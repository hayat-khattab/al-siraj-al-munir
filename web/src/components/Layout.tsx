import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './Layout.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initial = user?.fullName?.trim().charAt(0) || 'م';

  return (
    <header className="app-top">
      <div className="app-top-brand" onClick={() => navigate('/home')}>
        <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden>
          <g fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="20" cy="20" r="10" />
            <circle cx="20" cy="20" r="16" opacity="0.5" />
            <path d="M20 4v32M4 20h32" opacity="0.4" />
          </g>
        </svg>
        <span className="app-top-name">السِّرَاج المُنِير</span>
      </div>

      <div className="app-top-user">
        {user?.role === 'ADMIN' && (
          <button className="app-top-pill" onClick={() => navigate('/admin')}>
            لوحة التحكم
          </button>
        )}
        <span className="app-top-avatar" title={user?.fullName}>
          {initial}
        </span>
        <button className="app-top-logout" title="تسجيل الخروج" onClick={logout}>
          خروج
        </button>
      </div>
    </header>
  );
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="screen-title">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}