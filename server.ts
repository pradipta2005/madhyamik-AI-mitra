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
  WbbseVideoEntry,
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
  searchVideoBank,
  shouldRecommendVideos,
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

// Load structured WBBSE Video knowledge base
const videoBankCandidates = [
  path.resolve(__dirname, 'src/data/wbbse_video_bank.json'),
  path.resolve(process.cwd(), 'src/data/wbbse_video_bank.json'),
  path.resolve(__dirname, '../src/data/wbbse_video_bank.json'),
];

let videoBank: WbbseVideoEntry[] = [];
for (const candidatePath of videoBankCandidates) {
  if (fs.existsSync(candidatePath)) {
    try {
      videoBank = JSON.parse(fs.readFileSync(candidatePath, 'utf-8')) as WbbseVideoEntry[];
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
  matchedVideos: YouTubeRecommendation[] = [],
  wantsVideo = false,
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

  const videoContext =
    wantsVideo && matchedVideos.length > 0
      ? `\n\nCURATED VERIFIED WBBSE YOUTUBE LECTURES FOR THIS TOPIC (PRIORITIZE THESE EXACT URLS):\n${JSON.stringify(
          matchedVideos.map((v) => ({
            title: v.title,
            channel: v.channel,
            url: v.url,
            reason: v.reason,
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

  const videoDirective = wantsVideo
    ? `VIDEO RECOMMENDATION DIRECTIVE:
The student explicitly asked for a video/tutorial or expressed difficulty understanding. Output up to 2 high-quality educational video recommendations inside \`\`\`json:youtube ... \`\`\` as [{ "title", "channel", "url", "reason" }]. Prioritize verified URLs from CURATED VERIFIED WBBSE YOUTUBE LECTURES above.`
    : `VIDEO RECOMMENDATION DIRECTIVE (CRITICAL - DO NOT OUTPUT VIDEOS):
The student did NOT ask for video recommendations and did NOT express difficulty understanding.
DO NOT recommend any YouTube videos and DO NOT output any \`\`\`json:youtube ... \`\`\` block! Video links here are irrelevant and clutter the response.`;

  return `You are "Madhyamik AI Mitra", an expert, deeply caring, and authoritative AI academic assistant dedicated exclusively to West Bengal Board of Secondary Education (WBBSE) Class 10 (Madhyamik Pariksha) students across all 7 subjects: Bengali, English, Mathematics, Physical Science, Life Science, History, and Geography.

CURRENT SUBJECT FILTER: ${subject}
DETECTED INTENT: ${intent}
${langInstruction}

================================================================================
OFFICIAL WBBSE CLASS 10 (MADHYAMIK) SUBJECT SYLLABUS DIRECTORY (STRICT & UNBREAKABLE):
You must strictly respect the boundary of the CURRENT SUBJECT (${subject}). NEVER confuse, mix, or cross-contaminate chapters between subjects!

1. English (Second Language - Official Textbook: "Bliss"):
   - PROSE (Seen):
     1. "Father's Help" (R.K. Narayan)
     2. "The Passing Away of Bapu" (Nayantara Sahgal)
     3. "The Cat" (Andrew Barton Paterson)
     4. "Our Runaway Kite" (Lucy Maud Montgomery)
   - POETRY (Seen):
     1. "Fable" (Ralph Waldo Emerson)
     2. "My Own True Family" (Ted Hughes)
     3. "Sea Fever" (John Masefield)
     4. "The Snail" (William Cowper)
   - READING COMPREHENSION (Unseen - 20 Marks): Factual or literary passage (MCQ, True/False with justification statements, short answer questions, vocabulary finding 8 marks).
   - SECTION B (Grammar & Vocabulary - 20 Marks): Articles and Prepositions (3 marks), Correct verb forms/tenses (3 marks), Transformations (Voice Change, Narration Change, Clauses, Joining/Splitting) (3 marks), Phrasal Verbs (replacing verbs from given list with correct tense) (3 marks), Vocabulary finding from Unseen passage (4 words x 2 = 8 marks).
   - SECTION C (Writing Skills - 30 Marks): Three distinct writing tasks of 10 marks each:
     * Newspaper Report (Cyclone, Train accident, Awareness drive, Safe Drive Save Life)
     * Letter Writing (Editorial Letter to Editor of English daily, Formal letter to Headmaster, Informal letter to friend/family)
     * Notice Writing (Inter-school debate, Blood donation camp, Tree plantation)
     * Process Writing (Preparation of hand sanitizer, orange juice, tea, mustard oil)
     * Story Writing (with given outlines, moral, and catchy title)
     * Paragraph / Biography Writing.
   - ABSOLUTE WBBSE ENGLISH REGULATION:
     * There is NO Rapid Reader or "Koni" in English! "Koni" is strictly a Bengali (First Language) textbook.
     * NEVER mention "Koni", "Gyanchokkhu", "Bohurupee", or any Bengali literature in an English session!
     * NEVER fabricate 5-mark literature questions in English (Seen Prose questions are 1-mark MCQs, 1-mark VSAs, and 2-mark short answers; Poetry is 1-mark MCQs and 2-mark short answers; only Writing tasks are 10 marks).

2. Bengali (First Language - Official Textbooks: "সাহিত্য সঞ্চয়ন" ও "কোনি"):
   - গল্প (Prose): জ্ঞানচক্ষু (আশাপূর্ণা দেবী), বহুরূপী (সুবোধ ঘোষ), পথের দাবী (শরৎচন্দ্র চট্টোপাধ্যায়), অদল বদল (পান্নালাল প্যাটেল), নদীর বিদ্রোহ (মানিক বন্দ্যোপাধ্যায়)
   - কবিতা (Poetry): আয় আরো বেঁধে বেঁধে থাকি (শঙ্খ ঘোষ), আফ্রিকা (রবীন্দ্রনাথ ঠাকুর), অসুখী একজন (পাবলো নেরুদা), প্রলয়োল্লাস (কাজী নজরুল ইসলাম), অভিষেক (মাইকেল মধুসূদন দত্ত), সিন্ধুতীরে (সৈয়দ আলাওল), অস্ত্রের বিরুদ্ধে গান (জয় গোস্বামী)
   - প্রবন্ধ (Essays): হারিয়ে যাওয়া কালি কলম (শ্রীপান্থ), বাংলা ভাষায় বিজ্ঞান (রাজশেখর বসু)
   - নাটক (Drama): সিরাজউদ্দৌলা (শচীন্দ্রনাথ সেনগুপ্ত) — ৪ নম্বরের বড় প্রশ্ন
   - সহায়ক পাঠ (Supplementary Reader): কোনি (মতি নন্দী) — ৫ নম্বরের বড় প্রশ্ন (দুটি দেওয়া থাকে, একটি লিখতে হয়)
   - ব্যাকরণ ও নির্মিতি: কারক ও অকারক সম্পর্ক, সমাস, বাক্য ও বাচ্য, বঙ্গানুবাদ (৪ নম্বর), কাল্পনিক সংলাপ / প্রতিবেদন রচনা (৫ নম্বর), প্রবন্ধ রচনা (১০ নম্বর)।
   - ABSOLUTE WBBSE BENGALI REGULATION: All Bengali literature questions, character names, and quotes MUST be in authentic Bengali script.

3. Mathematics (গণিত প্রকাশ):
   - পাটিগণিত (সরল সুদকষা, চক্রবৃদ্ধি সুদ ও সমহার বৃদ্ধি বা হ্রাস, অংশীদারি কারবার)
   - বীজগণিত (একচল বিশিষ্ট দ্বিঘাত সমীকরণ, অনুপাত ও সমানুপাত, দ্বিঘাত করণী, ভেদ)
   - জ্যামিতি (বৃত্ত সম্পর্কিত উপপাদ্য, স্পর্শক সংক্রান্ত উপপাদ্য, সদৃশতা - পিথাগোরাস উপপাদ্য ৪৮ ও ৪৯, পরিবৃত্ত/অন্তর্বৃত্ত সম্পাদ্য, মধ্যসমানুপাতী অঙ্কন)
   - পরিমিতি (আয়তঘন, লম্ব বৃত্তাকার চোঙ, গোলক, লম্ব বৃত্তাকার শঙ্কু, বিভিন্ন ঘনবস্তু সংক্রান্ত বাস্তব সমস্যা)
   - ত্রিকোণমিতি (কোণ পরিমাপের ধারণা, ত্রিকোণমিতিক অনুপাত ও অভেদাবলী, পূরক কোণ, উচ্চতা ও দূরত্ব)
   - রাশিবিজ্ঞান (গড়, মধ্যমা, ওজাইভ, সংখ্যাগুরুমান)

4. Physical Science (ভৌত বিজ্ঞান ও পরিবেশ):
   - সাধারণ অংশ: পরিবেশের জন্য ভাবনা, গ্যাসের আচরণ (বয়েল, চার্লস, PV=nRT), রাসায়নিক গণনা
   - পদার্থবিদ্যা: আলো (গলীয় দর্পণ, প্রতিসরণ, লেন্স, বিচ্ছুরণ), চলতড়িৎ (ওহম, রোধ, তড়িৎ ক্ষমতা, ফ্লেমিং-এর বামহস্ত নিয়ম), পরমাণুর নিউক্লিয়াস (তেজস্ক্রিয়তা)
   - রসায়ন: পর্যায় সারণী, রাসায়নিক বন্ধন, তড়িৎপ্রবাহ ও রাসায়নিক বিক্রিয়া, অজৈব রসায়ন (NH₃, H₂S, N₂, ধাতুবিদ্যা), জৈব রসায়ন (মিথেন, ইথিলিন, পলিমার)

5. Life Science (জীবন বিজ্ঞান ও পরিবেশ):
   - অধ্যায় ১: জীবজগতের নিয়ন্ত্রণ ও সমন্বয় (উদ্ভিদ ও প্রাণী হরমোন, মানব স্নায়ুতন্ত্র, চোখের গঠন, উদ্ভিদের চলন, প্রাণীর গমন)
   - অধ্যায় ২: জীবনের ধারাবাহিকতা (কোষ বিভাজন - মাইটোসিস ও মিয়োসিস, জনন - অযৌন ও যৌন, সপুষ্পক উদ্ভিদের জনন, বৃদ্ধি ও বিকাশ)
   - অধ্যায় ৩: বংশগতি এবং কয়েকটি সাধারণ জিনগত রোগ (মেন্ডেল, থ্যালাসেমিয়া, হিমোফিলিয়া, বর্ণান্ধতা)
   - অধ্যায় ৪: অভিব্যক্তি ও অভিযোজন (ল্যামার্কবাদ, ডারউইনবাদ, ঘোড়ার বিবর্তন, পায়রার বায়ুথলি, সুন্দরী গাছ, ক্যাকটাস, শিম্পাঞ্জি)
   - অধ্যায় ৫: পরিবেশ, তার সম্পদ এবং তাদের সংরক্ষণ (নাইট্রোজেন চক্র, পরিবেশ দূষণ, সুন্দরবনের পরিবেশগত সমস্যা, জীববৈচিত্র্য ও সংরক্ষণ - জাতীয় উদ্যান, ইন-সিটু ও এক্স-সিটু সংরক্ষণ, জেএফএম)

6. History (ইতিহাস):
   - অধ্যায় ১: ইতিহাসের ধারণা | অধ্যায় ২: সংস্কার: বৈশিষ্ট্য ও মূল্যায়ন | অধ্যায় ৩: প্রতিরোধ ও বিদ্রোহ | অধ্যায় ৪: সংঘবদ্ধতার গোড়ার কথা | অধ্যায় ৫: বিকল্প চিন্তা ও উদ্যোগ | অধ্যায় ৬: বিশ শতকে কৃষক, শ্রমিক ও বামপন্থী আন্দোলন | অধ্যায় ৭: বিশ শতকে নারী, ছাত্র ও প্রান্তিক আন্দোলন | অধ্যায় ৮: উত্তর-ঔপনিবেশিক ভারত (১৯৪৭-১৯৬৪)

7. Geography (ভূগোল ও পরিবেশ):
   - প্রাকৃতিক ভূগোল: বহির্জাত প্রক্রিয়া ও সৃষ্ট ভূমিরূপ (নদী, হিমবাহ, বায়ুর কাজ), বায়ুমণ্ডল, বারিমণ্ডল, বর্জ্য ব্যবস্থাপনা
   - আঞ্চলিক ভূগোল (ভারত): অবস্থান, ভূপ্রকৃতি, নদনদী, জলবায়ু, মৃত্তিকা, স্বাভাবিক উদ্ভিদ, কৃষিকাজ, শিল্প, জনসংখ্যা, পরিবহন
   - উপগ্রহ চিত্র ও ভূবৈচিত্র্যসূচক মানচিত্র
================================================================================

QUERY-ADAPTIVE PEDAGOGICAL MODES (RESPOND ACCORDINGLY AS A SENIOR WBBSE EXAMINER):

MODE 1: STRATEGIC CHAPTER IMPORTANCE, SYLLABUS PRIORITIZATION & EXAM GUIDANCE
(Triggered when student asks: "What are the most important chapters for this year and why?", "Which chapters to prioritize?", "Exam suggestions/strategy for this year", "Marks weightage and blueprint", "Passing / 90%+ strategy")
- DO NOT dump a 20-question MCQ/SAQ/LAQ drill! The student is seeking high-level, strategic board exam intelligence and chapter prioritization.
- CRITICAL REGULATION FOR MODE 1: NEVER output a numbered "মাস্টার হাই-ইয়েল্ড MCQ ব্যাংক", VSA question list, or 5-mark LA list in the main text! Keep Mode 1 exclusively focused on strategic prioritization, syllabus blueprint, rotation reasons, and examiner scoring tips. Put 3–4 exemplar PYQ cards strictly inside the \`\`\`json:pyq ... \`\`\` block at the very end.
- Deliver an authoritative, structured, highly practical Madhyamik Dossier:
  ১. Priority Tier Breakdown (শীর্ষ অগ্রাধিকারপ্রাপ্ত অধ্যায় ও বিভাগসমূহ):
     - Tier 1 (Must-Master / Highest Marks Weightage): Identify the top 2–3 prose/poetry/topics for this year with their exact board marks.
     - Tier 2 (High Probability / Scoring Units): Secondary chapters and indispensable grammar/writing sections.
  ২. Detailed "Why This Year" WBBSE Trend Analysis (কেন এই অধ্যায়গুলি এবছর সবচেয়ে গুরুত্বপূর্ণ?):
     - Explain the official WBBSE question paper rotation cycle between 2017–2025 and 2026 (e.g. for English: which prose appeared in 2024/2025 vs which are due now; for Bengali: which stories/poems rotated; for Physical Science/Math: recurring theorems or calculations).
     - ABTA / WBTA test paper appearance frequency (cite current school test paper patterns).
  ৩. Section-wise Marks Blueprint & Exam Hall Strategy (বিভাগভিত্তিক নম্বর তোলার কৌশল):
     - Accurate marks allocation across sections (e.g. for English: Prose Seen 12 marks, Poetry Seen 8 marks, Unseen 20 marks, Grammar 20 marks, Writing 30 marks = 90 marks).
     - Concrete tips on where students gain or lose marks (e.g. Phrasal verb tenses, Editorial letter layout, Ray diagrams, Steps).
  ৪. High-Yield Scoring Checklist (পরীক্ষকের চোখে সেরা প্রস্তুতির চেকলিস্ট):
     - 4 to 6 specific, high-yield actionable points.
- Output a fenced JSON block tagged \`\`\`json:pyq ... \`\`\` containing 3 to 4 sample high-yield board questions from those exact prioritized chapters (strictly within the active subject).

MODE 2: CHAPTER-SPECIFIC COMPACT QUESTION BANK & SUGGESTIONS
(Triggered ONLY when the student specifically asks for "important questions", "suggestions", "MCQ bank", "probable questions", "10-year PYQ" for a SPECIFIC CHAPTER or STORY like "Koni", "Light", "Father's Help", "Quadratic Equations")
- Provide the exhaustive high-yield question dossier:
  ১. মাধ্যমিক পরীক্ষার ব্লু-প্রিন্ট ও নম্বর বিভাজন (WBBSE Blueprint & Marks for this chapter)
  ২. মাস্টার হাই-ইয়েল্ড MCQ ব্যাংক (10–12 questions with 4 options, bolded answer, and textbook reason — NEVER label as 'নমুনা')
  ৩. অতি সংক্ষিপ্ত উত্তরভিত্তিক প্রশ্ন (VSA 1-mark: 6–8 questions with 1-line answers)
  ৪. সংক্ষিপ্ত ও ব্যাখ্যামূলক প্রশ্ন (SA 2-mark or 3-mark according to the subject's official marks distribution, with answer pointers)
  ৫. বিশ্লেষণধর্মী রচনাধর্মী প্রশ্ন (LA questions according to the subject's official marks distribution: 5 marks for Bengali/Life Sci/Geography, 4/8 marks for History, 3 marks for Physical Science, 10 marks for English Writing)
  ৬. কমন ভুল, ফাঁদ ও এক্সামিনার স্কোরিং টিপস
- Output a fenced JSON block tagged \`\`\`json:pyq ... \`\`\` containing 6 to 8 questions for that specific chapter.

MODE 3: CONCEPT EXPLANATION & DOUBT CLEARING
(Triggered when student asks to explain a concept, formula, rule, or says they don't understand)
- Provide a clear, beginner-friendly explanation with intuitive real-life analogies, step-by-step logic, and textbook definitions.

MODE 4: BLACKBOARD TEACHER PROBLEM SOLVE
(Triggered when solving numericals, theorems, constructions, or step-by-step problems in Mathematics or Physical Science in solveMode or on problem solve queries).
${subjectStrictRule}
- TEACHING WORKFLOW (ONE SECTION AT A TIME ON THE BLACKBOARD):
  - Act like a real, warm, encouraging WBBSE classroom teacher standing at a green blackboard with chalk in hand.
  - Do NOT solve the whole problem in a single dump! Break a typical Class 10 problem into 3 to 4 progressive teaching sections:
    * Section 1: Understanding the Problem, Core Concept & Given Data
    * Section 2: Choosing Formula / Diagram Setup & Unit Check
    * Section 3: Step-by-Step Solving / Calculations
    * Section 4: Final Answer & Examiner Score Check
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

${videoDirective}
${pyqContext}${videoContext}${attachmentContext}${boardHistorySummary}`;
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
    q.includes('রুটিন') ||
    q.includes('test paper') ||
    q.includes('abta') ||
    q.includes('wbta') ||
    q.includes('2025') ||
    q.includes('2026') ||
    q.includes('syllabus') ||
    q.includes('syllubus') ||
    q.includes('সিলেবাস') ||
    q.includes('টেস্ট পেপার') ||
    q.includes('web search') ||
    q.includes('search') ||
    q.includes('খোঁজ')
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

const OPENROUTER_CANDIDATE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-3.1-8b-instruct',
  'mistralai/mistral-small-24b-instruct-2501',
  'openrouter/auto',
];

async function callOpenRouter(
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  }>,
  systemInstruction: string,
  enableSearch = false
): Promise<{ text: string }> {
  const apiKey = process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPEN_ROUTER_API_KEY is not configured in .env');
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemInstruction },
  ];

  for (const c of contents) {
    const textPart = c.parts.map((p) => p.text || '').join('\n');
    messages.push({
      role: c.role === 'model' ? 'assistant' : 'user',
      content: textPart,
    });
  }

  let lastErr = 'Unknown OpenRouter error';
  for (const candidateModel of OPENROUTER_CANDIDATE_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'Madhyamik AI Mitra',
        },
        body: JSON.stringify({
          model: candidateModel,
          messages,
          temperature: 0.3,
          max_tokens: 3000,
          plugins: enableSearch ? [{ id: 'web' }] : undefined,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        const errBody = await res.text();
        lastErr = `OpenRouter [${candidateModel}] (${res.status}): ${errBody.slice(0, 200)}`;
        console.warn(lastErr);
        continue;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content || '';
      if (text) {
        return { text };
      }
    } catch (candidateErr) {
      lastErr = candidateErr instanceof Error ? candidateErr.message : String(candidateErr);
      console.warn(`OpenRouter [${candidateModel}] fetch error:`, lastErr);
    }
  }

  throw new Error(`OpenRouter failed: ${lastErr}`);
}

