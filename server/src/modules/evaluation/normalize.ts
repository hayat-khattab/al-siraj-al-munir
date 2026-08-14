/**
 * Arabic text normalization for robust answer comparison.
 *
 * The goal is to avoid marking semantically correct answers as wrong simply
 * because of insignificant formatting differences (diacritics, alternate
 * letter forms, punctuation, spacing, tatweel, ...).
 */

const DIACRITICS =
  /[\u064B-\u065F\u0670\u0640]/g; // Arabic diacritical marks + tatweel
const PUNCTUATION =
  /[\u060C\u061B\u061F\u201C\u201D\u2018\u2019«»“”"'.،؛؟!?:()\-_\/\\[\]{}@#^~*+=<>|`]/g;

const MAP: Record<string, string> = {
  'أ': 'ا',
  'إ': 'ا',
  'آ': 'ا',
  'ٱ': 'ا',
  'ى': 'ي',
  'ة': 'ه',
};

const DIGIT_MAP: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

function mapLetters(s: string): string {
  let out = '';
  for (const ch of s) {
    out += MAP[ch] ?? DIGIT_MAP[ch] ?? ch;
  }
  return out;
}

export function normalizeArabic(input: string): string {
  if (!input) return '';
  return mapLetters(input.replace(DIACRITICS, '').replace(PUNCTUATION, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Parses the accepted-answer field into a list of accepted variants.
 * Supports multiple variants separated by newlines, '|' or '؛'.
 */
export function parseAcceptedVariants(raw: string): string[] {
  return (raw ?? '')
    .split(/\n|\||؛/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(normalizeArabic);
}

export function normalizeAnswer(input: string): string {
  return normalizeArabic(input);
}

/**
 * Jaccard-style word overlap for short-answer comparison (0..1).
 * A token matches if it is equal to, or is a substring of, the other token
 * (handles common Arabic prefix/suffix and typo variations).
 */
export function wordSimilarity(a: string, b: string): number {
  const wordsA = a.split(' ').filter(Boolean);
  const wordsB = b.split(' ').filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  let intersection = 0;
  const used = new Set<number>();
  for (const wa of wordsA) {
    for (let j = 0; j < wordsB.length; j++) {
      if (used.has(j)) continue;
      const wb = wordsB[j];
      if (wa === wb || wa.includes(wb) || wb.includes(wa)) {
        intersection += 1;
        used.add(j);
        break;
      }
    }
  }
  const union = wordsA.length + wordsB.length - intersection;
  return union === 0 ? 0 : intersection / union;
}
