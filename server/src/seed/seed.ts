import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from '../config';
import { getDb, nowIso, type UserRow } from '../db/database';
import { logger } from '../util/logger';
import { startOfDayInTz } from '../util/time';
import { parseFullName, normalizePhone } from '../util/normalize';
import { bulkCreateQuestions, type BulkQuestionInput } from '../modules/admin/service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolves to the questions.json copied next to the bundle in production,
// or to the source file in development.
function questionsJsonPath(): string {
  return path.resolve(__dirname, 'questions.json');
}

function computeBaseDate(): string {
  if (config.competitionStartDate) {
    return config.competitionStartDate;
  }
  // Rolling demo mode: make "yesterday" the day of question 1 so that
  // question 1 is answerable today, question 2 tomorrow, and so on.
  const yesterday = new Date(Date.now() - 86_400_000);
  const start = startOfDayInTz(yesterday.toISOString(), config.competitionTimezone);
  return start.slice(0, 10);
}

function loadQuestions(): BulkQuestionInput[] {
  const raw = JSON.parse(
    fs.readFileSync(questionsJsonPath(), 'utf-8'),
  ) as Array<{
    questionNumber: number;
    hijriDay: number;
    questionText: string;
    correctAnswer: string;
    answerVariants?: string[];
  }>;
  return raw.map((q) => ({
    questionNumber: q.questionNumber,
    hijriDay: q.hijriDay,
    questionText: q.questionText,
    correctAnswer: q.correctAnswer,
    answerVariants: q.answerVariants ?? [],
  }));
}

function ensureAdmin(): void {
  const db = getDb();
  const parsed = parseFullName(config.adminFullName);
  const normalized = normalizePhone(config.adminWhatsappNumber);

  const existing = db.prepare('SELECT * FROM users WHERE whatsapp_normalized = ?').get(normalized) as
    | UserRow
    | undefined;
  if (existing) {
    db.prepare("UPDATE users SET role = 'ADMIN', status = 'ACTIVE' WHERE id = ?").run(existing.id);
    logger.info(`Admin user updated: ${existing.full_name}`);
    return;
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, full_name, first_name, middle_name, last_name, whatsapp_number, whatsapp_normalized, role, status, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ADMIN', 'ACTIVE', ?, NULL)`,
  ).run(
    id,
    parsed.fullName,
    parsed.first,
    parsed.middle,
    parsed.last,
    config.adminWhatsappNumber,
    normalized,
    nowIso(),
  );
  logger.info(`Admin user created: ${parsed.fullName} (${config.adminWhatsappNumber})`);
}

function run(): void {
  const db = getDb();
  const force = process.argv.includes('--force');

  const existingCount = (db.prepare('SELECT COUNT(*) AS c FROM questions').get() as { c: number }).c;
  if (existingCount > 0 && !force) {
    logger.warn(
      `Database already contains ${existingCount} questions. Use \`npm run seed -- --force\` to wipe and re-seed.`,
    );
    return;
  }

  if (existingCount > 0) {
    db.prepare('DELETE FROM answers').run();
    db.prepare('DELETE FROM question_sessions').run();
    db.prepare('DELETE FROM questions').run();
    logger.info('Cleared existing competition data.');
  }

  const questions = loadQuestions();
  const baseDate = computeBaseDate();
  const result = bulkCreateQuestions(questions, baseDate);

  ensureAdmin();

  logger.info(`Seeded ${result.created} questions. Base date (Hijri day 1): ${baseDate}`);
  logger.info(
    config.competitionStartDate
      ? 'Fixed competition date mode (COMPETITION_START_DATE).'
      : 'Rolling demo mode: question 1 is available today.',
  );
}

/**
 * Idempotent seeding used on server boot: seeds the 30-question calendar and
 * the admin account only when the database is empty.
 */
export function seedIfNeeded(): void {
  const db = getDb();
  const existingCount = (db.prepare('SELECT COUNT(*) AS c FROM questions').get() as { c: number }).c;
  if (existingCount > 0) {
    ensureAdmin();
    return;
  }
  const questions = loadQuestions();
  const baseDate = computeBaseDate();
  const result = bulkCreateQuestions(questions, baseDate);
  ensureAdmin();
  logger.info(`Seeded ${result.created} questions. Base date (Hijri day 1): ${baseDate}`);
}

// CLI entry (`npm run seed [-- --force]`). Skips when imported by the server.
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run();
}
