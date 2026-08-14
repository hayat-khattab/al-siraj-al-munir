import supertest from 'supertest';
import type express from 'express';
import { getDb, resetDb, type UserRow } from '../src/db/database';

let app: express.Express | null = null;

export async function initApp(): Promise<express.Express> {
  if (app) return app;
  const { createApp } = await import('../src/app');
  resetDb();
  getDb();
  app = createApp();
  return app;
}

export function api(app: express.Express): supertest.SuperTest<supertest.Test> {
  return supertest(app) as unknown as supertest.SuperTest<supertest.Test>;
}

export interface AuthedUser {
  token: string;
  userId: string;
  fullName: string;
  phone: string;
}

export async function registerUser(
  app: express.Express,
  fullName: string,
  phone: string,
): Promise<AuthedUser> {
  const req = api(app);
  const reg = await req.post('/api/auth/register').send({ fullName, whatsappNumber: phone }).expect(201);
  const code = reg.body.otpReveal;
  if (!code) throw new Error('otpReveal missing - is ENABLE_OTP_REVEAL set?');
  const verify = await req
    .post('/api/auth/verify')
    .send({ whatsappNumber: phone, code, purpose: 'REGISTER' })
    .expect(200);
  return {
    token: verify.body.token,
    userId: verify.body.user.id,
    fullName: verify.body.user.fullName,
    phone,
  };
}

export async function loginUser(app: express.Express, phone: string): Promise<string> {
  const req = api(app);
  const res = await req.post('/api/auth/login').send({ whatsappNumber: phone }).expect(200);
  const code = res.body.otpReveal;
  const verify = await req
    .post('/api/auth/verify')
    .send({ whatsappNumber: phone, code, purpose: 'LOGIN' })
    .expect(200);
  return verify.body.token;
}

export function makeAdminByPhone(phone: string): void {
  const row = getDb().prepare('SELECT id FROM users WHERE whatsapp_normalized = ?').get(phone) as
    | { id: string }
    | undefined;
  if (!row) throw new Error(`User ${phone} not found`);
  getDb().prepare("UPDATE users SET role = 'ADMIN' WHERE id = ?").run(row.id);
}

export function toIso(date: Date): string {
  return date.toISOString();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * Seeds a competition with explicit availability windows.
 *
 * `baseDate` is the Gregorian date of Hijri day 1. The question for day D
 * becomes available on day D+1 (competition rule). Therefore, to make
 * question 1 available TODAY, pass a baseDate of yesterday.
 *
 * @param baseDate date of Hijri day 1 (default: yesterday)
 * @param count number of questions
 */
export async function seedCompetition(
  baseDate: Date = new Date(Date.now() - 86_400_000),
  count = 3,
  month = 'ربيع الأول',
) {
  const { createQuestion } = await import('../src/modules/admin/service');
  const questions = [];
  for (let i = 1; i <= count; i++) {
    const dayStart = addDays(baseDate, i - 1);
    const availableFrom = addDays(dayStart, 1).toISOString();
    const availableUntil = addDays(dayStart, 2).toISOString();
    const created = createQuestion({
      questionNumber: i,
      hijriDay: i,
      hijriMonth: month,
      questionText: `سؤال رقم ${i}؟`,
      correctAnswer: `الإجابة الصحيحة ${i}`,
      answerVariants: [`جواب ${i}`, `الإجابة ${i}`],
      availableFrom,
      availableUntil,
      status: 'ACTIVE',
    }) as { id: string };
    const id = created.id;
    questions.push({ id, questionNumber: i, hijriDay: i, availableFrom, availableUntil });
  }
  return questions;
}

export function forceExpireSession(questionId: string, userId: string): void {
  getDb()
    .prepare("UPDATE question_sessions SET status = 'EXPIRED', expires_at = ?, ended_at = ? WHERE question_id = ? AND user_id = ?")
    .run(new Date(Date.now() - 1000).toISOString(), new Date().toISOString(), questionId, userId);
}

export function getUserRow(userId: string): UserRow {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
}

export { resetDb };
