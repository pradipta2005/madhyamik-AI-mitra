import type {
  BlackboardLine,
  BlackboardLineKind,
  BlackboardSectionSnapshot,
  ChatMessage,
  FormattedAuthError,
  GroundingLink,
  AppUser,
  ImportanceLevel,
  LanguageCode,
  LiveTranscriptTurn,
  MessageMode,
  ProblemSolveData,
  PyqBankEntry,
  StudySession,
  SuggestedPyqItem,
  WbbseSubject,
  YouTubeRecommendation,
} from '../types.ts';

export const SUBJECT_META: {
  id: WbbseSubject;
  labelEn: string;
  labelBn: string;
}[] = [
  { id: 'All Subjects', labelEn: 'All Subjects', labelBn: 'সকল বিষয়' },
  { id: 'Physical Science', labelEn: 'Physical Science', labelBn: 'ভৌত বিজ্ঞান' },
  { id: 'Life Science', labelEn: 'Life Science', labelBn: 'জীবন বিজ্ঞান' },
  { id: 'Mathematics', labelEn: 'Mathematics', labelBn: 'গণিত' },
  { id: 'History', labelEn: 'History', labelBn: 'ইতিহাস' },
  { id: 'Geography', labelEn: 'Geography', labelBn: 'ভূগোল' },
  { id: 'Bengali', labelEn: 'Bengali', labelBn: 'বাংলা' },
  { id: 'English', labelEn: 'English', labelBn: 'ইংরেজি' },
];

export function getVisibleSubjects(lockedSubject: WbbseSubject | null) {
  if (lockedSubject === null) {
    return SUBJECT_META;
  }
  return SUBJECT_META.filter((s) => s.id === lockedSubject);
}

const BANGLISH_MARKERS = new Set([
  'bojhao',
  'bojhhao',
  'bojha',
  'shohoj',
  'sohoj',
  'bhashay',
  'bhashai',
  'vasay',
  'vasai',
  'prosno',
  'proshno',
  'uttor',
  'bhouto',
  'vouto',
  'jibon',
  'biggan',
  'bigyan',
  'itihas',
  'bhugol',
  'vugol',
  'gonit',
  'alor',
  'protisaron',
  'kivabe',
  'kibhabe',
  'keno',
  'kothay',
  'korbo',
  'koro',
  'dao',
  'din',
  'bolo',
  'sajeshon',
  'guruttopurno',
  'guruttapurno',
  'banglay',
  'bangla',
  'amake',
  'amar',
  'tomar',
  'emon',
  'kon',
  'konta',
  'gulo',
  'niye',
  'theke',
  'jonyo',
  'jonno',
  'ebong',
  'ar',
  'kichu',
  'adhyay',
  'odhyay',
  'upopaddo',
  'shomoy',
]);

export function detectLanguage(text: string): LanguageCode {
  if (!text || !text.trim()) return 'en';
  if (/[\u0980-\u09FF]/.test(text)) {
    return 'bn';
  }
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let banglishHits = 0;
  for (const token of tokens) {
    if (BANGLISH_MARKERS.has(token)) {
      banglishHits += 1;
    }
  }
  if (banglishHits >= 2) {
    return 'bn';
  }
  if (
    banglishHits === 1 &&
    tokens.some((t) =>
      ['bojhao', 'bojhhao', 'bhashay', 'vasay', 'proshno', 'prosno', 'kivabe', 'amake', 'banglay'].includes(
        t
      )
    )
  ) {
    return 'bn';
  }
  return 'en';
}

export function isSupportedDocumentType(fileName: string, mimeType = ''): boolean {
  const lower = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();
  return (
    mime === 'application/pdf' ||
    mime === 'text/plain' ||
    mime === 'image/png' ||
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/webp' ||
    mime === 'image/gif' ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif')
  );
}

export function isProblemSolveSubject(subject: WbbseSubject): boolean {
  return subject === 'Mathematics' || subject === 'Physical Science';
}

