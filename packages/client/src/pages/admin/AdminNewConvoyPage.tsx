import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { createConvoy } from '../../api';

export const AdminNewConvoyPage = () => {
  const [name, setName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { refreshConvoys } = useOutletContext<{ refreshConvoys: () => void }>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const convoy = await createConvoy({
        name,
        accessCode: accessCode || undefined,
        adminPassword,
        status: 'draft',
      });
      refreshConvoys();
      navigate(`/admin/convoys/${convoy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Nouveau convoi</h1>
      <form onSubmit={submit} className="card" style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <label>
          Nom
          <input className="input" value={name} onChange={e => setName(e.target.value)} required style={{ marginTop: '0.25rem' }} />
        </label>
        <label>
          Code d&apos;accès (optionnel, 6-8 car.)
          <input className="input" value={accessCode} onChange={e => setAccessCode(e.target.value.toUpperCase())} maxLength={8} style={{ marginTop: '0.25rem' }} />
        </label>
        <label>
          Mot de passe organisateur
          <input className="input" type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} required minLength={4} style={{ marginTop: '0.25rem' }} />
        </label>
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        <button className="btn" type="submit">Créer</button>
      </form>
    </div>
  );
};
