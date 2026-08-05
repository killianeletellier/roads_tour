import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteNavigation } from '@roads-tour/shared';
import type { ConvoyRoute, OffRouteEvent } from '@roads-tour/shared';
import { getAppConfig } from '../api';
import { NavHud } from '../components/NavHud';
import { MapView } from '../components/MapView';
import { ParticipantSheet } from '../components/ParticipantSheet';
import { useGeolocation, useThrottledPosition, useVoicePlayback, usePushToTalk } from '../hooks/useGeolocation';
import { useConvoySocket } from '../hooks/useConvoySocket';
import { getConnectedParticipants } from '../utils/participants';
import { MicIcon, UsersIcon, CloseIcon } from '../components/Icons';

interface Session {
  memberId: string;
  token: string;
  displayName: string;
  convoy: ConvoyRoute;
  role: 'participant' | 'organizer';
  organizerRole: 'lead' | 'sweep' | 'door' | null;
}

export const NavigationPage = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [osrmUrl, setOsrmUrl] = useState('/api/osrm');
  const [toasts, setToasts] = useState<string[]>([]);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [focusedMemberId, setFocusedMemberId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('roads_tour_session');
      if (!raw) {
        navigate('/');
        return;
      }
      setSession(JSON.parse(raw));
    } catch {
      navigate('/');
    }
    getAppConfig().then(c => setOsrmUrl(c.osrmUrl)).catch(() => {});
  }, [navigate]);

  const addToast = useCallback((msg: string) => {
    setToasts(prev => [...prev, msg]);
    setTimeout(() => setToasts(prev => prev.slice(1)), 4000);
  }, []);

  const { location, heading, speed } = useGeolocation();
  const { enqueueChunk, reset: resetVoice } = useVoicePlayback();

  const onOffRoute = useCallback((event: OffRouteEvent) => {
    if (session?.role === 'organizer') {
      addToast(`${event.displayName} hors tracé (${Math.round(event.distance)} m)`);
    }
  }, [session?.role, addToast]);

  const socketOptions = session
    ? {
        token: session.token,
        memberId: session.memberId,
        role: session.role,
        onOffRoute: session.role === 'organizer' ? onOffRoute : undefined,
        onVoiceStart: () => resetVoice(),
        onVoiceChunk: (_id: string, data: string) => enqueueChunk(data),
        onVoiceEnd: () => {},
      }
    : null;

  const {
    members,
    positionsVisible,
    sendPosition,
    sendOffRoute,
    togglePositions,
    voiceStart,
    voiceChunk,
    voiceEnd,
  } = useConvoySocket(socketOptions);

  const handleOffRoute = useCallback((distance: number) => {
    if (!session) return;
    sendOffRoute({
      memberId: session.memberId,
      displayName: session.displayName,
      distance,
    });
  }, [session, sendOffRoute]);

  const handleOsrmError = useCallback((message: string) => {
    addToast(message);
  }, [addToast]);

  const nav = useRouteNavigation(
    session?.convoy ?? null,
    location,
    { osrmUrl, onOffRoute: handleOffRoute, onOsrmError: handleOsrmError },
  );

  const sendPos = useCallback((memberId: string, lat: number, lon: number, h: number | null, s: number | null) => {
    sendPosition(memberId, lat, lon, h, s);
  }, [sendPosition]);

  useThrottledPosition(session?.memberId ?? null, location, heading, speed, sendPos);

  const ptt = usePushToTalk(voiceStart, voiceChunk, voiceEnd);

  const handlePttPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    ptt.start();
  }, [ptt]);

  const handlePttPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    ptt.stop();
  }, [ptt]);

  const handlePttPointerLeave = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (ptt.isRecording) {
      handlePttPointerUp(e);
    }
  }, [ptt, handlePttPointerUp]);

  const blockTouchDefault = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
  }, []);

  const pois = useMemo(
    () => nav.sortedPoints.map((p, i) => ({
      lat: p.latitude,
      lon: p.longitude,
      label: p.label?.trim() || `POI ${i + 1}`,
      order: i + 1,
    })),
    [nav.sortedPoints],
  );

  const connectedParticipants = useMemo(
    () => getConnectedParticipants(members),
    [members],
  );

  useEffect(() => {
    if (focusedMemberId && !members.some(m => m.id === focusedMemberId)) {
      setFocusedMemberId(null);
    }
  }, [focusedMemberId, members]);

  const handleSelectParticipant = useCallback((memberId: string) => {
    setFocusedMemberId(memberId);
    setParticipantsOpen(false);
  }, []);

  const handleFocusClear = useCallback(() => {
    setFocusedMemberId(null);
  }, []);

  const leave = () => {
    localStorage.removeItem('roads_tour_session');
    navigate('/');
  };

  if (!session) return null;

  const isOrganizer = session.role === 'organizer';

  return (
    <div className="nav-page">
      <div className="nav-page__map">
        <MapView
          navigationMode
          highlightPois
          routeGeoJSON={nav.routeGeoJSON}
          recalcGeoJSON={nav.recalcGeoJSON}
          userLocation={location}
          userHeading={heading}
          members={members}
          pois={pois}
          bottomPadding={220}
          focusMemberId={focusedMemberId}
          onFocusClear={handleFocusClear}
        />
      </div>

      <div className="toast-container">
        {toasts.map((t, i) => (
          <div key={i} className="toast warning">{t}</div>
        ))}
      </div>

      <button
        className="nav-page__close btn-icon"
        onClick={leave}
        aria-label="Quitter la navigation"
      >
        <CloseIcon />
      </button>

      {isOrganizer && (
        <button
          type="button"
          className="participant-badge"
          onClick={() => setParticipantsOpen(true)}
          aria-label={`${connectedParticipants.length} participant${connectedParticipants.length !== 1 ? 's' : ''} connecté${connectedParticipants.length !== 1 ? 's' : ''}`}
        >
          <UsersIcon />
          <span className="participant-badge__count">{connectedParticipants.length}</span>
        </button>
      )}

      <ParticipantSheet
        open={participantsOpen}
        participants={connectedParticipants}
        focusedId={focusedMemberId}
        onClose={() => setParticipantsOpen(false)}
        onSelect={handleSelectParticipant}
      />

      <div className="nav-page__overlay">
        {isOrganizer && (
          <div className="nav-page__toolbar">
            <button
              className={`btn-icon ${positionsVisible ? 'active' : ''}`}
              onClick={() => togglePositions(!positionsVisible)}
              aria-label="Afficher positions"
            >
              <UsersIcon />
            </button>
            <button
              className={`btn-icon nav-page__ptt no-select ${ptt.isRecording ? 'nav-page__ptt--active' : ''}`}
              onPointerDown={handlePttPointerDown}
              onPointerUp={handlePttPointerUp}
              onPointerLeave={handlePttPointerLeave}
              onPointerCancel={handlePttPointerUp}
              onContextMenu={blockTouchDefault}
              aria-label="Push-to-talk"
            >
              <MicIcon />
            </button>
          </div>
        )}

        <NavHud
          hasGps={location != null}
          instruction={nav.currentInstruction}
          nextPointName={nav.nextPointLabel}
          distanceToNextM={nav.distanceToNextM}
          estimatedMinutesRemaining={nav.estimatedMinutesRemaining}
          totalRemainingKm={nav.totalRemainingKm}
          offRouteDistance={nav.offRouteDistance}
          convoyName={session.convoy.name}
          osrmError={nav.osrmError}
          osrmLoading={nav.osrmLoading}
        />
      </div>
    </div>
  );
};
