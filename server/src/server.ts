import { createApp } from './app';
import { config } from './config';
import { getDb } from './db/database';
import { seedIfNeeded } from './seed/seed';
import { logger } from './util/logger';

function bootstrap(): void {
  getDb();
  seedIfNeeded();

  const app = createApp();

  app.listen(config.port, () => {
    logger.info(`Al-Siraj Al-Munir API listening on http://localhost:${config.port}${config.apiBaseUrl}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`Competition days: ${config.competitionDays}`);
    logger.info(`Answer time: ${config.answerTimeMinutes} minutes`);
  });
}

bootstrap();
