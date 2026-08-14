import crypto from 'node:crypto';
import { getDb, nowIso, audit, transaction, type AnswerRow } from '../../db/database';
import { AppError } from '../../util/errors';
import { answerEvaluationService, evaluationConfig } from '../evaluation/index';
import {
  availabilityOf,
  effectiveDeadline,
  getAnswerForUser,
  getQuestionDetail,
  getQuestionRow,
  getSessionForUser,
  type QuestionDetailView,
} from '../competition/service';

const MIN_ANSWER_LENGTH = 3;
const MAX_ANSWER_LENGTH = 3000;

export interface SubmitResult {
  answer: {
    answerId: string;
    questionId: string;
    answerText: string;
    submittedAt: string;
    score: number | null;
    correction: string | null;
    feedback: string | null;
    correctAnswer: string | null;
  };
}

function validateAnswerText(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim().length < MIN_ANSWER_LENGTH) {
    throw AppError.badRequest('ANSWER_TOO_SHORT', 'يرجى كتابة إجابة قبل تسليمها.');
  }
  if (raw.trim().length > MAX_ANSWER_LENGTH) {
    throw AppError.badRequest('ANSWER_TOO_LONG', 'الإجابة طويلة جداً. الحد الأقصى 3000 حرف.');
  }
  return raw.trim();
}

/**
 * Submits an answer for a question.
 *
 * All rules are enforced server-side inside a single transaction:
 *  - question must be currently available
 *  - user must have an active (non-expired) session
 *  - now <= effective deadline (session expiry capped by question availability)
 *  - only one answer per (user, question) - enforced by the UNIQUE constraint
 */
export function submitAnswer(userId: string, questionId: string, rawAnswer: unknown): SubmitResult {
  const answerText = validateAnswerText(rawAnswer);
  const now = new Date();

  const result = transaction(() => {
    const question = getQuestionRow(questionId);

    const existing = getAnswerForUser(question.id, userId);
    if (existing) {
      throw AppError.badRequest('ALREADY_ANSWERED', 'لقد قمت بتسليم إجابتك لهذا السؤال مسبقاً.');
    }

    const availability = availabilityOf(question, now);
    if (availability === 'FUTURE') {
      throw AppError.badRequest('NOT_AVAILABLE_YET', 'انتظر قدوم اليوم، فهذا السؤال غير متاح بعد.');
    }
    if (availability === 'CLOSED') {
      throw AppError.badRequest('QUESTION_CLOSED', 'انتهى وقت الإجابة على هذا السؤال.');
    }

    const session = getSessionForUser(question.id, userId);
    if (!session) {
      throw AppError.badRequest('SESSION_REQUIRED', 'يجب فتح السؤال أولاً لبدء جلسة الإجابة.');
    }
    if (session.status === 'EXPIRED') {
      throw AppError.badRequest('SESSION_EXPIRED', 'انتهى وقت الإجابة على هذا السؤال.');
    }
    if (session.status === 'SUBMITTED') {
      throw AppError.badRequest('ALREADY_ANSWERED', 'لقد قمت بتسليم إجابتك لهذا السؤال مسبقاً.');
    }

    const deadline = new Date(effectiveDeadline(question, session)).getTime();
    if (now.getTime() > deadline) {
      getDb()
        .prepare("UPDATE question_sessions SET status = 'EXPIRED', ended_at = ? WHERE id = ?")
        .run(nowIso(), session.id);
      audit('QUESTION_EXPIRED', userId, { questionId: question.id });
      throw AppError.badRequest('SESSION_EXPIRED', 'انتهى وقت الإجابة على هذا السؤال.');
    }

    let variants: string[] = [];
    try {
      const parsed = JSON.parse(question.answer_variants ?? '[]');
      if (Array.isArray(parsed)) variants = parsed.filter((v) => typeof v === 'string');
    } catch {
      variants = [];
    }

    const evaluation = answerEvaluationService.evaluate({
      userAnswer: answerText,
      correctAnswer: question.correct_answer,
      acceptedVariants: variants,
    });

    const submittedAt = nowIso();
    const answerId = crypto.randomUUID();
    const score = evaluation.score;
    const correction = evaluation.correction;
    const isCorrect = score >= evaluationConfig.passThreshold;

    try {
      getDb()
        .prepare(
          `INSERT INTO answers
             (id, user_id, question_id, answer_text, submitted_at, status, automatic_score, automatic_correction, correction_feedback, correct_answer, corrected_at)
           VALUES (?, ?, ?, ?, ?, 'EVALUATED', ?, ?, ?, ?, ?)`,
        )
        .run(
          answerId,
          userId,
          question.id,
          answerText,
          submittedAt,
          score,
          correction,
          evaluation.feedback,
          question.correct_answer,
          nowIso(),
        );
    } catch (err: any) {
      if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw AppError.badRequest('ALREADY_ANSWERED', 'لقد قمت بتسليم إجابتك لهذا السؤال مسبقاً.');
      }
      throw err;
    }

    getDb()
      .prepare("UPDATE question_sessions SET status = 'SUBMITTED', ended_at = ? WHERE id = ?")
      .run(submittedAt, session.id);

    audit('ANSWER_SUBMITTED', userId, { questionId: question.id, answerId, isCorrect });
    audit('ANSWER_EVALUATED', userId, { questionId: question.id, answerId, score, correction });

    return {
      answer: {
        answerId,
        questionId: question.id,
        answerText,
        submittedAt,
        score,
        correction,
        feedback: evaluation.feedback,
        correctAnswer: question.correct_answer,
      },
    };
  });

  return result;
}

export function getMyAnswer(userId: string, questionId: string): { answer: AnswerRow } | null {
  const row = getAnswerForUser(questionId, userId);
  return row ? { answer: row } : null;
}

export function getQuestionAfterSubmit(userId: string, questionId: string): QuestionDetailView {
  return getQuestionDetail(userId, questionId);
}
