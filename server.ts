import 'dotenv/config';
import dns from 'dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore in environments where not supported
}
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  type GenerateContentResponse,
  type LiveServerMessage,
} from '@google/genai';
import { WebSocketServer, type WebSocket } from 'ws';
import type {
  BlackboardSectionSnapshot,
  GroundingLink,
  LanguageCode,
  PyqBankEntry,
  WbbseSubject,
  YouTubeRecommendation,
} from './src/types.ts';
import {
  detectLanguage,
  detectQueryIntent,
  extractYouTubeVideoId,
  formatTeacherSpeechForAudio,
  isProblemSolveSubject,
  isSupportedDocumentType,
  normalizeYouTubeUrl,
  parseAssistantResponseBlocks,
  searchPyqBank,
} from './src/utils/wbbseResearch.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

// Load structured WBBSE PYQ knowledge base
const pyqBankCandidates = [
  path.resolve(__dirname, 'src/data/wbbse_pyq_bank.json'),
  path.resolve(process.cwd(), 'src/data/wbbse_pyq_bank.json'),
  path.resolve(__dirname, '../src/data/wbbse_pyq_bank.json'),
];

let pyqBank: PyqBankEntry[] = [];
for (const candidatePath of pyqBankCandidates) {
  if (fs.existsSync(candidatePath)) {
    try {
      pyqBank = JSON.parse(fs.readFileSync(candidatePath, 'utf-8')) as PyqBankEntry[];
      break;
    } catch (err) {
      console.error(`Failed to parse ${candidatePath}:`, err);
    }
  }
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface ProblemSolvePromptContext {
  solveAction: 'start' | 'next_section' | 'simplify_section';
  targetSection: number;
  simplificationLevel: number;
  boardHistory: BlackboardSectionSnapshot[];
}

function buildResearchSystemInstruction(
  language: LanguageCode,
  subject: WbbseSubject,
  intent: string,
  matchedPyqs: PyqBankEntry[],
  attachmentSummary?: string,
  problemContext?: ProblemSolvePromptContext
): string {
  const langInstruction =
    language === 'bn'
      ? `STRICT BILINGUAL MIRRORING: The student's query is in Bengali (or Banglish). You MUST write your ENTIRE response—including all headings, greetings, concept explanations, PYQ questions, trend explanations, blackboard chalk lines, teacher spoken narration, and YouTube video descriptions—exclusively in natural, accurate Bengali script (বাংলা). Only keep unavoidable technical symbols, algebraic variables, IUPAC names, SI units, or English titles where WBBSE Bengali-medium textbooks do.`
      : `STRICT BILINGUAL MIRRORING: The student's query is in English. You MUST write your ENTIRE response—including headings, explanations, PYQ questions, trend notes, blackboard chalk lines, teacher spoken narration, and YouTube descriptions—in clear, natural English appropriate for WBBSE English-medium Class 10 students.`;

  const pyqContext =
    matchedPyqs.length > 0
      ? `\n\nLOCAL WBBSE + ABTA/WBTA PYQ KNOWLEDGE BASE MATCHES (2016–2026):\n${JSON.stringify(
          matchedPyqs.map((p) => ({
            subject: p.subject,
            chapter: language === 'bn' ? p.chapterBn : p.chapter,
            question: language === 'bn' ? p.questionBn : p.questionEn,
            examYears: p.examYears,
            testPaperRefs: p.testPaperRefs || [],
            marks: p.marks,
            importanceLevel: p.importanceLevel,
            trendNote: language === 'bn' ? p.trendNoteBn : p.trendNoteEn,
          })),
          null,
          2
        )}`
      : '';

  const attachmentContext = attachmentSummary
    ? `\n\nSTUDENT'S UPLOADED DOCUMENT / IMAGE CONTEXT:\n${attachmentSummary}\nInspect the attached image/PDF directly and prioritize its exact problem, diagram, numbers, or question paper content.`
    : '';

  const simplificationLevel = problemContext?.simplificationLevel ?? 1;
  const targetSection = problemContext?.targetSection ?? 1;
  const solveAction = problemContext?.solveAction ?? 'start';
  const boardHistorySummary =
    problemContext && problemContext.boardHistory.length > 0
      ? `\n\nALREADY WRITTEN ON BLACKBOARD (Completed Sections):\n${problemContext.boardHistory
          .map(
            (s) =>
              `Section ${s.sectionNumber}: ${s.sectionTitle}\n${s.blackboardLines
                .map((l) => `  [${l.kind}] ${l.content}`)
                .join('\n')}`
          )
          .join('\n')}`
      : '';

  const simplificationNote =
    simplificationLevel >= 3
      ? `SIMPLIFICATION LEVEL ${simplificationLevel} (MAXIMUM CLARITY): The student is still confused on Section ${targetSection}! Rewrite ONLY Section ${targetSection} from scratch with an everyday real-world analogy, break every tiny arithmetic/algebraic step onto its own blackboard line, and explain from Class 8–9 basics.`
      : simplificationLevel === 2
        ? `SIMPLIFICATION LEVEL 2 (EXTRA SIMPLE): The student did not understand Section ${targetSection}. Re-teach ONLY Section ${targetSection} using simpler everyday words, a concrete analogy, and explicit micro-steps on the blackboard.`
        : `SIMPLIFICATION LEVEL 1: Teach Section ${targetSection} clearly like an encouraging WBBSE school teacher standing at the classroom blackboard.`;

  const subjectStrictRule =
    subject === 'Mathematics'
      ? `STRICT MATHEMATICS-ONLY PROBLEM SOLVE GUARD:
   - You are in **Mathematics** Problem Solve mode. You MUST ONLY solve pure **Mathematics** problems (WBBSE Class 10: Arithmetic / Simple & Compound Interest / Partnership, Algebra / Quadratic Equations / Ratio & Proportion / Variation / Quadratic Surds, Geometry Theorems & Constructions, Trigonometry, Mensuration, Statistics / Mean-Median-Ogive).
   - If the student's question or uploaded image/PDF is from Physical Science (Physics/Chemistry), Life Science, History, Geography, Bengali, English, or any non-Mathematics domain, DO NOT solve it!
   - Instead set "subjectMismatch": true, "subjectGuard": "Mathematics", "detectedSubject": "<actual subject name>", "mismatchReason": "<warm message in ${language === 'bn' ? 'Bengali' : 'English'} telling the student this belongs to that subject, and asking them to click New Chat and select that subject>", "blackboardLines": [{ "kind": "highlight", "content": "<short notice>" }], "teacherSpeech": "<same polite guidance>", "isFinalSection": true, "sectionNumber": 1, "estimatedTotalSections": 1.`
      : subject === 'Physical Science'
        ? `STRICT PHYSICAL SCIENCE-ONLY PROBLEM SOLVE GUARD:
   - You are in **Physical Science** Problem Solve mode. You MUST ONLY solve **Physical Science** (Physics & Chemistry) problems (WBBSE Class 10: Environment, Behaviour of Gases / Boyle's & Charles's Law / PV=nRT, Chemical Calculations / Mole & Vapour Density, Thermal Phenomena, Light / Mirrors-Lenses-Snell's Law, Current Electricity / Ohm's Law-Resistors-Joule's Heating-Power, Atomic Nucleus, Periodic Table, Chemical Bonding, Electrochemistry, Metallurgy, Organic Chemistry).
   - If the student's question or uploaded image/PDF is pure Mathematics (quadratic equations, circle theorems, trigonometry, mensuration, bank interest, algebra unrelated to Physics/Chemistry), or History, Biology, Geography, Bengali, or English, DO NOT solve it!
   - Instead set "subjectMismatch": true, "subjectGuard": "Physical Science", "detectedSubject": "<actual subject name>", "mismatchReason": "<warm message in ${language === 'bn' ? 'Bengali' : 'English'} telling the student this belongs to that subject, and asking them to click New Chat and select that subject>", "blackboardLines": [{ "kind": "highlight", "content": "<short notice>" }], "teacherSpeech": "<same polite guidance>", "isFinalSection": true, "sectionNumber": 1, "estimatedTotalSections": 1.`
        : '';

  const bengaliTeacherSpeechRule =
    language === 'bn'
      ? `
   - BENGALI CLASSROOM TEACHER SPOKEN NARRATION STANDARD (CRITICAL FOR AUDIO & CLARITY):
     * Write "teacherSpeech" and "feedbackQuestion" in refined, respectful, natural West Bengal classroom Bengali (শুদ্ধ ও প্রাঞ্জল কথ্য প্রমিত বাংলা)—like an experienced, caring Madhyamik Mathematics/Physical Science teacher explaining calmly in class.
     * NEVER use blunt or robotic openings like "শোনো," or awkward machine-translated phrases ("মাইক্রো-ধাপ", "এই সমস্যার জন্য আমরা ধারণা দেখব"). Start warmly and professionally (e.g., "এসো, প্রথমে প্রশ্নটি ভালোভাবে বুঝে নেওয়া যাক।", "এবার বোর্ডের দ্বিতীয় অংশের দিকে লক্ষ্য করো।", "খুব সহজভাবে বিষয়টি দেখা যাক।").
     * AUDIO-READY RULE FOR "teacherSpeech" & "feedbackQuestion": Because students LISTEN to this aloud, NEVER put raw Greek symbols (α, β, θ, Ω), superscripts (², ³), slashes (1/R, -b/a), LaTeX ($...$), arrows (→), or symbol-Bengali hybrids like "α-কে" inside "teacherSpeech" or "feedbackQuestion"! Instead write every mathematical expression phonetically in natural Bengali words just as a teacher speaks aloud (e.g., "আলফা", "টু আলফা", "এক্স স্কোয়ার", "মাইনাস বি বাই এ", "এক বাই আর", "ওহম", "ভোল্ট"). Keep the compact symbolic equations on the blackboard ("blackboardLines") only!
     * Align "teacherSpeech" directly with THIS section's "blackboardLines": clearly explain *what* we are writing in this section and *why* it works in 3–4 smooth, well-punctuated sentences (using proper দাঁড়ি "।" and কমা ",") so any Class 10 student immediately grasps the logic.`
      : '';

  return `You are "Madhyamik AI Mitra", an autonomous, high-precision exam research and study assistant dedicated exclusively to West Bengal Board of Secondary Education (WBBSE) Class 10 (Madhyamik Pariksha) students across all 7 subjects: Bengali, English, Mathematics, Physical Science, Life Science, History, and Geography.

CURRENT SUBJECT FILTER: ${subject}
DETECTED INTENT: ${intent}
${langInstruction}

FACTUAL ACCURACY MANDATE (CRITICAL):
- Verify every WBBSE Class 10 chapter, exam year (2016–2026), marks distribution, formula, chemical equation, historical date, and ABTA/WBTA Test Paper reference with Google Search Grounding before stating it.
- NEVER fabricate exam years, theorem numbers, facts, or URLs. If an exact exam year is uncertain, verify via Google Search or state only verified years.
- For all Mathematics and Physical Science numericals, double-check every arithmetic operation, sign, square root, and SI/CGS unit conversion twice before emitting output.

AUTONOMOUS RESEARCH AGENT GUIDELINES:
1. DEEP PYQ, ABTA & WBTA TEST PAPER ANALYSIS MODE (Whenever the student asks for important questions, suggestions, 10-year PYQs, ABTA/WBTA test paper analysis, exam patterns, or chapter-wise probable questions):
   - Cross-reference:
     (a) The Local WBBSE PYQ Knowledge Base below,
     (b) Official WBBSE Madhyamik board question trends (2016–2026), AND
     (c) **ABTA (All Bengal Teachers' Association)** and **WBTA (West Bengal Teachers' Association)** Test Papers via Google Search Grounding.
   - Write a crisp analytical overview comparing WBBSE board frequency with ABTA/WBTA test paper repetition and chapter marks weightage.
   - Output a fenced JSON block strictly tagged \`\`\`json:pyq ... \`\`\` containing an array of 4 to 6 high-yield questions. Each object MUST have:
     - "question": string (exact board/test-paper question in ${language === 'bn' ? 'Bengali' : 'English'})
     - "years": number[] (verified Madhyamik exam years e.g. [2018, 2021, 2024])
     - "testPaperRefs": string[] (1 to 3 ABTA/WBTA test paper references e.g. ["ABTA Test Paper 2024–25", "WBTA 2024–25"])
     - "marks": string (e.g. "${language === 'bn' ? '৩ নম্বর' : '3 Marks'}")
     - "importance": strictly one of "High Probability", "Repeated Trend", or "Concept Builder"
     - "trendNote": string (concise 1-line trend note referencing WBBSE & ABTA/WBTA in ${language === 'bn' ? 'Bengali' : 'English'})
     - "chapter": string
     - "subject": string

2. BLACKBOARD TEACHER PROBLEM SOLVE MODE (ONLY active when DETECTED INTENT is "problem_solve" AND CURRENT SUBJECT FILTER is "Mathematics" or "Physical Science"):
   ${subjectStrictRule}
   - TEACHING WORKFLOW (ONE SECTION AT A TIME ON THE BLACKBOARD):
     - Act like a real, warm, encouraging WBBSE classroom teacher standing at a green blackboard with chalk.
     - Do NOT solve the whole problem in a single dump! Break a typical Class 10 problem into 3 to 4 progressive teaching sections (e.g., Section 1: *Understanding the Problem, Core Concept & Given Data*; Section 2: *Choosing Formula / Drawing Setup & Unit Check*; Section 3: *Step-by-Step Solving*; Section 4: *Final Answer & Exam Check* — use 3–4 sections so each section is digestibly short and interactive).
     - CURRENT ACTION: "${solveAction}" | TARGET SECTION TO WRITE NOW: Section ${targetSection}.
     - ${simplificationNote}
     - Write ONLY Section ${targetSection} right now!
     - If Section ${targetSection} is NOT the final section, set "isFinalSection": false, keep the remaining calculation for the next section after the student confirms understanding, and ask a friendly check-in question in "feedbackQuestion".
     - ONLY when Section ${targetSection} actually finishes solving the problem (typically Section 3 or 4), set "isFinalSection": true, include a blackboard line with "kind": "answer", and populate "finalAnswer" and "examTip".${bengaliTeacherSpeechRule}
   - Keep prose outside the JSON block to a brief 1-sentence warm classroom cue.
   - Output a fenced JSON block strictly tagged \`\`\`json:problem_solve ... \`\`\` as a single JSON object with:
     - "topicTitle": string (problem/chapter title)
     - "subjectGuard": "${subject === 'Physical Science' ? 'Physical Science' : 'Mathematics'}"
     - "subjectMismatch": boolean (false if on-subject, true if off-subject)
     - "detectedSubject": string (optional, only if subjectMismatch is true)
     - "mismatchReason": string (optional, only if subjectMismatch is true)
     - "sectionNumber": ${targetSection}
     - "estimatedTotalSections": number (typically 3 or 4; >= ${targetSection})
     - "isFinalSection": boolean (true ONLY when the problem is completely solved in this section or on subjectMismatch)
     - "sectionTitle": string (crisp title for Section ${targetSection}, e.g. "Section 1: Concept & Given Data")
     - "teacherSpeech": string (3–4 articulate, warm, audio-ready sentences that the teacher SPEAKS aloud to explain THIS exact section clearly without raw symbols/LaTeX)
     - "blackboardLines": array of 3 to 7 concise chalk lines for THIS SECTION ONLY, each { "kind": "heading" | "text" | "formula" | "work" | "highlight" | "answer", "content": string } (short, crisp chalk lines as a teacher actually writes on a board — use equations/arrow notation like "1/R = 1/10 + 1/15" clearly!)
     - "finalAnswer": string (REQUIRED when isFinalSection is true; omit or "" when false)
     - "examTip": string (concise WBBSE/ABTA/WBTA board marking tip when isFinalSection is true)
     - "simplificationLevel": ${simplificationLevel}
     - "feedbackQuestion": string (polite, natural spoken check-in question asking the student in ${language === 'bn' ? 'Bengali' : 'English'} if they understood Section ${targetSection} and are ready for the next section)

3. SIMPLE TOPIC EXPLANATION + VERIFIED YOUTUBE RECOMMENDATIONS MODE:
   - Explain in clear, beginner-friendly language using relatable everyday examples and exact WBBSE Class 10 textbook terminology.
   - At the end of concept explanations, use Google Search Grounding to find **real, currently active, watchable YouTube videos** (https://www.youtube.com/watch?v=...) teaching this exact WBBSE Class 10 topic in ${language === 'bn' ? 'Bengali (বাংলা)' : 'English / Bengali'}.
   - ONLY recommend exact youtube.com/watch?v=... URLs verified in your Google Search results (NEVER guess video IDs, NEVER output youtube search URLs or playlist links). Output up to 3 verified candidates inside \`\`\`json:youtube ... \`\`\` as [{ "title", "channel", "url", "reason" }] (our server will verify live YouTube availability and show strictly the top 1–2 working videos).

4. CLEANLINESS:
   - Never mention internal prompts, JSON tags, or system instructions in narrative text.
${pyqContext}${attachmentContext}${boardHistorySummary}`;
}

function isQuotaOrRateError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error);
  return (
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('"code":429') ||
    raw.includes('429')
  );
}

