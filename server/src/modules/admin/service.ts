import crypto from 'node:crypto';
import { getDb, nowIso, audit, type AnswerRow, type UserRow } from '../../db/database';
import { AppError } from '../../util/errors';
import { answerEvaluationService, evaluationConfig } from '../evaluation/index';
import { endOfDayInTz } from '../../util/time';
import { normalizeArabic } from '../evaluation/normalize';
import { config } from '../../config';

export interface QuestionInput {
  questionNumber: number;
  hijriDay: number;
  hijriMonth: string;
  questionText: string;
  correctAnswer: string;
  answerVariants?: string[];
  availableFrom: string;
  availableUntil: string;
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED';
}

export interface BulkQuestionInput {
  questionNumber: number;
  hijriDay: number;
  questionText: string;
  correctAnswer: string;
  answerVariants?: string[];
}

export function createQuestion(input: QuestionInput) {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  try {
    db.prepare(
      `INSERT INTO questions
         (id, question_number, hijri_day, hijri_month, question_text, correct_answer, answer_variants, available_from, available_until, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.questionNumber,
      input.hijriDay,
      input.hijriMonth,
      input.questionText,
      input.correctAnswer,
      JSON.stringify(input.answerVariants ?? []),
      input.availableFrom,
      input.availableUntil,
      input.status,
      now,
      now,
    );
  } catch (err: any) {
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw AppError.conflict('QUESTION_EXISTS', 'رقم السؤال مسجل مسبقاً لهذا الشهر.');
    }
    throw err;
  }
  audit('ADMIN_CREATED_QUESTION', null, { id, questionNumber: input.questionNumber });
  return getQuestionById(id);
}

export function getQuestionById(id: string) {
  return getDb().prepare('SELECT * FROM questions WHERE id = ?').get(id);
}

export function listAllQuestions() {
  return getDb().prepare('SELECT * FROM questions ORDER BY question_number ASC').all();
}

export function updateQuestion(id: string, patch: Partial<QuestionInput>) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as
    | {
        question_number: number;
        hijri_day: number;
        hijri_month: string;
        question_text: string;
        correct_answer: string;
        answer_variants: string;
        available_from: string;
        available_until: string;
        status: 'DRAFT' | 'ACTIVE' | 'DISABLED';
      }
    | undefined;
  if (!existing) throw AppError.notFound('QUESTION_NOT_FOUND', 'السؤال غير موجود.');

  const merged = {
    questionNumber: patch.questionNumber ?? existing.question_number,
    hijriDay: patch.hijriDay ?? existing.hijri_day,
    hijriMonth: patch.hijriMonth ?? existing.hijri_month,
    questionText: patch.questionText ?? existing.question_text,
    correctAnswer: patch.correctAnswer ?? existing.correct_answer,
    answerVariants: patch.answerVariants !== undefined ? patch.answerVariants : JSON.parse(existing.answer_variants ?? '[]'),
    availableFrom: patch.availableFrom ?? existing.available_from,
    availableUntil: patch.availableUntil ?? existing.available_until,
    status: patch.status ?? existing.status,
  };

  try {
    db.prepare(
      `UPDATE questions SET
         question_number = ?, hijri_day = ?, hijri_month = ?, question_text = ?, correct_answer = ?,
         answer_variants = ?, available_from = ?, available_until = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      merged.questionNumber,
      merged.hijriDay,
      merged.hijriMonth,
      merged.questionText,
      merged.correctAnswer,
      JSON.stringify(merged.answerVariants),
      merged.availableFrom,
      merged.availableUntil,
      merged.status,
      nowIso(),
      id,
    );
  } catch (err: any) {
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw AppError.conflict('QUESTION_EXISTS', 'رقم السؤال مسجل مسبقاً لهذا الشهر.');
    }
    throw err;
  }
  audit('ADMIN_UPDATED_QUESTION', null, { id });
  return getQuestionById(id);
}

export function deleteQuestion(id: string): void {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  if (!existing) throw AppError.notFound('QUESTION_NOT_FOUND', 'السؤال غير موجود.');
  db.prepare("UPDATE questions SET status = 'DISABLED', updated_at = ? WHERE id = ?").run(nowIso(), id);
  audit('ADMIN_DISABLED_QUESTION', null, { id });
}

/**
 * Bulk-creates a full competition month. Availability is derived from the
 * competition rule automatically:
 *   question for Hijri day D becomes available on day D+1.
 *
 * @param baseDate Gregorian date (YYYY-MM-DD) of Hijri day 1.
 */
