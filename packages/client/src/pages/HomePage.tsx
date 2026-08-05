import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConvoyByCode } from '../api';
import { Logo } from '../components/Icons';

export const HomePage = () => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOrganizer, setShowOrganizer] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const convoy = await getConvoyByCode(code.trim());
      sessionStorage.setItem('pending_convoy', JSON.stringify(convoy));
      navigate('/join', { state: { organizer: false } });
    } catch {
      setError('Code convoi invalide ou indisponible');
    } finally {
      setLoading(false);
    }
  };

  const startLongPress = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    longPressTimer.current = setTimeout(() => setShowOrganizer(true), 2000);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const blockContextMenu = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
  }, []);

  const openOrganizer = () => {
    setShowOrganizer(false);
    navigate('/organizer');
  };

  return (
    <div className="app-shell" style={{ padding: '2rem 1.5rem', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
        <div
          className="home-page__logo-trigger no-select"
          onPointerDown={startLongPress}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onContextMenu={blockContextMenu}
        >
          <Logo size={64} />
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Roads Tour</h1>

        <form onSubmit={join} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input
            className="input"
            placeholder="Code convoi"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
          {error && <div style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</div>}
          <button className="btn" type="submit" disabled={loading || !code.trim()}>
            Rejoindre
          </button>
        </form>
      </div>

      {showOrganizer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card" style={{ maxWidth: 320, width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2 style={{ fontSize: '1.125rem' }}>Mode organisateur</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Accès réservé aux organisateurs du convoi.</p>
            <button className="btn" onClick={openOrganizer}>Continuer</button>
            <button className="btn-secondary btn" onClick={() => setShowOrganizer(false)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
};
