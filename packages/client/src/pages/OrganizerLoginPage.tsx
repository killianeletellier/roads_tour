import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConvoyByCode, joinConvoy } from '../api';

export const OrganizerLoginPage = () => {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [organizerRole, setOrganizerRole] = useState<'lead' | 'sweep' | 'door'>('lead');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const convoy = await getConvoyByCode(code.trim());
      const result = await joinConvoy(convoy.id, {
        displayName: displayName.trim(),
        role: 'organizer',
        adminPassword: password,
        organizerRole,
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
      setError(err instanceof Error ? err.message : 'Authentification échouée');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell" style={{ padding: '2rem 1.5rem', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Mode organisateur</h1>
        <input className="input" placeholder="Code convoi" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required />
        <input className="input" type="password" placeholder="Mot de passe convoi" value={password} onChange={e => setPassword(e.target.value)} required />
        <input className="input" placeholder="Pseudo" value={displayName} onChange={e => setDisplayName(e.target.value)} required />
        <label style={{ fontSize: '0.875rem' }}>
          Rôle
          <select className="input" value={organizerRole} onChange={e => setOrganizerRole(e.target.value as 'lead' | 'sweep' | 'door')} style={{ marginTop: '0.25rem' }}>
            <option value="lead">Tête de convoi</option>
            <option value="sweep">Balais</option>
            <option value="door">Ouvreuse</option>
          </select>
        </label>
        {error && <div style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</div>}
        <button className="btn" type="submit" disabled={loading}>Connexion</button>
        <button type="button" className="btn-secondary btn" onClick={() => navigate('/')}>Retour</button>
      </form>
    </div>
  );
};
