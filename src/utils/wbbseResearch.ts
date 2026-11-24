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
  WbbseVideoEntry,
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
  'suggestion',
  'suggession',
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
  'gulor',
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
  'somoy',
  'koni',
  'bohurupi',
  'gyanchokkhu',
  'er',
  'te',
  'ye',
  'diye',
  'holo',
  'hobe',
  'ache',
  'achhe',
  'ki',
  'karon',
  'golpo',
  'kobita',
  'natok',
  'prabandha',
  'important',
  'mcq',
  'mcqs',
  'saq',
  'laq',
  'bhalo',
  'khub',
  'sob',
  'shob',
]);

export function detectLanguage(text: string, subject?: WbbseSubject): LanguageCode {
  if (!text || !text.trim()) return 'en';
  if (/[\u0980-\u09FF]/.test(text)) {
    return 'bn';
  }
  const lower = text.toLowerCase();
  if (lower.includes('in english') || lower.includes('english version')) {
    return 'en';
  }
  if (subject === 'Bengali') {
    // Bengali subject in WBBSE Class 10 is 1st Language Bengali.
    return 'bn';
  }

  const tokens = lower
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
      [
        'bojhao',
        'bojhhao',
        'bhashay',
        'vasay',
        'proshno',
        'prosno',
        'kivabe',
        'amake',
        'banglay',
        'koni',
        'er',
        'theke',
        'dao',
        'sajeshon',
      ].includes(t)
    )
  ) {
    return 'bn';
  }
  return 'en';
}

export function deduplicateConsecutiveWords(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let words = text.trim().split(/\s+/);
  if (words.length <= 1) return text.trim();

  // Helper to compare words case-insensitively
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  // Run multiple passes for n-gram deduplication (from n=10 down to 1)
  let changed = true;
  let pass = 0;
  while (changed && pass < 5) {
    changed = false;
    pass++;
    const maxN = Math.min(10, Math.floor(words.length / 2));
    for (let n = maxN; n >= 1; n--) {
      const nextWords: string[] = [];
      let i = 0;
      while (i < words.length) {
        if (i + 2 * n <= words.length) {
          let match = true;
          for (let j = 0; j < n; j++) {
            if (!eq(words[i + j], words[i + n + j])) {
              match = false;
              break;
            }
          }
          if (match) {
            changed = true;
            // Keep first block of length n
            for (let j = 0; j < n; j++) nextWords.push(words[i + j]);
            i += 2 * n;
            // Skip any further consecutive identical blocks
            while (i + n <= words.length) {
              let furtherMatch = true;
              for (let j = 0; j < n; j++) {
                if (!eq(words[i + j], nextWords[nextWords.length - n + j])) {
                  furtherMatch = false;
                  break;
                }
              }
              if (furtherMatch) {
                i += n;
              } else {
                break;
              }
            }
            continue;
          }
        }
        nextWords.push(words[i]);
        i++;
      }
      words = nextWords;
    }
  }

  return words.join(' ');
}

