import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { getDb, resetDb } from '../src/db/database';
import { seedIfNeeded } from '../src/seed/seed';
import { normalizePhone } from '../src/util/normalize';
import { config } from '../src/config';
import { answerEvaluationService } from '../src/modules/evaluation/index';

const questionsFile = new URL('../src/seed/questions.json', import.meta.url);

describe('Seeding', () => {
  beforeEach(() => resetDb());

  it('seeds the verified questions.json questions and records a seed version', () => {
    const db = getDb();
    seedIfNeeded();

    const count = (db.prepare('SELECT COUNT(*) AS c FROM questions').get() as { c: number }).c;
    expect(count).toBe(1);

    const version = db.prepare("SELECT value FROM settings WHERE key = 'seed_version'").get() as { value: string };
    expect(version.value).toBeTruthy();
  });

  it('ensures an admin account exists', () => {
    const db = getDb();
    seedIfNeeded();

    const admin = db.prepare("SELECT * FROM users WHERE role = 'ADMIN'").get() as
      | { whatsapp_normalized: string }
      | undefined;
    expect(admin).toBeTruthy();
    expect(admin!.whatsapp_normalized).toBe(normalizePhone(config.adminWhatsappNumber));
  });

  it('is idempotent', () => {
    const db = getDb();
    seedIfNeeded();
    seedIfNeeded();
    expect((db.prepare('SELECT COUNT(*) AS c FROM questions').get() as { c: number }).c).toBe(1);
  });

  it('wipes and re-seeds when the stored version does not match the file (and no answers exist)', () => {
    const db = getDb();
    seedIfNeeded();
    db.prepare("UPDATE settings SET value = 'stale' WHERE key = 'seed_version'").run();
    seedIfNeeded();
    expect((db.prepare('SELECT COUNT(*) AS c FROM questions').get() as { c: number }).c).toBe(1);
  });
});

describe('Competition questions are scorable', () => {
  it('Episode 1 hadith answer is accepted by the evaluator', () => {
    const questions = JSON.parse(readFileSync(questionsFile, 'utf-8')) as Array<{
      correctAnswer: string;
      answerVariants: string[];
    }>;

    const q1 = questions[0];
    const variants = q1.answerVariants ?? [];

    // Exact canonical quoting must be accepted.
    expect(answerEvaluationService.evaluate({ userAnswer: q1.correctAnswer, correctAnswer: q1.correctAnswer, acceptedVariants: variants }).correction).toBe(
      'CORRECT',
    );

    // A plain quoting of the hadith (without isnad) must also be accepted.
    const member = 'ذاك يوم ولدت فيه ويوم بعثت فيه أو أنزل علي فيه';
    expect(answerEvaluationService.evaluate({ userAnswer: member, correctAnswer: q1.correctAnswer, acceptedVariants: variants }).correction).toBe('CORRECT');
  });
});
