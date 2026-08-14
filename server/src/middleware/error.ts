import type { NextFunction, Request, Response } from 'express';
import { AppError, isAppError } from '../util/errors';
import { logger } from '../util/logger';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound('ROUTE_NOT_FOUND', 'المسار المطلوب غير موجود.'));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (isAppError(err)) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  logger.error('UNHANDLED_ERROR', { message: err instanceof Error ? err.message : String(err) });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.' },
  });
}