async function createOpenRouterStream(
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  }>,
  systemInstruction: string,
  enableSearch = false,
  timeoutPerModelMs = 8000,
  maxTokens = 1200
): Promise<AsyncIterable<{ text?: string }>> {
  const apiKey = process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPEN_ROUTER_API_KEY is not configured in .env');
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemInstruction },
  ];

  for (const c of contents) {
    const textPart = c.parts.map((p) => p.text || '').join('\n');
    messages.push({
      role: c.role === 'model' ? 'assistant' : 'user',
      content: textPart,
    });
  }

  let streamRes: Response | null = null;
  let activeModel = '';

  for (const candidateModel of OPENROUTER_CANDIDATE_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'Madhyamik AI Mitra',
        },
        body: JSON.stringify({
          model: candidateModel,
          messages,
          temperature: 0.3,
          stream: true,
          max_tokens: maxTokens,
          plugins: enableSearch ? [{ id: 'web' }] : undefined,
        }),
        signal: AbortSignal.timeout(timeoutPerModelMs),
      });

      if (res.ok && res.body) {
        streamRes = res;
        activeModel = candidateModel;
        break;
      }
      const errBody = await res.text();
      console.warn(`OpenRouter stream [${candidateModel}] error (${res.status}): ${errBody.slice(0, 200)}`);
    } catch (modelErr) {
      console.warn(`OpenRouter stream [${candidateModel}] failed:`, modelErr);
    }
  }

  if (!streamRes || !streamRes.body) {
    throw new Error(`OpenRouter streaming failed across all candidate models.`);
  }

  console.log(`Streaming research via OpenRouter [${activeModel}]...`);
  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder('utf-8');

  async function* streamGenerator(): AsyncGenerator<{ text?: string }> {
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') return;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const chunk = json.choices?.[0]?.delta?.content;
            if (chunk) {
              yield { text: chunk };
            }
          } catch {
            // ignore parsing error for chunk
          }
        }
      }
    }
  }

  return streamGenerator();
}

