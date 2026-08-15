import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
}

const serverRoot = path.resolve(__dirname, '..');

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
  port: int('PORT', 4000),
  apiBaseUrl: process.env.API_BASE_URL ?? '/api',

  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  dbPath:
    process.env.DB_PATH === ':memory:'
      ? ':memory:'
      : path.resolve(serverRoot, process.env.DB_PATH ?? './data/seraj.db'),

  competitionDays: int('COMPETITION_DAYS', 30),
  competitionStartDate: process.env.COMPETITION_START_DATE || null,
  competitionTimezone: process.env.COMPETITION_TIMEZONE ?? 'Africa/Cairo',
  answerTimeMinutes: int('ANSWER_TIME_MINUTES', 30),

  otpProvider: process.env.OTP_PROVIDER ?? 'console',
  enableOtpReveal: bool('ENABLE_OTP_REVEAL', true),
  otpTtlMinutes: int('OTP_TTL_MINUTES', 10),
  requireOtp: bool('REQUIRE_OTP', false),

  adminFullName: process.env.ADMIN_FULL_NAME ?? 'مدير مسابقة السراج',
  adminWhatsappNumber: process.env.ADMIN_WHATSAPP_NUMBER ?? '+201000000000',
  adminUsername: process.env.ADMIN_USERNAME ?? 'root',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'admin2root',

  corsOrigins: (process.env.CORS_ORIGINS ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  logLevel: process.env.LOG_LEVEL ?? 'info',
};
