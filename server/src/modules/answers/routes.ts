import { Router, type Request, type Response } from 'express';
import { AppError } from '../../util/errors';
import { getDb, type AnswerRow } from '../../db/database';
import { getQuestionRow } from '../competition/service';
import { getQuestionAfterSubmit } from './service';
import { param } from '../../util/http';

const router = Router();

router.get('/:id', (req: Request, res: Response) => {
  const row = getDb()
    .prepare('SELECT * FROM answers WHERE id = ? AND user_id = ?')
    .get(param(req, 'id'), req.user!.id) as AnswerRow | undefined;
  if (!row) throw AppError.notFound('ANSWER_NOT_FOUND', 'الإجابة غير موجودة.');
  const question = getQuestionRow(row.question_id);
  res.json({
    answer: {
      answerId: row.id,
      questionId: row.question_id,
      questionNumber: question.question_number,
      answerText: row.answer_text,
      submittedAt: row.submitted_at,
      score: row.automatic_score,
      correction: row.automatic_correction,
      feedback: row.correction_feedback,
      correctAnswer: row.correct_answer,
      correctedAt: row.corrected_at,
    },
  });
});

// GET /answers/question/:questionId - used by the client to re-sync state
router.get('/question/:questionId', (req: Request, res: Response) => {
  const question = getQuestionAfterSubmit(req.user!.id, param(req, 'questionId'));
  res.json({ question });
});

export default router;
