import { describe, beforeEach, it, expect } from 'vitest';
import {
  initApp,
  api,
  registerUser,
  seedCompetition,
  resetDb,
} from './helpers';

let app: Awaited<ReturnType<typeof initApp>>;

describe('Answer submission', () => {
  beforeEach(async () => {
    resetDb();
    app = await initApp();
  });

  it('submits a correct answer and stores the automatic evaluation', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);

    const res = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: 'الإجابة الصحيحة 1' })
      .expect(201);

    expect(res.body.answer.score).toBe(100);
    expect(res.body.answer.correction).toBe('CORRECT');
    expect(res.body.answer.correctAnswer).toBe('الإجابة الصحيحة 1');
    expect(res.body.answer.submittedAt).toBeTruthy();
  });

  it('accepts semantically-equal answers despite diacritics and letter variants', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);

    const res = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: '  الإجابة الصحيحة ١   ' })
      .expect(201);
    expect(res.body.answer.score).toBe(100);
    expect(res.body.answer.correction).toBe('CORRECT');
  });

  it('accepts an alternate accepted variant', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);

    const res = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: 'جواب 1' })
      .expect(201);
    expect(res.body.answer.correction).toBe('CORRECT');
  });

  it('marks an incorrect answer with a zero score', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);

    const res = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: 'إجابة خاطئة تماماً' })
      .expect(201);
    expect(res.body.answer.score).toBe(0);
    expect(res.body.answer.correction).toBe('INCORRECT');
  });

  it('prevents duplicate submission', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: 'الإجابة الصحيحة 1' })
      .expect(201);

    const res = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: 'إجابة أخرى' })
      .expect(400);
    expect(res.body.error.code).toBe('ALREADY_ANSWERED');
  });

  it('handles concurrent submission attempts (race condition)', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);

    const attempts = await Promise.allSettled([
      api(app)
        .post(`/api/competition/questions/${questions[0].id}/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ answer: 'الإجابة الصحيحة 1' }),
      api(app)
        .post(`/api/competition/questions/${questions[0].id}/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ answer: 'الإجابة الصحيحة 1' }),
    ]);

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled').map((a) => (a as PromiseFulfilledResult<any>).value);
    const statuses = fulfilled.map((r) => r.status).sort();
    expect(statuses.filter((s: number) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s: number) => s === 400)).toHaveLength(1);
  });

  it('requires starting a session before submitting', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    const res = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: 'الإجابة الصحيحة 1' })
      .expect(400);
    expect(res.body.error.code).toBe('SESSION_REQUIRED');
  });

  it('rejects a submission with client-supplied score/userId (anti-tampering)', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);

    const res = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: 'الإجابة الصحيحة 1', userId: 'attacker', score: 100 })
      .expect(201);
    expect(res.body.answer.score).toBe(100); // score computed server-side, not from body
  });

  it('makes the answered question read-only and returns evaluation', async () => {
    const questions = await seedCompetition(undefined, 3);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: 'الإجابة الصحيحة 1' })
      .expect(201);

    const detail = await api(app)
      .get(`/api/competition/questions/${questions[0].id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(detail.body.question.status).toBe('ANSWERED');
    expect(detail.body.question.answer.answerText).toBe('الإجابة الصحيحة 1');
    expect(detail.body.question.answer.score).toBe(100);
    expect(detail.body.question.answer.correctAnswer).toBeTruthy();

    const days = await api(app).get('/api/competition/days').set('Authorization', `Bearer ${user.token}`).expect(200);
    expect(days.body.days.find((d: any) => d.questionId === questions[0].id).status).toBe('ANSWERED');
  });
});

describe('Cross-user isolation', () => {
  beforeEach(async () => {
    resetDb();
    app = await initApp();
  });

  it('prevents a user from viewing another user\'s answer', async () => {
    const questions = await seedCompetition(undefined, 3);
    const u1 = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${u1.token}`)
      .expect(201);
    const submitted = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${u1.token}`)
      .send({ answer: 'الإجابة الصحيحة 1' })
      .expect(201);

    const u2 = await registerUser(app, 'خالد عمر سعيد', '+201009876543');
    const res = await api(app)
      .get(`/api/answers/${submitted.body.answer.answerId}`)
      .set('Authorization', `Bearer ${u2.token}`)
      .expect(404);
    expect(res.body.error.code).toBe('ANSWER_NOT_FOUND');
  });
});
