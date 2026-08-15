import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import * as admin from './service';
import { param } from '../../util/http';

const router = Router();

// ------------------------------------------------------------------
// Questions
// ------------------------------------------------------------------

router.get('/questions', (_req: Request, res: Response) => {
  const rows = admin.listAllQuestions();
  res.json({ questions: rows });
});

router.post('/questions', (req: Request, res: Response) => {
  const schema = z.object({
    questionNumber: z.number().int().positive(),
    hijriDay: z.number().int().positive().max(30),
    hijriMonth: z.string().min(1).max(60),
    questionText: z.string().min(3).max(2000),
    correctAnswer: z.string().min(1).max(2000),
    answerVariants: z.array(z.string()).optional().default([]),
    availableFrom: z.string().datetime(),
    availableUntil: z.string().datetime(),
    status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED']).default('ACTIVE'),
  });
  const data = schema.parse(req.body);
  res.status(201).json({ question: admin.createQuestion(data) });
});

router.put('/questions/:id', (req: Request, res: Response) => {
  const schema = z.object({
    questionNumber: z.number().int().positive().optional(),
    hijriDay: z.number().int().positive().max(30).optional(),
    hijriMonth: z.string().min(1).max(60).optional(),
    questionText: z.string().min(3).max(2000).optional(),
    correctAnswer: z.string().min(1).max(2000).optional(),
    answerVariants: z.array(z.string()).optional(),
    availableFrom: z.string().datetime().optional(),
    availableUntil: z.string().datetime().optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED']).optional(),
  });
  const patch = schema.parse(req.body);
  res.json({ question: admin.updateQuestion(param(req, 'id'), patch) });
});

router.delete('/questions/:id', (req: Request, res: Response) => {
  admin.deleteQuestion(param(req, 'id'));
  res.status(200).json({ message: 'تم تعطيل السؤال بنجاح.' });
});

router.post('/questions/bulk', (req: Request, res: Response) => {
  const schema = z.object({
    baseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ بصيغة YYYY-MM-DD'),
    hijriMonth: z.string().min(1).max(60).default('ربيع الأول'),
    questions: z.array(
      z.object({
        questionNumber: z.number().int().positive(),
        hijriDay: z.number().int().positive().max(30),
        questionText: z.string().min(3).max(2000),
        correctAnswer: z.string().min(1).max(2000),
        answerVariants: z.array(z.string()).optional().default([]),
      }),
    ),
  });
  const data = schema.parse(req.body);
  const result = admin.bulkCreateQuestions(data.questions, data.baseDate);
  res.status(201).json(result);
});

// ------------------------------------------------------------------
// Users
// ------------------------------------------------------------------

router.get('/users', (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  res.json({ users: admin.listUsers(search) });
});

router.patch('/users/:id/role', (req: Request, res: Response) => {
  const schema = z.object({ role: z.enum(['USER', 'ADMIN']) });
  const { role } = schema.parse(req.body);
  admin.setUserRole(param(req, 'id'), role);
  res.json({ message: 'تم تحديث صلاحية المستخدم.' });
});

router.patch('/users/:id/status', (req: Request, res: Response) => {
  const schema = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) });
  const { status } = schema.parse(req.body);
  admin.setUserStatus(param(req, 'id'), status);
  res.json({ message: 'تم تحديث حالة المستخدم.' });
});

router.get('/users/:id/answers', (req: Request, res: Response) => {
  res.json({ answers: admin.listUserAnswers(param(req, 'id')) });
});

// ------------------------------------------------------------------
// Answers
// ------------------------------------------------------------------

router.get('/answers', (req: Request, res: Response) => {
  const questionNumber = typeof req.query.questionNumber === 'string' ? Number(req.query.questionNumber) : undefined;
  const correction = req.query.correction === 'CORRECT' || req.query.correction === 'INCORRECT' ? req.query.correction : undefined;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  res.json({ answers: admin.listAnswers({ questionNumber, correction, limit }) });
});

router.post('/answers/:id/re-evaluate', (req: Request, res: Response) => {
  res.json(admin.reEvaluateAnswer(param(req, 'id')));
});

// ------------------------------------------------------------------
// Statistics
// ------------------------------------------------------------------

router.get('/statistics', (_req: Request, res: Response) => {
  res.json({ statistics: admin.getStatistics() });
});

export default router;
