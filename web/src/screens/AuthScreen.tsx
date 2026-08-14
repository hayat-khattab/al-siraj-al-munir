import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Toast from '../components/Toast';
import './AuthScreen.css';

const NAME_PARTS = 3;
const PHONE_RE = /^\+?[0-9]{8,15}$/;
const OTP_RE = /^[0-9]{6}$/;

interface OtpResponse {
  token: string;
  user: import('../api/types').AuthUser;
}

export default function AuthScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('register');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function switchMode(m: 'login' | 'register') {
    setMode(m);
    setError(null);
    setToast(null);
    setOtpRequested(false);
    setCode('');
  }

  function validate(): string | null {
    const phoneErr = PHONE_RE.test(phone.trim()) ? null : 'أدخل رقم هاتف صحيح (أرقام فقط، يبدأ بـ + اختيارياً)';
    if (phoneErr) return phoneErr;
    if (mode === 'register') {
      const parts = fullName.trim().split(/\s+/).filter(Boolean);
      if (parts.length !== NAME_PARTS) return `الاسم الثلاثي يتكون من ${NAME_PARTS} أجزاء بالضبط`;
      for (const p of parts) {
        if (!/^[A-Za-z\u0600-\u06FF]+$/.test(p)) return 'أجزاء الاسم يجب أن تكون حروفاً فقط (عربية أو إنجليزية)';
      }
    }
    return null;
  }

  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setVerifying(true);
    try {
      await api.post(mode === 'register' ? '/auth/register' : '/auth/login', {
        fullName: fullName.trim(),
        whatsappNumber: phone.trim(),
      });
      setOtpRequested(true);
      setToast(mode === 'register' ? 'تم التسجيل، راسلنا الرقم السري عبر واتساب' : 'أرسلنا رمز الدخول عبر واتساب');
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : 'تعذر إكمال الطلب');
    } finally {
      setVerifying(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!OTP_RE.test(code.trim())) {
      setError('الرمز السري يجب أن يكون 6 أرقام');
      return;
    }
    setError(null);
    setVerifying(true);
    try {
      const res = await api.post<OtpResponse>('/auth/verify', {
        whatsappNumber: phone.trim(),
        code: code.trim(),
        purpose: mode === 'register' ? 'REGISTER' : 'LOGIN',
      });
      login(res.token, res.user);
      navigate('/home', { replace: true });
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : 'رمز غير صحيح');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-hero">
        <div className="auth-logo">
          <svg viewBox="0 0 100 100" width="52" height="52" aria-hidden>
            <g fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="50" cy="50" r="24" />
              <circle cx="50" cy="50" r="38" opacity="0.55" />
              <path d="M50 12v76M12 50h76" opacity="0.4" />
            </g>
          </svg>
        </div>
        <h1>السِّرَاج المُنِير</h1>
        <p>مسابقة يومية في السيرة النبوية — ربيع الأنوار 1448</p>
      </div>

      <div className="auth-tabs">
        <button
          className={mode === 'register' ? 'auth-tab active' : 'auth-tab'}
          onClick={() => switchMode('register')}
        >
          تسجيل جديد
        </button>
        <button
          className={mode === 'login' ? 'auth-tab active' : 'auth-tab'}
          onClick={() => switchMode('login')}
        >
          دخول
        </button>
      </div>

      {!otpRequested ? (
        <form className="card auth-card" onSubmit={requestOtp}>
          {mode === 'register' && (
            <div className="field">
              <label htmlFor="fullName">الاسم الثلاثي</label>
              <input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مثال: محمد أحمد علي"
                autoComplete="name"
                dir="auto"
              />
              <p className="hint-text">الاسم الأول + الأب + الجد، بالعربية أو بالإنجليزية</p>
            </div>
          )}
          <div className="field">
            <label htmlFor="phone">رقم الواتساب</label>
            <input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="مثال: 01012345678"
              inputMode="tel"
              dir="ltr"
              autoComplete="tel"
            />
            <p className="hint-text">سيصلك عليه الرمز السري عبر واتساب</p>
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={verifying}>
            {verifying ? 'جاري الإرسال…' : mode === 'register' ? 'إنشاء الحساب' : 'إرسال الرمز'}
          </button>
        </form>
      ) : (
        <form className="card auth-card" onSubmit={verify}>
          <div className="otp-note">
            {mode === 'register'
              ? 'تم إنشاء حسابك. أدخل الرمز السري المكوّن من 6 أرقام'
              : 'أدخل الرمز السري المكوّن من 6 أرقام'}
          </div>
          <div className="field">
            <label htmlFor="code">الرمز السري</label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              dir="ltr"
              className="otp-input"
            />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={verifying}>
            {verifying ? 'جاري التحقق…' : 'دخول'}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => switchMode(mode)}>
            تعديل البيانات
          </button>
        </form>
      )}

      <Toast message={toast} />
    </div>
  );
}