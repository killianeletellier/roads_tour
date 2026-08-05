import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { checkAdmin, adminLogout, listConvoys, type ConvoySummary } from '../../api';
import { Logo } from '../../components/Icons';

export const AdminLayout = () => {
  const [convoys, setConvoys] = useState<ConvoySummary[]>([]);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkAdmin()
      .then(() => listConvoys().then(setConvoys))
      .catch(() => navigate('/admin/login'))
      .finally(() => setReady(true));
  }, [navigate]);

  const logout = async () => {
    await adminLogout();
    navigate('/admin/login');
  };

  if (!ready) return null;

  return (
    <div className="admin-layout">
      <aside style={{ background: 'var(--surface)', borderRight: '1px solid #e5e7eb', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Logo size={28} />
          <strong>Roads Tour</strong>
        </div>
        <Link to="/admin/convoys/new" className="btn" style={{ textDecoration: 'none', fontSize: '0.875rem' }}>
          + Nouveau convoi
        </Link>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
          {convoys.map(c => (
            <Link
              key={c.id}
              to={`/admin/convoys/${c.id}`}
              style={{ padding: '0.5rem 0.75rem', borderRadius: 6, textDecoration: 'none', color: 'var(--text)' }}
            >
              {c.name}
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>{c.accessCode}</span>
            </Link>
          ))}
        </nav>
        <button className="btn-secondary btn" onClick={logout} style={{ fontSize: '0.875rem' }}>
          Déconnexion
        </button>
      </aside>
      <main style={{ padding: '1.5rem', overflow: 'auto' }}>
        <Outlet context={{ refreshConvoys: () => listConvoys().then(setConvoys) }} />
      </main>
    </div>
  );
};
