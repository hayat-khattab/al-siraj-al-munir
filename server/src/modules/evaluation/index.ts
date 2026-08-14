import { normalizeAnswer, parseAcceptedVariants, wordSimilarity } from './normalize';

export interface EvaluationInput {
  userAnswer: string;
  correctAnswer: string;
  /** Additional accepted variants (from admin-provided answer_variants field). */
  acceptedVariants?: string[];
}

export interface EvaluationResult {
  score: number;
  correction: 'CORRECT' | 'INCORRECT';
  feedback: string;
  matchedVariant: string | null;
  confidence: number;
  method: string;
}

/**
 * Abstraction for answer evaluation.
 *
 * Currently backed by a deterministic rule-based engine (exact normalized
 * match + fuzzy word overlap). A semantic/AI evaluator can be plugged in
 * later (e.g. `AiEvaluationService`) without changing the rest of the
 * application.
 */
export interface AnswerEvaluationService {
  evaluate(input: EvaluationInput): EvaluationResult;
}

const EXACT_SCORE = 100;
const PASS_THRESHOLD = 70;

export class RuleBasedEvaluationService implements AnswerEvaluationService {
  evaluate(input: EvaluationInput): EvaluationResult {
    const user = normalizeAnswer(input.userAnswer);
    const candidates = [
      normalizeAnswer(input.correctAnswer),
      ...parseAcceptedVariants(input.correctAnswer),
      ...(input.acceptedVariants ?? []).map(normalizeAnswer),
    ];

    if (user.length === 0) {
      return {
        score: 0,
        correction: 'INCORRECT',
        feedback: 'لم يتم تقديم إجابة للمراجعة.',
        matchedVariant: null,
        confidence: 1,
        method: 'rule-based',
      };
    }

    for (const candidate of candidates) {
      if (candidate.length > 0 && user === candidate) {
        return {
          score: EXACT_SCORE,
          correction: 'CORRECT',
          feedback: 'إجابة صحيحة. أحسنت!',
          matchedVariant: candidate,
          confidence: 1,
          method: 'rule-based-exact',
        };
      }
    }

    // Fuzzy fallback: strong word overlap can rescue small typos.
    const best = candidates.reduce<{ sim: number; candidate: string | null }>(
      (acc, candidate) => {
        const sim = wordSimilarity(user, candidate);
        return sim > acc.sim ? { sim, candidate } : acc;
      },
      { sim: 0, candidate: null },
    );

    if (best.sim >= 0.8 && best.candidate) {
      return {
        score: Math.round(EXACT_SCORE * best.sim),
        correction: 'CORRECT',
        feedback: `إجابة صحيحة بنسبة عالية من التطابق.`,
        matchedVariant: best.candidate,
        confidence: best.sim,
        method: 'rule-based-fuzzy',
      };
    }

    return {
      score: 0,
      correction: 'INCORRECT',
      feedback: 'الإجابة غير مطابقة للإجابة المعتمدة.',
      matchedVariant: null,
      confidence: best.sim,
      method: 'rule-based',
    };
  }
}

export const answerEvaluationService: AnswerEvaluationService = new RuleBasedEvaluationService();

export const evaluationConfig = {
  passThreshold: PASS_THRESHOLD,
};