export function extractYouTubeVideoId(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0] || '';
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        const v = parsed.searchParams.get('v') || '';
        return /^[a-zA-Z0-9_-]{11}$/.test(v) ? v : null;
      }
      const match = parsed.pathname.match(/^\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{11})/);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function normalizeYouTubeUrl(rawUrl: string): string | null {
  const id = extractYouTubeVideoId(rawUrl);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function detectQueryIntent(
  text: string,
  subject: WbbseSubject = 'All Subjects',
  hasAttachment = false,
  solveMode = false
): MessageMode {
  const isMathOrPhysics = isProblemSolveSubject(subject);
  if (solveMode && isMathOrPhysics) return 'problem_solve';

  const lower = text.toLowerCase();
  const pyqKeywords = [
    'pyq',
    'previous year',
    'important question',
    'suggestion',
    '10-year',
    '10 year',
    'trend',
    'marks',
    'exam pattern',
    'most probable',
    'common question',
    'abta',
    'wbta',
    'test paper',
    'প্রশ্ন',
    'সাজেশন',
    'গুরুত্বপূর্ণ',
    'বিগত',
    'বছরের',
    'নম্বর',
    'প্রশ্নপত্র',
    'কমন',
    'টেস্ট পেপার',
  ];
  const problemSolveKeywords = [
    'solve',
    'step by step',
    'step-by-step',
    'unable to solve',
    'stuck',
    'numerical',
    'calculate',
    'find the value',
    'prove that',
    'simplify',
    'simpler',
    'confused',
    'understand this problem',
    'অঙ্ক',
    'সমাধান',
    'কষে',
    'প্রমাণ করো',
    'মান নির্ণয়',
    'ধাপে ধাপে',
    'সহজ করে',
    'বুঝতে পারছি না',
    'পারছি না',
  ];
  const conceptKeywords = [
    'explain',
    'understand',
    'what is',
    'how does',
    'why does',
    'concept',
    'define',
    'simple',
    'diagram',
    'bojh',
    'সহজ',
    'বোঝাও',
    'বুঝিয়ে',
    'কী',
    'কাকে বলে',
    'ব্যাখ্যা',
    'কেন',
    'কীভাবে',
  ];

  const isProblemSolve = problemSolveKeywords.some((k) => lower.includes(k));
  const isPyq = pyqKeywords.some((k) => lower.includes(k));
  const isConcept = conceptKeywords.some((k) => lower.includes(k));

  if (isMathOrPhysics && (isProblemSolve || hasAttachment) && !isPyq) {
    return 'problem_solve';
  }
  if (isPyq && !isConcept) return 'pyq';
  if (isConcept && !isPyq) return 'concept';
  if (isPyq) return 'pyq';
  if (isConcept) return 'concept';
  return 'general';
}

export function searchPyqBank(
  entries: PyqBankEntry[],
  query: string,
  subject: WbbseSubject = 'All Subjects',
  limit = 6
): PyqBankEntry[] {
  const pool =
    subject === 'All Subjects'
      ? entries
      : entries.filter((e) => e.subject === subject);

  const normalizedQuery = query.toLowerCase().trim();
  const queryTokens = normalizedQuery
    .split(/[\s,?.!।;:()\-]+/)
    .filter((t) => t.length >= 2);

  const scored = pool.map((entry) => {
    let score = 0;
    const haystack = [
      entry.subject,
      entry.chapter,
      entry.chapterBn,
      entry.questionEn,
      entry.questionBn,
      ...entry.keywords,
    ]
      .join(' ')
      .toLowerCase();

    for (const token of queryTokens) {
      if (haystack.includes(token)) {
        score += 3;
      }
      if (entry.keywords.some((kw) => kw.toLowerCase() === token)) {
        score += 4;
      }
    }

    if (entry.importanceLevel === 'High Probability') score += 1.5;
    if (entry.importanceLevel === 'Repeated Trend') score += 1;
    score += entry.examYears.length * 0.25;

    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

const VALID_IMPORTANCE = new Set<ImportanceLevel>([
  'High Probability',
  'Repeated Trend',
  'Concept Builder',
]);

export function parseAssistantResponseBlocks(rawText: string): {
  cleanText: string;
  pyqItems: SuggestedPyqItem[];
  youtubeVideos: YouTubeRecommendation[];
  problemSolve?: ProblemSolveData;
} {
  let cleanText = rawText;
  let pyqItems: SuggestedPyqItem[] = [];
  let youtubeVideos: YouTubeRecommendation[] = [];
  let problemSolve: ProblemSolveData | undefined;

  const pyqMatch = cleanText.match(/```json:pyq\s*([\s\S]*?)```/i);
  if (pyqMatch && pyqMatch[1]) {
    try {
      const parsed = JSON.parse(pyqMatch[1].trim());
      if (Array.isArray(parsed)) {
        pyqItems = parsed
          .slice(0, 12)
          .filter((item) => item && typeof item.question === 'string')
          .map((item) => ({
            question: String(item.question).slice(0, 1200),
            years: Array.isArray(item.years)
              ? item.years
                  .map((y: unknown) => Number(y))
                  .filter((y: number) => Number.isFinite(y) && y >= 2000 && y <= 2030)
                  .slice(0, 12)
              : [],
            testPaperRefs: Array.isArray(item.testPaperRefs)
              ? item.testPaperRefs
                  .map((r: unknown) => String(r).trim().slice(0, 120))
                  .filter(Boolean)
                  .slice(0, 4)
              : undefined,
            marks: String(item.marks ?? '2 Marks').slice(0, 40),
            importance: VALID_IMPORTANCE.has(item.importance)
              ? item.importance
              : 'High Probability',
            trendNote: String(item.trendNote ?? '').slice(0, 400),
            chapter: item.chapter ? String(item.chapter).slice(0, 120) : undefined,
            subject: item.subject ? String(item.subject).slice(0, 80) : undefined,
          }));
      }
    } catch {
      // Ignore malformed JSON fence safely
    }
    cleanText = cleanText.replace(pyqMatch[0], '');
  }

const VALID_LINE_KINDS = new Set<BlackboardLineKind>([
  'heading',
  'text',
  'formula',
  'work',
  'highlight',
  'answer',
]);

function normalizeBlackboardLines(raw: unknown): BlackboardLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 14)
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const rec = item as Record<string, unknown>;
      const rawKind = String(rec.kind || 'text') as BlackboardLineKind;
      return {
        kind: VALID_LINE_KINDS.has(rawKind) ? rawKind : 'text',
        content: String(rec.content ?? '').trim().slice(0, 800),
      };
    })
    .filter((l) => l.content.length > 0);
}

  const solveMatch =
    cleanText.match(/```json:problem_solve\s*([\s\S]*?)```/i) ||
    cleanText.match(
      /```json\s*(\{[\s\S]*?(?:"blackboardLines"|"teacherSpeech"|"subjectMismatch")[\s\S]*?\})\s*```/i
    );
  if (solveMatch && solveMatch[1]) {
    try {
      const parsed = JSON.parse(solveMatch[1].trim());
      if (parsed && typeof parsed === 'object') {
        const hasBlackboard =
          typeof parsed.teacherSpeech === 'string' ||
          Array.isArray(parsed.blackboardLines) ||
          Boolean(parsed.subjectMismatch);
        const hasLegacy =
          typeof parsed.simpleConcept === 'string' && Array.isArray(parsed.steps);

        if (hasBlackboard || hasLegacy) {
          const blackboardLines = normalizeBlackboardLines(parsed.blackboardLines);
          const boardHistory: BlackboardSectionSnapshot[] = Array.isArray(parsed.boardHistory)
            ? parsed.boardHistory
                .slice(0, 8)
                .filter((h: unknown) => h && typeof h === 'object')
                .map((h: Record<string, unknown>, idx: number) => ({
                  sectionNumber:
                    typeof h.sectionNumber === 'number' && Number.isFinite(h.sectionNumber)
                      ? h.sectionNumber
                      : idx + 1,
                  sectionTitle: String(h.sectionTitle ?? `Section ${idx + 1}`).slice(0, 180),
                  blackboardLines: normalizeBlackboardLines(h.blackboardLines),
                }))
            : [];

          problemSolve = {
            topicTitle: String(
              parsed.topicTitle ?? parsed.sectionTitle ?? 'Blackboard Solution'
            ).slice(0, 180),
            subjectGuard:
              parsed.subjectGuard === 'Mathematics' ||
              parsed.subjectGuard === 'Physical Science'
                ? parsed.subjectGuard
                : undefined,
            subjectMismatch: Boolean(parsed.subjectMismatch),
            mismatchReason: parsed.mismatchReason
              ? String(parsed.mismatchReason).slice(0, 800)
              : undefined,
            detectedSubject: parsed.detectedSubject
              ? String(parsed.detectedSubject).slice(0, 80)
              : undefined,
            sectionNumber:
              typeof parsed.sectionNumber === 'number' && Number.isFinite(parsed.sectionNumber)
                ? Math.max(1, Math.min(10, Math.round(parsed.sectionNumber)))
                : undefined,
            estimatedTotalSections:
              typeof parsed.estimatedTotalSections === 'number' &&
              Number.isFinite(parsed.estimatedTotalSections)
                ? Math.max(1, Math.min(10, Math.round(parsed.estimatedTotalSections)))
                : undefined,
            isFinalSection:
              typeof parsed.isFinalSection === 'boolean' ? parsed.isFinalSection : undefined,
            sectionTitle: parsed.sectionTitle
              ? String(parsed.sectionTitle).slice(0, 180)
              : undefined,
            teacherSpeech: parsed.teacherSpeech
              ? String(parsed.teacherSpeech).slice(0, 3500)
              : undefined,
            blackboardLines: blackboardLines.length > 0 ? blackboardLines : undefined,
            boardHistory: boardHistory.length > 0 ? boardHistory : undefined,
            simpleConcept:
              typeof parsed.simpleConcept === 'string'
                ? String(parsed.simpleConcept).slice(0, 3500)
                : undefined,
            formulaOrRule: parsed.formulaOrRule
              ? String(parsed.formulaOrRule).slice(0, 600)
              : undefined,
            givenData: Array.isArray(parsed.givenData)
              ? parsed.givenData
                  .map((g: unknown) => String(g).trim().slice(0, 300))
                  .filter(Boolean)
                  .slice(0, 10)
              : undefined,
            steps: Array.isArray(parsed.steps)
              ? parsed.steps
                  .slice(0, 12)
                  .filter((st: unknown) => st && typeof st === 'object')
                  .map((st: Record<string, unknown>, idx: number) => ({
                    stepNumber:
                      typeof st.stepNumber === 'number' && Number.isFinite(st.stepNumber)
                        ? st.stepNumber
                        : idx + 1,
                    title: String(st.title ?? `Step ${idx + 1}`).slice(0, 180),
                    whyThisStep: String(st.whyThisStep ?? '').slice(0, 600),
                    work: String(st.work ?? '').slice(0, 1500),
                  }))
              : undefined,
            finalAnswer: parsed.finalAnswer
              ? String(parsed.finalAnswer).slice(0, 600)
              : undefined,
            examTip: parsed.examTip ? String(parsed.examTip).slice(0, 500) : undefined,
            simplificationLevel:
              typeof parsed.simplificationLevel === 'number' &&
              Number.isFinite(parsed.simplificationLevel)
                ? Math.max(1, Math.min(5, Math.round(parsed.simplificationLevel)))
                : 1,
            feedbackQuestion: String(
              parsed.feedbackQuestion ??
                'Did you understand this section clearly? Ready to move on?'
            ).slice(0, 300),
          };
        }
      }
    } catch {
      // Ignore malformed JSON fence safely
    }
    cleanText = cleanText.replace(solveMatch[0], '');
  }

  const ytMatch = cleanText.match(/```json:youtube\s*([\s\S]*?)```/i);
  if (ytMatch && ytMatch[1]) {
    try {
      const parsed = JSON.parse(ytMatch[1].trim());
      if (Array.isArray(parsed)) {
        youtubeVideos = parsed
          .filter(
            (v) =>
              v &&
              typeof v.title === 'string' &&
              typeof v.url === 'string' &&
              /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(v.url)
          )
          .slice(0, 4)
          .map((v) => ({
            title: String(v.title).slice(0, 200),
            channel: String(v.channel ?? 'YouTube Educator').slice(0, 120),
            url: normalizeYouTubeUrl(String(v.url)) || String(v.url).slice(0, 500),
            reason: v.reason ? String(v.reason).slice(0, 280) : undefined,
          }))
          .slice(0, 2);
      }
    } catch {
      // Ignore malformed JSON fence safely
    }
    cleanText = cleanText.replace(ytMatch[0], '');
  }

  return {
    cleanText: cleanText.trim(),
    pyqItems,
    youtubeVideos,
    problemSolve,
  };
}

