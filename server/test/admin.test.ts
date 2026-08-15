import { describe, beforeEach, it, expect } from 'vitest';
import {
  initApp,
  api,
  registerUser,
  seedCompetition,
  makeAdminByPhone,
  resetDb,
} from './helpers';

let app: Awaited<ReturnType<typeof initApp>>;

describe('Admin dashboard', () => {
  beforeEach(async () => {
    resetDb();
    app = await initApp();
  });

  it('creates, updates, disables, and re-enables questions', async () => {
    const admin = await registerUser(app, 'مدير مسابقة السراج', '+201000000001');
    makeAdminByPhone(admin.phone);

    const created = await api(app)
      .post('/api/admin/questions')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        questionNumber: 1,
        hijriDay: 1,
        hijriMonth: 'ربيع الأول',
        questionText: 'سؤال إداري جديد؟',
        correctAnswer: 'الجواب المعتمد',
        answerVariants: ['جواب معتمد'],
        availableFrom: new Date(Date.now() - 1000).toISOString(),
        availableUntil: new Date(Date.now() + 86_400_000).toISOString(),
        status: 'ACTIVE',
      })
      .expect(201);
    const questionId = created.body.question.id;

    const updated = await api(app)
      .put(`/api/admin/questions/${questionId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ questionText: 'سؤال إداري معدّل؟' })
      .expect(200);
    expect(updated.body.question.question_text).toBe('سؤال إداري معدّل؟');

    await api(app).delete(`/api/admin/questions/${questionId}`).set('Authorization', `Bearer ${admin.token}`).expect(200);

    const list = await api(app).get('/api/admin/questions').set('Authorization', `Bearer ${admin.token}`).expect(200);
    expect(list.body.questions.find((q: any) => q.id === questionId).status).toBe('DISABLED');
  });

  it('bulk-creates a competition month with automatic availability', async () => {
    const admin = await registerUser(app, 'مدير مسابقة السراج', '+201000000001');
    makeAdminByPhone(admin.phone);

    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    const baseDate = yesterday.toISOString().slice(0, 10);

    const res = await api(app)
      .post('/api/admin/questions/bulk')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        baseDate,
        hijriMonth: 'ربيع الأول',
        questions: [
          { questionNumber: 1, hijriDay: 1, questionText: 'س 1؟', correctAnswer: 'ج 1' },
          { questionNumber: 2, hijriDay: 2, questionText: 'س 2؟', correctAnswer: 'ج 2' },
          { questionNumber: 3, hijriDay: 3, questionText: 'س 3؟', correctAnswer: 'ج 3' },
        ],
      })
      .expect(201);
    expect(res.body.created).toBe(3);

    const list = await api(app).get('/api/admin/questions').set('Authorization', `Bearer ${admin.token}`).expect(200);
    expect(list.body.questions).toHaveLength(3);
  });

  it('lists users and their participation', async () => {
    const admin = await registerUser(app, 'مدير مسابقة السراج', '+201000000001');
    makeAdminByPhone(admin.phone);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');

    const questions = await seedCompetition(undefined, 2);
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
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .query({ search: 'أحمد' })
      .expect(200);
    const target = res.body.users.find((u: any) => u.id === user.userId);
    expect(target).toBeTruthy();
    expect(target.answeredCount).toBe(1);
  });

  it('shows answers with evaluation details', async () => {
    const admin = await registerUser(app, 'مدير مسابقة السراج', '+201000000001');
    makeAdminByPhone(admin.phone);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');

    const questions = await seedCompetition(undefined, 2);
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: 'الإجابة الصحيحة 1' })
      .expect(201);

    const res = await api(app).get('/api/admin/answers').set('Authorization', `Bearer ${admin.token}`).expect(200);
    expect(res.body.answers).toHaveLength(1);
    expect(res.body.answers[0].userName).toBe('أحمد محمد علي');
    expect(res.body.answers[0].score).toBe(100);
  });

  it('re-evaluates an answer', async () => {
    const admin = await registerUser(app, 'مدير مسابقة السراج', '+201000000001');
    makeAdminByPhone(admin.phone);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');

    const questions = await seedCompetition(undefined, 2);
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);
    const submitted = await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: 'الإجابة الصحيحة 1' })
      .expect(201);

    const res = await api(app)
      .post(`/api/admin/answers/${submitted.body.answer.answerId}/re-evaluate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    expect(res.body.answer.score).toBe(100);
  });

  it('computes competition statistics', async () => {
    const admin = await registerUser(app, 'مدير مسابقة السراج', '+201000000001');
    makeAdminByPhone(admin.phone);
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');

    const questions = await seedCompetition(undefined, 2);
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/start`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(201);
    await api(app)
      .post(`/api/competition/questions/${questions[0].id}/submit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ answer: 'الإجابة الصحيحة 1' })
      .expect(201);

    const res = await api(app).get('/api/admin/statistics').set('Authorization', `Bearer ${admin.token}`).expect(200);
    const stats = res.body.statistics;
    expect(stats.totalUsers).toBe(2);
    expect(stats.activeParticipants).toBe(1);
    expect(stats.totalAnswers).toBe(1);
    expect(stats.correctAnswers).toBe(1);
    expect(stats.correctRate).toBe(100);
  });

  it('lists a member\'s per-question answers with timing and evaluation', async () => {
    const adminRes = await api(app)
      .post('/api/auth/admin-login')
      .send({ username: 'root', password: 'admin2root' })
      .expect(200);
    const adminToken = adminRes.body.token;

    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    const questions = await seedCompetition(undefined, 2);
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
      .get(`/api/admin/users/${user.userId}/answers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.answers).toHaveLength(2);
    const q1 = res.body.answers.find((a: any) => a.questionNumber === 1);
    expect(q1.correction).toBe('CORRECT');
    expect(q1.startedAt).not.toBeNull();
    expect(q1.submittedAt).not.toBeNull();
    expect(q1.timeTakenSeconds).not.toBeNull();
    expect(q1.correctAnswer).toBeTruthy();

    const q2 = res.body.answers.find((a: any) => a.questionNumber === 2);
    expect(q2.answerId).toBeNull();
    expect(q2.sessionStatus).toBeNull();
  });
});
