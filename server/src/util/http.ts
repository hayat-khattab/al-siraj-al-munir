import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { AppError } from './errors';

/** Type-safe access to a required route parameter. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw AppError.badRequest('MISSING_PARAM', `معرّف '${name}' مفقود.`);
  }
  return value;
}

/**
 * Wraps an async route handler so rejections are forwarded to the
 * Express error middleware (Express 4 does not do this automatically).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