export interface SessionGroup {
  label: string;
  sessions: StudySession[];
}

export function groupSessionsByDate(
  sessions: StudySession[],
  nowMs: number = Date.now()
): SessionGroup[] {
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const yesterdayMs = todayMs - 24 * 60 * 60 * 1000;

  const today: StudySession[] = [];
  const yesterday: StudySession[] = [];
  const earlier: StudySession[] = [];

  for (const s of sorted) {
    if (s.updatedAt >= todayMs) {
      today.push(s);
    } else if (s.updatedAt >= yesterdayMs) {
      yesterday.push(s);
    } else {
      earlier.push(s);
    }
  }

  const groups: SessionGroup[] = [];
  if (today.length > 0) groups.push({ label: 'Today', sessions: today });
  if (yesterday.length > 0) groups.push({ label: 'Yesterday', sessions: yesterday });
  if (earlier.length > 0) groups.push({ label: 'Earlier', sessions: earlier });
  return groups;
}

export function formatLiveTranscriptSummary(
  turns: LiveTranscriptTurn[],
  lang: LanguageCode
): string {
  const cleanTurns = turns.filter((t) => t.text.trim().length > 0);
  if (cleanTurns.length === 0) return '';
  const heading =
    lang === 'bn'
      ? '### লাইভ ভয়েস প্রস্তুতির কথোপকথন (Live Voice Viva Transcript)'
      : '### Live Voice Viva & Concept Session Transcript';

  const lines = cleanTurns.map((t) => {
    const label =
      lang === 'bn'
        ? t.speaker === 'student'
          ? '**শিক্ষার্থী:**'
          : '**মিত্র টিউটর:**'
        : t.speaker === 'student'
          ? '**Student:**'
          : '**Mitra Tutor:**';
    return `${label} ${t.text.trim()}`;
  });

  return `${heading}\n\n${lines.join('\n\n')}`;
}

