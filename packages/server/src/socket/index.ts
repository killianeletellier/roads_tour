import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { PositionUpdate, OffRouteEvent } from '@roads-tour/shared';
import { CONNECTED_THRESHOLD_MS } from '@roads-tour/shared';
import { prisma } from '../db.js';
import {
  toMemberInfo,
  isAnonymizedDisplayName,
  generateAnonymizedDisplayName,
} from '../services/convoy.js';
import { config } from '../config.js';

interface ConvoyRoomState {
  positionsVisible: boolean;
  voiceActiveMemberId: string | null;
}

const pubClient = new Redis(config.redisUrl);
const subClient = pubClient.duplicate();

const roomStates = new Map<string, ConvoyRoomState>();

const getRoomState = (convoyId: string): ConvoyRoomState => {
  if (!roomStates.has(convoyId)) {
    roomStates.set(convoyId, { positionsVisible: false, voiceActiveMemberId: null });
  }
  return roomStates.get(convoyId)!;
};

const shouldReceivePosition = (
  recipientRole: 'participant' | 'organizer',
  senderRole: 'participant' | 'organizer',
  positionsVisible: boolean,
): boolean => {
  if (recipientRole === 'organizer') return true;
  if (senderRole === 'organizer') return true;
  return positionsVisible;
};

const isRecentlySeen = (lastSeen: Date | null): boolean => {
  if (!lastSeen) return false;
  return Date.now() - lastSeen.getTime() < CONNECTED_THRESHOLD_MS;
};

const clearMemberPosition = (memberId: string) => {
  try {
    prisma.convoyMember.update({
      where: { id: memberId },
      data: {
        lat: null,
        lon: null,
        heading: null,
        speed: null,
        isOffRoute: false,
      },
    });
  } catch (e) {

  }
}

interface AuthenticatedSocket extends Socket {
  memberId?: string;
  convoyId?: string;
  role?: 'participant' | 'organizer';
}

