import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { config } from './config';
import { logger } from './util/logger';
import { AppError } from './util/errors';
import authRoutes from './modules/auth/routes';
import userRoutes from './modules/users/routes';
import competitionRoutes from './modules/competition/routes';
import answerRoutes from './modules/answers/routes';
import adminRoutes from './modules/admin/routes';
import { requireAuth, requireAdmin } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { getDb } from './db/database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serves the built frontend so the whole app lives behind a single URL.
// Resolves to <repo>/web/dist whether running from src or dist/src.
function webDistPath(): string {
  return path.resolve(__dirname, '../../web/dist');
}

function hasBuiltWeb(): boolean {
  return fs.existsSync(path.join(webDistPath(), 'index.html'));
}

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new AppError(403, 'CORS_DENIED', 'غير مسموح بهذا الأصل.'));
        }
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.originalUrl}`);
    next();
  });

  const api = express.Router();

  api.get('/health', (_req: Request, res: Response) => {
    getDb().prepare('SELECT 1').get();
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  });

  api.use('/auth', authRoutes);
  api.use('/users', requireAuth, userRoutes);
  api.use('/competition', requireAuth, competitionRoutes);
  api.use('/answers', requireAuth, answerRoutes);
  api.use('/admin', requireAuth, requireAdmin, adminRoutes);

  app.use(config.apiBaseUrl, api);

  if (hasBuiltWeb()) {
    app.use(express.static(webDistPath()));
    // SPA fallback: unknown non-API paths render the app shell.
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith(config.apiBaseUrl)) return next();
      res.sendFile(path.join(webDistPath(), 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: first ? `بيانات غير صحيحة: ${first.message}` : 'بيانات غير صحيحة.',
          details: err.issues,
        },
      });
      return;
    }
    next(err);
  });
  app.use(errorHandler);

  return app;
}