export function isValidFirestoreId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

export function clampString(val: string | undefined, maxLength: number): string {
  if (!val) return '';
  return val.length > maxLength ? val.slice(0, maxLength) : val;
}

export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

/**
 * Strips internal JSON blocks (e.g. ```json:problem_solve, ```json:pyq, ```json:youtube)
 * whether fully completed or partially streamed, so chat bubbles only display clean prose.
 */
export function stripInternalFences(text: string): string {
  if (!text) return '';
  return text
    .replace(/```json:(?:problem_solve|pyq|youtube)[\s\S]*?(?:```|$)/gi, '')
    .trim();
}

export function sanitizeMessageForStorage(msg: ChatMessage): ChatMessage {
  const sanitized: ChatMessage = {
    ...msg,
    text: clampString(msg.text, 40000),
    subject: clampString(msg.subject, 60),
    attachmentName: msg.attachmentName
      ? clampString(msg.attachmentName, 180)
      : undefined,
    attachmentMimeType: msg.attachmentMimeType
      ? clampString(msg.attachmentMimeType, 80)
      : undefined,
    problemSolve: msg.problemSolve
      ? {
          topicTitle: clampString(msg.problemSolve.topicTitle, 180),
          subjectGuard: msg.problemSolve.subjectGuard,
          subjectMismatch: msg.problemSolve.subjectMismatch,
          mismatchReason: msg.problemSolve.mismatchReason
            ? clampString(msg.problemSolve.mismatchReason, 800)
            : undefined,
          detectedSubject: msg.problemSolve.detectedSubject
            ? clampString(msg.problemSolve.detectedSubject, 80)
            : undefined,
          sectionNumber: msg.problemSolve.sectionNumber,
          estimatedTotalSections: msg.problemSolve.estimatedTotalSections,
          isFinalSection: msg.problemSolve.isFinalSection,
          sectionTitle: msg.problemSolve.sectionTitle
            ? clampString(msg.problemSolve.sectionTitle, 180)
            : undefined,
          teacherSpeech: msg.problemSolve.teacherSpeech
            ? clampString(msg.problemSolve.teacherSpeech, 3500)
            : undefined,
          blackboardLines: msg.problemSolve.blackboardLines
            ? msg.problemSolve.blackboardLines.slice(0, 14).map((l) => ({
                kind: l.kind,
                content: clampString(l.content, 800),
              }))
            : undefined,
          boardHistory: msg.problemSolve.boardHistory
            ? msg.problemSolve.boardHistory.slice(0, 8).map((sec) => ({
                sectionNumber: sec.sectionNumber,
                sectionTitle: clampString(sec.sectionTitle, 180),
                blackboardLines: sec.blackboardLines.slice(0, 14).map((l) => ({
                  kind: l.kind,
                  content: clampString(l.content, 800),
                })),
              }))
            : undefined,
          simpleConcept: msg.problemSolve.simpleConcept
            ? clampString(msg.problemSolve.simpleConcept, 3500)
            : undefined,
          formulaOrRule: msg.problemSolve.formulaOrRule
            ? clampString(msg.problemSolve.formulaOrRule, 600)
            : undefined,
          givenData: msg.problemSolve.givenData
            ? msg.problemSolve.givenData.slice(0, 10).map((g) => clampString(g, 300))
            : undefined,
          steps: msg.problemSolve.steps
            ? msg.problemSolve.steps.slice(0, 12).map((s, idx) => ({
                stepNumber: typeof s.stepNumber === 'number' ? s.stepNumber : idx + 1,
                title: clampString(s.title, 180),
                whyThisStep: clampString(s.whyThisStep, 600),
                work: clampString(s.work, 1500),
              }))
            : undefined,
          finalAnswer: msg.problemSolve.finalAnswer
            ? clampString(msg.problemSolve.finalAnswer, 600)
            : undefined,
          examTip: msg.problemSolve.examTip
            ? clampString(msg.problemSolve.examTip, 500)
            : undefined,
          simplificationLevel: Math.max(
            1,
            Math.min(5, msg.problemSolve.simplificationLevel || 1)
          ),
          feedbackQuestion: clampString(msg.problemSolve.feedbackQuestion, 300),
        }
      : undefined,
    pyqItems: msg.pyqItems
      ? msg.pyqItems.slice(0, 15).map((p) => ({
          ...p,
          question: clampString(p.question, 1200),
          marks: clampString(p.marks, 40),
          trendNote: clampString(p.trendNote, 400),
          testPaperRefs: p.testPaperRefs
            ? p.testPaperRefs.slice(0, 4).map((r) => clampString(r, 120))
            : undefined,
        }))
      : undefined,
    youtubeVideos: msg.youtubeVideos
      ? msg.youtubeVideos.slice(0, 2).map((v) => ({
          title: clampString(v.title, 200),
          channel: clampString(v.channel, 120),
          url: clampString(v.url, 500),
          reason: v.reason ? clampString(v.reason, 280) : undefined,
          thumbnailUrl: v.thumbnailUrl ? clampString(v.thumbnailUrl, 500) : undefined,
          verified: v.verified,
        }))
      : undefined,
    groundingLinks: msg.groundingLinks
      ? msg.groundingLinks.slice(0, 10).map((g: GroundingLink) => ({
          title: clampString(g.title, 200),
          url: clampString(g.url, 500),
        }))
      : undefined,
  };
  const cleaned = stripUndefinedDeep(sanitized);
  delete (cleaned as unknown as Record<string, unknown>).isStreaming;
  return cleaned;
}

