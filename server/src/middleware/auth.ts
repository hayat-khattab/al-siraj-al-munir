import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../util/token';
import { AppError } from '../util/errors';
import { getUserById, type PublicUser } from '../modules/auth/service';

declare module 'express-serve-static-core' {
  interface Request {
    user?: PublicUser;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(AppError.unauthorized());
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifyToken(token);
  const user = getUserById(payload.sub);
  if (!user || user.status !== 'ACTIVE') {
    return next(AppError.unauthorized('USER_INACTIVE', 'الحساب غير نشط. يرجى التواصل مع الإدارة.'));
  }
  req.user = user;
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') {
    return next(AppError.forbidden());
  }
  next();
}