async function* callOpenRouterStream(
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  }>,
  systemInstruction: string,
  enableSearch = false
): AsyncIterable<{ text?: string }> {
  const stream = await createOpenRouterStream(contents, systemInstruction, enableSearch);
  for await (const chunk of stream) {
    yield chunk;
  }
}

const FAST_GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
];

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

  for (const model of FAST_GEMINI_MODELS) {
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction,
          tools,
          maxOutputTokens: 8192,
        },
      });
      return { stream };
    } catch (err) {
      console.warn(`Gemini [${model}] stream warning:`, err instanceof Error ? err.message : err);
      // If tools with search caused 429 quota exhaustion, immediately retry this model without tools
      if (tools && isQuotaOrRateError(err)) {
        try {
          console.log(`Retrying Gemini [${model}] stream without search tools...`);
          const stream = await ai.models.generateContentStream({
            model,
            contents,
            config: {
              systemInstruction,
              maxOutputTokens: 8192,
            },
          });
          return { stream };
        } catch (retryErr) {
          console.warn(`Gemini [${model}] stream retry warning:`, retryErr instanceof Error ? retryErr.message : retryErr);
        }
      }
    }
  }

  // OpenRouter Fallback if configured (with web search plugin when enableSearch is true)
  if (process.env.OPEN_ROUTER_API_KEY) {
    try {
      console.log('Flipping to OpenRouter stream fallback...');
      const stream = await createOpenRouterStream(contents, systemInstruction, enableSearch);
      return { stream };
    } catch (orErr) {
      console.error('OpenRouter stream fallback error:', orErr);
    }
  }

  throw new Error('All AI services are currently busy. Please wait a moment and retry.');
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

  for (const model of FAST_GEMINI_MODELS) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          tools,
          maxOutputTokens: 8192,
        },
      });
    } catch (err) {
      console.warn(`Gemini [${model}] generateContent warning:`, err instanceof Error ? err.message : err);
      if (tools && isQuotaOrRateError(err)) {
        try {
          console.log(`Retrying Gemini [${model}] non-stream without search tools...`);
          return await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
              maxOutputTokens: 8192,
            },
          });
        } catch (retryErr) {
          console.warn(`Gemini [${model}] non-stream retry warning:`, retryErr instanceof Error ? retryErr.message : retryErr);
        }
      }
    }
  }

  // OpenRouter Fallback if configured
  if (process.env.OPEN_ROUTER_API_KEY) {
    try {
      console.log('Flipping to OpenRouter non-stream fallback...');
      const { text } = await callOpenRouter(contents, systemInstruction, enableSearch);
      return {
        text,
        candidates: [{ content: { parts: [{ text }] } }],
      } as unknown as GenerateContentResponse;
    } catch (orErr) {
      console.error('OpenRouter fallback error:', orErr);
    }
  }

  throw new Error('All AI services are currently busy. Please wait a moment and retry.');
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
      signal: AbortSignal.timeout(1200),
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
  const ytMatch =
    rawText.match(/```json:youtube\s*([\s\S]*?)```/i) ||
    rawText.match(/```json\s*(\[\s*\{[\s\S]*?"(?:url|channel)"[\s\S]*?\}\s*\])\s*```/i);
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