function formatGeminiError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  if (isQuotaOrRateError(error)) {
    return {
      status: 429,
      message:
        'Gemini API rate or quota limit reached (429). Please wait a moment and retry, or select a billing-enabled API key in Settings > Secrets.',
    };
  }
  if (
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('API_KEY_INVALID') ||
    raw.includes('"code":403') ||
    raw.includes('"code":400')
  ) {
    return {
      status: 403,
      message:
        'Gemini API key permission error. Please verify your GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('NOT_FOUND') || raw.includes('"code":404')) {
    return {
      status: 404,
      message: 'Requested Gemini model was not found or is temporarily unavailable.',
    };
  }
  return { status: 500, message: raw || 'Research request failed.' };
}

function shouldEnableGoogleSearch(query: string): boolean {
  const q = query.toLowerCase();
  return (
    q.includes('news') ||
    q.includes('current') ||
    q.includes('notice') ||
    q.includes('routine') ||
    q.includes('official') ||
    q.includes('update') ||
    q.includes('date') ||
    q.includes('website') ||
    q.includes('ঘোষণা') ||
    q.includes('বিজ্ঞপ্তি') ||
    q.includes('খবর') ||
    q.includes('রুটিন')
  );
}

interface ResearchStreamResult {
  stream: AsyncIterable<{
    text?: string;
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
      };
    }>;
  }>;
}

