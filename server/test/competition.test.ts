import { describe, beforeEach, it, expect } from 'vitest';
import { initApp, api, registerUser, seedCompetition, addDays, resetDb } from './helpers';

let app: Awaited<ReturnType<typeof initApp>>;

describe('Competition availability', () => {
  beforeEach(async () => {
    resetDb();
    app = await initApp();
  });

  it('shows correct day states in the grid', async () => {
    const base = new Date(Date.now() - 86_400_000);
    base.setHours(0, 0, 0, 0);
    // q1 available window: [base+1, base+2) => question for "yesterday" available today
    // q2 available window: [base+2, base+3) => future
    const questions = await seedCompetition(base, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');

    const res = await api(app).get('/api/competition/days').set('Authorization', `Bearer ${user.token}`).expect(200);
    expect(res.body.days).toHaveLength(3);

    const q1 = res.body.days.find((d: any) => d.questionId === questions[0].id);
    const q2 = res.body.days.find((d: any) => d.questionId === questions[1].id);
    expect(q1.status).toBe('AVAILABLE');
    expect(q2.status).toBe('FUTURE');
  });

  it('never exposes the correct answer for an unanswered question', async () => {
    const base = new Date(Date.now() - 86_400_000);
    const questions = await seedCompetition(base, 2);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    const res = await api(app)
      .get(`/api/competition/questions/${questions[0].id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const q = res.body.question;
    expect(q.questionText).toBeTruthy();
    expect(q.correctAnswer).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('correctAnswer');
  });

  it('locks future questions and hides their content', async () => {
    const base = new Date(Date.now() - 86_400_000);
    const questions = await seedCompetition(base, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    const res = await api(app)
      .get(`/api/competition/questions/${questions[2].id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(res.body.question.questionText).toBeNull();
    expect(res.body.question.status).toBe('FUTURE');
    expect(res.body.question.message).toContain('غير متاح');
  });

  it('rejects starting a session for a future question', async () => {
    const base = new Date(Date.now() - 86_400_000);
    const questions = await seedCompetition(base, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    const res = await api(app)
      .post(`/api/competition/questions/${questions[2].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(400);
    expect(res.body.error.code).toBe('NOT_AVAILABLE_YET');
  });

  it('marks a closed unanswered question as missed', async () => {
    const base = new Date();
    base.setDate(base.getDate() - 10); // all questions already past
    const questions = await seedCompetition(base, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    const res = await api(app).get('/api/competition/days').set('Authorization', `Bearer ${user.token}`).expect(200);
    const q1 = res.body.days.find((d: any) => d.questionId === questions[0].id);
    expect(q1.status).toBe('MISSED');

    const detail = await api(app)
      .get(`/api/competition/questions/${questions[0].id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(detail.body.question.status).toBe('MISSED');
    expect(detail.body.question.message).toContain('فاتك');
    expect(detail.body.question.answer).toBeNull();
  });
});
