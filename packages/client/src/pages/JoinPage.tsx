import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { joinConvoy } from '../api';

interface PendingConvoy {
  id: string;
  name: string;
  accessCode: string;
}

export const JoinPage = () => {
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const pending: PendingConvoy | null = (() => {
    try {
      const raw = sessionStorage.getItem('pending_convoy');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!pending) navigate('/');
  }, [pending, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    setLoading(true);
    setError('');
    try {
      const result = await joinConvoy(pending.id, {
        displayName: displayName.trim(),
        role: 'participant',
      });
      localStorage.setItem('roads_tour_session', JSON.stringify({
        memberId: result.memberId,
        token: result.token,
        displayName: displayName.trim(),
        convoy: result.convoy,
        role: result.role,
        organizerRole: result.organizerRole,
      }));
      navigate('/navigate');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre');
    } finally {
      setLoading(false);
    }
  };

  if (!pending) return null;

  return (
    <div className="app-shell" style={{ padding: '2rem 1.5rem', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>{pending.name}</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Choisissez votre pseudo</p>
        <input
          className="input"
          placeholder="Pseudo"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          maxLength={32}
          required
          autoFocus
        />
        {error && <div style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</div>}
        <button className="btn" type="submit" disabled={loading || !displayName.trim()}>
          Entrer dans le convoi
        </button>
      </form>
    </div>
  );
};