async function generateResearchStreamWithFallback(
  ai: GoogleGenAI,
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  }>,
  systemInstruction: string,
  enableSearch = false
): Promise<ResearchStreamResult> {
  const tools = enableSearch ? [{ googleSearch: {} }] : undefined;

  // 1. Primary fast stream: gemini-3.1-flash-lite (ultra-low TTFT ~1.5s - 2.5s)
  try {
    const stream = await ai.models.generateContentStream({
      model: 'gemini-3.1-flash-lite',
      contents,
      config: {
        systemInstruction,
        tools,
      },
    });
    return { stream };
  } catch (err1) {
    console.warn('gemini-3.1-flash-lite stream error; attempting gemini-3.8-flash:', err1);
    // 2. Fallback: gemini-3.8-flash with LOW thinking
    try {
      const stream = await ai.models.generateContentStream({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction,
          tools,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      return { stream };
    } catch (err2) {
      console.warn('gemini-3.8-flash stream error; falling back to gemini-4-hydrogen:', err2);
      // 3. Fallback: gemini-4-hydrogen with LOW thinking
      const stream = await ai.models.generateContentStream({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      return { stream };
    }
  }
}

async function generateResearchWithFallback(
  ai: GoogleGenAI,
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  }>,
  systemInstruction: string,
  enableSearch = false
): Promise<GenerateContentResponse> {
  const tools = enableSearch ? [{ googleSearch: {} }] : undefined;
  try {
    return await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents,
      config: {
        systemInstruction,
        tools,
      },
    });
  } catch (err) {
    if (!isQuotaOrRateError(err)) {
      throw err;
    }
    console.warn('gemini-3.1-flash-lite hit rate limit; retrying with gemini-3.8-flash.');
    await new Promise((r) => setTimeout(r, 600));
    try {
      return await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction,
          tools,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
    } catch (err2) {
      if (!isQuotaOrRateError(err2)) {
        throw err2;
      }
      console.warn('gemini-3.8-flash hit rate limit; falling back to gemini-4-hydrogen.');
      await new Promise((r) => setTimeout(r, 600));
      return await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
    }
  }
}

async function verifyYouTubeVideoAvailable(
  candidate: YouTubeRecommendation
): Promise<YouTubeRecommendation | null> {
  const canonicalUrl = normalizeYouTubeUrl(candidate.url);
  if (!canonicalUrl) return null;
  const videoId = extractYouTubeVideoId(canonicalUrl);
  if (!videoId) return null;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      canonicalUrl
    )}&format=json`;
    const res = await fetch(oembedUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(2500),
      headers: {
        'User-Agent': 'MadhyamikAIMitra/1.0',
      },
    });
    if (!res.ok) {
      return null;
    }
    const meta = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    if (!meta?.title) return null;

    return {
      title: String(meta.title).slice(0, 200),
      channel: String(meta.author_name || candidate.channel || 'YouTube').slice(0, 120),
      url: canonicalUrl,
      reason: candidate.reason,
      thumbnailUrl:
        meta.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      verified: true,
    };
  } catch {
    return null;
  }
}

function extractRawYouTubeCandidatesFromText(rawText: string): YouTubeRecommendation[] {
  const out: YouTubeRecommendation[] = [];
  const ytMatch = rawText.match(/```json:youtube\s*([\s\S]*?)```/i);
  if (ytMatch && ytMatch[1]) {
    try {
      const parsed = JSON.parse(ytMatch[1].trim());
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item.url === 'string') {
            out.push({
              title: String(item.title || 'YouTube Lecture').slice(0, 200),
              channel: String(item.channel || 'YouTube').slice(0, 120),
              url: String(item.url),
              reason: item.reason ? String(item.reason).slice(0, 280) : undefined,
            });
          }
        }
      }
    } catch {
      // Ignore malformed JSON
    }
  }
  return out;
}

async function resolveRedirectToYouTubeUrl(rawUrl: string): Promise<string | null> {
  if (extractYouTubeVideoId(rawUrl)) return normalizeYouTubeUrl(rawUrl);
  try {
    const res = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
      headers: { 'User-Agent': 'MadhyamikAIMitra/1.0' },
    });
    const finalUrl = res.url;
    return normalizeYouTubeUrl(finalUrl);
  } catch {
    return null;
  }
}

const EXCLUDED_REGIONAL_LANG_RE =
  /\b(tamil|telugu|malayalam|kannada|marathi|gujarati|odia|oriya|punjabi|bhojpuri)\b/i;
const WBBSE_PRIORITY_RE =
  /(wbbse|madhyamik|class\s*10|১০|মাধ্যমিক|bengali|bangla|বাংলা)/i;

async function discoverLiveYouTubeVideos(
  query: string,
  subject: WbbseSubject,
  language: LanguageCode,
  seenIds: Set<string>,
  needed: number
): Promise<YouTubeRecommendation[]> {
  if (needed <= 0) return [];
  const cleanedTopic = query
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  const searchTerms = [
    `WBBSE Class 10 ${subject === 'All Subjects' ? '' : subject} ${cleanedTopic} ${
      language === 'bn' ? 'Bengali' : 'Madhyamik'
    }`
      .replace(/\s+/g, ' ')
      .trim(),
    `Madhyamik ${cleanedTopic} Bengali explanation`
      .replace(/\s+/g, ' ')
      .trim(),
  ];

  const found: YouTubeRecommendation[] = [];

  for (const term of searchTerms) {
    if (found.length >= needed) break;
    try {
      const searchRes = await fetch(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`,
        {
          signal: AbortSignal.timeout(5000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
          },
        }
      );
      if (!searchRes.ok) continue;
      const html = await searchRes.text();
      const rawIds = [
        ...new Set(
          [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1])
        ),
      ].filter((id) => !seenIds.has(id));

      const verifiedBatch = await Promise.all(
        rawIds.slice(0, 8).map((id) =>
          verifyYouTubeVideoAvailable({
            title: cleanedTopic || 'WBBSE Lecture',
            channel: 'YouTube',
            url: `https://www.youtube.com/watch?v=${id}`,
            reason:
              language === 'bn'
                ? 'মাধ্যমিক (WBBSE Class 10) টপিক বোঝার জন্য যাচাইকৃত ইউটিউব লেকচার।'
                : 'Verified available YouTube lecture aligned with this WBBSE Class 10 topic.',
          })
        )
      );

      const eligible = verifiedBatch.filter((item): item is YouTubeRecommendation => {
        if (!item) return false;
        const combined = `${item.title} ${item.channel}`;
        return !EXCLUDED_REGIONAL_LANG_RE.test(combined);
      });

      eligible.sort((a, b) => {
        const aScore = WBBSE_PRIORITY_RE.test(`${a.title} ${a.channel}`) ? 1 : 0;
        const bScore = WBBSE_PRIORITY_RE.test(`${b.title} ${b.channel}`) ? 1 : 0;
        return bScore - aScore;
      });

      for (const item of eligible) {
        const vid = extractYouTubeVideoId(item.url);
        if (vid && !seenIds.has(vid)) {
          seenIds.add(vid);
          found.push(item);
          if (found.length >= needed) break;
        }
      }
    } catch {
      // Ignore transient network errors during fallback discovery
    }
  }

  return found;
}

