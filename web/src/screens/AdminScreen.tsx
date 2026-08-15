import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AdminAnswer, AdminQuestion, AdminStats, AdminUser, UserAnswerAdminRow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import Layout, { ScreenTitle } from '../components/Layout';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import './AdminScreen.css';

type Tab = 'stats' | 'questions' | 'users' | 'answers';

const AR_NUM: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤', '5': '٥',
  '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};
const toAr = (n: number | null | undefined): string =>
  String(n ?? 0).split('').map((c) => AR_NUM[c] ?? c).join('');

const MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];

export default function AdminScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('stats');
  const [toast, setToast] = useState<string | null>(null);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="app-shell">
        <Layout />
        <ScreenTitle title="لوحة التحكم" />
        <div className="card q-error">
          <p>هذه الصفحة متاحة للمشرفين فقط.</p>
          <button className="btn btn-ghost" onClick={() => navigate('/home')}>
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell admin">
      <Layout />
      <ScreenTitle title="لوحة التحكم" subtitle="إدارة محتوى المسابقة والمشاركين" />
      <div className="admin-tabs">
        {(
          [
            ['stats', 'الإحصائيات'],
            ['questions', 'الأسئلة'],
            ['users', 'المستخدمون'],
            ['answers', 'الإجابات'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={`admin-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'stats' && <StatsTab />}
      {tab === 'questions' && <QuestionsTab />}
      {tab === 'users' && <UsersTab onToast={setToast} />}
      {tab === 'answers' && <AnswersTab onToast={setToast} />}
      <Toast message={toast} />
    </div>
  );
}

// ---------------------------------------------------------------- Stats
function StatsTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  useEffect(() => {
    api.get<{ statistics: AdminStats }>('/admin/statistics').then((r) => setStats(r.statistics)).catch(() => {});
  }, []);

  if (!stats) return <div className="spinner" />;

  const cards: [string, string, string][] = [
    ['إجمالي المستخدمين', toAr(stats.totalUsers), 'u'],
    ['مشاركون نشطون', toAr(stats.activeParticipants), 'u'],
    ['إجابات الآن (24 ساعة)', toAr(stats.todayParticipants), 'u'],
    ['معدل الإجابات الصحيحة', `${toAr(stats.correctRate)}٪`, 'o'],
    ['إجابات صحيحة', toAr(stats.correctAnswers), 'o'],
    ['إجابات خاطئة', toAr(stats.incorrectAnswers), 'o'],
    ['أسئلة فاتت', toAr(stats.missedQuestions), 'm'],
    ['متوسط وقت الإجابة', `${toAr(stats.avgAnswerTimeSeconds)} ث`, 't'],
    ['إجمالي الأسئلة', toAr(stats.totalQuestions), 'q'],
  ];

  return (
    <div className="stats-grid">
      {cards.map(([label, value, tone]) => (
        <div key={label} className={`stat-card tone-${tone}`}>
          <span className="stat-value">{value}</span>
          <span className="stat-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Questions
function QuestionsTab() {
  const [questions, setQuestions] = useState<AdminQuestion[] | null>(null);
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; q: AdminQuestion }>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<{ questions: AdminQuestion[] }>('/admin/questions')
      .then((r) => setQuestions(r.questions))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function remove(q: AdminQuestion) {
    if (!window.confirm(`تحذير: تعطيل السؤال رقم ${q.question_number}؟`)) return;
    await api.delete(`/admin/questions/${q.id}`);
    setToast('تم تعطيل السؤال');
    load();
  }

  function toggle(q: AdminQuestion) {
    const next = q.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    api
      .put(`/admin/questions/${q.id}`, { status: next })
      .then(() => {
        setToast(next === 'ACTIVE' ? 'تم تفعيل السؤال' : 'تم تعطيل السؤال');
        load();
      })
      .catch((e) => setToast(e instanceof ApiError ? e.message : 'خطأ'));
  }

  return (
    <>
      <div className="admin-row">
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
          إضافة سؤال
        </button>
      </div>
      {!questions && <div className="spinner" />}
      <div className="admin-list">
        {questions?.map((q) => (
          <div key={q.id} className={`admin-item ${q.status !== 'ACTIVE' ? 'dimmed' : ''}`}>
            <span className="admin-item-badge">{toAr(q.question_number)}</span>
            <div className="admin-item-main">
              <p className="admin-item-title">{q.question_text}</p>
              <p className="admin-item-sub">
                اليوم {toAr(q.hijri_day)} — {q.hijri_month}
              </p>
            </div>
            <div className="admin-item-actions">
              <button className="mini-btn" onClick={() => setModal({ mode: 'edit', q })}>
                تعديل
              </button>
              <button className="mini-btn toggle" onClick={() => toggle(q)}>
                {q.status === 'ACTIVE' ? 'تعطيل' : 'تفعيل'}
              </button>
              <button className="mini-btn danger" onClick={() => remove(q)}>
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>
      {modal && (
        <QuestionModal
          existing={modal.mode === 'edit' ? modal.q : null}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            setToast('تم الحفظ');
            load();
          }}
        />
      )}
      <Toast message={toast} />
    </>
  );
}

function QuestionModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: AdminQuestion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => ({
    questionNumber: existing?.question_number ?? 1,
    hijriDay: existing?.hijri_day ?? 1,
    hijriMonth: existing?.hijri_month ?? MONTHS[0],
    questionText: existing?.question_text ?? '',
    correctAnswer: existing?.correct_answer ?? '',
    availableFrom: existing?.available_from?.slice(0, 16) ?? '',
    availableUntil: existing?.available_until?.slice(0, 16) ?? '',
    status: existing?.status ?? 'ACTIVE',
    variants: existing ? (JSON.parse(existing.answer_variants || '[]') as string[]).join('\n') : '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.questionText.trim() || !form.correctAnswer.trim()) {
      setError('أكمل نص السؤال والإجابة الصحيحة');
      return;
    }
    const payload = {
      questionNumber: Number(form.questionNumber),
      hijriDay: Number(form.hijriDay),
      hijriMonth: form.hijriMonth,
      questionText: form.questionText.trim(),
      correctAnswer: form.correctAnswer.trim(),
      availableFrom: (form.availableFrom ? new Date(form.availableFrom) : new Date()).toISOString(),
      availableUntil: (form.availableUntil ? new Date(form.availableUntil) : new Date()).toISOString(),
      status: form.status as 'DRAFT' | 'ACTIVE' | 'DISABLED',
      answerVariants: form.variants.split('\n').map((v: string) => v.trim()).filter(Boolean),
    };
    setSaving(true);
    try {
      if (existing) {
        await api.put(`/admin/questions/${existing.id}`, payload);
      } else {
        await api.post('/admin/questions', payload);
      }
      onSaved();
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={existing ? `تعديل سؤال رقم ${existing.question_number}` : 'إضافة سؤال جديد'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="grid-2">
          <div className="field">
            <label>رقم السؤال</label>
            <input type="number" min={1} max={30} value={form.questionNumber} onChange={(e) => set('questionNumber', +e.target.value)} />
          </div>
          <div className="field">
            <label>اليوم الهجري</label>
            <input type="number" min={1} max={30} value={form.hijriDay} onChange={(e) => set('hijriDay', +e.target.value)} />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>الشهر الهجري</label>
            <select value={form.hijriMonth} onChange={(e) => set('hijriMonth', e.target.value)}>
              {MONTHS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>الحالة</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="ACTIVE">نشط</option>
              <option value="DRAFT">مسودة</option>
              <option value="DISABLED">معطل</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>نص السؤال</label>
          <textarea value={form.questionText} onChange={(e) => set('questionText', e.target.value)} placeholder="نص السؤال…" />
        </div>
        <div className="field">
          <label>الإجابة الصحيحة</label>
          <textarea value={form.correctAnswer} onChange={(e) => set('correctAnswer', e.target.value)} placeholder="الإجابة المرجعية…" />
        </div>
        <div className="field">
          <label>صيغ مقبولة إضافية (سطر لكل صيغة)</label>
          <textarea value={form.variants} onChange={(e) => set('variants', e.target.value)} placeholder="مثال:\nأبو بكر الصديق" />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>الإتاحة من</label>
            <input type="datetime-local" value={form.availableFrom} onChange={(e) => set('availableFrom', e.target.value)} />
          </div>
          <div className="field">
            <label>الإتاحة حتى</label>
            <input type="datetime-local" value={form.availableUntil} onChange={(e) => set('availableUntil', e.target.value)} />
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'جاري الحفظ…' : 'حفظ'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Users
function UsersTab({ onToast }: { onToast: (s: string) => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [answersMap, setAnswersMap] = useState<Record<string, UserAnswerAdminRow[]>>({});
  const [loadingAnswers, setLoadingAnswers] = useState<Record<string, boolean>>({});

  const load = useCallback(
    (q?: string) => {
      api
        .get<{ users: AdminUser[] }>(`/admin/users${q ? `?search=${encodeURIComponent(q)}` : ''}`)
        .then((r) => setUsers(r.users))
        .catch(() => {});
    },
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  const onSearch = (v: string) => {
    setSearch(v);
    load(v);
  };

  function toggleRole(u: AdminUser) {
    const next = u.role === 'ADMIN' ? 'USER' : 'ADMIN';
    api.patch(`/admin/users/${u.id}/role`, { role: next }).then(() => {
      onToast('تم تحديث الصلاحية');
      load(search);
    });
  }

  function toggleStatus(u: AdminUser) {
    const next = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    api.patch(`/admin/users/${u.id}/status`, { status: next }).then(() => {
      onToast('تم تحديث الحالة');
      load(search);
    });
  }

  function openAnswers(u: AdminUser) {
    setExpanded((e) => ({ ...e, [u.id]: !e[u.id] }));
    if (!expanded[u.id] && !answersMap[u.id]) {
      setLoadingAnswers((l) => ({ ...l, [u.id]: true }));
      api
        .get<{ answers: UserAnswerAdminRow[] }>(`/admin/users/${u.id}/answers`)
        .then((r) => {
          setAnswersMap((m) => ({ ...m, [u.id]: r.answers }));
        })
        .catch((e) => onToast(e instanceof ApiError ? e.message : 'خطأ'))
        .finally(() => setLoadingAnswers((l) => ({ ...l, [u.id]: false })));
    }
  }

  return (
    <>
      <div className="admin-row">
        <input className="search-input" placeholder="ابحث بالاسم أو الرقم…" value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      {!users && <div className="spinner" />}
      <div className="admin-list">
        {users?.map((u) => (
          <div key={u.id} className={`admin-item ${u.status !== 'ACTIVE' ? 'dimmed' : ''}`}>
            <span className="user-avatar">{u.fullName?.trim().charAt(0) || 'م'}</span>
            <div className="admin-item-main">
              <p className="admin-item-title">
                {u.fullName}
                {u.role === 'ADMIN' && <span className="role-chip">مشرف</span>}
              </p>
              <p className="admin-item-sub" dir="ltr" style={{ textAlign: 'right' }}>
                {u.whatsappNumber} — {toAr(u.answeredCount)} إجابة
              </p>
            </div>
            <div className="admin-item-actions">
              <button className="mini-btn" onClick={() => openAnswers(u)}>
                {expanded[u.id] ? 'إخفاء' : 'الإجابات'}
              </button>
              <button className="mini-btn toggle" onClick={() => toggleRole(u)}>
                {u.role === 'ADMIN' ? 'إزالة إشراف' : 'إشراف'}
              </button>
              <button className={`mini-btn ${u.status === 'ACTIVE' ? '' : 'toggle'}`} onClick={() => toggleStatus(u)}>
                {u.status === 'ACTIVE' ? 'تجميد' : 'تفعيل'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {Object.keys(expanded).map(
        (uid) =>
          expanded[uid] && (
            <UserAnswersPanel
              key={uid}
              userId={uid}
              answers={answersMap[uid] ?? []}
              loading={loadingAnswers[uid] ?? false}
            />
          ),
      )}
    </>
  );
}

function UserAnswersPanel({
  userId,
  answers,
  loading,
}: {
  userId: string;
  answers: UserAnswerAdminRow[];
  loading: boolean;
}) {
  const row = (label: string, value: string | number | null) => (
    <div className="answer-row">
      <span className="answer-label">{label}</span>
      <span className="answer-value">{value ?? '—'}</span>
    </div>
  );

  return (
    <div className="answers-panel">
      <h3>إجابات العضو</h3>
      {loading && <div className="spinner" />}
      {!loading && answers.length === 0 && <p className="hint-text">لم يُجرَ جلسة ولا إجابة بعد.</p>}
      {!loading &&
        answers.map((a) => {
          const ok = a.correction === 'CORRECT';
          const answered = a.answerId !== null;
          return (
            <div key={a.questionNumber} className="answer-card">
              <div className="answer-head">
                <strong>السؤال {toAr(a.questionNumber)} — اليوم {toAr(a.hijriDay)} {a.hijriMonth}</strong>
                {answered ? (
                  <span className={`badge ${ok ? 'ok' : 'bad'}`}>{ok ? 'صح' : 'خطأ'}</span>
                ) : (
                  <span className="badge neutral">لم يُجرَب</span>
                )}
              </div>
              <p className="answer-q">{a.questionText}</p>
              {answered ? (
                <p className="answer-user">{a.answerText}</p>
              ) : (
                <p className="answer-user dimmed">بدون إجابة</p>
              )}
              <div className="answer-grid">
                {row('بدء الجلسة', a.startedAt ? new Date(a.startedAt).toLocaleString('ar-EG') : null)}
                {row('نهاية/إنتهاء', a.endedAt ?? a.expiresAt ? new Date(a.endedAt ?? a.expiresAt!).toLocaleString('ar-EG') : null)}
                {row('الإرسال', a.submittedAt ? new Date(a.submittedAt).toLocaleString('ar-EG') : null)}
                {row('وقت الإجابة', a.timeTakenSeconds !== null ? `${toAr(a.timeTakenSeconds)} ث` : null)}
                {row('التقييم', a.correction)}
                {row('الإجابة الصحيحة', a.correctAnswer)}
              </div>
            </div>
          );
        })}
    </div>
  );
}

// ---------------------------------------------------------------- Answers
function AnswersTab({ onToast }: { onToast: (s: string) => void }) {
  const [answers, setAnswers] = useState<AdminAnswer[] | null>(null);

  const load = useCallback(() => {
    api.get<{ answers: AdminAnswer[] }>('/admin/answers').then((r) => setAnswers(r.answers)).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function reEvaluate(id: string) {
    api
      .post(`/admin/answers/${id}/re-evaluate`)
      .then(() => {
        onToast('تمت إعادة التقييم');
        load();
      })
      .catch((e) => onToast(e instanceof ApiError ? e.message : 'خطأ'));
  }

  return (
    <>
      {!answers && <div className="spinner" />}
      <div className="admin-list">
        {answers?.map((a) => {
          const ok = a.correction === 'CORRECT';
          return (
            <div key={a.answerId} className="admin-item">
              <span className={`answer-badge ${ok ? 'ok' : 'bad'}`}>{ok ? '✓' : '✕'}</span>
              <div className="admin-item-main">
                <p className="admin-item-title">
                  {a.userName} — السؤال {toAr(a.questionNumber)}
                </p>
                <p className="admin-item-answer">{a.answerText}</p>
                <p className="admin-item-sub" dir="ltr" style={{ textAlign: 'right' }}>
                  {a.correctAnswer} · {a.timeTakenSeconds !== null ? `${toAr(a.timeTakenSeconds)} ث` : '—'}
                </p>
              </div>
              <div className="admin-item-actions">
                <button className="mini-btn" onClick={() => reEvaluate(a.answerId)}>
                  إعادة تقييم
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}