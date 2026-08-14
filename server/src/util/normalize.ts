import { AppError } from '../util/errors';

const NAME_PART_RE = /^[\u0621-\u064A\u0660-\u0669A-Za-z'’\-]+$/;
const ARABIC_PART_RE = /[\u0621-\u064A]/;

/**
 * Validates and splits a full name into exactly three parts.
 * The competition requires a three-part full name (first, middle, last).
 */
export function parseFullName(fullName: string): { fullName: string; first: string; middle: string; last: string } {
  const trimmed = (fullName ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    throw AppError.badRequest('INVALID_NAME', 'يرجى إدخال الاسم الثلاثي الكامل.');
  }
  const parts = trimmed.split(' ');
  if (parts.length !== 3) {
    throw AppError.badRequest(
      'INVALID_NAME',
      'يرجى إدخال الاسم الثلاثي الكامل (الاسم الأول، اسم الأب، اسم العائلة) مفصولة بمسافات.',
    );
  }
  for (const part of parts) {
    if (!NAME_PART_RE.test(part)) {
      throw AppError.badRequest('INVALID_NAME', 'يحتوي الاسم على رموز غير صالحة. يرجى استخدام الحروف العربية فقط.');
    }
  }
  const hasArabic = parts.some((p) => ARABIC_PART_RE.test(p));
  const normalized = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
  if (!hasArabic && parts.length !== 3) {
    throw AppError.badRequest('INVALID_NAME', 'يرجى إدخال الاسم الثلاثي الكامل.');
  }
  return {
    fullName: normalized,
    first: parts[0] ?? '',
    middle: parts[1] ?? '',
    last: parts[2] ?? '',
  };
}

/**
 * Normalizes a phone number to E.164-style internal form.
 * Handles spaces, dashes, parentheses, leading +, 00, and local leading 0.
 */
export function normalizePhone(input: string): string {
  const cleaned = (input ?? '').replace(/[\s\-()().]/g, '').trim();
  if (!cleaned) return '';

  let digits = cleaned.replace(/[^\d]/g, '');
  if (cleaned.startsWith('+')) {
    digits = cleaned.slice(1).replace(/[^\d]/g, '');
  } else if (cleaned.startsWith('00')) {
    digits = cleaned.slice(2).replace(/[^\d]/g, '');
  } else if (cleaned.startsWith('0')) {
    digits = cleaned.replace(/[^\d]/g, '');
    if (digits.length === 11) digits = '20' + digits.slice(1);
  }

  if (digits.length < 8 || digits.length > 15) {
    throw AppError.badRequest('INVALID_PHONE', 'يرجى إدخال رقم واتساب صحيح (8 إلى 15 رقماً).');
  }

  return '+' + digits;
}

/** Formats a normalized number into a friendly display form. */
export function formatPhone(phone: string): string {
  return phone;
}
