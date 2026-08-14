import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../config';
import { logger } from '../util/logger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type DB = Database.Database;

export interface UserRow {
  id: string;
  full_name: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  whatsapp_number: string;
  whatsapp_normalized: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'DISABLED';
  created_at: string;
  last_login_at: string | null;
}

export interface QuestionRow {
  id: string;
  question_number: number;
  hijri_day: number;
  hijri_month: string;
  question_text: string;
  correct_answer: string;
  answer_variants: string;
  available_from: string;
  available_until: string;
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED';
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  question_id: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  status: 'ACTIVE' | 'SUBMITTED' | 'EXPIRED';
  created_at: string;
}

export interface AnswerRow {
  id: string;
  user_id: string;
  question_id: string;
  answer_text: string;
  submitted_at: string;
  status: 'SUBMITTED' | 'EVALUATED' | 'FAILED';
  automatic_score: number | null;
  automatic_correction: string | null;
  correction_feedback: string | null;
  correct_answer: string | null;
  corrected_at: string | null;
}

export interface OtpRow {
  id: string;
  phone_normalized: string;
  code_hash: string;
  purpose: 'REGISTER' | 'LOGIN';
  expires_at: string;
  attempts: number;
  consumed: number;
  created_at: string;
}

let db: DB | null = null;

export function nowIso(): string {
  return new Date().toISOString();
}

export const SCHEMA = `-- Al-Siraj Al-Munir - database schema

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  whatsapp_normalized TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_whatsapp ON users (whatsapp_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_full_name ON users (full_name);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  question_number INTEGER NOT NULL,
  hijri_day INTEGER NOT NULL,
  hijri_month TEXT NOT NULL,
  question_text TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  answer_variants TEXT NOT NULL DEFAULT '[]',
  available_from TEXT NOT NULL,
  available_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'DISABLED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (question_number, hijri_month)
);

CREATE INDEX IF NOT EXISTS idx_questions_number ON questions (question_number);
CREATE INDEX IF NOT EXISTS idx_questions_available_from ON questions (available_from);

CREATE TABLE IF NOT EXISTS question_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUBMITTED', 'EXPIRED')),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, question_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON question_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_question ON question_sessions (question_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON question_sessions (status);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'EVALUATED', 'FAILED')),
  automatic_score INTEGER,
  automatic_correction TEXT,
  correction_feedback TEXT,
  correct_answer TEXT,
  corrected_at TEXT,
  UNIQUE (user_id, question_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_answers_user ON answers (user_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers (question_id);
CREATE INDEX IF NOT EXISTS idx_answers_submitted ON answers (submitted_at);

CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  phone_normalized TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'LOGIN' CHECK (purpose IN ('REGISTER', 'LOGIN')),
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes (phone_normalized);

CREATE TABLE IF NOT EXISTS competition_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  user_id TEXT,
  meta TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_logs (event);`;

export function parseSchema(): string {
  return SCHEMA;
}

export function getDb(): DB {
  if (db) return db;

  const isMemory = config.dbPath === ':memory:';
  if (!isMemory) {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  }

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(parseSchema());
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** Allows tests to reset the connection to a fresh in-memory database. */
export function resetDb(): void {
  closeDb();
}

export function transaction<T>(fn: () => T): T {
  const database = getDb();
  const wrapped = database.transaction(fn);
  return wrapped();
}

export function audit(event: string, userId?: string | null, meta?: unknown): void {
  try {
    getDb()
      .prepare('INSERT INTO audit_logs (event, user_id, meta, created_at) VALUES (?, ?, ?, ?)')
      .run(event, userId ?? null, meta ? JSON.stringify(meta) : null, nowIso());
    logger.info(`AUDIT ${event}${userId ? ` user=${userId}` : ''}`);
  } catch (err) {
    logger.error('AUDIT_FAILED', { event, err: String(err) });
  }
}