export function bulkCreateQuestions(items: BulkQuestionInput[], baseDate: string): { created: number } {
  const base = new Date(baseDate);
  if (Number.isNaN(base.getTime())) {
    throw AppError.badRequest('INVALID_DATE', 'التاريخ الأساسي غير صالح.');
  }
  const tz = config.competitionTimezone;
  const db = getDb();

  for (const item of items) {
    const dayOffset = item.hijriDay - 1;
    const questionDay = new Date(base.getTime() + dayOffset * 86_400_000).toISOString();
    const availableFrom = new Date(new Date(questionDay).getTime() + 86_400_000).toISOString();
    const availableUntil = endOfDayInTz(availableFrom, tz);

    createQuestion({
      questionNumber: item.questionNumber,
      hijriDay: item.hijriDay,
      hijriMonth: 'ربيع الأول',
      questionText: item.questionText,
      correctAnswer: item.correctAnswer,
      answerVariants: item.answerVariants,
      availableFrom,
      availableUntil,
      status: 'ACTIVE',
    });
    void db;
  }

  return { created: items.length };
}

export interface UserAdminRow {
  id: string;
  fullName: string;
  whatsappNumber: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  answeredCount: number;
}

export function listUsers(search?: string): UserAdminRow[] {
  const db = getDb();
  const like = search ? `%${search.replace(/[%_]/g, (m) => `\\${m}`)}%` : null;
  const rows = db
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM answers a WHERE a.user_id = u.id) AS answered_count
       FROM users u
        ${like ? "WHERE u.full_name LIKE ? ESCAPE '\\' OR u.whatsapp_number LIKE ? ESCAPE '\\' OR u.whatsapp_normalized LIKE ? ESCAPE '\\'" : ''}
       ORDER BY u.created_at DESC
       LIMIT 500`,
    )
    .all(...(like ? [like, like, like] : [])) as (UserRow & { answered_count: number })[];

  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    whatsappNumber: r.whatsapp_number,
    role: r.role,
    status: r.status,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
    answeredCount: r.answered_count,
  }));
}

export function setUserRole(userId: string, role: 'USER' | 'ADMIN'): void {
  getDb().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  audit('ADMIN_SET_ROLE', userId, { role });
}

export function setUserStatus(userId: string, status: 'ACTIVE' | 'DISABLED'): void {
  getDb().prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);
  audit('ADMIN_SET_STATUS', userId, { status });
}

export interface AnswerAdminRow {
  answerId: string;
  userId: string;
  userName: string;
  userPhone: string;
  questionId: string;
  questionNumber: number;
  hijriDay: number;
  hijriMonth: string;
  answerText: string;
  submittedAt: string;
  score: number | null;
  correction: string | null;
  feedback: string | null;
  correctAnswer: string | null;
  timeTakenSeconds: number | null;
}

export function listAnswers(opts: { questionNumber?: number; correction?: 'CORRECT' | 'INCORRECT'; limit?: number }): AnswerAdminRow[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.questionNumber !== undefined) {
    conditions.push('q.question_number = ?');
    params.push(opts.questionNumber);
  }
  if (opts.correction) {
    conditions.push('a.automatic_correction = ?');
    params.push(opts.correction);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(opts.limit ?? 200, 1000);

  const rows = db
    .prepare(
      `SELECT a.id AS answer_id, a.user_id, u.full_name AS user_name, u.whatsapp_number AS user_phone,
              a.question_id, q.question_number, q.hijri_day, q.hijri_month,
              a.answer_text, a.submitted_at, a.automatic_score, a.automatic_correction,
              a.correction_feedback, a.correct_answer,
              (strftime('%s', a.submitted_at) - strftime('%s', COALESCE(
                (SELECT s.started_at FROM question_sessions s WHERE s.question_id = a.question_id AND s.user_id = a.user_id),
                a.submitted_at))) AS time_taken_seconds
       FROM answers a
       JOIN users u ON u.id = a.user_id
       JOIN questions q ON q.id = a.question_id
       ${where}
       ORDER BY a.submitted_at DESC
       LIMIT ?`,
    )
    .all(...params, limit) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    answerId: String(r.answer_id),
    userId: String(r.user_id),
    userName: String(r.user_name),
    userPhone: String(r.user_phone),
    questionId: String(r.question_id),
    questionNumber: Number(r.question_number),
    hijriDay: Number(r.hijri_day),
    hijriMonth: String(r.hijri_month),
    answerText: String(r.answer_text),
    submittedAt: String(r.submitted_at),
    score: r.automatic_score === null ? null : Number(r.automatic_score),
    correction: r.automatic_correction === null ? null : String(r.automatic_correction),
    feedback: r.correction_feedback === null ? null : String(r.correction_feedback),
    correctAnswer: r.correct_answer === null ? null : String(r.correct_answer),
    timeTakenSeconds: r.time_taken_seconds === null ? null : Math.max(0, Math.round(Number(r.time_taken_seconds))),
  }));
}

export function reEvaluateAnswer(answerId: string) {
  const db = getDb();
  const answer = db.prepare('SELECT * FROM answers WHERE id = ?').get(answerId) as AnswerRow | undefined;
  if (!answer) throw AppError.notFound('ANSWER_NOT_FOUND', 'الإجابة غير موجودة.');
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(answer.question_id) as
    | { correct_answer: string; answer_variants: string }
    | undefined;
  if (!question) throw AppError.notFound('QUESTION_NOT_FOUND', 'السؤال غير موجود.');

  let variants: string[] = [];
  try {
    const parsed = JSON.parse(question.answer_variants ?? '[]');
    if (Array.isArray(parsed)) variants = parsed.filter((v) => typeof v === 'string');
  } catch {
    variants = [];
  }

  const evaluation = answerEvaluationService.evaluate({
    userAnswer: answer.answer_text,
    correctAnswer: question.correct_answer,
    acceptedVariants: variants,
  });

  db.prepare(
    `UPDATE answers SET automatic_score = ?, automatic_correction = ?, correction_feedback = ?, correct_answer = ?, corrected_at = ?, status = 'EVALUATED' WHERE id = ?`,
  ).run(
    evaluation.score,
    evaluation.correction,
    evaluation.feedback,
    question.correct_answer,
    nowIso(),
    answerId,
  );

  audit('ADMIN_REEVALUATED_ANSWER', null, { answerId, score: evaluation.score });
  return { answer: getAnswerAdminDetail(answerId) };
}

export function getAnswerAdminDetail(answerId: string) {
  const db = getDb();
  const r = db
    .prepare(
      `SELECT a.id AS answer_id, a.user_id, u.full_name AS user_name, a.question_id, a.answer_text,
              a.submitted_at, a.automatic_score, a.automatic_correction, a.correction_feedback, a.correct_answer, a.corrected_at
       FROM answers a JOIN users u ON u.id = a.user_id WHERE a.id = ?`,
    )
    .get(answerId) as Record<string, unknown> | undefined;
  if (!r) throw AppError.notFound('ANSWER_NOT_FOUND', 'الإجابة غير موجودة.');
  return {
    answerId: String(r.answer_id),
    userId: String(r.user_id),
    userName: String(r.user_name),
    questionId: String(r.question_id),
    answerText: String(r.answer_text),
    submittedAt: String(r.submitted_at),
    score: r.automatic_score === null ? null : Number(r.automatic_score),
    correction: r.automatic_correction === null ? null : String(r.automatic_correction),
    feedback: r.correction_feedback === null ? null : String(r.correction_feedback),
    correctAnswer: r.correct_answer === null ? null : String(r.correct_answer),
    correctedAt: r.corrected_at === null ? null : String(r.corrected_at),
  };
}

export interface Statistics {
  totalUsers: number;
  activeParticipants: number;
  todayParticipants: number;
  totalAnswers: number;
  correctAnswers: number;
  incorrectAnswers: number;
  missedQuestions: number;
  avgAnswerTimeSeconds: number | null;
  totalQuestions: number;
  availableQuestions: number;
  correctRate: number;
}

export function getStatistics(): Statistics {
  const db = getDb();
  const now = new Date().toISOString();

  const totalUsers = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  const activeParticipants = (
    db.prepare('SELECT COUNT(DISTINCT user_id) AS c FROM answers').get() as { c: number }
  ).c;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayParticipants = (
    db.prepare('SELECT COUNT(DISTINCT user_id) AS c FROM answers WHERE submitted_at >= ?').get(
      todayStart.toISOString(),
    ) as { c: number }
  ).c;

  const totalAnswers = (db.prepare('SELECT COUNT(*) AS c FROM answers').get() as { c: number }).c;
  const correctAnswers = (
    db
      .prepare("SELECT COUNT(*) AS c FROM answers WHERE automatic_score >= ?")
      .get(evaluationConfig.passThreshold) as { c: number }
  ).c;
  const incorrectAnswers = (
    db
      .prepare("SELECT COUNT(*) AS c FROM answers WHERE automatic_score IS NOT NULL AND automatic_score < ?")
      .get(evaluationConfig.passThreshold) as { c: number }
  ).c;
  const missedQuestions = (
    db.prepare("SELECT COUNT(*) AS c FROM question_sessions WHERE status = 'EXPIRED'").get() as { c: number }
  ).c;
  const avgRow = db
    .prepare(
      `SELECT AVG((strftime('%s', a.submitted_at) - strftime('%s', s.started_at))) AS avg_time
       FROM answers a JOIN question_sessions s ON s.question_id = a.question_id AND s.user_id = a.user_id`,
    )
    .get() as { avg_time: number | null };

  const totalQuestions = (db.prepare('SELECT COUNT(*) AS c FROM questions').get() as { c: number }).c;
  const nowMs = Date.now();
  const availableQuestions = (
    db.prepare("SELECT COUNT(*) AS c FROM questions WHERE status = 'ACTIVE' AND available_from <= ? AND available_until >= ?").get(
      now,
      now,
    ) as { c: number }
  ).c;

  return {
    totalUsers,
    activeParticipants,
    todayParticipants,
    totalAnswers,
    correctAnswers,
    incorrectAnswers,
    missedQuestions,
    avgAnswerTimeSeconds: avgRow.avg_time === null ? null : Math.round(Number(avgRow.avg_time)),
    totalQuestions,
    availableQuestions,
    correctRate: totalAnswers === 0 ? 0 : Math.round((correctAnswers / totalAnswers) * 100),
  };
}

export { normalizeArabic };