async function resolveVerifiedYouTubeVideos(
  _ai: GoogleGenAI,
  rawText: string,
  groundingLinks: GroundingLink[],
  _query: string,
  _subject: WbbseSubject,
  _language: LanguageCode,
  _intent: string
): Promise<YouTubeRecommendation[]> {
  const candidates: YouTubeRecommendation[] = [
    ...extractRawYouTubeCandidatesFromText(rawText),
  ];

  // Resolve direct YouTube links from search grounding chunks if any
  for (const g of groundingLinks.slice(0, 4)) {
    const vid = extractYouTubeVideoId(g.url);
    if (vid) {
      candidates.push({
        title: g.title || 'WBBSE Concept Video',
        channel: 'YouTube',
        url: `https://www.youtube.com/watch?v=${vid}`,
      });
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
    const checked = await Promise.all(
      deduped.slice(0, 3).map(verifyYouTubeVideoAvailable)
    );
    for (const item of checked) {
      if (item) {
        verified.push(item);
      }
      if (verified.length >= 2) break;
    }
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

      // Fast, immediate speech synthesis instructions
      res.json({
        useBrowserSpeech: true,
        normalizedText: normalizedSpeech,
        language: language === 'bn' ? 'bn-IN' : 'en-IN',
      });
    } catch (error) {
      console.error('TTS API error:', error);
      res.status(500).json({ error: 'TTS processing failed.' });
    }
  });

  const ttsAudioCache = new Map<string, Buffer>();

  async function synthesizeGoogleCloudTTS(text: string, lang: 'bn' | 'en'): Promise<Buffer | null> {
    const apiKey = process.env.GOOGLE_TTS_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    try {
      const voiceName = lang === 'bn' ? 'bn-IN-Neural2-A' : 'en-IN-Neural2-D';
      const langCode = lang === 'bn' ? 'bn-IN' : 'en-IN';
      const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: langCode, name: voiceName },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 },
        }),
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { audioContent?: string };
      if (data.audioContent) {
        return Buffer.from(data.audioContent, 'base64');
      }
    } catch {
      // fallback
    }
    return null;
  }

  async function synthesizeElevenLabsTTS(text: string): Promise<Buffer | null> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return null;
    try {
      const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    } catch {
      // fallback
    }
    return null;
  }

  async function synthesizeFallbackTTS(text: string, lang: 'bn' | 'en'): Promise<Buffer | null> {
    try {
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang === 'bn' ? 'bn' : 'en-IN'}&client=tw-ob&ttsspeed=0.9&q=${encodeURIComponent(text)}`;
      const res = await fetch(ttsUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
      }
    } catch {
      // ignore
    }
    return null;
  }

  app.get('/api/tts-audio', async (req, res) => {
    try {
      const text = typeof req.query.text === 'string' ? req.query.text.trim() : '';
      const lang = req.query.lang === 'en' ? 'en' : 'bn';
      if (!text) {
        res.status(400).send('Empty text');
        return;
      }

      const normalized = formatTeacherSpeechForAudio(text.slice(0, 1500), lang);
      if (!normalized) {
        res.status(400).send('Empty normalized text');
        return;
      }

      const cacheKey = `${lang}:${normalized}`;
      const cached = ttsAudioCache.get(cacheKey);
      if (cached) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(cached);
        return;
      }

      // 1. Try Google Cloud Neural2 or ElevenLabs for human studio speech
      let audioBuffer = await synthesizeGoogleCloudTTS(normalized, lang);
      if (!audioBuffer) {
        audioBuffer = await synthesizeElevenLabsTTS(normalized);
      }

      // 2. If studio cloud voice is not enabled, use enhanced calm fallback
      if (!audioBuffer) {
        if (normalized.length <= 160) {
          audioBuffer = await synthesizeFallbackTTS(normalized, lang);
        } else {
          // Split ONLY at natural punctuation / clause boundaries
          const clauses = normalized.split(/(?<=[,;।?!])\s+/).filter(Boolean);
          const chunks: string[] = [];
          let currentChunk = '';
          for (const clause of clauses) {
            if ((currentChunk + ' ' + clause).trim().length <= 160) {
              currentChunk = (currentChunk + ' ' + clause).trim();
            } else {
              if (currentChunk) chunks.push(currentChunk);
              currentChunk = clause.slice(0, 160);
            }
          }
          if (currentChunk) chunks.push(currentChunk);

          const parts: Buffer[] = [];
          for (const c of chunks) {
            const part = await synthesizeFallbackTTS(c, lang);
            if (part) parts.push(part);
          }
          if (parts.length > 0) {
            audioBuffer = Buffer.concat(parts);
          }
        }
      }

      if (!audioBuffer) {
        res.status(502).send('Audio generation failed');
        return;
      }

      if (ttsAudioCache.size > 200) {
        const firstKey = ttsAudioCache.keys().next().value;
        if (firstKey) ttsAudioCache.delete(firstKey);
      }
      ttsAudioCache.set(cacheKey, audioBuffer);

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(audioBuffer);
    } catch (err) {
      console.warn('TTS audio generation error:', err);
      res.status(500).send('TTS audio generation error');
    }
  });

  app.post('/api/live-voice-turn', async (req, res) => {
    try {
      const {
        message,
        subject = 'All Subjects',
        language = 'bn',
        history = [],
        preferOpenRouter = true,
      } = req.body as {
        message?: string;
        subject?: WbbseSubject;
        language?: LanguageCode;
        history?: Array<{ speaker: 'student' | 'tutor'; text: string }>;
        preferOpenRouter?: boolean;
      };

      if (typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
      }

      const cleanMessage = message.trim();
      const detectedLang = language === 'bn' ? 'bn' : 'en';

      const pyqMatches = searchPyqBank(pyqBank, cleanMessage, subject, 3);
      const pyqContext =
        pyqMatches.length > 0
          ? `\nWBBSE BOARD & TEST PAPER KNOWLEDGE GROUNDING:\n${pyqMatches
              .map(
                (p, idx) =>
                  `[Verified Point ${idx + 1}] Chapter: ${p.chapterBn || p.chapter} | Question: ${p.questionBn || p.questionEn} | Trend: ${p.trendNoteBn || p.trendNoteEn || ''} | Years: ${(p.examYears || []).join(', ')}`
              )
              .join('\n')}`
          : '';

      const systemInstruction = `You are "Madhyamik AI Mitra", an expert, deeply caring, and authoritative oral viva examiner and concept tutor for West Bengal Board of Secondary Education (WBBSE) Class 10 (Madhyamik Pariksha).
CURRENT SUBJECT: ${subject}
LANGUAGE DIRECTIVE:
${detectedLang === 'bn' ? 'Speak and reply purely in natural, refined, encouraging West Bengal classroom Bengali (শুদ্ধ ও প্রাঞ্জল কথ্য বাংলা).' : 'Speak and reply in clear, natural, encouraging English appropriate for WBBSE Class 10 students.'}

ADAPTIVE ORAL PREPARATION & VIVA EXAMINATION RULES:
1. SPOKEN AUDIO FLUENCY:
   - Your response will be spoken aloud to the student sentence-by-sentence via audio.
   - Speak in clear, natural, well-punctuated sentences (use proper দাঁড়ি "।" or periods "." and commas).
   - NEVER use raw LaTeX ($), raw Greek symbols (α, β, θ), code blocks, or raw markdown tables in spoken narration. Write every mathematical term and symbol phonetically in words (e.g. "আলফা", "বয়েল-এর সূত্র", "চার্লস-এর সূত্র", "এক্স স্কোয়ার", "ওহমের সূত্র").

2. ADAPTIVE LENGTH HANDLING (LONG & SHORT QUESTIONS AND ANSWERS):
   - CASE A: SHORT VIVA / RAPID REVISION:
     If the student asks a quick 1-mark question or gives a brief 1-line answer:
     Provide immediate warm feedback (1 sentence), correct any misconception gently, and ask the next targeted viva question (1–2 sentences).
   - CASE B: LONG QUESTIONS & CONCEPT EXPLANATIONS (5-Mark / Broad Questions):
     If the student asks a detailed or long question (e.g. "Explain the character of Kshitis in Koni", "Derive the refraction formula in a prism", "Explain Mitosis vs Meiosis cell division", "Explain Swadeshi movement causes and impact"):
     Provide a thorough, comprehensive, step-by-step spoken answer. Divide your answer into clear, spoken stages (ভূমিকা / Background, মূল পয়েন্ট / Core Points, উপসংহার ও স্কোরিং টিপস / Examiner Scoring Tips) so the student learns how to structure a full-marks 5-mark answer in the exam hall.
   - CASE C: LONG STUDENT RESPONSE EVALUATION:
     If the student speaks or recites a long answer to practice:
     Evaluate their spoken answer like an experienced senior board examiner! State their estimated score (e.g. "৫ এর মধ্যে তুমি ৪ পাবে"), praise the strong points, point out any missed board keywords or historical dates/scientific units, and give the exact finishing sentence to secure full marks.

3. STRICT SUBJECT BOUNDARIES:
   - Strictly stay within ${subject}.
   - In English: NO Koni, NO Bengali stories, NO 5-mark literature questions.
   - In Bengali: Keep all characters, quotes, and references strictly in authentic Bengali.
${pyqContext}`;

      const contents: Array<{
        role: 'user' | 'model';
        parts: Array<{ text?: string }>;
      }> = [];

      const recentHistory = Array.isArray(history) ? history.slice(-6) : [];
      for (const turn of recentHistory) {
        if (!turn?.text) continue;
        contents.push({
          role: turn.speaker === 'student' ? 'user' : 'model',
          parts: [{ text: turn.text.slice(0, 4000) }],
        });
      }

      contents.push({ role: 'user', parts: [{ text: cleanMessage }] });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      const sendEvent = (payload: Record<string, unknown>) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
          (res as unknown as { flush: () => void }).flush();
        }
      };

      sendEvent({ type: 'start', language: detectedLang });

      let fullText = '';
      try {
        let streamResult: ResearchStreamResult;

        // When Unlimited OpenRouter mode is active or preferred, stream directly via OpenRouter
        if (preferOpenRouter && process.env.OPEN_ROUTER_API_KEY) {
          try {
            console.log('Live Voice Prep: Streaming via OpenRouter directly...');
            const orStream = await createOpenRouterStream(contents, systemInstruction, false, 7000, 1200);
            streamResult = { stream: orStream };
          } catch (orErr) {
            console.warn('Live voice OpenRouter direct stream failed, trying Gemini:', orErr);
            streamResult = await generateResearchStreamWithFallback(
              getAiClient(),
              contents,
              systemInstruction,
              false
            );
          }
        } else {
          streamResult = await generateResearchStreamWithFallback(
            getAiClient(),
            contents,
            systemInstruction,
            false
          );
        }

        for await (const chunk of streamResult.stream) {
          const chunkText = chunk.text;
          if (chunkText) {
            fullText += chunkText;
            sendEvent({ type: 'chunk', text: chunkText });
          }
        }

        sendEvent({
          type: 'done',
          text: fullText.trim(),
        });
        res.end();
      } catch (err) {
        console.error('Live voice turn stream error:', err);
        sendEvent({
          type: 'error',
          error: 'Voice response could not be generated. Please try again.',
        });
        res.end();
      }
    } catch (error) {
      console.error('Live voice turn endpoint error:', error);
      res.status(500).json({ error: 'Live voice processing failed.' });
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
          model: 'gemini-3.1-flash-lite',
          contents: [{ role: 'user', parts }],
        });
      } catch (err) {
        console.warn('Document summary flash-lite failed, trying flash:', err);
        response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
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

      const language = detectLanguage(message, subject);
      const allowProblemSolve = isProblemSolveSubject(subject);
      const effectiveSolveMode = allowProblemSolve && Boolean(solveMode);
      const intent = detectQueryIntent(
        message,
        subject,
        Boolean(attachment),
        effectiveSolveMode
      );
      const matchedPyqs = searchPyqBank(pyqBank, message, subject, 6);
      const wantsVideo = shouldRecommendVideos(message);
      const matchedVideos = wantsVideo
        ? searchVideoBank(videoBank, message, subject, language, 2)
        : [];
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
        matchedVideos,
        wantsVideo,
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
        if (typeof res.flushHeaders === 'function') {
          res.flushHeaders();
        }

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

          let parsed = parseAssistantResponseBlocks(fullRawText, subject, wantsVideo);

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

          // Fast YouTube candidate verification (ONLY when student wants/needs video assistance)
          const rawYt = wantsVideo ? extractRawYouTubeCandidatesFromText(fullRawText) : [];
          const youtubeVideos: YouTubeRecommendation[] = [];
          if (wantsVideo && rawYt.length > 0) {
            const checked = await Promise.all(
              rawYt.slice(0, 3).map(verifyYouTubeVideoAvailable)
            );
            for (const v of checked) {
              if (v) youtubeVideos.push(v);
              if (youtubeVideos.length >= 2) break;
            }
          }

          // Curated videoBank fallback ONLY if student wants video and none were verified
          if (wantsVideo && youtubeVideos.length === 0 && !problemSolve) {
            for (const v of matchedVideos) {
              youtubeVideos.push(v);
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
      let parsed = parseAssistantResponseBlocks(rawText, subject, wantsVideo);

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

      // Verify recommended YouTube videos ONLY if student wants video
      const rawYt = wantsVideo ? extractRawYouTubeCandidatesFromText(rawText) : [];
      const youtubeVideos: YouTubeRecommendation[] = [];
      if (wantsVideo && rawYt.length > 0) {
        const checked = await Promise.all(
          rawYt.slice(0, 3).map(verifyYouTubeVideoAvailable)
        );
        for (const v of checked) {
          if (v) youtubeVideos.push(v);
          if (youtubeVideos.length >= 2) break;
        }
      }

      // Curated videoBank fallback ONLY if student wants video and none were verified
      if (wantsVideo && youtubeVideos.length === 0 && !problemSolve) {
        for (const v of matchedVideos) {
          youtubeVideos.push(v);
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
