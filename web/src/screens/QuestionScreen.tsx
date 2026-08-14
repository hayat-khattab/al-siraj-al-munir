import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AnswerView, QuestionView, SubmitResult } from '../api/types';
import Layout, { ScreenTitle } from '../components/Layout';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import { useCountdown, formatSeconds } from '../hooks/useCountdown';
import './QuestionScreen.css';

function Timer({ remaining, total }: { remaining: number; total: number }) {
  const frac = total > 0 ? remaining / total : 0;
  const R = 30;
  const C = 2 * Math.PI * R;
  const low = frac <= 0.2;
  return (
    <div className="timer-wrap">
      <svg viewBox="0 0 72 72" className="timer-ring">
        <circle className="timer-track" cx="36" cy="36" r={R} />
        <circle
          className={low ? 'timer-progress low' : 'timer-progress'}
          cx="36"
          cy="36"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <div className="timer-time">{formatSeconds(remaining)}</div>
    </div>
  );
}

export default function QuestionScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [question, setQuestion] = useState<QuestionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionRemaining, setSessionRemaining] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<AnswerView | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const endedRef = useRef(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api
      .get<{ question: QuestionView }>(`/competition/questions/${id}`)
      .then(({ question }) => {
        setQuestion(question);
        setResult(null);
        setAnswer('');
        setSessionRemaining(question.session?.remainingSeconds ?? null);
        endedRef.current = false;
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'تعذر تحميل السؤال'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const countdown = useCountdown(sessionRemaining);
  const expired = countdown.expired;

  useEffect(() => {
    if (expired && sessionRemaining !== null && !endedRef.current) {
      endedRef.current = true;
      setToast('انتهى الوقت المخصص للإجابة على هذا السؤال');
    }
  }, [expired, sessionRemaining]);

  async function startSession() {
    if (!id) return;
    setStarting(true);
    setError(null);
    try {
      const { question } = await api.post<{ question: QuestionView }>(`/competition/questions/${id}/start`);
      setSessionRemaining(question.session?.remainingSeconds ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذر بدء الإجابة');
    } finally {
      setStarting(false);
    }
  }

  async function submit() {
    if (!id || expired || submitting) return;
    const text = answer.trim();
    if (!text) {
      setToast('اكتب إجابتك أولاً');
      return;
    }
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<SubmitResult>(`/competition/questions/${id}/submit`, { answer: text });
      setResult(res.answer);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        if (e.code === 'ALREADY_ANSWERED') load();
      } else {
        setError('تعذر إرسال الإجابة');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="app-shell">
        <Layout />
        <div className="spinner" />
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="app-shell">
        <Layout />
        <ScreenTitle title="السؤال" />
        <div className="card q-error">
          <p>{error || 'لم يتم العثور على السؤال'}</p>
          <button className="btn btn-ghost" onClick={() => navigate('/home')}>
            العودة للتقويم
          </button>
        </div>
      </div>
    );
  }

  const q = question;

  // ---- FUTURE / locked ----
  if (q.status === 'FUTURE') {
    return (
      <div className="app-shell">
        <Layout />
        <ScreenTitle title={`السؤال رقم ${q.questionNumber}`} />
        <div className="card q-locked">
          <div className="q-locked-icon">🔒</div>
          <h2>السؤال مقفل</h2>
          <p>سؤال اليوم {q.hijriDay} لم يُفتح بعد. تابع تقويمك وعد في موعده.</p>
          <button className="btn btn-ghost" onClick={() => navigate('/home')}>
            العودة للتقويم
          </button>
        </div>
      </div>
    );
  }

  // ---- Answered view (with evaluation) ----
  if (q.status === 'ANSWERED' && q.answer) {
    return (
      <div className="app-shell">
        <Layout />
        <ScreenTitle title={`السؤال رقم ${q.questionNumber}`} subtitle="إجابتك محفوظة" />
        <div className="card q-body">
          {q.questionText && <p className="q-text">{q.questionText}</p>}
          <hr className="gold-rule" />
          <div className="qa-row">
            <span className="qa-label">إجابتك:</span>
            <span className="qa-value">{q.answer.answerText}</span>
          </div>
          <div className="qa-row">
            <span className="qa-label">الإجابة الصحيحة:</span>
            <span className="qa-value correct">{q.answer.correctAnswer}</span>
          </div>
          {q.answer.feedback && (
            <div className="qa-feedback">
              <span className="qa-label">ملاحظة التصحيح:</span>
              <p>{q.answer.feedback}</p>
            </div>
          )}
        </div>
        <button className="btn btn-ghost btn-block" onClick={() => navigate('/home')}>
          العودة للتقويم
        </button>
      </div>
    );
  }

  // ---- Result after successful submit ----
  if (result) {
    const ok = result.score === 100;
    return (
      <div className="app-shell">
        <Layout />
        <div className={`result-hero ${ok ? 'ok' : 'ko'}`}>
          <div className="result-check">{ok ? '✓' : '✕'}</div>
          <h1>{ok ? 'أحسنت! إجابة صحيحة' : 'إجابة غير صحيحة'}</h1>
          <p>أُجبت على سؤال اليوم {q.questionNumber} من رمضان.</p>
          <div className="result-score">
            النتيجة: <b>{ok ? '١٠٠٪' : '٠٪'}</b>
          </div>
        </div>
        <button className="btn btn-primary btn-block" onClick={() => navigate('/home')}>
          العودة للتقويم
        </button>
      </div>
    );
  }

  // ---- Available with session: timer + answer ----
  const canAnswer = sessionRemaining !== null && !expired;

  return (
    <div className="app-shell">
      <Layout />
      <ScreenTitle title={`السؤال رقم ${q.questionNumber}`} subtitle={`اليوم ${q.hijriDay} من رمضان`} />

      <div className="card q-body">
        {canAnswer ? (
          <>
            <div className="timer-bar">
              <Timer remaining={countdown.remaining} total={1800} />
              <div className="timer-label">
                <b>{expired ? 'انتهى الوقت' : 'الوقت المتبقي'}</b>
                <span>٣٠ دقيقة من أول مرة فتحت فيها السؤال</span>
              </div>
            </div>
            <p className="q-text">{q.questionText}</p>
            <div className="field">
              <label htmlFor="answer">إجابتك</label>
              <textarea
                id="answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="اكتب إجابتك هنا بجملة أو جملتين…"
                disabled={expired}
              />
              <p className="hint-text">{answer.trim().length} حرف — أجب بوضوح ودقة</p>
            </div>
            <button
              className="btn btn-primary btn-block"
              onClick={() => setConfirmOpen(true)}
              disabled={submitting || !answer.trim() || expired}
            >
              {submitting ? 'جاري الإرسال…' : 'إرسال الإجابة'}
            </button>
          </>
        ) : sessionRemaining === null ? (
          <>
            <p className="q-text">{q.questionText}</p>
            <div className="start-box">
              <p>السؤال متاح الآن. اضغط للبدء — يبدأ عدّاد الـ ٣٠ دقيقة من هذه اللحظة.</p>
              <button className="btn btn-primary btn-block" onClick={startSession} disabled={starting}>
                {starting ? 'جاري التحضير…' : 'ابدأ الإجابة الآن'}
              </button>
            </div>
          </>
        ) : (
          <div className="q-locked-inline">
            <h2>انتهى وقت السؤال</h2>
            <p>تجاوزت الـ ٣٠ دقيقة ولم تُجب — سيظهر السؤال كسؤالٍ فاتك في تقويمك.</p>
            <p className="q-text dim">{q.questionText}</p>
            <button className="btn btn-ghost btn-block" onClick={() => navigate('/home')}>
              العودة للتقويم
            </button>
          </div>
        )}
      </div>

      {/* Missed */}
      {q.status === 'MISSED' && (
        <div className="card q-missed">
          <div className="q-missed-icon">⏳</div>
          <h2>فاتك هذا السؤال</h2>
          <p>انتهى وقت يومه الهجري قبل أن تُجيب. يمكنك متابعة بقية أيام الشهر.</p>
          <p className="q-text dim">{q.questionText}</p>
          <button className="btn btn-ghost btn-block" onClick={() => navigate('/home')}>
            العودة للتقويم
          </button>
        </div>
      )}

      <Modal open={confirmOpen} title="تأكيد الإرسال" onClose={() => setConfirmOpen(false)}>
        <p className="confirm-text">هل أنت متأكد من إرسال إجابتك؟ لا يمكنك تعديلها بعد الإرسال.</p>
        <div className="confirm-box">{answer}</div>
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={() => setConfirmOpen(false)}>
            رجوع
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            نعم، أرسل
          </button>
        </div>
      </Modal>

      <Toast message={toast} />
    </div>
  );
}