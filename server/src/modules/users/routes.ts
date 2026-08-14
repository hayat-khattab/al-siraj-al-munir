import { Router, type Request, type Response } from 'express';

const router = Router();

router.get('/me', (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