export function formatTeacherSpeechForAudio(
  rawText: string,
  language: LanguageCode
): string {
  if (!rawText || !rawText.trim()) return '';
  let text = rawText
    .replace(/\$\$/g, ' ')
    .replace(/\$/g, ' ')
    .replace(/[`*_#]/g, ' ')
    .replace(/\s*->\s*|\s*=>\s*|→/g, language === 'bn' ? ' অর্থাৎ ' : ' which gives ');

  if (language === 'bn') {
    const bnReplacements: Array<[RegExp, string]> = [
      [/α/g, 'আলফা'],
      [/β/g, 'বিটা'],
      [/γ/g, 'গামা'],
      [/θ/g, 'থিটা'],
      [/π/g, 'পাই'],
      [/Δ/g, 'ডেল্টা'],
      [/Ω/g, 'ওহম'],
      [/²/g, ' স্কোয়ার'],
      [/³/g, ' কিউব'],
      [/₀/g, ' শূন্য'],
      [/₁/g, ' ওয়ান'],
      [/₂/g, ' টু'],
      [/₃/g, ' থ্রি'],
      [/√/g, 'রুট '],
      [/×/g, ' গুণ '],
      [/÷/g, ' ভাগ '],
      [/≠/g, ' অসমান '],
      [/≤/g, ' লেস দ্যান অর ইকুয়াল টু '],
      [/≥/g, ' গ্রেটার দ্যান অর ইকুয়াল টু '],
      [/\s*=\s*/g, ' সমান '],
      [/\s*\+\s*/g, ' যোগ '],
      [/(\d+)\s*\/\s*(\d+)/g, '$1 বাই $2'],
    ];
    for (const [pattern, replacement] of bnReplacements) {
      text = text.replace(pattern, replacement);
    }
  } else {
    const enReplacements: Array<[RegExp, string]> = [
      [/α/g, 'alpha'],
      [/β/g, 'beta'],
      [/γ/g, 'gamma'],
      [/θ/g, 'theta'],
      [/π/g, 'pi'],
      [/Δ/g, 'delta'],
      [/Ω/g, 'ohm'],
      [/²/g, ' squared'],
      [/³/g, ' cubed'],
      [/₀/g, ' naught'],
      [/₁/g, ' 1'],
      [/₂/g, ' 2'],
      [/₃/g, ' 3'],
      [/√/g, 'square root of '],
      [/×/g, ' times '],
      [/÷/g, ' divided by '],
      [/≠/g, ' is not equal to '],
      [/≤/g, ' is less than or equal to '],
      [/≥/g, ' is greater than or equal to '],
      [/\s*=\s*/g, ' equals '],
      [/\s*\+\s*/g, ' plus '],
    ];
    for (const [pattern, replacement] of enReplacements) {
      text = text.replace(pattern, replacement);
    }
  }

  return text.replace(/\s+/g, ' ').trim();
}

export function parseAuthError(
  error: unknown,
  projectId = 'gen-lang-client-0687209894'
): FormattedAuthError | null {
  if (!error) return null;
  const raw = error instanceof Error ? error.message : String(error);
  const isUnauthorized =
    raw.includes('auth/unauthorized-domain') ||
    raw.includes('unauthorized-domain');

  let hostname = 'localhost';
  let port = '';
  let protocol = 'http:';
  let pathname = '/';
  let search = '';

  if (typeof window !== 'undefined' && window.location) {
    hostname = window.location.hostname || 'localhost';
    port = window.location.port ? `:${window.location.port}` : '';
    protocol = window.location.protocol || 'http:';
    pathname = window.location.pathname || '/';
    search = window.location.search || '';
  }

  const is127 = hostname === '127.0.0.1';
  const localhostUrl = `${protocol}//localhost${port}${pathname}${search}`;
  const firebaseConsoleUrl = `https://console.firebase.google.com/project/${projectId}/authentication/settings`;

  if (isUnauthorized) {
    return {
      raw,
      isUnauthorizedDomain: true,
      hostname,
      canSwitchToLocalhost: is127,
      localhostUrl,
      firebaseConsoleUrl,
      titleEn: 'Domain Not Authorized in Firebase',
      titleBn: 'ফায়ারবেস অথেনটিকেশনে এই ডোমেইন অনুমোদিত নয়',
      messageEn: `The domain "${hostname}" is not on the Authorized Domains list for your Firebase project (${projectId}).`,
      messageBn: `"${hostname}" ডোমেনটি আপনার ফায়ারবেস প্রজেক্টে (${projectId}) Google সাইন-ইন এর জন্য এখনও অনুমোদিত (Authorized) করা হয়নি।`,
      stepsEn: [
        'Open Firebase Console > Authentication > Settings',
        'Under "Authorized domains", click "Add domain"',
        `Add "${hostname}" (without port or http/https) and click Save`,
      ],
      stepsBn: [
        'Firebase Console > Authentication > Settings লিঙ্কে যান',
        '"Authorized domains" অংশে গিয়ে "Add domain" বাটনে ক্লিক করুন',
        `"${hostname}" টাইপ করে Save বাটনে ক্লিক করুন`,
      ],
    };
  }

  let messageEn = raw;
  let messageBn = raw;
  if (raw.includes('auth/popup-blocked')) {
    messageEn = 'The Google sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
    messageBn = 'ব্রাউজার Google সাইন-ইন পপ-আপ ব্লক করেছে। অনুগ্রহ করে ব্রাউজারের পপ-আপ অনুমোদন করে আবার চেষ্টা করুন।';
  } else if (raw.includes('auth/network-request-failed')) {
    messageEn = 'Network request failed. Please check your internet connection.';
    messageBn = 'ইন্টারনেট সংযোগ বিচ্ছিন্ন হয়েছে। অনুগ্রহ করে কানেকশন পরীক্ষা করুন।';
  } else if (raw.includes('auth/cancelled-popup-request') || raw.includes('auth/popup-closed-by-user')) {
    messageEn = 'Sign-in popup was closed before completion.';
    messageBn = 'সাইন-ইন উইন্ডোটি বন্ধ করা হয়েছে।';
  }

  return {
    raw,
    isUnauthorizedDomain: false,
    hostname,
    canSwitchToLocalhost: false,
    localhostUrl,
    firebaseConsoleUrl,
    titleEn: 'Authentication Notice',
    titleBn: 'সাইন-ইন সংক্রান্ত বিজ্ঞপ্তি',
    messageEn,
    messageBn,
    stepsEn: [],
    stepsBn: [],
  };
}

export function isGuestUser(user: unknown): user is AppUser {
  return Boolean(
    user &&
      typeof user === 'object' &&
      'isGuest' in user &&
      (user as Record<string, unknown>).isGuest === true
  );
}

