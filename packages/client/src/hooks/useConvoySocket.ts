import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ConvoyMemberInfo, OffRouteEvent } from '@roads-tour/shared';
import { isConnectedMember } from '../utils/participants';

interface UseConvoySocketOptions {
  token: string;
  memberId: string;
  displayName: string;
  role: 'participant' | 'organizer';
  onOffRoute?: (event: OffRouteEvent) => void;
  onVoiceStart?: (memberId: string) => void;
  onVoiceChunk?: (memberId: string, data: string) => void;
  onVoiceEnd?: (memberId: string) => void;
}

export const useConvoySocket = (options: UseConvoySocketOptions | null) => {
  const [members, setMembers] = useState<ConvoyMemberInfo[]>([]);
  const [positionsVisible, setPositionsVisible] = useState(false);
  const [connectionTick, setConnectionTick] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const viewerRoleRef = useRef(options?.role ?? 'participant');
  viewerRoleRef.current = options?.role ?? 'participant';
  const positionsVisibleRef = useRef(false);
  positionsVisibleRef.current = positionsVisible;

  useEffect(() => {
    if (!options) return;
    const { token, memberId, displayName } = options;
    const socket = io({ path: '/socket.io', auth: { token, displayName } });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('members:request');
    });

    socket.on('members:snapshot', (snapshot: ConvoyMemberInfo[]) => {
      setMembers(snapshot.filter(isConnectedMember));
    });

    socket.on('member:offline', (payload: { memberId: string }) => {
      setMembers(prev => prev.filter(m => m.id !== payload.memberId));
    });

    socket.on('position:update', (payload: {
      memberId: string;
      lat: number;
      lon: number;
      heading?: number;
      speed?: number;
      role?: string;
      organizerRole?: string | null;
      displayName?: string;
    }) => {
      if (payload.memberId === memberId) return;
      const isOrganizerViewer = viewerRoleRef.current === 'organizer';
      const senderIsOrganizer = payload.role === 'organizer';
      if (!isOrganizerViewer && !senderIsOrganizer && !positionsVisibleRef.current) return;

      setMembers(prev => {
        const existing = prev.find(m => m.id === payload.memberId);
        if (existing) {
          return prev.map(m =>
            m.id === payload.memberId
              ? { ...m, lat: payload.lat, lon: payload.lon, heading: payload.heading ?? m.heading, speed: payload.speed ?? m.speed, lastSeen: new Date().toISOString() }
              : m,
          );
        }
        return [...prev, {
          id: payload.memberId,
          displayName: payload.displayName ?? '?',
          role: (payload.role as 'participant' | 'organizer') ?? 'participant',
          organizerRole: (payload.organizerRole as 'lead' | 'sweep' | 'door' | null) ?? null,
          lat: payload.lat,
          lon: payload.lon,
          heading: payload.heading ?? null,
          speed: payload.speed ?? null,
          isOffRoute: false,
          lastSeen: new Date().toISOString(),
        }];
      });
    });

    socket.on('member:off-route', (event: OffRouteEvent) => {
      optionsRef.current?.onOffRoute?.(event);
    });

    socket.on('positions:toggle', (payload: { visible: boolean }) => {
      setPositionsVisible(payload.visible);
      if (optionsRef.current?.role === 'participant') {
        if (!payload.visible) {
          setMembers(prev => prev.filter(m => m.role === 'organizer'));
        } else {
          socket.emit('members:request');
        }
      }
    });

    socket.on('voice:start', (payload: { memberId: string }) => {
      optionsRef.current?.onVoiceStart?.(payload.memberId);
    });

    socket.on('voice:chunk', (payload: { memberId: string; data: string }) => {
      optionsRef.current?.onVoiceChunk?.(payload.memberId, payload.data);
    });

    socket.on('voice:end', (payload: { memberId: string }) => {
      optionsRef.current?.onVoiceEnd?.(payload.memberId);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [options?.token, options?.memberId]);

  useEffect(() => {
    if (!options) return;
    const id = window.setInterval(() => setConnectionTick(t => t + 1), 5000);
    return () => window.clearInterval(id);
  }, [options?.token]);

  const sendPosition = useCallback((memberId: string, lat: number, lon: number, heading: number | null, speed: number | null) => {
    socketRef.current?.emit('position:update', { memberId, lat, lon, heading, speed });
  }, []);

  const sendOffRoute = useCallback((payload: OffRouteEvent) => {
    socketRef.current?.emit('member:off-route', payload);
  }, []);

  const togglePositions = useCallback((visible: boolean) => {
    socketRef.current?.emit('positions:toggle', { visible });
    setPositionsVisible(visible);
  }, []);

  const voiceStart = useCallback(() => {
    socketRef.current?.emit('voice:start');
  }, []);

  const voiceChunk = useCallback((data: string) => {
    socketRef.current?.emit('voice:chunk', { data });
  }, []);

  const voiceEnd = useCallback(() => {
    socketRef.current?.emit('voice:end');
  }, []);

  const visibleMembers = useMemo(() => {
    let filtered = members;
    if (options?.role !== 'organizer') {
      filtered = positionsVisible ? members : members.filter(m => m.role === 'organizer');
    }
    return filtered.filter(isConnectedMember);
  }, [members, positionsVisible, options?.role, connectionTick]);

  return {
    members: visibleMembers,
    positionsVisible,
    sendPosition,
    sendOffRoute,
    togglePositions,
    voiceStart,
    voiceChunk,
    voiceEnd,
  };
};
