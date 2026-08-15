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
const DEFAULT_HIJRI_MONTH = 'ربيع الأول';

// Resolves to the questions.json copied next to the bundle in production,
// or to the source file in development.
function questionsJsonPath(): string {
  return path.resolve(__dirname, 'questions.json');
}

function computeBaseDate(): string {
  if (config.competitionStartDate) {
    return config.competitionStartDate;
  }
  // Rolling demo mode: make "today" the day of question 1 so that
  // question 1 is answerable today, question 2 tomorrow, and so on.
  const today = startOfDayInTz(new Date().toISOString(), config.competitionTimezone);
  return today.slice(0, 10);
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

function questionsContent(): string {
  return fs.readFileSync(questionsJsonPath(), 'utf-8');
}

/** Version fingerprint of the questions file so deploy-time sync knows when content changed. */
function seedVersion(): string {
  return crypto.createHash('sha256').update(questionsContent()).digest('hex').slice(0, 16);
}

function getStoredSeedVersion(): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'seed_version'").get() as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setStoredSeedVersion(version: string): void {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('seed_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(version);
}

function countRows(table: 'questions' | 'answers'): number {
  return (getDb().prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
}

function clearCompetitionData(): void {
  const db = getDb();
  db.prepare('DELETE FROM answers').run();
  db.prepare('DELETE FROM question_sessions').run();
  db.prepare('DELETE FROM questions').run();
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

/** Wipe everything and seed from questions.json. Only safe before any real participant answers exist. */
function fullSeed(): void {
  clearCompetitionData();
  const questions = loadQuestions();
  const baseDate = computeBaseDate();
  const result = bulkCreateQuestions(questions, baseDate);
  setStoredSeedVersion(seedVersion());
  ensureAdmin();
  logger.info(`Seeded ${result.created} questions. Base date (Hijri day 1): ${baseDate}`);
}

/**
 * Non-destructive sync: adds questions from questions.json that are missing,
 * updates the text/answer of existing ones, and preserves all participant
 * data (answers, sessions, users). Used once the competition is live.
 */
function syncSeed(): void {
  const db = getDb();
  const questions = loadQuestions();
  const baseDate = computeBaseDate();
  const additions: BulkQuestionInput[] = [];
  let updated = 0;

  for (const item of questions) {
    const existing = db
      .prepare('SELECT id FROM questions WHERE question_number = ? AND hijri_month = ?')
      .get(item.questionNumber, DEFAULT_HIJRI_MONTH) as { id: string } | undefined;

    if (existing) {
      db.prepare(
        'UPDATE questions SET hijri_day = ?, question_text = ?, correct_answer = ?, answer_variants = ? WHERE id = ?',
      ).run(
        item.hijriDay,
        item.questionText,
        item.correctAnswer,
        JSON.stringify(item.answerVariants ?? []),
        existing.id,
      );
      updated++;
    } else {
      additions.push(item);
    }
  }

  if (additions.length > 0) {
    const result = bulkCreateQuestions(additions, baseDate);
    logger.info(`Synced ${result.created} new questions. Base date (Hijri day 1): ${baseDate}`);
  } else {
    void baseDate;
  }
  setStoredSeedVersion(seedVersion());
  ensureAdmin();
  logger.info(`Seed sync complete: ${updated} updated, ${additions.length} added.`);
}

function run(): void {
  const force = process.argv.includes('--force');

  const version = seedVersion();
  const stored = getStoredSeedVersion();
  const existingCount = countRows('questions');
  const upToDate = existingCount > 0 && stored === version;

  if (!force && upToDate) {
    logger.info('Seed data is up to date. Skipping.');
    ensureAdmin();
    return;
  }

  if (force) {
    fullSeed();
    logger.info('Forced re-seed completed.');
    return;
  }

  if (existingCount === 0) {
    fullSeed();
    return;
  }

  // Questions exist but the file changed: only ever wipe if no real answers yet.
  const answerCount = countRows('answers');
  if (answerCount === 0) {
    logger.info('Question content changed and no participant answers exist yet — performing full re-seed.');
    fullSeed();
  } else {
    logger.info('Question content changed but participant answers exist — performing non-destructive sync.');
    syncSeed();
  }
}

/**
 * Idempotent seeding used on server boot. Re-seeds the question calendar
 * whenever questions.json changes (and there are no participant answers yet),
 * otherwise syncs new/updated questions without touching participant data.
 */
export function seedIfNeeded(): void {
  const version = seedVersion();
  const stored = getStoredSeedVersion();
  const existingCount = countRows('questions');

  if (existingCount === 0) {
    fullSeed();
    return;
  }

  if (stored === version) {
    ensureAdmin();
    return;
  }

  if (countRows('answers') === 0) {
    logger.info('Question content changed and no participant answers exist yet — performing full re-seed.');
    fullSeed();
  } else {
    logger.info('Question content changed but participant answers exist — performing non-destructive sync.');
    syncSeed();
  }
}

// CLI entry (`npm run seed [-- --force]`). Skips when imported by the server.
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run();
}