export type Role = 'USER' | 'ADMIN';

export interface AuthUser {
  id: string;
  fullName: string;
  whatsappNumber: string;
  role: Role;
  createdAt: string;
}

export type DayStatus = 'ANSWERED' | 'AVAILABLE' | 'MISSED' | 'FUTURE';

export interface CompetitionDay {
  questionId: string | null;
  questionNumber: number;
  hijriDay: number;
  hijriMonth: string;
  status: DayStatus;
  availableFrom: string;
  availableUntil: string;
  serverNow: string;
}

export type QuestionStatus = 'AVAILABLE' | 'MISSED' | 'ANSWERED' | 'FUTURE';

export interface QuestionView {
  questionId: string;
  questionNumber: number;
  status: QuestionStatus;
  hijriDay: number;
  hijriMonth: number;
  questionText: string | null;
  availableFrom: string;
  availableUntil: string;
  serverNow: string;
  session: {
    sessionId: string;
    startedAt: string;
    expiresAt: string;
    effectiveDeadline: string;
    remainingSeconds: number;
    status: string;
  } | null;
  answer: AnswerView | null;
  message: string | null;
}

export interface SessionResult {
  sessionId: string;
  remainingSeconds: number;
}

export interface AnswerView {
  answerId: string;
  answerText: string;
  submittedAt: string;
  score: number | null;
  correction: 'CORRECT' | 'INCORRECT' | null;
  feedback: string | null;
  correctAnswer: string | null;
  correctedAt: string | null;
}

export interface SubmitResult {
  answer: AnswerView;
  remainingSeconds: number;
}

export interface AdminQuestion {
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

export interface AdminUser {
  id: string;
  fullName: string;
  whatsappNumber: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  lastLoginAt: string | null;
  answeredCount: number;
}

export interface AdminAnswer {
  answerId: string;
  userId: string;
  userName: string;
  userPhone: string;
  questionId: string;
  questionNumber: number;
  hijriDay: number;
  hijriMonth: string;
  answerText: string;
  submittedAt: string;
  score: number | null;
  correction: 'CORRECT' | 'INCORRECT' | null;
  feedback: string | null;
  correctAnswer: string | null;
  timeTakenSeconds: number | null;
}

export interface AdminStats {
  totalUsers: number;
  activeParticipants: number;
  todayParticipants: number;
  totalAnswers: number;
  correctAnswers: number;
  incorrectAnswers: number;
  missedQuestions: number;
  avgAnswerTimeSeconds: number;
  totalQuestions: number;
  availableQuestions: number;
  correctRate: number;
}

export interface UserAnswerAdminRow {
  questionNumber: number;
  hijriDay: number;
  hijriMonth: string;
  questionText: string;
  correctAnswer: string;
  answerId: string | null;
  answerText: string | null;
  submittedAt: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  endedAt: string | null;
  timeTakenSeconds: number | null;
  score: number | null;
  correction: 'CORRECT' | 'INCORRECT' | null;
  sessionStatus: 'ACTIVE' | 'SUBMITTED' | 'EXPIRED' | null;
}