async function resolveVerifiedYouTubeVideos(
  ai: GoogleGenAI,
  rawText: string,
  groundingLinks: GroundingLink[],
  query: string,
  subject: WbbseSubject,
  language: LanguageCode,
  intent: string
): Promise<YouTubeRecommendation[]> {
  const candidates: YouTubeRecommendation[] = [
    ...extractRawYouTubeCandidatesFromText(rawText),
  ];

  // Resolve any YouTube links present in Google Search grounding chunks (including vertex redirect URLs)
  const ytGroundingCandidates = groundingLinks
    .filter(
      (g) =>
        extractYouTubeVideoId(g.url) !== null ||
        /youtube\.com|youtu\.be|youtube/i.test(`${g.title} ${g.url}`)
    )
    .slice(0, 4);

  if (ytGroundingCandidates.length > 0) {
    const resolvedLinks = await Promise.all(
      ytGroundingCandidates.map(async (g) => {
        const resolvedUrl = await resolveRedirectToYouTubeUrl(g.url);
        return resolvedUrl
          ? ({
              title: g.title,
              channel: 'YouTube',
              url: resolvedUrl,
            } as YouTubeRecommendation)
          : null;
      })
    );
    for (const r of resolvedLinks) {
      if (r) candidates.push(r);
    }
  }

  // Deduplicate by videoId before checking oEmbed
  const deduped: YouTubeRecommendation[] = [];
  const seenIds = new Set<string>();
  for (const c of candidates) {
    const id = extractYouTubeVideoId(c.url);
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      deduped.push(c);
    }
  }

  const verified: YouTubeRecommendation[] = [];
  if (deduped.length > 0) {
    const checked = await Promise.all(deduped.slice(0, 6).map(verifyYouTubeVideoAvailable));
    for (const item of checked) {
      if (item && !EXCLUDED_REGIONAL_LANG_RE.test(`${item.title} ${item.channel}`)) {
        verified.push(item);
      }
      if (verified.length >= 2) break;
    }
  }

  // In concept mode, ensure up to 2 verified available YouTube videos via grounded lookup + live YouTube discovery
  if (verified.length === 0 && intent === 'concept') {
    try {
      const searchPrompt = `Find 3 real, currently available YouTube video links (youtube.com/watch?v=...) explaining this WBBSE Class 10 (Madhyamik) topic in ${
        language === 'bn' ? 'Bengali' : 'Bengali or English'
      }: Subject "${subject}", Topic: "${query.slice(0, 220)}". Return ONLY a JSON array of { "title", "channel", "url", "reason" } using real watch URLs from search results.`;
      const ytSearchRes = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [{ role: 'user', parts: [{ text: searchPrompt }] }],
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      const ytText = ytSearchRes.text ?? '';
      const extraChunks =
        ytSearchRes.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const extraCandidates: YouTubeRecommendation[] = [];
      const jsonArrMatch = ytText.match(/\[[\s\S]*\]/);
      if (jsonArrMatch) {
        try {
          const arr = JSON.parse(jsonArrMatch[0]);
          if (Array.isArray(arr)) {
            for (const v of arr) {
              if (v && typeof v.url === 'string') {
                extraCandidates.push({
                  title: String(v.title || 'YouTube Lecture'),
                  channel: String(v.channel || 'YouTube'),
                  url: String(v.url),
                  reason: v.reason ? String(v.reason).slice(0, 280) : undefined,
                });
              }
            }
          }
        } catch {
          // ignore
        }
      }
      const chunkUrls = await Promise.all(
        extraChunks.slice(0, 4).map(async (ch) => {
          if (!ch?.web?.uri) return null;
          const resolved = await resolveRedirectToYouTubeUrl(ch.web.uri);
          return resolved
            ? ({
                title: ch.web.title || 'YouTube Lecture',
                channel: 'YouTube',
                url: resolved,
              } as YouTubeRecommendation)
            : null;
        })
      );
      for (const item of chunkUrls) {
        if (item) extraCandidates.push(item);
      }

      const extraDeduped: YouTubeRecommendation[] = [];
      for (const c of extraCandidates) {
        const id = extractYouTubeVideoId(c.url);
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          extraDeduped.push(c);
        }
      }
      const checkedExtra = await Promise.all(
        extraDeduped.slice(0, 5).map(verifyYouTubeVideoAvailable)
      );
      for (const item of checkedExtra) {
        if (item && !EXCLUDED_REGIONAL_LANG_RE.test(`${item.title} ${item.channel}`)) {
          verified.push(item);
        }
        if (verified.length >= 2) break;
      }
    } catch {
      // Fall through cleanly to direct YouTube discovery
    }
  }

  if (verified.length < 2 && intent === 'concept') {
    const discovered = await discoverLiveYouTubeVideos(
      query,
      subject,
      language,
      seenIds,
      2 - verified.length
    );
    verified.push(...discovered);
  }

  return verified.slice(0, 2);
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=()');
    next();
  });

  app.use(express.json({ limit: '16mb' }));
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const e = err as { status?: number; type?: string; message?: string };
      if (e?.type === 'entity.too.large' || e?.status === 413) {
        res
          .status(413)
          .json({ error: 'Uploaded file or request is too large (max 16 MB).' });
        return;
      }
      if (err instanceof SyntaxError && e?.status === 400) {
        res.status(400).json({ error: 'Malformed JSON request body.' });
        return;
      }
      next(err);
    }
  );

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      status: 'ok',
      pyqCount: pyqBank.length,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.API_KEY),
      env: isProduction ? 'production' : 'development',
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.post('/api/tts', async (req, res) => {
    try {
      const { text, language = 'bn' } = req.body as {
        text?: string;
        language?: LanguageCode;
      };
      if (typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Text is required for speech synthesis.' });
        return;
      }

      const normalizedSpeech = formatTeacherSpeechForAudio(
        text.trim().slice(0, 2200),
        language === 'bn' ? 'bn' : 'en'
      );

      if (!normalizedSpeech) {
        res.status(400).json({ error: 'Spoken text is empty after normalization.' });
        return;
      }

      const ai = getAiClient();
      const styleHint =
        language === 'bn'
          ? 'Calm, articulate, warm Bengali school teacher explaining a Class 10 board concept clearly in standard Kolkata Bengali with natural pauses.'
          : 'Calm, articulate, warm Class 10 Indian school teacher explaining a concept clearly in standard English.';

      const ttsResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: normalizedSpeech,
                speechMetadata: {
                  style: styleHint,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const audioPart = ttsResponse.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData?.data
      );
      const audioBase64 = audioPart?.inlineData?.data;
      const mimeType = audioPart?.inlineData?.mimeType || 'audio/wav';

      if (!audioBase64) {
        res.status(502).json({ error: 'TTS model returned no audio output.' });
        return;
      }

      res.json({
        audioBase64,
        mimeType,
        normalizedText: normalizedSpeech,
      });
    } catch (error) {
      console.error('TTS API error:', error);
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/upload-pdf', async (req, res) => {
    try {
      const { fileName, mimeType, base64Data } = req.body as {
        fileName?: string;
        mimeType?: string;
        base64Data?: string;
      };

      if (
        typeof fileName !== 'string' ||
        !fileName.trim() ||
        typeof base64Data !== 'string' ||
        !base64Data
      ) {
        res.status(400).json({ error: 'Missing fileName or file data.' });
        return;
      }

      if (!isSupportedDocumentType(fileName, mimeType)) {
        res.status(400).json({
          error: 'Please upload an Image (PNG/JPG/WEBP), PDF (.pdf), or Text (.txt) document.',
        });
        return;
      }

      const lowerName = fileName.toLowerCase();
      let effectiveMime = mimeType || 'application/pdf';
      if (lowerName.endsWith('.txt')) effectiveMime = 'text/plain';
      else if (lowerName.endsWith('.pdf')) effectiveMime = 'application/pdf';
      else if (lowerName.endsWith('.png')) effectiveMime = 'image/png';
      else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
        effectiveMime = 'image/jpeg';
      } else if (lowerName.endsWith('.webp')) effectiveMime = 'image/webp';
      else if (lowerName.endsWith('.gif')) effectiveMime = 'image/gif';

      const isImage = effectiveMime.startsWith('image/');
      const ai = getAiClient();

      const parts =
        effectiveMime === 'text/plain'
          ? [
              {
                text: `Extract a concise 2-line academic summary of this uploaded WBBSE Madhyamik document (${fileName}), listing the detected Subject(s), Chapters, and Question/Problem details.\n\nDocument text:\n${Buffer.from(
                  base64Data,
                  'base64'
                )
                  .toString('utf-8')
                  .slice(0, 20000)}`,
              },
            ]
          : [
              {
                inlineData: {
                  mimeType: effectiveMime,
                  data: base64Data,
                },
              },
              {
                text: isImage
                  ? `Inspect this uploaded image of a WBBSE Class 10 (Madhyamik) problem or test paper (${fileName}). Provide a concise 2-line summary stating the Subject, Chapter/Topic, and the exact problem or question shown.`
                  : `Analyze this uploaded WBBSE Class 10 (Madhyamik) syllabus, PYQ, or ABTA/WBTA test paper PDF (${fileName}). Provide a concise 3-line summary listing the detected Subject(s), key Chapters/Topics, and exam years or problem types covered.`,
              },
            ];

      let response: GenerateContentResponse;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [{ role: 'user', parts }],
          config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
        });
      } catch (err) {
        if (!isQuotaOrRateError(err)) throw err;
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: [{ role: 'user', parts }],
        });
      }

      const summary =
        response.text?.trim() ||
        `Attached ${fileName} for WBBSE Madhyamik analysis.`;

      res.json({
        fileName,
        mimeType: effectiveMime,
        summary,
      });
    } catch (error) {
      console.error('Upload document error:', error);
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/research', async (req, res) => {
    try {
      const {
        message,
        subject = 'All Subjects',
        history = [],
        attachment,
        solveMode = false,
        simplificationLevel = 1,
        solveAction = 'start',
        currentSection = 1,
        boardHistory = [],
      } = req.body as {
        message?: string;
        subject?: WbbseSubject;
        history?: { role: 'user' | 'assistant'; text: string }[];
        attachment?: {
          fileName: string;
          mimeType: string;
          base64Data?: string;
          summary?: string;
        };
        solveMode?: boolean;
        simplificationLevel?: number;
        solveAction?: 'start' | 'next_section' | 'simplify_section';
        currentSection?: number;
        boardHistory?: BlackboardSectionSnapshot[];
      };

      if (typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
      }

      const language = detectLanguage(message);
      const allowProblemSolve = isProblemSolveSubject(subject);
      const effectiveSolveMode = allowProblemSolve && Boolean(solveMode);
      const intent = detectQueryIntent(
        message,
        subject,
        Boolean(attachment),
        effectiveSolveMode
      );
      const matchedPyqs = searchPyqBank(pyqBank, message, subject, 6);
      const safeSimpLevel = Math.max(1, Math.min(5, Number(simplificationLevel) || 1));
      const safeTargetSection =
        solveAction === 'next_section'
          ? Math.max(1, Math.min(10, (Number(currentSection) || 1) + 1))
          : solveAction === 'simplify_section'
            ? Math.max(1, Math.min(10, Number(currentSection) || 1))
            : 1;
      const safeBoardHistory = Array.isArray(boardHistory)
        ? boardHistory.slice(0, 8)
        : [];

      const systemInstruction = buildResearchSystemInstruction(
        language,
        subject,
        intent,
        matchedPyqs,
        attachment?.summary,
        intent === 'problem_solve'
          ? {
              solveAction,
              targetSection: safeTargetSection,
              simplificationLevel: safeSimpLevel,
              boardHistory: safeBoardHistory,
            }
          : undefined
      );

      const contents: Array<{
        role: 'user' | 'model';
        parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
      }> = [];

      const recentHistory = Array.isArray(history) ? history.slice(-8) : [];
      for (const turn of recentHistory) {
        if (!turn?.text) continue;
        contents.push({
          role: turn.role === 'user' ? 'user' : 'model',
          parts: [{ text: turn.text.slice(0, 6000) }],
        });
      }

      const currentParts: Array<{
        text?: string;
        inlineData?: { mimeType: string; data: string };
      }> = [];

      if (
        attachment?.base64Data &&
        (attachment.mimeType === 'application/pdf' ||
          attachment.mimeType.startsWith('image/'))
      ) {
        currentParts.push({
          inlineData: {
            mimeType:
              attachment.mimeType === 'image/jpg' ? 'image/jpeg' : attachment.mimeType,
            data: attachment.base64Data,
          },
        });
      } else if (attachment?.base64Data && attachment.mimeType === 'text/plain') {
        const decoded = Buffer.from(attachment.base64Data, 'base64')
          .toString('utf-8')
          .slice(0, 12000);
        currentParts.push({
          text: `[Attached Paper: ${attachment.fileName}]\n${decoded}`,
        });
      }

      currentParts.push({ text: message.trim() });
      contents.push({ role: 'user', parts: currentParts });

      const ai = getAiClient();
      const needsSearch = shouldEnableGoogleSearch(message);
      const wantsStream = req.body.stream !== false;

      if (wantsStream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        const sendEvent = (payload: Record<string, unknown>) => {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
            (res as unknown as { flush: () => void }).flush();
          }
        };

        sendEvent({
          type: 'start',
          language,
          mode: intent === 'problem_solve' ? 'problem_solve' : intent,
        });

        let fullRawText = '';
        const groundingLinks: GroundingLink[] = [];
        const seenUrls = new Set<string>();

        try {
          const streamResult = await generateResearchStreamWithFallback(
            ai,
            contents,
            systemInstruction,
            needsSearch
          );

          for await (const chunk of streamResult.stream) {
            const chunkText = chunk.text;
            if (chunkText) {
              fullRawText += chunkText;
              sendEvent({
                type: 'chunk',
                text: chunkText,
              });
            }

            const gChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (Array.isArray(gChunks)) {
              for (const ch of gChunks) {
                const uri = ch?.web?.uri;
                const title = ch?.web?.title;
                if (uri && title && !seenUrls.has(uri)) {
                  seenUrls.add(uri);
                  groundingLinks.push({ title, url: uri });
                }
              }
            }
          }

          let parsed = parseAssistantResponseBlocks(fullRawText);

          // Defensive formatting recovery if problem_solve mode omitted its structured fence
          if (intent === 'problem_solve' && allowProblemSolve && !parsed.problemSolve) {
            try {
              const repairPrompt = `Convert your response below into the required fenced \`\`\`json:problem_solve ... \`\`\` block for Section ${safeTargetSection} of the ${subject} Blackboard Teacher lesson.\n\nDraft:\n${fullRawText.slice(0, 4000)}`;
              const repairRes = await ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: [...contents, { role: 'user', parts: [{ text: repairPrompt }] }],
                config: {
                  systemInstruction,
                },
              });
              const repairedText = repairRes.text ?? '';
              const repairedParsed = parseAssistantResponseBlocks(repairedText);
              if (repairedParsed.problemSolve) {
                fullRawText = repairedText;
                parsed = repairedParsed;
              }
            } catch {
              // Proceed safely without blocking request
            }
          }

          // Attach cumulative blackboard history to returned problemSolve section
          let problemSolve = parsed.problemSolve;
          if (problemSolve && allowProblemSolve) {
            problemSolve = {
              ...problemSolve,
              subjectGuard: subject as 'Mathematics' | 'Physical Science',
              boardHistory: safeBoardHistory.length > 0 ? safeBoardHistory : undefined,
            };
          } else if (!allowProblemSolve) {
            problemSolve = undefined;
          }

          // Fast YouTube candidate verification (up to 2 videos, max 2.5s timeout)
          const rawYt = extractRawYouTubeCandidatesFromText(fullRawText);
          const youtubeVideos: YouTubeRecommendation[] = [];
          if (rawYt.length > 0) {
            const checked = await Promise.all(
              rawYt.slice(0, 3).map(verifyYouTubeVideoAvailable)
            );
            for (const v of checked) {
              if (v) youtubeVideos.push(v);
              if (youtubeVideos.length >= 2) break;
            }
          }

          const resolvedMode = problemSolve
            ? 'problem_solve'
            : parsed.pyqItems.length > 0
              ? 'pyq'
              : youtubeVideos.length > 0
                ? 'concept'
                : intent === 'problem_solve' && !allowProblemSolve
                  ? 'general'
                  : intent;

          sendEvent({
            type: 'done',
            text:
              parsed.cleanText ||
              (problemSolve
                ? problemSolve.subjectMismatch
                  ? problemSolve.mismatchReason ||
                    (language === 'bn'
                      ? `এই প্রশ্নটি ${subject} বিষয়ের নয়।`
                      : `This question is outside ${subject}.`)
                  : language === 'bn'
                    ? `ব্ল্যাকবোর্ডে Section ${problemSolve.sectionNumber || 1} লেখা হলো — মন দিয়ে দেখে বলো বুঝতে পারলে কি না:`
                    : `Here is Section ${problemSolve.sectionNumber || 1} on the blackboard — let me know if you understood:`
                : language === 'bn'
                  ? 'দুঃখিত, এই মুহূর্তে উত্তর তৈরি করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করো।'
                  : 'Sorry, I could not generate a response right now. Please try again.'),
            mode: resolvedMode,
            language,
            problemSolve,
            pyqItems: parsed.pyqItems,
            youtubeVideos: youtubeVideos.slice(0, 2),
            groundingLinks: groundingLinks.slice(0, 8),
          });
          res.end();
        } catch (streamError) {
          console.error('Research stream error:', streamError);
          const formatted = formatGeminiError(streamError);
          sendEvent({
            type: 'error',
            error: formatted.message,
          });
          res.end();
        }
        return;
      }

      // Non-streaming fallback
      const response = await generateResearchWithFallback(
        ai,
        contents,
        systemInstruction,
        needsSearch
      );

      let rawText = response.text ?? '';
      let parsed = parseAssistantResponseBlocks(rawText);

      // Defensive formatting recovery if problem_solve mode omitted its structured fence
      if (intent === 'problem_solve' && allowProblemSolve && !parsed.problemSolve) {
        try {
          const repairPrompt = `Convert your response below into the required fenced \`\`\`json:problem_solve ... \`\`\` block for Section ${safeTargetSection} of the ${subject} Blackboard Teacher lesson.\n\nDraft:\n${rawText.slice(0, 4000)}`;
          const repairRes = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: [...contents, { role: 'user', parts: [{ text: repairPrompt }] }],
            config: {
              systemInstruction,
            },
          });
          const repairedText = repairRes.text ?? '';
          const repairedParsed = parseAssistantResponseBlocks(repairedText);
          if (repairedParsed.problemSolve) {
            rawText = repairedText;
            parsed = repairedParsed;
          }
        } catch {
          // Proceed safely without blocking request
        }
      }

      // Attach cumulative blackboard history to returned problemSolve section
      let problemSolve = parsed.problemSolve;
      if (problemSolve && allowProblemSolve) {
        problemSolve = {
          ...problemSolve,
          subjectGuard: subject as 'Mathematics' | 'Physical Science',
          boardHistory: safeBoardHistory.length > 0 ? safeBoardHistory : undefined,
        };
      } else if (!allowProblemSolve) {
        problemSolve = undefined;
      }

      // Extract Google Search grounding links
      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const groundingLinks: GroundingLink[] = [];
      const seenUrls = new Set<string>();

      for (const chunk of groundingChunks) {
        const uri = chunk?.web?.uri;
        const title = chunk?.web?.title;
        if (uri && title && !seenUrls.has(uri)) {
          seenUrls.add(uri);
          groundingLinks.push({ title, url: uri });
        }
      }

      // Verify recommended YouTube videos
      const rawYt = extractRawYouTubeCandidatesFromText(rawText);
      const youtubeVideos: YouTubeRecommendation[] = [];
      if (rawYt.length > 0) {
        const checked = await Promise.all(
          rawYt.slice(0, 3).map(verifyYouTubeVideoAvailable)
        );
        for (const v of checked) {
          if (v) youtubeVideos.push(v);
          if (youtubeVideos.length >= 2) break;
        }
      }

      const resolvedMode = problemSolve
        ? 'problem_solve'
        : parsed.pyqItems.length > 0
          ? 'pyq'
          : youtubeVideos.length > 0
            ? 'concept'
            : intent === 'problem_solve' && !allowProblemSolve
              ? 'general'
              : intent;

      res.json({
        text:
          parsed.cleanText ||
          (problemSolve
            ? problemSolve.subjectMismatch
              ? problemSolve.mismatchReason ||
                (language === 'bn'
                  ? `এই প্রশ্নটি ${subject} বিষয়ের নয়।`
                  : `This question is outside ${subject}.`)
              : language === 'bn'
                ? `ব্ল্যাকবোর্ডে Section ${problemSolve.sectionNumber || 1} লেখা হলো — মন দিয়ে দেখে বলো বুঝতে পারলে কি না:`
                : `Here is Section ${problemSolve.sectionNumber || 1} on the blackboard — let me know if you understood:`
            : language === 'bn'
              ? 'দুঃখিত, এই মুহূর্তে উত্তর তৈরি করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করো।'
              : 'Sorry, I could not generate a response right now. Please try again.'),
        mode: resolvedMode,
        language,
        problemSolve,
        pyqItems: parsed.pyqItems,
        youtubeVideos: youtubeVideos.slice(0, 2),
        groundingLinks: groundingLinks.slice(0, 8),
      });
    } catch (error) {
      console.error('Research API error:', error);
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  const server = http.createServer(app);

  // WebSocket server for Gemini Live API (gemini-3.8-live)
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host}`);
    if (reqUrl.pathname === '/api/live-ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
    // Let Vite or other upgrade handlers manage non-/api/live-ws paths if applicable
  });

  wss.on('connection', async (clientWs: WebSocket, req) => {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
    const subject = reqUrl.searchParams.get('subject') || 'All Subjects';
    const lang = reqUrl.searchParams.get('lang') === 'bn' ? 'bn' : 'en';

    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let isClosed = false;

    const sendSafe = (payload: Record<string, unknown>) => {
      if (!isClosed && clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    try {
      const ai = getAiClient();
      const systemInstruction = `You are "Madhyamik AI Mitra", a warm, patient, encouraging West Bengal Board of Secondary Education (WBBSE) Class 10 oral examiner and concept tutor.
