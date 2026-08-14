import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './Splash.css';

export default function Splash() {
  const { loaded } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), 2100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!leaving || !loaded) return;
    const t = setTimeout(() => navigate('/home', { replace: true }), 450);
    return () => clearTimeout(t);
  }, [leaving, loaded, navigate]);

  return (
    <div className={`splash ${leaving ? 'splash-leave' : ''}`}>
      <div className="splash-ornament" aria-hidden>
        <svg viewBox="0 0 100 100" width="64" height="64">
          <g fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="50" cy="50" r="24" />
            <circle cx="50" cy="50" r="38" opacity="0.55" />
            <path d="M50 12v76M12 50h76M23 23l54 54M77 23l-54 54" opacity="0.4" />
          </g>
        </svg>
      </div>
      <h1 className="splash-title">
        السِّرَاج المُنِير
      </h1>
      <p className="splash-sub">مسابقة يومية في السيرة النبوية</p>
      <div className="splash-loading" />
    </div>
  );
}