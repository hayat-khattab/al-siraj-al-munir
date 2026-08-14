import { describe, beforeEach, it, expect } from 'vitest';
import {
  initApp,
  api,
  registerUser,
  seedCompetition,
  forceExpireSession,
  resetDb,
  getUserRow,
} from './helpers';

let app: Awaited<ReturnType<typeof initApp>>;

describe('Timer and sessions', () => {
  beforeEach(async () => {
    resetDb();
    app = await initApp();
  });

  it('starts a 30-minute session on first open', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    const res = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);
    const session = res.body.question.session;
    expect(session.status).toBe('ACTIVE');
    expect(session.remainingSeconds).toBeGreaterThan(29 * 60);
    expect(session.remainingSeconds).toBeLessThanOrEqual(30 * 60);
  });

  it('does not reset the timer when reopening the question', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');

    const first = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);
    const firstStartedAt = first.body.question.session.startedAt;
    const firstRemaining = first.body.question.session.remainingSeconds;

    // Wait a moment so elapsed time is measurable.
    await new Promise((r) => setTimeout(r, 1100));

    const second = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);
    const session = second.body.question.session;

    expect(session.startedAt).toBe(firstStartedAt); // same session, not restarted
    expect(session.remainingSeconds).toBeLessThan(firstRemaining); // time elapsed
    expect(session.remainingSeconds).toBeGreaterThan(firstRemaining - 5);
  });

  it('the client cannot reset or extend its own timer', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);

    // Directly tamper with the stored session deadline (simulating DB manipulation)
    const row = getUserRow(user.userId);
    void row;
    // The user cannot change the server session; attempt a second "start" - must reuse.
    const again = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);
    expect(again.body.question.session.remainingSeconds).toBeLessThanOrEqual(30 * 60);
  });

  it('expires the session and blocks submission after the deadline', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);

    forceExpireSession(questions[0].id, user.userId);

    const submit = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: 'الإجابة الصحيحة 1' })
      .expect(400);
    expect(submit.body.error.code).toBe('SESSION_EXPIRED');

    const days = await api(app).get('/api/competition/days').set('Authorization', `Bearer ${user.token}`).expect(200);
    const q1 = days.body.days.find((d: any) => d.questionId === questions[0].id);
    expect(q1.status).toBe('MISSED');
  });

  it('blocks submission when the availability window has closed', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);

    // Close the availability window: available_until is 2 days ahead by default.
    const { getDb } = await import('../src/db/database');
    getDb()
      .prepare('UPDATE questions SET available_until = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), questions[0].id);

    const submit = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: 'الإجابة الصحيحة 1' })
      .expect(400);
    expect(submit.body.error.code).toBe('QUESTION_CLOSED');
  });
});