export const setupSocketIO = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    path: '/socket.io',
    adapter: createAdapter(pubClient, subClient)
  });

  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Unauthorized'));
    const member = await prisma.convoyMember.findUnique({ where: { sessionToken: token } });
    socket.memberId = member?.id ?? crypto.randomUUID();
    socket.convoyId = member?.convoyId ?? "cb776772-ec05-4e04-9f24-1fe8741dbf97";
    socket.role = member?.role ?? "participant";
    if (!member) {
      await prisma.convoyMember.create({
        data: {
          id: socket.memberId,
          convoyId: socket.convoyId,
          displayName: "unknown-name",
          role: socket.role,
          organizerRole: null,
        }
      });
    }
    next();
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const convoyId = socket.convoyId!;
    const memberId = socket.memberId!;
    const room = `convoy:${convoyId}`;
    socket.join(room);

    const authDisplayName = typeof socket.handshake.auth.displayName === 'string'
      ? socket.handshake.auth.displayName.trim()
      : '';

    void (async () => {
      await clearMemberPosition(memberId);
      const member = await prisma.convoyMember.findUnique({ where: { id: memberId } });
      if (
        member
        && isAnonymizedDisplayName(member.displayName)
        && authDisplayName
        && !isAnonymizedDisplayName(authDisplayName)
      ) {
        const conflict = await prisma.convoyMember.findFirst({
          where: {
            convoyId,
            displayName: authDisplayName,
            id: { not: memberId },
          },
        });
        if (!conflict) {
          await prisma.convoyMember.upsert({
            where: { id: memberId },
            update: { displayName: authDisplayName, lastSeen: new Date() },
            create: { id: memberId, convoyId,
            displayName: authDisplayName,
            role: "participant",
            organizerRole: null }
          });
          return;
        }
      }
      await prisma.convoyMember.update({
        where: { id: memberId },
        data: { lastSeen: new Date() },
      }).catch(() => {});
    })();

    const state = getRoomState(convoyId);
    socket.emit('positions:toggle', { visible: state.positionsVisible });

    socket.on('position:update', async (payload: PositionUpdate) => {
      //if (payload.memberId !== memberId) return;
      await prisma.convoyMember.upsert({
        where: { id: memberId },
        update: {
          lat: payload.lat,
          lon: payload.lon,
          heading: payload.heading ?? null,
          speed: payload.speed ?? null,
          lastSeen: new Date(),
        },
        create: {
          id: memberId, convoyId,
          role: "participant",
          organizerRole: null,
          displayName: memberId,
          lat: payload.lat,
          lon: payload.lon,
          heading: payload.heading ?? null,
          speed: payload.speed ?? null,
          lastSeen: new Date(),
        }
      });

      const roomState = getRoomState(convoyId);
      const sender = await prisma.convoyMember.findUnique({ where: { id: memberId } });
      if (!sender) return;

      const updatePayload = {
        ...payload,
        role: sender.role,
        organizerRole: sender.organizerRole,
        displayName: sender.displayName,
      };

      const sockets = await io.in(room).fetchSockets();
      for (const s of sockets) {
        const recipient = s as unknown as AuthenticatedSocket;
        if (recipient.memberId === memberId) continue;
        if (shouldReceivePosition(recipient.role!, sender.role, roomState.positionsVisible)) {
          s.emit('position:update', updatePayload);
        }
      }
    });

    socket.on('member:off-route', async (payload: OffRouteEvent) => {
      if (payload.memberId !== memberId) return;
      await prisma.convoyMember.update({
        where: { id: memberId },
        data: { isOffRoute: true },
      }).catch(() => {});
      const sockets = await io.in(room).fetchSockets();
      for (const s of sockets) {
        const ts = s as unknown as AuthenticatedSocket;
        if (ts.role === 'organizer' && ts.memberId !== memberId) {
          s.emit('member:off-route', payload);
        }
      }
    });

    socket.on('positions:toggle', (payload: { visible: boolean }) => {
      if (socket.role !== 'organizer') return;
      const state = getRoomState(convoyId);
      state.positionsVisible = payload.visible;
      io.to(room).emit('positions:toggle', payload);
    });

    socket.on('voice:start', () => {
      if (socket.role !== 'organizer') return;
      const state = getRoomState(convoyId);
      if (state.voiceActiveMemberId && state.voiceActiveMemberId !== memberId) return;
      state.voiceActiveMemberId = memberId;
      socket.to(room).emit('voice:start', { memberId });
    });

    socket.on('voice:chunk', (payload: { data?: string }) => {
      if (socket.role !== 'organizer') return;
      if (typeof payload?.data !== 'string' || payload.data.length === 0) return;
      const state = getRoomState(convoyId);
      if (state.voiceActiveMemberId !== memberId) return;
      socket.to(room).emit('voice:chunk', { memberId, data: payload.data });
    });

    socket.on('voice:end', () => {
      if (socket.role !== 'organizer') return;
      const state = getRoomState(convoyId);
      if (state.voiceActiveMemberId === memberId) {
        state.voiceActiveMemberId = null;
      }
      socket.to(room).emit('voice:end', { memberId });
    });

    socket.on('members:request', async () => {
      const sockets = await io.in(room).fetchSockets();
      const onlineIds = new Set(
        sockets
          .map(s => (s as unknown as AuthenticatedSocket).memberId)
          .filter((id): id is string => !!id),
      );

      const members = await prisma.convoyMember.findMany({ where: { convoyId } });
      const state = getRoomState(convoyId);
      const filtered = members.filter(m => {
        if (m.id === memberId) return false;
        if (!onlineIds.has(m.id)) return false;
        if (!isRecentlySeen(m.lastSeen)) return false;
        if (m.lat == null || m.lon == null) return false;
        return shouldReceivePosition(socket.role!, m.role, state.positionsVisible);
      });
      socket.emit('members:snapshot', filtered.map(toMemberInfo));
    });

    socket.on('disconnect', async () => {
      const state = getRoomState(convoyId);
      if (state.voiceActiveMemberId === memberId) {
        state.voiceActiveMemberId = null;
        socket.to(room).emit('voice:end', { memberId });
      }
      await prisma.convoyMember.update({
        where: { id: memberId },
        data: {
          displayName: generateAnonymizedDisplayName(),
          lat: null,
          lon: null,
          heading: null,
          speed: null,
          isOffRoute: false,
        },
      }).catch(() => {});
      socket.to(room).emit('member:offline', { memberId });
    });
  });

  return io;
};