export function cleanVoiceRecognitionText(raw: string, lang: LanguageCode): string {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.trim();

  if (lang === 'bn') {
    const bnReplacements: [RegExp, string][] = [
      [/(?<![\p{L}\p{N}])মাদ্যমিক(?![\p{L}\p{N}])/gui, 'মাধ্যমিক'],
      [/(?<![\p{L}\p{N}])উপপাদ(?![\p{L}\p{N}])/gui, 'উপপাদ্য'],
      [/(?<![\p{L}\p{N}])দ্বিঘাত সমিকরন(?![\p{L}\p{N}])/gui, 'দ্বিঘাত সমীকরণ'],
      [/(?<![\p{L}\p{N}])আলোক প্রতিসরণ(?![\p{L}\p{N}])/gui, 'আলোর প্রতিসরণ'],
      [/(?<![\p{L}\p{N}])চলতড়িত(?![\p{L}\p{N}])/gui, 'চলতড়িৎ'],
      [/(?<![\p{L}\p{N}])বহিরূপী(?![\p{L}\p{N}])/gui, 'বহুরূপী'],
      [/(?<![\p{L}\p{N}])সাওতাল(?![\p{L}\p{N}])/gui, 'সাঁওতাল'],
      [/(?<![\p{L}\p{N}])জ্ঞান চক্ষু(?![\p{L}\p{N}])/gui, 'জ্ঞানচক্ষু'],
      [/(?<![\p{L}\p{N}])ত্রিকোনমিতি(?![\p{L}\p{N}])/gui, 'ত্রিকোণমিতি'],
      [/(?<![\p{L}\p{N}])রাশি বিজ্ঞান(?![\p{L}\p{N}])/gui, 'রাশিবিজ্ঞান'],
      [/(?<![\p{L}\p{N}])পরি মিতি(?![\p{L}\p{N}])/gui, 'পরিমিতি'],
      [/(?<![\p{L}\p{N}])বয়েলের সূত্র(?![\p{L}\p{N}])/gui, 'বয়েলের সূত্র'],
      [/(?<![\p{L}\p{N}])চার্লসের সূত্র(?![\p{L}\p{N}])/gui, 'চার্লসের সূত্র'],
      [/(?<![\p{L}\p{N}])ওহমের সূত্র(?![\p{L}\p{N}])/gui, 'ওহমের সূত্র'],
      [/(?<![\p{L}\p{N}])টেস্ট পেপার(?![\p{L}\p{N}])/gui, 'টেস্ট পেপার'],
      [/(?<![\p{L}\p{N}])পি ওয়াই কিউ(?![\p{L}\p{N}])/gui, 'PYQ'],
      [/(?<![\p{L}\p{N}])এ বি টি এ(?![\p{L}\p{N}])/gui, 'ABTA'],
      [/(?<![\p{L}\p{N}])ডাব্লিউ বি টি এ(?![\p{L}\p{N}])/gui, 'WBTA'],
      [/(?<![\p{L}\p{N}])ডব্লিউ বি বি এস ই(?![\p{L}\p{N}])/gui, 'WBBSE'],
      [/(?<![\p{L}\p{N}])ইম্পরট্যান্ট(?![\p{L}\p{N}])/gui, 'গুরুত্বপূর্ণ'],
      [/(?<![\p{L}\p{N}])ইম্পর্টেন্ট(?![\p{L}\p{N}])/gui, 'গুরুত্বপূর্ণ'],
      [/(?<![\p{L}\p{N}])কোশ্চেনস?(?![\p{L}\p{N}])/gui, 'প্রশ্ন'],
      [/(?<![\p{L}\p{N}])কোয়েশ্চেনস?(?![\p{L}\p{N}])/gui, 'প্রশ্ন'],
      [/(?<![\p{L}\p{N}])সাজেসন(?![\p{L}\p{N}])/gui, 'সাজেশন'],
      [/(?<![\p{L}\p{N}])bangla\s+important\s+questions?(?![\p{L}\p{N}])/gui, 'বাংলা গুরুত্বপূর্ণ প্রশ্ন'],
      [/(?<![\p{L}\p{N}])important\s+questions?(?![\p{L}\p{N}])/gui, 'গুরুত্বপূর্ণ প্রশ্ন'],
      [/(?<![\p{L}\p{N}])bangla(?![\p{L}\p{N}])/gui, 'বাংলা'],
      [/(?<![\p{L}\p{N}])koni(?![\p{L}\p{N}])/gui, 'কোনি'],
      [/(?<![\p{L}\p{N}])gonit(?![\p{L}\p{N}])/gui, 'গণিত'],
      [/(?<![\p{L}\p{N}])bhouto\s*biggan(?![\p{L}\p{N}])/gui, 'ভৌতবিজ্ঞান'],
      [/(?<![\p{L}\p{N}])jibon\s*biggan(?![\p{L}\p{N}])/gui, 'জীবনবিজ্ঞান'],
      [/(?<![\p{L}\p{N}])itihas(?![\p{L}\p{N}])/gui, 'ইতিহাস'],
      [/(?<![\p{L}\p{N}])bhugol(?![\p{L}\p{N}])/gui, 'ভূগোল'],
    ];
    for (const [re, rep] of bnReplacements) {
      text = text.replace(re, rep);
    }
  } else {
    const enReplacements: [RegExp, string][] = [
      [/\bmadhyamic\b/gi, 'Madhyamik'],
      [/\bmadhamik\b/gi, 'Madhyamik'],
      [/\bwbbse\b/gi, 'WBBSE'],
      [/\bpyq\b/gi, 'PYQ'],
      [/\bpyqs\b/gi, 'PYQs'],
      [/\babta\b/gi, 'ABTA'],
      [/\bwbta\b/gi, 'WBTA'],
      [/\bohms? law\b/gi, "Ohm's law"],
      [/\bboyles? law\b/gi, "Boyle's law"],
      [/\bcharles? law\b/gi, "Charles's law"],
      [/\bsnells? law\b/gi, "Snell's law"],
    ];
    for (const [re, rep] of enReplacements) {
      text = text.replace(re, rep);
    }
  }

  const collapsed = text.replace(/\s+/g, ' ');
  return deduplicateConsecutiveWords(collapsed);
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
      ...(entry.testPaperRefs || []),
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
      if (
        (token === 'abta' || token === 'wbta' || token === 'testpaper') &&
        entry.testPaperRefs &&
        entry.testPaperRefs.length > 0
      ) {
        score += 3;
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

export function searchVideoBank(
  entries: WbbseVideoEntry[],
  query: string,
  subject: WbbseSubject = 'All Subjects',
  language: LanguageCode = 'bn',
  limit = 2
): YouTubeRecommendation[] {
  if (!entries || entries.length === 0) return [];

  const pool =
    subject === 'All Subjects'
      ? entries
      : entries.filter((e) => e.subject === subject);

  const finalPool = pool.length > 0 ? pool : entries;
  const normalizedQuery = query.toLowerCase().trim();
  const queryTokens = normalizedQuery
    .split(/[\s,?.!।;:()\-]+/)
    .filter((t) => t.length >= 2);

  const scored = finalPool.map((entry) => {
    let score = 0;
    const haystack = [
      entry.subject,
      entry.chapter,
      entry.chapterBn,
      entry.title,
      ...entry.keywords,
    ]
      .join(' ')
      .toLowerCase();

    for (const token of queryTokens) {
      if (haystack.includes(token)) {
        score += 3;
      }
      if (entry.keywords.some((kw) => kw.toLowerCase() === token)) {
        score += 5;
      }
    }

    if (entry.subject === subject) {
      score += 2;
    }

    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const selected = (scored[0]?.score > 0 ? scored.filter((s) => s.score > 0) : scored)
    .slice(0, limit)
    .map((s) => s.entry);

  return selected.map((e) => ({
    title: e.title,
    channel: e.channel,
    url: e.url,
    reason: language === 'bn' ? e.reasonBn : e.reasonEn,
    thumbnailUrl:
      e.thumbnailUrl ||
      `https://i.ytimg.com/vi/${extractYouTubeVideoId(e.url)}/hqdefault.jpg`,
    verified: true,
  }));
}

export function shouldRecommendVideos(query: string): boolean {
  if (!query || typeof query !== 'string') return false;
  const q = query.toLowerCase();

  // Explicit requests for video/tutorial/lecture
  const explicitKeywords = [
    'video',
    'vedio',
    'videos',
    'youtube',
    'lecture',
    'tutorial',
    'animation',
    'ভিডিও',
    'ভিডিয়ো',
    'লেকচার',
    'টিউটোরিয়াল',
    'টিউটোরিয়াল',
  ];
  if (explicitKeywords.some((k) => q.includes(k))) return true;

  // Requests indicating difficulty in understanding, confusion, or asking for simple explanation
  const difficultyKeywords = [
    'understand',
    'understanding',
    "don't get",
    'cant understand',
    "can't understand",
    'unable to understand',
    'confused',
    'confusion',
    'struggling',
    'difficult to grasp',
    'hard to understand',
    'explain simply',
    'explain easily',
    'visualize',
    'visualise',
    'কীভাবে কাজ করে',
    'সহজ ভাষায় বোঝাও',
    'সহজ ভাষায় বোঝাও',
    'সহজ করে বোঝাও',
    'সহজ করে বুঝিয়ে দাও',
    'সহজ ভাষায়',
    'সহজ ভাষায়',
    'বুঝতে পারছি না',
    'বুঝতে পারলাম না',
    'বুঝিয়ে দাও',
    'বুঝিয়ে দাও',
    'অসুবিধা হচ্ছে',
    'bujhte parchi na',
    'sohoj bhashay',
  ];
  return difficultyKeywords.some((k) => q.includes(k));
}

const VALID_IMPORTANCE = new Set<ImportanceLevel>([
  'High Probability',
  'Repeated Trend',
  'Concept Builder',
]);

const BENGALI_ONLY_KEYWORDS = [
  'koni',
  'কোনি',
  'gyanchokkhu',
  'জ্ঞানচক্ষু',
  'বহুরূপী',
  'bohurupi',
  'পথের দাবী',
  'অদল বদল',
  'নদীর বিদ্রোহ',
  'সিরাজউদ্দৌলা',
  'আফ্রিকা',
  'অসুখী একজন',
  'প্রলয়োল্লাস',
  'অভিষেক',
  'মতি নন্দী',
  'moti nandi',
  'ক্ষিতীশ',
  'kshitis',
];

const ENGLISH_ONLY_KEYWORDS = [
  "father's help",
  'passing away of bapu',
  'bapu',
  'fable',
  'sea fever',
  'the cat',
  'runaway kite',
  'the snail',
  'r.k. narayan',
];

export function parseAssistantResponseBlocks(
  rawText: string,
  currentSubject?: WbbseSubject,
  allowVideos = true
): {
  cleanText: string;
  pyqItems: SuggestedPyqItem[];
  youtubeVideos: YouTubeRecommendation[];
  problemSolve?: ProblemSolveData;
} {
  let cleanText = rawText;
  let pyqItems: SuggestedPyqItem[] = [];
  let youtubeVideos: YouTubeRecommendation[] = [];
  let problemSolve: ProblemSolveData | undefined;

  const pyqMatch =
    cleanText.match(/```json:pyq\s*([\s\S]*?)```/i) ||
    cleanText.match(/```json\s*(\[\s*\{[\s\S]*?"question"[\s\S]*?\}\s*\])\s*```/i);
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

        // Strict cross-subject card sanitation
        if (currentSubject === 'English') {
          pyqItems = pyqItems.filter((item) => {
            const combined = `${item.chapter || ''} ${item.question || ''}`.toLowerCase();
            return !BENGALI_ONLY_KEYWORDS.some((kw) => combined.includes(kw));
          });
        } else if (currentSubject === 'Bengali') {
          pyqItems = pyqItems.filter((item) => {
            const combined = `${item.chapter || ''} ${item.question || ''}`.toLowerCase();
            return !ENGLISH_ONLY_KEYWORDS.some((kw) => combined.includes(kw));
          });
        }
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
    cleanText.match(/```json:problem_solve\s*([\s\S]*?)(?:```|$)/i) ||
    cleanText.match(
      /```json\s*(\{[\s\S]*?(?:"blackboardLines"|"teacherSpeech"|"subjectMismatch")[\s\S]*?\})\s*(?:```|$)/i
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

  const ytMatch =
    cleanText.match(/```json:youtube\s*([\s\S]*?)```/i) ||
    cleanText.match(/```json\s*(\[\s*\{[\s\S]*?"(?:url|channel|videoId)"[\s\S]*?\}\s*\])\s*```/i);
  if (ytMatch && ytMatch[1]) {
    try {
      const parsed = JSON.parse(ytMatch[1].trim());
      if (Array.isArray(parsed) && allowVideos) {
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

  if (!allowVideos) {
    youtubeVideos = [];
  }

  let finalCleanText = cleanText.trim();

  // Strict cross-subject prose sanitization to eliminate hallucinations
  if (currentSubject === 'English') {
    finalCleanText = finalCleanText
      .replace(/(?:^|\n)[^\n]*(?:rapid reader|koni\b|moti nandi|gyanchokkhu|bohurupee)[^\n]*(?:\n|$)/gi, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } else if (currentSubject === 'Bengali') {
    finalCleanText = finalCleanText
      .replace(/(?:^|\n)[^\n]*(?:father['’]s help|r\.?\s*k\.?\s*narayan|passing away of bapu|our runaway kite)[^\n]*(?:\n|$)/gi, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  if (youtubeVideos.length === 0) {
    finalCleanText = finalCleanText
      .replace(
        /(?:^|\n)#{1,4}\s*(?:ইউটিউব|ইউটিউব ভিডিও|ভিডিও লেকচার|YouTube|Recommended Videos?|Recommended Video Lectures?)[^\n]*\n*(?:সহজভাবে বোঝার জন্য নিচের ভিডিওগুলো দেখতে পারো[^\n]*\n*|নিচের ভিডিও[^\n]*\n*|You can watch the videos below[^\n]*\n*|Watch the recommended lecture[^\n]*\n*)?/gi,
        '\n'
      )
      .trim();
  }
  if (!finalCleanText) {
    if (problemSolve) {
      finalCleanText =
        problemSolve.teacherSpeech ||
        problemSolve.sectionTitle ||
        'নিচে ব্ল্যাকবোর্ডে প্রতিটি ধাপ লক্ষ্য করো:';
    } else if (pyqItems.length > 0) {
      finalCleanText =
        'বিগত বছরের মাধ্যমিক ও টেস্ট পেপার (ABTA/WBTA) বিশ্লেষণের গুরুত্বপূর্ণ প্রশ্নাবলি নিচে দেওয়া হলো:';
    }
  }

  return {
    cleanText: finalCleanText,
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
  let text = rawText;

  // 1. Clean markdown links [label](url) -> label
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 2. Math & Physics combined formulas and superscripts/subscripts BEFORE markdown stripping
  if (language === 'bn') {
    text = text
      .replace(/P_?1\s*V_?1\s*=\s*P_?2\s*V_?2/gi, 'পি ওয়ান ভি ওয়ান সমান পি টু ভি টু')
      .replace(/P_?1\s*\/\s*T_?1\s*=\s*P_?2\s*\/\s*T_?2/gi, 'পি ওয়ান বাই টি ওয়ান সমান পি টু বাই টি টু')
      .replace(/V_?1\s*\/\s*T_?1\s*=\s*V_?2\s*\/\s*T_?2/gi, 'ভি ওয়ান বাই টি ওয়ান সমান ভি টু বাই টি টু')
      .replace(/P\s*\*\s*V\s*=\s*k|P\s*V\s*=\s*k|P\s*V\s*=\s*ধ্রুবক/gi, 'পি গুণ ভি সমান ধ্রুবক')
      .replace(/V\s*\/\s*T\s*=\s*k/gi, 'ভি বাই টি সমান ধ্রুবক')
      .replace(/PV\s*=\s*nRT/gi, 'পি ভি সমান এন আর টি')
      .replace(/V\s*=\s*IR/gi, 'ভি সমান আই আর')
      .replace(/I\s*=\s*V\s*\/\s*R/gi, 'আই সমান ভি বাই আর')
      .replace(/b\^?2\s*-\s*4ac|b²\s*-\s*4ac/gi, 'বি স্কোয়ার মাইনাস চার এ সি')
      .replace(/ax\^?2\s*\+\s*bx\s*\+\s*c\s*=\s*0/gi, 'এ এক্স স্কোয়ার যোগ বি এক্স যোগ সি সমান শূন্য')
      .replace(/\^2|²/g, ' স্কোয়ার')
      .replace(/\^3|³/g, ' কিউব')
      .replace(/_1|₁/g, ' ওয়ান')
      .replace(/_2|₂/g, ' টু')
      .replace(/_0|₀/g, ' শূন্য');
  } else {
    text = text
      .replace(/P_?1\s*V_?1\s*=\s*P_?2\s*V_?2/gi, 'P 1 V 1 equals P 2 V 2')
      .replace(/PV\s*=\s*nRT/gi, 'P V equals n R T')
      .replace(/V\s*=\s*IR/gi, 'V equals I R')
      .replace(/\^2|²/g, ' squared')
      .replace(/\^3|³/g, ' cubed')
      .replace(/_1|₁/g, ' 1')
      .replace(/_2|₂/g, ' 2')
      .replace(/_0|₀/g, ' 0');
  }

  // 3. Normalize LaTeX macros before stripping delimiters
  if (language === 'bn') {
    text = text
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 বাই $2')
      .replace(/\\sqrt\{([^}]+)\}/g, 'রুট $1')
      .replace(/\\(?:times|cdot|ast)/g, ' গুণ ')
      .replace(/\\pm/g, ' প্লাস মাইনাস ')
      .replace(/\\approx/g, ' প্রায় সমান ')
      .replace(/\\(?:ne|neq)/g, ' অসমান ')
      .replace(/\\(?:le|leq)/g, ' লেস দ্যান অর ইকুয়াল টু ')
      .replace(/\\(?:ge|geq)/g, ' গ্রেটার দ্যান অর ইকুয়াল টু ')
      .replace(/\\(?:circ|degree)/g, ' ডিগ্রি')
      .replace(/\\alpha/g, 'আলফা')
      .replace(/\\beta/g, 'বিটা')
      .replace(/\\gamma/g, 'গামা')
      .replace(/\\(?:delta|Delta)/g, 'ডেল্টা')
      .replace(/\\theta/g, 'থিটা')
      .replace(/\\lambda/g, 'ল্যাম্বডা')
      .replace(/\\mu/g, 'মিউ')
      .replace(/\\pi/g, 'পাই')
      .replace(/\\rho/g, 'রো')
      .replace(/\\(?:omega|Omega)/g, 'ওহম');
  } else {
    text = text
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2')
      .replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1')
      .replace(/\\(?:times|cdot|ast)/g, ' times ')
      .replace(/\\pm/g, ' plus or minus ')
      .replace(/\\approx/g, ' approximately equals ')
      .replace(/\\(?:ne|neq)/g, ' is not equal to ')
      .replace(/\\(?:le|leq)/g, ' is less than or equal to ')
      .replace(/\\(?:ge|geq)/g, ' is greater than or equal to ')
      .replace(/\\(?:circ|degree)/g, ' degrees')
      .replace(/\\alpha/g, 'alpha')
      .replace(/\\beta/g, 'beta')
      .replace(/\\gamma/g, 'gamma')
      .replace(/\\(?:delta|Delta)/g, 'delta')
      .replace(/\\theta/g, 'theta')
      .replace(/\\lambda/g, 'lambda')
      .replace(/\\mu/g, 'mu')
      .replace(/\\pi/g, 'pi')
      .replace(/\\rho/g, 'rho')
      .replace(/\\(?:omega|Omega)/g, 'ohm');
  }

  // Strip remaining LaTeX backslash commands
  text = text.replace(/\\[a-zA-Z]+/g, ' ');

  // 4. Strip markdown syntax
  text = text
    .replace(/\$\$/g, ' ')
    .replace(/\$/g, ' ')
    .replace(/[`*_#~]/g, ' ')
    .replace(/^[\s*\-•>]+\s*/gm, '')
    .replace(/\s*->\s*|\s*=>\s*|→/g, language === 'bn' ? ' অর্থাৎ ' : ' which gives ')
    .replace(/[:;—–]/g, ', ');

  if (language === 'bn') {
    const bnReplacements: Array<[RegExp, string]> = [
      [/WBBSE/gi, 'মধ্যশিক্ষা পর্ষদ'],
      [/ABTA/gi, 'এবিটিএ'],
      [/WBTA/gi, 'ডব্লিউবিটিএ'],
      [/MCQ/gi, 'এমসিকিউ'],
      [/VSA/gi, 'অতি সংক্ষিপ্ত প্রশ্ন'],
      [/SA/gi, 'সংক্ষিপ্ত প্রশ্ন'],
      [/LA/gi, 'বড় প্রশ্ন'],
      [/PYQ/gi, 'বিগত বছরের প্রশ্ন'],
      [/(\d+)\s*Marks?/gi, '$1 নম্বর'],
      [/Class\s*10|Class\s*X/gi, 'দশম শ্রেণি'],
      // Common exam structural terms
      [/\bStep\s*(\d+)/gi, '$1 নম্বর ধাপ'],
      [/\bSection\s*(\d+)/gi, '$1 নম্বর অংশ'],
      [/\bQuestion\s*(\d+)/gi, '$1 নম্বর প্রশ্ন'],
      [/\bCase\s*([A-Za-z0-9]+)/gi, 'ক্ষেত্র $1'],
      // Physics & Math combined formulas
      [/P_?1\s*V_?1\s*=\s*P_?2\s*V_?2/gi, 'পি ওয়ান ভি ওয়ান সমান পি টু ভি টু'],
      [/P\s*\*\s*V\s*=\s*k|P\s*V\s*=\s*k|P\s*V\s*=\s*ধ্রুবক/gi, 'পি গুণ ভি সমান ধ্রুবক'],
      [/V_?1\s*\/\s*T_?1\s*=\s*V_?2\s*\/\s*T_?2/gi, 'ভি ওয়ান বাই টি ওয়ান সমান ভি টু বাই টি টু'],
      [/V\s*\/\s*T\s*=\s*k/gi, 'ভি বাই টি সমান ধ্রুবক'],
      [/PV\s*=\s*nRT/gi, 'পি ভি সমান এন আর টি'],
      [/V\s*=\s*IR/gi, 'ভি সমান আই আর'],
      [/I\s*=\s*V\s*\/\s*R/gi, 'আই সমান ভি বাই আর'],
      [/ax\^?2\s*\+\s*bx\s*\+\s*c\s*=\s*0/gi, 'এ এক্স স্কোয়ার যোগ বি এক্স যোগ সি সমান শূন্য'],
      // Subscripts and variables
      [/\bP_?1\b|P₁/g, 'পি ওয়ান'],
      [/\bP_?2\b|P₂/g, 'পি টু'],
      [/\bV_?1\b|V₁/g, 'ভি ওয়ান'],
      [/\bV_?2\b|V₂/g, 'ভি টু'],
      [/\bT_?1\b|T₁/g, 'টি ওয়ান'],
      [/\bT_?2\b|T₂/g, 'টি টু'],
      [/\bI_?1\b|I₁/g, 'আই ওয়ান'],
      [/\bI_?2\b|I₂/g, 'আই টু'],
      [/\bR_?1\b|R₁/g, 'আর ওয়ান'],
      [/\bR_?2\b|R₂/g, 'আর টু'],
      // Common Chemistry & Physics terms
      [/\bCO2\b|CO₂/g, 'কার্বন ডাই অক্সাইড'],
      [/\bH2O\b|H₂O/g, 'জল'],
      [/\bO2\b|O₂/g, 'অক্সিজেন'],
      [/\bN2\b|N₂/g, 'নাইট্রোজেন'],
      [/\bH2\b|H₂/g, 'হাইড্রোজেন'],
      [/\bSO2\b|SO₂/g, 'সালফার ডাই অক্সাইড'],
      [/\bNaCl\b/g, 'সোডিয়াম ক্লোরাইড'],
      [/\bHCl\b/g, 'হাইড্রোক্লোরিক অ্যাসিড'],
      [/\bCaCO3\b|CaCO₃/g, 'ক্যালসিয়াম কার্বনেট'],
      [/\bNH3\b|NH₃/g, 'অ্যামোনিয়া'],
      // Trigonometric functions
      [/\bsin\b/gi, 'সাইন'],
      [/\bcos\b/gi, 'কস'],
      [/\btan\b/gi, 'ট্যান'],
      [/\bcot\b/gi, 'কট'],
      [/\bsec\b/gi, 'সেক'],
      [/\bcosec\b/gi, 'কোসেক'],
      // Units
      [/\bcm\b/gi, 'সেন্টিমিটার'],
      [/\bmm\b/gi, 'মিলিমিটার'],
      [/\bkm\b/gi, 'কিলোমিটার'],
      [/\bkg\b/gi, 'কিলোগ্রাম'],
      [/\bsec\b/gi, 'সেকেন্ড'],
      [/\bmin\b/gi, 'মিনিট'],
      [/\batm\b/gi, 'বায়ুমণ্ডলীয় চাপ'],
      // Single-letter isolated math/science variables
      [/\bP\b/g, 'পি'],
      [/\bV\b/g, 'ভি'],
      [/\bT\b/g, 'টি'],
      [/\bk\b/g, 'কে'],
      [/\bR\b/g, 'আর'],
      [/\bI\b/g, 'আই'],
      [/\bx\b/g, 'এক্স'],
      [/\by\b/g, 'ওয়াই'],
      [/\bz\b/g, 'জেড'],
      [/\ba\b/g, 'এ'],
      [/\bb\b/g, 'বি'],
      [/\bc\b/g, 'সি'],
      [/\bm\b/g, 'এম'],
      [/\bn\b/g, 'এন'],
      [/\bd\b/g, 'ডি'],
      [/\bh\b/g, 'এইচ'],
      [/\br\b/g, 'আর'],
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

    // Convert ASCII digits to Bengali digits for authentic Bengali TTS pronunciation
    const bnDigits: Record<string, string> = {
      '0': '০',
      '1': '১',
      '2': '২',
      '3': '৩',
      '4': '৪',
      '5': '৫',
      '6': '৬',
      '7': '৭',
      '8': '৮',
      '9': '৯',
    };
    text = text.replace(/[0-9]/g, (d) => bnDigits[d] || d);
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
      [/(\d+)\s*\/\s*(\d+)/g, '$1 over $2'],
    ];
    for (const [pattern, replacement] of enReplacements) {
      text = text.replace(pattern, replacement);
    }
  }

  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Splits raw or normalized teacher speech into bite-sized, grammatically
 * complete sentences suitable for zero-distortion audio playback.
 */
export function splitSpeechIntoSentences(
  rawText: string,
  language: LanguageCode,
  maxChunkLength = 160
): string[] {
  const normalized = formatTeacherSpeechForAudio(rawText, language);
  if (!normalized) return [];

  // Split on Bengali dari (।), question mark (?), exclamation (!), or newlines.
  // For period (.), only split when NOT between numbers to preserve decimals.
  const rawSentences = normalized
    .split(/(?<=[।?!]|\.(?!\d)|\n+)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const sentence of rawSentences) {
    if (sentence.length <= maxChunkLength) {
      chunks.push(sentence);
      continue;
    }

    // Split long sentence at natural punctuation pauses (comma, semicolon)
    const subParts = sentence
      .split(/(?<=[,;])\s+/)
      .map((p) => p.trim())
      .filter(Boolean);

    let current = '';
    for (const part of subParts) {
      if (!current) {
        current = part;
      } else if ((current + ' ' + part).length <= maxChunkLength) {
        current = current + ' ' + part;
      } else {
        chunks.push(current);
        current = part;
      }
    }

    if (current) {
      if (current.length > maxChunkLength) {
        // If an individual clause still exceeds maxChunkLength, break cleanly along words
        const words = current.split(/\s+/).filter(Boolean);
        let wordChunk = '';
        for (const w of words) {
          if (!wordChunk) {
            wordChunk = w;
          } else if ((wordChunk + ' ' + w).length <= maxChunkLength) {
            wordChunk = wordChunk + ' ' + w;
          } else {
            chunks.push(wordChunk);
            wordChunk = w;
          }
        }
        if (wordChunk) chunks.push(wordChunk);
      } else {
        chunks.push(current);
      }
    }
  }

  return chunks.filter((c) => c.length > 0);
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

