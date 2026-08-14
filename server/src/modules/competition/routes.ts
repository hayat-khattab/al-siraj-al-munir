import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { listDays, getQuestionDetail, startSession } from './service';
import { submitAnswer } from '../answers/service';
import { param } from '../../util/http';

const router = Router();

router.get('/days', (req: Request, res: Response) => {
  const days = listDays(req.user!.id);
  res.json({ days, serverNow: new Date().toISOString() });
});

router.get('/questions/:id', (req: Request, res: Response) => {
  const detail = getQuestionDetail(req.user!.id, param(req, 'id'));
  res.json({ question: detail });
});

router.post('/questions/:id/start', (req: Request, res: Response) => {
  const detail = startSession(req.user!.id, param(req, 'id'));
  res.status(201).json({ question: detail });
});

router.post('/questions/:id/submit', (req: Request, res: Response) => {
  const schema = z.object({ answer: z.string().min(1) });
  const { answer } = schema.parse(req.body);
  const result = submitAnswer(req.user!.id, param(req, 'id'), answer);
  res.status(201).json(result);
});

export default router;
