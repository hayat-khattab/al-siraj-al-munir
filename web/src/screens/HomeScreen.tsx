import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { CompetitionDay } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import Layout, { ScreenTitle } from '../components/Layout';
import './HomeScreen.css';

const STATUS_LABEL: Record<string, string> = {
  ANSWERED: 'أجبت',
  AVAILABLE: 'متاح',
  MISSED: 'فاتك',
  FUTURE: '',
};

function dayNumberToArabic(n: number): string {
  const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(n).split('').map((c) => map[+c]).join('');
}

function DayCard({ d }: { d: CompetitionDay }) {
  const navigate = useNavigate();
  const clickable = d.status !== 'FUTURE' && d.questionId;
  return (
    <button
      className={`day-card day-${d.status.toLowerCase()}`}
      disabled={!clickable}
      onClick={() => clickable && navigate(`/question/${d.questionId}`)}
    >
      <span className="day-num">{dayNumberToArabic(d.hijriDay)}</span>
      <span className="day-hijri">{d.hijriMonth}</span>
      {d.status !== 'FUTURE' && <span className="day-badge">{STATUS_LABEL[d.status]}</span>}
    </button>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [days, setDays] = useState<CompetitionDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ days: CompetitionDay[] }>('/competition/days')
      .then((r) => setDays(r.days))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="app-shell">
      <Layout />
      <ScreenTitle title={`أهلاً بك، ${user?.fullName?.split(/\s+/)[0] || ''}`} subtitle="أجب عن السؤال اليومي كل يوم هجري، في موعده" />

      <div className="card rules-card">
        <div className="rules-head">
          <span className="rules-icon">◆</span>
          <h2>كيف تلعب؟</h2>
        </div>
        <ol className="rules-list">
          <li>يُفتح السؤال اليومي في يومه الهجري لمدة ٢٤ ساعة.</li>
          <li>من لحظة فتح السؤال أمامك، لديك <b>٣٠ دقيقة</b> للإجابة.</li>
          <li>إجابة واحدة فقط لكل سؤال — اكتبها بدقة.</li>
          <li>تقويم ٣٠ يوماً كاملة بانتظار إجاباتك.</li>
        </ol>
      </div>

      <h3 className="grid-title">تقويم الشهر</h3>

      {error && <div className="error-text">{error}</div>}

      {!days && !error ? (
        <div className="spinner" />
      ) : (
        <div className="days-grid">
          {days?.map((d) => <DayCard key={d.hijriDay} d={d} />)}
        </div>
      )}

      <p className="grid-legend">
        <span className="legend-dot dot-available" /> متاح الآن
        <span className="legend-dot dot-answered" /> أُجيب
        <span className="legend-dot dot-missed" /> انتهى وقته
      </p>
    </div>
  );
}