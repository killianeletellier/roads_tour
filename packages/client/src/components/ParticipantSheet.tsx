import type { ConvoyMemberInfo } from '@roads-tour/shared';
import { CloseIcon } from './Icons';

interface ParticipantSheetProps {
  open: boolean;
  participants: ConvoyMemberInfo[];
  focusedId: string | null;
  onClose: () => void;
  onSelect: (memberId: string) => void;
}

export const ParticipantSheet = ({
  open,
  participants,
  focusedId,
  onClose,
  onSelect,
}: ParticipantSheetProps) => {
  if (!open) return null;

  return (
    <div className="participant-sheet" role="dialog" aria-label="Participants connectés">
      <button
        type="button"
        className="participant-sheet__backdrop"
        onClick={onClose}
        aria-label="Fermer"
      />
      <div className="participant-sheet__panel">
        <div className="participant-sheet__header">
          <h2 className="participant-sheet__title">Participants</h2>
          <button
            type="button"
            className="btn-icon participant-sheet__close"
            onClick={onClose}
            aria-label="Fermer"
          >
            <CloseIcon />
          </button>
        </div>
        {participants.length === 0 ? (
          <p className="participant-sheet__empty">Aucun participant connecté</p>
        ) : (
          <ul className="participant-sheet__list">
            {participants.map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`participant-sheet__item${focusedId === p.id ? ' participant-sheet__item--focused' : ''}`}
                  onClick={() => onSelect(p.id)}
                  disabled={p.lat == null || p.lon == null}
                >
                  <span className="participant-sheet__dot" aria-hidden />
                  <span className="participant-sheet__name">{p.displayName}</span>
                  {p.lat == null || p.lon == null ? (
                    <span className="participant-sheet__status">Sans position</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