Subject Focus: ${subject}.
Preferred Starting Language: ${lang === 'bn' ? 'Bengali (বাংলা)' : 'English'}.
Rules:
1. You are fluent in both natural Bengali (বাংলা) and English. Mirror whichever language the student speaks in—if they speak Bengali, reply in clear Bengali; if they speak English, reply in English.
2. Keep spoken responses concise, conversational, and easy to follow over audio (2–4 sentences per turn unless explaining a step-by-step concept).
3. You can explain Madhyamik concepts verbally with everyday examples OR quiz the student with 1-mark and 2-mark viva questions, praising good answers and gently correcting mistakes.
4. Start by briefly greeting the student warmly and asking what topic or subject they want to practice today.`;

      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction,
        },
        callbacks: {
          onopen: () => {
            sendSafe({ type: 'ready' });
          },
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              sendSafe({
                type: 'inputTranscript',
                text: content.inputTranscription.text,
              });
            }
            if (content?.outputTranscription?.text) {
              sendSafe({
                type: 'outputTranscript',
                text: content.outputTranscription.text,
              });
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                sendSafe({
                  type: 'audio',
                  data: part.inlineData.data,
                });
              }
            }
            if (content?.interrupted) {
              sendSafe({ type: 'interrupted' });
            }
            if (content?.turnComplete) {
              sendSafe({ type: 'turnComplete' });
            }
          },
          onerror: (err) => {
            console.error('Gemini Live error:', err);
            sendSafe({ type: 'error', message: 'Live voice session encountered an error.' });
          },
          onclose: () => {
            sendSafe({ type: 'closed' });
          },
        },
      });
    } catch (error) {
      console.error('Failed to connect Gemini Live:', error);
      sendSafe({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not connect Live Voice Tutor.',
      });
    }

    clientWs.on('message', (raw) => {
      if (!liveSession || isClosed) return;
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          audio?: string;
          text?: string;
        };
        if (msg.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.text) {
          liveSession.sendRealtimeInput({ text: msg.text });
        }
      } catch (err) {
        console.error('WebSocket message parse error:', err);
      }
    });

    clientWs.on('close', () => {
      isClosed = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
    });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true' ? { server } : false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = fs.existsSync(path.resolve(__dirname, 'dist'))
      ? path.resolve(__dirname, 'dist')
      : fs.existsSync(path.resolve(process.cwd(), 'dist'))
        ? path.resolve(process.cwd(), 'dist')
        : __dirname;
    app.use(
      express.static(distDir, {
        maxAge: '7d',
        setHeaders: (res, filePath) => {
          if (
            filePath.endsWith('index.html') ||
            filePath.endsWith('manifest.webmanifest') ||
            filePath.endsWith('robots.txt')
          ) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found.' });
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Madhyamik AI Mitra server running on http://0.0.0.0:${PORT}`);
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`Received ${signal}; shutting down Madhyamik AI Mitra server cleanly...`);
    wss.clients.forEach((client) => {
      try {
        client.close(1001, 'Server shutting down');
      } catch {
        // Ignore close errors
      }
    });
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
