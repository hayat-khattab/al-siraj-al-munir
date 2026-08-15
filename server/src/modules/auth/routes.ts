import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import * as authService from './service';
import { asyncHandler } from '../../util/http';

const router = Router();

const phoneSchema = z.string().min(6).max(30);

router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    fullName: z.string().min(3).max(120),
    whatsappNumber: phoneSchema,
  });
  const { fullName, whatsappNumber } = schema.parse(req.body);
  const result = await authService.register(fullName, whatsappNumber);
  res.status(201).json(result);
}));

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({ whatsappNumber: phoneSchema });
  const { whatsappNumber } = schema.parse(req.body);
  const result = await authService.requestLogin(whatsappNumber);
  res.json(result);
}));

router.post('/verify', (req: Request, res: Response) => {
  const schema = z.object({
    whatsappNumber: phoneSchema,
    code: z.string().min(4).max(8),
    purpose: z.enum(['REGISTER', 'LOGIN']).default('LOGIN'),
  });
  const { whatsappNumber, code, purpose } = schema.parse(req.body);
  const result = authService.verifyOtp(whatsappNumber, code, purpose);
  res.json(result);
});

router.post('/admin-login', (req: Request, res: Response) => {
  const schema = z.object({
    username: z.string().min(1).max(60),
    password: z.string().min(1).max(200),
  });
  const { username, password } = schema.parse(req.body);
  res.json(authService.adminLogin(username, password));
});

export default router;
