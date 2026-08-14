import crypto from 'node:crypto';
import {
  getDb,
  nowIso,
  audit,
  transaction,
  type QuestionRow,
  type SessionRow,
  type AnswerRow,
} from '../../db/database';
import { AppError } from '../../util/errors';
import { config } from '../../config';
import { endOfDayInTz } from '../../util/time';

export type Availability = 'FUTURE' | 'AVAILABLE' | 'CLOSED';

export type DayStatus = 'FUTURE' | 'AVAILABLE' | 'ANSWERED' | 'MISSED';

export interface DayView {
  questionId: string;
  questionNumber: number;
  hijriDay: number;
  hijriMonth: string;
  status: DayStatus;
  availableFrom: string;
  availableUntil: string;
  serverNow: string;
}

export interface QuestionDetailView {
  questionId: string;
  questionNumber: number;
  hijriDay: number;
  hijriMonth: string;
  questionText: string | null;
  status: DayStatus;
  availability: Availability;
  availableFrom: string;
  availableUntil: string;
  serverNow: string;
  session: SessionView | null;
  answer: AnswerView | null;
  message: string | null;
}

export interface SessionView {
  sessionId: string;
  startedAt: string;
  expiresAt: string;
  effectiveDeadline: string;
  remainingSeconds: number;
  status: 'ACTIVE' | 'SUBMITTED' | 'EXPIRED';
}

export interface AnswerView {
  answerId: string;
  answerText: string;
  submittedAt: string;
  score: number | null;
  correction: string | null;
  feedback: string | null;
  correctAnswer: string | null;
  correctedAt: string | null;
}

export function availabilityOf(question: Pick<QuestionRow, 'status' | 'available_from' | 'available_until'>, now: Date): Availability {
  if (question.status !== 'ACTIVE') return 'FUTURE';
  const t = now.getTime();
  if (t < new Date(question.available_from).getTime()) return 'FUTURE';
  if (t > new Date(question.available_until).getTime()) return 'CLOSED';
  return 'AVAILABLE';
}

/** Lazily marks ACTIVE sessions as EXPIRED when their time is up. */
export function expireStaleSessions(now: Date): void {
  getDb()
    .prepare(
      `UPDATE question_sessions SET status = 'EXPIRED', ended_at = COALESCE(ended_at, ?)
       WHERE status = 'ACTIVE' AND expires_at <= ?`,
    )
    .run(nowIso(), now.toISOString());
}

export function effectiveDeadline(question: QuestionRow, session: SessionRow): string {
  const sessionExpiry = new Date(session.expires_at).getTime();
  const availabilityEnd = new Date(question.available_until).getTime();
  return new Date(Math.min(sessionExpiry, availabilityEnd)).toISOString();
}

export function getQuestionRow(questionId: string): QuestionRow {
  const row = getDb().prepare('SELECT * FROM questions WHERE id = ?').get(questionId) as QuestionRow | undefined;
  if (!row) throw AppError.notFound('QUESTION_NOT_FOUND', 'السؤال غير موجود.');
  return row;
}

export function getSessionForUser(questionId: string, userId: string): SessionRow | null {
  const row = getDb()
    .prepare('SELECT * FROM question_sessions WHERE question_id = ? AND user_id = ?')
    .get(questionId, userId) as SessionRow | undefined;
  return row ?? null;
}

export function getAnswerForUser(questionId: string, userId: string): AnswerRow | null {
  const row = getDb()
    .prepare('SELECT * FROM answers WHERE question_id = ? AND user_id = ?')
    .get(questionId, userId) as AnswerRow | undefined;
  return row ?? null;
}

function toAnswerView(row: AnswerRow): AnswerView {
  return {
    answerId: row.id,
    answerText: row.answer_text,
    submittedAt: row.submitted_at,
    score: row.automatic_score,
    correction: row.automatic_correction,
    feedback: row.correction_feedback,
    correctAnswer: row.correct_answer,
    correctedAt: row.corrected_at,
  };
}

function toSessionView(question: QuestionRow, row: SessionRow, now: Date): SessionView {
  const deadline = effectiveDeadline(question, row);
  return {
    sessionId: row.id,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    effectiveDeadline: deadline,
    remainingSeconds: Math.max(0, Math.floor((new Date(deadline).getTime() - now.getTime()) / 1000)),
    status: row.status,
  };
}

