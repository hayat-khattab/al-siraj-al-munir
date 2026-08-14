import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb, nowIso, audit, transaction, type UserRow, type OtpRow } from '../../db/database';
import { AppError } from '../../util/errors';
import { parseFullName, normalizePhone } from '../../util/normalize';
import { signToken } from '../../util/token';
import { config } from '../../config';
import { getOtpProvider, isOtpRevealEnabled } from './otp';

const OTP_LENGTH = 6;

export interface AuthResult {
  token: string;
  user: PublicUser;
  otpReveal?: string;
}

export interface PublicUser {
  id: string;
  fullName: string;
  whatsappNumber: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  lastLoginAt: string | null;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    fullName: row.full_name,
    whatsappNumber: row.whatsapp_number,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function generateOtpCode(): string {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

function issueOtp(phoneNormalized: string, purpose: 'REGISTER' | 'LOGIN'): { code: string } {
  const code = generateOtpCode();
  const codeHash = bcrypt.hashSync(code, 8);
  const expiresAt = new Date(Date.now() + config.otpTtlMinutes * 60_000).toISOString();

  transaction(() => {
    const db = getDb();
    // Invalidate previous unconsumed codes for this phone + purpose.
    db.prepare("DELETE FROM otp_codes WHERE phone_normalized = ? AND purpose = ? AND consumed = 0").run(
      phoneNormalized,
      purpose,
    );
    db.prepare(
      'INSERT INTO otp_codes (id, phone_normalized, code_hash, purpose, expires_at, attempts, consumed, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)',
    ).run(crypto.randomUUID(), phoneNormalized, codeHash, purpose, expiresAt, nowIso());
  });

  return { code };
}

export async function register(fullName: string, rawPhone: string): Promise<{ message: string; otpReveal?: string; channel: string }> {
  const parsed = parseFullName(fullName);
  const phoneNormalized = normalizePhone(rawPhone);

  const existing = getDb()
    .prepare('SELECT id FROM users WHERE whatsapp_normalized = ?')
    .get(phoneNormalized) as UserRow | undefined;

  if (existing) {
    throw AppError.conflict(
      'PHONE_TAKEN',
      'رقم الواتساب مسجل مسبقاً. يرجى تسجيل الدخول بدلاً من إنشاء حساب جديد.',
    );
  }

  const nameTaken = getDb().prepare('SELECT id FROM users WHERE full_name = ?').get(parsed.fullName) as
    | UserRow
    | undefined;
  if (nameTaken) {
    throw AppError.conflict('NAME_TAKEN', 'الاسم الثلاثي مسجل مسبقاً بحساب آخر.');
  }

  const id = crypto.randomUUID();
  const now = nowIso();
  try {
    getDb()
      .prepare(
        `INSERT INTO users (id, full_name, first_name, middle_name, last_name, whatsapp_number, whatsapp_normalized, role, status, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'USER', 'ACTIVE', ?, NULL)`,
      )
      .run(id, parsed.fullName, parsed.first, parsed.middle, parsed.last, rawPhone.trim(), phoneNormalized, now);
  } catch (err: any) {
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw AppError.conflict('DUPLICATE', 'بيانات الحساب مسجلة مسبقاً. يرجى تسجيل الدخول.');
    }
    throw err;
  }

  audit('USER_REGISTERED', id);

  const { code } = issueOtp(phoneNormalized, 'REGISTER');
  const delivery = await getOtpProvider().send(phoneNormalized, code);

  return {
    message: 'تم إنشاء حسابك بنجاح. أدخل رمز التحقق المرسل.',
    channel: delivery.channel,
    ...(isOtpRevealEnabled() ? { otpReveal: code } : {}),
  };
}

export async function requestLogin(rawPhone: string): Promise<{ message: string; otpReveal?: string; channel: string }> {
  const phoneNormalized = normalizePhone(rawPhone);
  const user = getDb()
    .prepare('SELECT * FROM users WHERE whatsapp_normalized = ?')
    .get(phoneNormalized) as UserRow | undefined;

  if (!user) {
    throw AppError.notFound('USER_NOT_FOUND', 'هذا الرقم غير مسجل. يرجى إنشاء حساب جديد أولاً.');
  }
  if (user.status !== 'ACTIVE') {
    throw AppError.forbidden('USER_DISABLED', 'تم إيقاف حسابك. يرجى التواصل مع الإدارة.');
  }

  const { code } = issueOtp(phoneNormalized, 'LOGIN');
  const delivery = await getOtpProvider().send(phoneNormalized, code);

  return {
    message: 'تم إرسال رمز التحقق إلى رقم الواتساب الخاص بك.',
    channel: delivery.channel,
    ...(isOtpRevealEnabled() ? { otpReveal: code } : {}),
  };
}

export function verifyOtp(rawPhone: string, code: string, purpose: 'REGISTER' | 'LOGIN'): AuthResult {
  const phoneNormalized = normalizePhone(rawPhone);
  const otp = getDb()
    .prepare('SELECT * FROM otp_codes WHERE phone_normalized = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1')
    .get(phoneNormalized, purpose) as OtpRow | undefined;

  if (!otp) {
    throw AppError.badRequest('OTP_NOT_FOUND', 'لا يوجد رمز تحقق. اطلب رمزاً جديداً.');
  }
  if (otp.consumed === 1) {
    throw AppError.badRequest('OTP_USED', 'تم استخدام هذا الرمز من قبل. اطلب رمزاً جديداً.');
  }
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    throw AppError.badRequest('OTP_EXPIRED', 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.');
  }

  const valid = bcrypt.compareSync(String(code).trim(), otp.code_hash);
  if (!valid) {
    const attempts = otp.attempts + 1;
    getDb()
      .prepare('UPDATE otp_codes SET attempts = ? WHERE id = ?')
      .run(attempts, otp.id);
    if (attempts >= 5) {
      getDb().prepare('DELETE FROM otp_codes WHERE id = ?').run(otp.id);
    }
    throw AppError.badRequest('OTP_INVALID', 'رمز التحقق غير صحيح. حاول مرة أخرى.');
  }

  const user = getDb()
    .prepare('SELECT * FROM users WHERE whatsapp_normalized = ?')
    .get(phoneNormalized) as UserRow | undefined;

  if (!user) {
    throw AppError.notFound('USER_NOT_FOUND', 'المستخدم غير موجود.');
  }
  if (user.status !== 'ACTIVE') {
    throw AppError.forbidden('USER_DISABLED', 'تم إيقاف حسابك. يرجى التواصل مع الإدارة.');
  }

  getDb()
    .prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?')
    .run(otp.id);
  getDb()
    .prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
    .run(nowIso(), user.id);

  audit('USER_LOGIN', user.id);
  const token = signToken({ sub: user.id, role: user.role });
  return { token, user: toPublicUser(user) };
}

export function getUserById(id: string): PublicUser | null {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? toPublicUser(row) : null;
}
