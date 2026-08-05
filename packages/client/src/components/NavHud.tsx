import { formatInstructionDistance, getManeuverInstruction } from '@roads-tour/shared';
import { ManeuverIcon } from './Icons';

interface NavHudProps {
  hasGps: boolean;
  instruction: { type: string; modifier?: string; name: string; distanceM: number } | null;
  nextPointName: string | null;
  distanceToNextM: number | null;
  estimatedMinutesRemaining: number | null;
  totalRemainingKm: number | null;
  offRouteDistance: number | null;
  convoyName: string;
  osrmError?: string | null;
  osrmLoading?: boolean;
}

const formatDistance = (m: number | null): string => {
  if (m == null) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
};

const formatTime = (min: number | null): string => {
  if (min == null) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  return `${Math.floor(min / 60)} h ${Math.round(min % 60).toString().padStart(2, '0')}`;
};

export const NavHud = ({
  hasGps,
  instruction,
  nextPointName,
  distanceToNextM,
  estimatedMinutesRemaining,
  totalRemainingKm,
  offRouteDistance,
  convoyName,
  osrmError,
  osrmLoading,
}: NavHudProps) => (
  <div className="nav-hud">
    {offRouteDistance != null && (
      <div className="nav-hud__off-route">
        Hors tracé · {Math.round(offRouteDistance)} m
      </div>
    )}

    {osrmError && (
      <div className="nav-hud__off-route">
        {osrmError}
      </div>
    )}

    <div className="nav-hud__instruction">
      {!hasGps ? (
        <div className="nav-hud__waiting">En attente du GPS…</div>
      ) : instruction ? (
        <>
          <div className="nav-hud__maneuver">
            <ManeuverIcon type={instruction.type} modifier={instruction.modifier} />
          </div>
          <div className="nav-hud__instruction-text">
            <div className="nav-hud__distance">
              {formatInstructionDistance(instruction.distanceM)}
            </div>
            <div className="nav-hud__street">
              {getManeuverInstruction(instruction.type, instruction.modifier)}
            </div>
            {instruction.name ? (
              <div className="nav-hud__step-distance">{instruction.name}</div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="nav-hud__waiting">
          {osrmLoading ? 'Calcul de l\'itinéraire…' : 'Chargement de l\'itinéraire…'}
        </div>
      )}
    </div>

    <div className="nav-hud__stats">
      <div className="nav-hud__stat">
        <span className="nav-hud__stat-label">Prochain POI</span>
        <span className="nav-hud__stat-value">
          {nextPointName ?? '—'}
          {distanceToNextM != null && (
            <span className="nav-hud__stat-sub"> · {formatDistance(distanceToNextM)}</span>
          )}
        </span>
      </div>
      <div className="nav-hud__stat-divider" aria-hidden />
      <div className="nav-hud__stat">
        <span className="nav-hud__stat-label">Arrivée</span>
        <span className="nav-hud__stat-value">
          {formatTime(estimatedMinutesRemaining)}
          {totalRemainingKm != null && (
            <span className="nav-hud__stat-sub"> · {totalRemainingKm.toFixed(1)} km</span>
          )}
        </span>
      </div>
    </div>

    <div className="nav-hud__convoy">{convoyName}</div>
  </div>
);