export function toDayView(question: QuestionRow, userId: string, now: Date): DayView {
  const availability = availabilityOf(question, now);
  const answer = getAnswerForUser(question.id, userId);
  const session = getSessionForUser(question.id, userId);

  let status: DayStatus;
  if (availability === 'FUTURE') {
    status = 'FUTURE';
  } else if (answer) {
    status = 'ANSWERED';
  } else if (availability === 'AVAILABLE') {
    if (session && session.status === 'EXPIRED') {
      status = 'MISSED';
    } else {
      status = 'AVAILABLE';
    }
  } else {
    // CLOSED without an answer → missed
    status = 'MISSED';
  }

  return {
    questionId: question.id,
    questionNumber: question.question_number,
    hijriDay: question.hijri_day,
    hijriMonth: question.hijri_month,
    status,
    availableFrom: question.available_from,
    availableUntil: question.available_until,
    serverNow: now.toISOString(),
  };
}

export function listDays(userId: string): DayView[] {
  const now = new Date();
  expireStaleSessions(now);
  const questions = getDb()
    .prepare('SELECT * FROM questions ORDER BY question_number ASC')
    .all() as QuestionRow[];
  return questions.map((q) => toDayView(q, userId, now));
}

export function getQuestionDetail(userId: string, questionId: string): QuestionDetailView {
  const now = new Date();
  expireStaleSessions(now);
  const question = getQuestionRow(questionId);
  const availability = availabilityOf(question, now);
  const answer = getAnswerForUser(question.id, userId);
  const session = getSessionForUser(question.id, userId);

  const base = {
    questionId: question.id,
    questionNumber: question.question_number,
    hijriDay: question.hijri_day,
    hijriMonth: question.hijri_month,
    availability,
    availableFrom: question.available_from,
    availableUntil: question.available_until,
    serverNow: now.toISOString(),
  };

  if (answer) {
    return {
      ...base,
      status: 'ANSWERED',
      questionText: question.question_text,
      session: session ? toSessionView(question, session, now) : null,
      answer: toAnswerView(answer),
      message: 'لقد قمت بتسليم إجابتك لهذا السؤال مسبقاً.',
    };
  }

  if (availability === 'FUTURE') {
    return {
      ...base,
      status: 'FUTURE',
      questionText: null,
      session: null,
      answer: null,
      message: 'انتظر قدوم اليوم، فهذا السؤال غير متاح بعد.',
    };
  }

  if (availability === 'CLOSED') {
    return {
      ...base,
      status: 'MISSED',
      questionText: question.question_text,
      session: session ? toSessionView(question, session, now) : null,
      answer: null,
      message: 'فاتك هذا السؤال ولم تجب عليه.',
    };
  }

  // AVAILABLE
  if (session && session.status === 'EXPIRED') {
    return {
      ...base,
      status: 'MISSED',
      questionText: question.question_text,
      session: toSessionView(question, session, now),
      answer: null,
      message: 'فاتك هذا السؤال ولم تجب عليه.',
    };
  }

  if (session && session.status === 'ACTIVE') {
    return {
      ...base,
      status: 'AVAILABLE',
      questionText: question.question_text,
      session: toSessionView(question, session, now),
      answer: null,
      message: null,
    };
  }

  return {
    ...base,
    status: 'AVAILABLE',
    questionText: question.question_text,
    session: null,
    answer: null,
    message: null,
  };
}

export function startSession(userId: string, questionId: string): QuestionDetailView {
  const now = new Date();
  const question = getQuestionRow(questionId);
  const availability = availabilityOf(question, now);

  const existingAnswer = getAnswerForUser(question.id, userId);
  if (existingAnswer) {
    throw AppError.badRequest('ALREADY_ANSWERED', 'لقد قمت بتسليم إجابتك لهذا السؤال مسبقاً.');
  }

  if (availability === 'FUTURE') {
    throw AppError.badRequest('NOT_AVAILABLE_YET', 'انتظر قدوم اليوم، فهذا السؤال غير متاح بعد.');
  }
  if (availability === 'CLOSED') {
    throw AppError.badRequest('QUESTION_CLOSED', 'انتهى وقت الإجابة على هذا السؤال.');
  }

  expireStaleSessions(now);

  const existing = getSessionForUser(question.id, userId);
  if (existing) {
    if (existing.status === 'EXPIRED') {
      throw AppError.badRequest('SESSION_EXPIRED', 'انتهى وقت الإجابة على هذا السؤال.');
    }
    if (existing.status === 'SUBMITTED') {
      throw AppError.badRequest('ALREADY_ANSWERED', 'لقد قمت بتسليم إجابتك لهذا السؤال مسبقاً.');
    }
    return getQuestionDetail(userId, questionId);
  }

  const startedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + config.answerTimeMinutes * 60_000).toISOString();

  transaction(() => {
    getDb()
      .prepare(
        `INSERT INTO question_sessions (id, user_id, question_id, started_at, expires_at, ended_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, 'ACTIVE', ?)`,
      )
      .run(crypto.randomUUID(), userId, question.id, startedAt, expiresAt, startedAt);
  });

  audit('QUESTION_STARTED', userId, { questionId: question.id, startedAt });
  return getQuestionDetail(userId, questionId);
}
