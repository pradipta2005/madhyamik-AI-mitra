export type WbbseSubject =
  | 'All Subjects'
  | 'Physical Science'
  | 'Life Science'
  | 'Mathematics'
  | 'History'
  | 'Geography'
  | 'Bengali'
  | 'English';

export type LanguageCode = 'bn' | 'en';

export type ImportanceLevel =
  | 'High Probability'
  | 'Repeated Trend'
  | 'Concept Builder';

export interface PyqBankEntry {
  id: string;
  subject: Exclude<WbbseSubject, 'All Subjects'>;
  chapter: string;
  chapterBn: string;
  questionEn: string;
  questionBn: string;
  examYears: number[];
  testPaperRefs?: string[];
  marks: number;
  importanceLevel: ImportanceLevel;
  trendNoteEn: string;
  trendNoteBn: string;
  keywords: string[];
}

export interface SuggestedPyqItem {
  question: string;
  years: number[];
  testPaperRefs?: string[];
  marks: string;
  importance: ImportanceLevel;
  trendNote: string;
  chapter?: string;
  subject?: string;
}

export interface YouTubeRecommendation {
  title: string;
  channel: string;
  url: string;
  reason?: string;
  thumbnailUrl?: string;
  verified?: boolean;
}

export interface WbbseVideoEntry {
  id: string;
  subject: WbbseSubject;
  chapter: string;
  chapterBn: string;
  keywords: string[];
  title: string;
  channel: string;
  url: string;
  reasonBn: string;
  reasonEn: string;
  thumbnailUrl?: string;
}

export interface GroundingLink {
  title: string;
  url: string;
}

export interface ProblemSolveStep {
  stepNumber: number;
  title: string;
  whyThisStep: string;
  work: string;
}

export type BlackboardLineKind =
  | 'heading'
  | 'text'
  | 'formula'
  | 'work'
  | 'highlight'
  | 'answer';

export interface BlackboardLine {
  kind: BlackboardLineKind;
  content: string;
}

export interface BlackboardSectionSnapshot {
  sectionNumber: number;
  sectionTitle: string;
  blackboardLines: BlackboardLine[];
}

export interface ProblemSolveData {
  topicTitle: string;
  subjectGuard?: 'Mathematics' | 'Physical Science';
  subjectMismatch?: boolean;
  mismatchReason?: string;
  detectedSubject?: string;
  sectionNumber?: number;
  estimatedTotalSections?: number;
  isFinalSection?: boolean;
  sectionTitle?: string;
  teacherSpeech?: string;
  blackboardLines?: BlackboardLine[];
  boardHistory?: BlackboardSectionSnapshot[];
  simpleConcept?: string;
  formulaOrRule?: string;
  givenData?: string[];
  steps?: ProblemSolveStep[];
  finalAnswer?: string;
  examTip?: string;
  simplificationLevel: number;
  feedbackQuestion: string;
}

export type MessageMode = 'pyq' | 'concept' | 'problem_solve' | 'general' | 'voice';

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  role: 'user' | 'assistant' | 'voice_transcript';
  text: string;
  language: LanguageCode;
  subject: string;
  mode: MessageMode;
  attachmentName?: string;
  attachmentMimeType?: string;
  problemSolve?: ProblemSolveData;
  pyqItems?: SuggestedPyqItem[];
  youtubeVideos?: YouTubeRecommendation[];
  groundingLinks?: GroundingLink[];
  createdAt: number;
  isStreaming?: boolean;
}

export interface UploadedPaperContext {
  fileName: string;
  mimeType: string;
  summary: string;
  base64Data?: string;
  previewUrl?: string;
  sizeBytes: number;
}

export interface StudySession {
  id: string;
  userId: string;
  title: string;
  subject: WbbseSubject;
  language: LanguageCode;
  messageCount: number;
  hasAttachment: boolean;
  attachmentName?: string;
  attachmentSummary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface LiveTranscriptTurn {
  speaker: 'student' | 'tutor';
  text: string;
  timestamp: number;
}

export interface AppUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL?: string | null;
  isGuest?: boolean;
}

export interface FormattedAuthError {
  raw: string;
  isUnauthorizedDomain: boolean;
  hostname: string;
  canSwitchToLocalhost: boolean;
  localhostUrl: string;
  firebaseConsoleUrl: string;
  titleEn: string;
  titleBn: string;
  messageEn: string;
  messageBn: string;
  stepsEn: string[];
  stepsBn: string[];
}
