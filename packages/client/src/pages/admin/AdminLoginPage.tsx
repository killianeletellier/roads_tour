import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../../api';
import { Logo } from '../../components/Icons';

export const AdminLoginPage = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await adminLogin(password);
      navigate('/admin/convoys/new');
    } catch {
      setError('Mot de passe incorrect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <form onSubmit={submit} className="card" style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Logo size={40} />
          <h1 style={{ fontSize: '1.25rem' }}>Roads Tour Admin</h1>
        </div>
        <input
          className="input"
          type="password"
          placeholder="Mot de passe administrateur"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
        />
        {error && <div style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</div>}
        <button className="btn" type="submit" disabled={loading || !password}>
          Connexion
        </button>
      </form>
    </div>
  );
};
