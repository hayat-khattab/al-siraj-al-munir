import { describe, it, expect } from 'vitest';
import { normalizeArabic, parseAcceptedVariants, wordSimilarity } from '../src/modules/evaluation/normalize';
import { answerEvaluationService } from '../src/modules/evaluation/index';

describe('Arabic normalization', () => {
  it('strips diacritics and tatweel', () => {
    expect(normalizeArabic('بِسْمِ اللّهِ')).toBe('بسم الله');
  });

  it('normalizes alef and ta-marbuta forms', () => {
    expect(normalizeArabic('الإسلام')).toBe('الاسلام');
    expect(normalizeArabic('حمدانة')).toBe('حمدانه');
  });

  it('collapses whitespace and removes punctuation', () => {
    expect(normalizeArabic('  إبراهيم، عليه   السلام! ')).toBe('ابراهيم عليه السلام');
  });

  it('parses accepted variants separated by newlines/pipes', () => {
    const variants = parseAcceptedVariants('إبراهيم عليه السلام\nسيدنا إبراهيم|الخليل');
    expect(variants).toEqual(['ابراهيم عليه السلام', 'سيدنا ابراهيم', 'الخليل']);
  });
});

describe('Rule-based evaluation', () => {
  it('scores an exact match 100', () => {
    const result = answerEvaluationService.evaluate({ userAnswer: 'سورة يس', correctAnswer: 'سورة يس' });
    expect(result.score).toBe(100);
    expect(result.correction).toBe('CORRECT');
  });

  it('matches against alternate variants', () => {
    const result = answerEvaluationService.evaluate({
      userAnswer: 'يس',
      correctAnswer: 'سورة يس',
      acceptedVariants: ['يس'],
    });
    expect(result.correction).toBe('CORRECT');
  });

  it('matches fuzzy-close answers (typo rescue)', () => {
    const result = answerEvaluationService.evaluate({
      userAnswer: 'سورة يسن',
      correctAnswer: 'سورة يس',
    });
    expect(result.score).toBeGreaterThan(0);
  });

  it('scores a wrong answer 0', () => {
    const result = answerEvaluationService.evaluate({ userAnswer: 'لا أعرف', correctAnswer: 'إبراهيم' });
    expect(result.score).toBe(0);
    expect(result.correction).toBe('INCORRECT');
  });

  it('handles empty answers gracefully', () => {
    const result = answerEvaluationService.evaluate({ userAnswer: '  ', correctAnswer: 'إبراهيم' });
    expect(result.score).toBe(0);
  });

  it('word similarity is symmetric and bounded', () => {
    expect(wordSimilarity('أ ب ج', 'أ ب ج')).toBe(1);
    expect(wordSimilarity('أ ب ج', 'د ه و')).toBe(0);
    expect(wordSimilarity('أ ب ج', 'أ ب ج د')).toBe(0.75);
  });
});
