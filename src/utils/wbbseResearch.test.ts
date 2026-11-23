import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { PyqBankEntry, StudySession, WbbseVideoEntry } from '../types.ts';
import {
  cleanVoiceRecognitionText,
  deduplicateConsecutiveWords,
  detectLanguage,
  detectQueryIntent,
  extractYouTubeVideoId,
  formatLiveTranscriptSummary,
  formatTeacherSpeechForAudio,
  getVisibleSubjects,
  groupSessionsByDate,
  isProblemSolveSubject,
  isSupportedDocumentType,
  isValidFirestoreId,
  normalizeYouTubeUrl,
  parseAssistantResponseBlocks,
  parseAuthError,
  sanitizeMessageForStorage,
  searchPyqBank,
  searchVideoBank,
  shouldRecommendVideos,
  splitSpeechIntoSentences,
  stripInternalFences,
} from './wbbseResearch.ts';

const pyqBankPath = path.resolve(process.cwd(), 'src/data/wbbse_pyq_bank.json');
const pyqBank = JSON.parse(fs.readFileSync(pyqBankPath, 'utf-8')) as PyqBankEntry[];

const videoBankPath = path.resolve(process.cwd(), 'src/data/wbbse_video_bank.json');
const videoBank = JSON.parse(fs.readFileSync(videoBankPath, 'utf-8')) as WbbseVideoEntry[];

test('detectLanguage recognizes Bengali Unicode script', () => {
  assert.equal(detectLanguage('ভৌত বিজ্ঞান আলোর প্রতিসরণ সহজ ভাষায় বোঝাও'), 'bn');
});

test('detectLanguage recognizes Banglish queries', () => {
  assert.equal(detectLanguage('Alor protisaron shohoj bhashay bojhao'), 'bn');
  assert.equal(detectLanguage('Physical Science er kichu guruttopurno proshno dao'), 'bn');
});

test('detectLanguage keeps English queries in English', () => {
  assert.equal(
    detectLanguage('Physical Science Light chapter 10-year important questions'),
    'en'
  );
  assert.equal(detectLanguage('Explain Ohm law with simple everyday examples'), 'en');
});

test('detectQueryIntent distinguishes PYQ vs Concept queries', () => {
  assert.equal(detectQueryIntent('10-year important questions for Life Science'), 'pyq');
  assert.equal(detectQueryIntent('ভৌত বিজ্ঞান আলোর প্রতিসরণ সহজ ভাষায় বোঝাও'), 'concept');
});

test('searchPyqBank returns subject-scoped matches across all 7 subjects', () => {
  const subjects = [
    'Physical Science',
    'Life Science',
    'Mathematics',
    'History',
    'Geography',
    'Bengali',
    'English',
  ] as const;

  for (const subj of subjects) {
    const results = searchPyqBank(pyqBank, 'important questions', subj, 5);
    assert.ok(results.length >= 1, `Expected PYQ entries for ${subj}`);
    assert.ok(results.every((r) => r.subject === subj));
  }

  const lightResults = searchPyqBank(pyqBank, 'Snell prism refraction', 'Physical Science', 3);
  assert.equal(lightResults[0]?.id, 'ps-light-01');
});

test('parseAssistantResponseBlocks extracts PYQ cards and strictly caps YouTube links to 2', () => {
  const sample = `Here is your analysis.

\`\`\`json:pyq
[
  {
    "question": "State Snell's law of refraction.",
    "years": [2017, 2019, 2024],
    "marks": "3 Marks",
    "importance": "High Probability",
    "trendNote": "Tested every 2-3 years."
  }
]
\`\`\`

\`\`\`json:youtube
[
  { "title": "Video 1", "channel": "Channel A", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  { "title": "Video 2", "channel": "Channel B", "url": "https://youtu.be/jNQXAC9IVRw" },
  { "title": "Video 3", "channel": "Channel C", "url": "https://www.youtube.com/watch?v=M7lc1UVf-VE" }
]
\`\`\`
`;

  const parsed = parseAssistantResponseBlocks(sample);
  assert.equal(parsed.cleanText, 'Here is your analysis.');
  assert.equal(parsed.pyqItems.length, 1);
  assert.equal(parsed.pyqItems[0]?.importance, 'High Probability');
  assert.equal(parsed.youtubeVideos.length, 2);
});

test('groupSessionsByDate groups Today, Yesterday, Earlier accurately', () => {
  const now = new Date(2026, 10, 17, 15, 0, 0).getTime();
  const sessions: StudySession[] = [
    {
      id: 's1',
      userId: 'u1',
      title: 'Today session',
      subject: 'Physical Science',
      language: 'en',
      messageCount: 2,
      hasAttachment: false,
      createdAt: now - 1000,
      updatedAt: now - 1000,
    },
    {
      id: 's2',
      userId: 'u1',
      title: 'Yesterday session',
      subject: 'History',
      language: 'bn',
      messageCount: 4,
      hasAttachment: false,
      createdAt: now - 26 * 60 * 60 * 1000,
      updatedAt: now - 26 * 60 * 60 * 1000,
    },
    {
      id: 's3',
      userId: 'u1',
      title: 'Older session',
      subject: 'Mathematics',
      language: 'en',
      messageCount: 1,
      hasAttachment: false,
      createdAt: now - 72 * 60 * 60 * 1000,
      updatedAt: now - 72 * 60 * 60 * 1000,
    },
  ];

  const grouped = groupSessionsByDate(sessions, now);
  assert.deepEqual(
    grouped.map((g) => g.label),
    ['Today', 'Yesterday', 'Earlier']
  );
});

test('formatLiveTranscriptSummary formats bilingual live turns cleanly', () => {
  const text = formatLiveTranscriptSummary(
    [
      { speaker: 'student', text: 'ওহমের সূত্র কী?', timestamp: 1 },
      { speaker: 'tutor', text: 'স্থির উষ্ণতায় পরিবাহীর প্রবাহমাত্রা বিভব প্রভেদের সমানুপাতিক।', timestamp: 2 },
    ],
    'bn'
  );
  assert.ok(text.includes('শিক্ষার্থী:'));
  assert.ok(text.includes('মিত্র টিউটর:'));
});

test('isValidFirestoreId blocks oversized or invalid IDs', () => {
  assert.equal(isValidFirestoreId('sess_123-abc'), true);
  assert.equal(isValidFirestoreId('bad/id'), false);
  assert.equal(isValidFirestoreId('a'.repeat(200)), false);
});

test('getVisibleSubjects returns all 8 options for New Chat and only the selected subject once locked', () => {
  const newChatSubjects = getVisibleSubjects(null);
  assert.equal(newChatSubjects.length, 8);

  const allLocked = getVisibleSubjects('All Subjects');
  assert.equal(allLocked.length, 1);
  assert.equal(allLocked[0]?.id, 'All Subjects');

  const bengaliLocked = getVisibleSubjects('Bengali');
  assert.equal(bengaliLocked.length, 1);
  assert.equal(bengaliLocked[0]?.id, 'Bengali');
});

test('isSupportedDocumentType validates images, PDFs, and text files cleanly', () => {
  assert.equal(isSupportedDocumentType('math_problem.jpg', 'image/jpeg'), true);
  assert.equal(isSupportedDocumentType('abta_page.png', 'image/png'), true);
  assert.equal(isSupportedDocumentType('wbta_paper.pdf', 'application/pdf'), true);
  assert.equal(isSupportedDocumentType('notes.txt', 'text/plain'), true);
  assert.equal(isSupportedDocumentType('virus.exe', 'application/octet-stream'), false);
});

test('isProblemSolveSubject allows ONLY Mathematics and Physical Science', () => {
  assert.equal(isProblemSolveSubject('Mathematics'), true);
  assert.equal(isProblemSolveSubject('Physical Science'), true);
  assert.equal(isProblemSolveSubject('All Subjects'), false);
  assert.equal(isProblemSolveSubject('Life Science'), false);
  assert.equal(isProblemSolveSubject('History'), false);
  assert.equal(isProblemSolveSubject('Geography'), false);
  assert.equal(isProblemSolveSubject('Bengali'), false);
  assert.equal(isProblemSolveSubject('English'), false);
});

test('detectQueryIntent blocks problem_solve outside Mathematics and Physical Science', () => {
  assert.equal(
    detectQueryIntent('Give ABTA and WBTA test paper important questions for History'),
    'pyq'
  );
  assert.equal(
    detectQueryIntent('I am stuck on this quadratic equation problem', 'Mathematics', true, false),
    'problem_solve'
  );
  assert.equal(
    detectQueryIntent('Solve this Ohm law numerical step by step', 'Physical Science', false, true),
    'problem_solve'
  );
  assert.notEqual(
    detectQueryIntent('Solve this problem step by step', 'History', true, true),
    'problem_solve'
  );
  assert.notEqual(
    detectQueryIntent('Solve this quadratic equation', 'All Subjects', true, true),
    'problem_solve'
  );
  assert.notEqual(
    detectQueryIntent('Explain and solve this diagram', 'Life Science', true, true),
    'problem_solve'
  );
});

test('extractYouTubeVideoId and normalizeYouTubeUrl parse watch, shorts, and youtu.be URLs safely', () => {
  assert.equal(
    extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'),
    'dQw4w9WgXcQ'
  );
  assert.equal(extractYouTubeVideoId('https://youtu.be/jNQXAC9IVRw?si=abc'), 'jNQXAC9IVRw');
  assert.equal(extractYouTubeVideoId('https://youtube.com/shorts/M7lc1UVf-VE'), 'M7lc1UVf-VE');
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=short'), null);
  assert.equal(
    normalizeYouTubeUrl('https://youtu.be/jNQXAC9IVRw?si=abc'),
    'https://www.youtube.com/watch?v=jNQXAC9IVRw'
  );
});

test('parseAssistantResponseBlocks extracts Blackboard Teacher sections, subjectMismatch, and strips undefined fields for Firestore', () => {
  const sample = `Welcome to class! Let's inspect this section carefully.

\`\`\`json:problem_solve
{
  "subjectGuard": "Mathematics",
  "subjectMismatch": false,
  "topicTitle": "Quadratic Equations — Nature of Roots",
  "sectionNumber": 1,
  "estimatedTotalSections": 3,
  "isFinalSection": false,
  "sectionTitle": "Section 1: Identify Coefficients a, b, c",
  "teacherSpeech": "First, look closely at the standard quadratic form and compare our given equation.",
  "blackboardLines": [
    { "kind": "heading", "content": "Section 1: Standard Form & Given Coefficients" },
    { "kind": "formula", "content": "ax^2 + bx + c = 0" },
    { "kind": "work", "content": "Given: a = 2, b = -5, c = 3" }
  ],
  "boardHistory": [],
  "simplificationLevel": 1,
  "feedbackQuestion": "Did you understand how we extracted a, b, and c?"
}
\`\`\`
`;

  const parsed = parseAssistantResponseBlocks(sample);
  assert.equal(parsed.problemSolve?.subjectGuard, 'Mathematics');
  assert.equal(parsed.problemSolve?.subjectMismatch, false);
  assert.equal(parsed.problemSolve?.sectionNumber, 1);
  assert.equal(parsed.problemSolve?.isFinalSection, false);
  assert.equal(parsed.problemSolve?.blackboardLines?.length, 3);

  const sanitized = sanitizeMessageForStorage({
    id: 'msg_1',
    sessionId: 'sess_1',
    userId: 'u1',
    role: 'assistant',
    text: parsed.cleanText,
    language: 'en',
    subject: 'Mathematics',
    mode: 'problem_solve',
    problemSolve: parsed.problemSolve,
    createdAt: Date.now(),
  });

  // Ensure no undefined property values survive recursively for Firestore setDoc
  const serialized = JSON.stringify(sanitized, (_k, v) => (v === undefined ? '__UNDEF__' : v));
  assert.equal(serialized.includes('__UNDEF__'), false);

  const mismatchSample = `\`\`\`json:problem_solve
{
  "subjectGuard": "Mathematics",
  "subjectMismatch": true,
  "detectedSubject": "Physical Science",
  "mismatchReason": "Ohm's law belongs to Physical Science, not Mathematics.",
  "topicTitle": "Subject Scope Notice",
  "simplificationLevel": 1,
  "feedbackQuestion": "Start a new chat in Physical Science?"
}
\`\`\``;
  const mismatchParsed = parseAssistantResponseBlocks(mismatchSample);
  assert.equal(mismatchParsed.problemSolve?.subjectMismatch, true);
  assert.equal(mismatchParsed.problemSolve?.detectedSubject, 'Physical Science');
});

test('formatTeacherSpeechForAudio normalizes Greek letters, math symbols, and LaTeX for natural Bengali & English speech', () => {
  const bnOut = formatTeacherSpeechForAudio(
    'সমীকরণের একটি বীজ $α$ হলে অপরটি $2α$ এবং $x² + 1/2 = 5$ ও রোধ $10 Ω$ হবে।',
    'bn'
  );
  assert.equal(bnOut.includes('α'), false);
  assert.equal(bnOut.includes('$'), false);
  assert.equal(bnOut.includes('Ω'), false);
  assert.ok(bnOut.includes('আলফা'));
  assert.ok(bnOut.includes('স্কোয়ার'));
  assert.ok(bnOut.includes('ওহম'));

  const enOut = formatTeacherSpeechForAudio('Area is $π r²$ and current $I = V / R$ in Ω.', 'en');
  assert.ok(enOut.includes('pi'));
  assert.ok(enOut.includes('squared'));
  assert.ok(enOut.includes('equals'));
  assert.ok(enOut.includes('ohm'));
});

test('splitSpeechIntoSentences splits paragraphs into clean sentences without dropping text or breaking numbers', () => {
  const paragraph =
    'বয়েলের সূত্রে তাপমাত্রা স্থির থাকলে নির্দিষ্ট ভরের গ্যাসের আয়তন চাপের সঙ্গে ব্যস্তানুপাতে পরিবর্তিত হয়। অর্থাৎ চাপ বাড়লে আয়তন কমে। গ্যাসের আয়তন ২.৫ লিটার থেকে বৃদ্ধি পেয়ে ৫.০ লিটার হলো। এবার বলো তো, চাপ কতটা কমবে?';
  const sentences = splitSpeechIntoSentences(paragraph, 'bn', 160);
  assert.ok(sentences.length >= 3);
  // Decimal 2.5/5.0 was not split into separate pieces
  assert.ok(sentences.some((s) => s.includes('২.৫') && s.includes('৫.০')));
  // Terminal question preserved
  assert.ok(sentences[sentences.length - 1].includes('চাপ কতটা কমবে?'));
});

test('parseAuthError formats auth/unauthorized-domain with steps, links, and localization', () => {
  const err = new Error('Firebase: Error (auth/unauthorized-domain).');
  const parsed = parseAuthError(err, 'my-test-project');
  assert.ok(parsed !== null);
  assert.equal(parsed?.isUnauthorizedDomain, true);
  assert.ok(parsed?.firebaseConsoleUrl.includes('my-test-project'));
  assert.ok(parsed?.stepsEn.length >= 3);
  assert.ok(parsed?.stepsBn.length >= 3);
  assert.ok(parsed?.titleBn.includes('ফায়ারবেস'));

  const nullResult = parseAuthError(null);
  assert.equal(nullResult, null);

  const popupBlocked = parseAuthError(new Error('Firebase: Error (auth/popup-blocked).'));
  assert.equal(popupBlocked?.isUnauthorizedDomain, false);
  assert.ok(popupBlocked?.messageEn.includes('popup was blocked'));
});

test('stripInternalFences cleans completed and streaming unclosed JSON code blocks', () => {
  const completeSample = 'Let us solve this step.\n```json:problem_solve\n{"topic":"Math"}\n```\nGood luck!';
  assert.equal(stripInternalFences(completeSample), 'Let us solve this step.\n\nGood luck!');

  const streamingUnclosedSample = 'Here is the explanation.\n```json:problem_solve\n{"sectionNumber": 1, "topic":';
  assert.equal(stripInternalFences(streamingUnclosedSample), 'Here is the explanation.');

  const normalMarkdown = '### Theorem 48\nState and prove the theorem.\n```python\nprint("code")\n```';
  assert.ok(stripInternalFences(normalMarkdown).includes('Theorem 48'));
  assert.ok(stripInternalFences(normalMarkdown).includes('print("code")'));
});

test('sanitizeMessageForStorage strips isStreaming for strict Firestore compliance', () => {
  const sanitized = sanitizeMessageForStorage({
    id: 'msg_stream_1',
    sessionId: 'sess_1',
    userId: 'u1',
    role: 'assistant',
    text: 'Streaming test text',
    language: 'en',
    subject: 'All Subjects',
    mode: 'general',
    createdAt: Date.now(),
    isStreaming: true,
  });

  assert.equal('isStreaming' in sanitized, false);
  assert.equal((sanitized as unknown as Record<string, unknown>).isStreaming, undefined);
});

test('deduplicateConsecutiveWords collapses repeated single words and 2-word phrases', () => {
  const repeated =
    'Bangla Bangla Bangla Bangla Bangla Bangla important question বাংলা বাংলা গুরুত্বপূর্ণ গুরুত্বপূর্ণ প্রশ্ন প্রশ্ন Bangla important question Bangla important question';
  const deduped = deduplicateConsecutiveWords(repeated);
  assert.equal(
    deduped,
    'Bangla important question বাংলা গুরুত্বপূর্ণ প্রশ্ন Bangla important question'
  );
});

test('cleanVoiceRecognitionText normalizes Madhyamik terms and avoids repetitions', () => {
  const cleanedEn = cleanVoiceRecognitionText('madhamik wbbse pyqs ohms law', 'en');
  assert.equal(cleanedEn, "Madhyamik WBBSE PYQs Ohm's law");

  const cleanedBn = cleanVoiceRecognitionText('মাদ্যমিক উপপাদ বাংলা গুরুত্বপূর্ণ প্রশ্ন', 'bn');
  assert.equal(cleanedBn, 'মাধ্যমিক উপপাদ্য বাংলা গুরুত্বপূর্ণ প্রশ্ন');

  // Exact scenario from student speech recognition runaway repetition
  const runawayScreenshotText =
    'Bangla Bangla Bangla Bangla Bangla Bangla important question বাংলা গুরুত্বপূর্ণ প্রশ্ন গুলো দাও Bangla important question Bangla important question বাংলা গুরুত্বপূর্ণ প্রশ্ন গুলো দাও Bangla important question বাংলা গুরুত্বপূর্ণ প্রশ্ন গুলো দাও';
  const cleanedRunaway = cleanVoiceRecognitionText(runawayScreenshotText, 'bn');
  assert.ok(cleanedRunaway.includes('বাংলা গুরুত্বপূর্ণ প্রশ্ন'));
  // Ensure "Bangla" is not repeated 6+ times consecutively
  assert.equal(cleanedRunaway.includes('Bangla Bangla'), false);
  assert.equal(cleanedRunaway.includes('বাংলা বাংলা'), false);
});

test('detectLanguage prioritizes Bengali when subject is Bengali or Banglish has literature tokens', () => {
  // Query from user screenshot 2
  assert.equal(detectLanguage('Koni er important mcq questions', 'Bengali'), 'bn');
  assert.equal(detectLanguage('Koni er important mcq questions'), 'bn');
  assert.equal(detectLanguage('Gyanchokkhu theke 5-mark question dao', 'Bengali'), 'bn');
  assert.equal(detectLanguage('Explain Koni in English please', 'Bengali'), 'en');
});

test('searchVideoBank retrieves verified YouTube lectures for Light, Koni, and Quadratic Equations', () => {
  const lightVids = searchVideoBank(videoBank, 'আলোর প্রতিসরণ সহজ ভাষায় বোঝাও', 'Physical Science', 'bn');
  assert.ok(lightVids.length >= 1);
  assert.ok(lightVids[0].url.includes('youtube.com/watch?v=JsZFGZAd0kI'));
  assert.equal(lightVids[0].verified, true);

  const koniVids = searchVideoBank(videoBank, 'Koni er important mcq questions', 'Bengali', 'bn');
  assert.ok(koniVids.length >= 1);
  assert.ok(koniVids.some((v) => v.url.includes('0jRIAGmlI5A') || v.url.includes('RL4kxukV9yQ')));

  const mathVids = searchVideoBank(videoBank, 'একচলবিশিষ্ট দ্বিঘাত সমীকরণ সূত্র ও সমাধান', 'Mathematics', 'bn');
  assert.ok(mathVids.length >= 1);
  assert.ok(mathVids.some((v) => v.url.includes('YvMmgrdJqrE') || v.url.includes('bdaOnDO0Q8M')));
});

test('searchPyqBank returns rich high-yield entries for Koni and Bengali literature', () => {
  const koniPyqs = searchPyqBank(pyqBank, 'Koni er important mcq questions', 'Bengali', 5);
  assert.ok(koniPyqs.length >= 2, 'Expected multiple high-yield PYQ entries for Koni');
  assert.ok(koniPyqs.some((p) => p.id === 'ben-koni-04'));
  assert.ok(koniPyqs.some((p) => p.questionBn.includes('কোনি')));
});

test('parseAssistantResponseBlocks removes dangling empty YouTube tutorial headings when no videos exist', () => {
  const sampleWithDangling = `ভৌত বিজ্ঞান আলোর প্রতিসরণ নিয়ে আলোচনা:

### ইউটিউব ভিডিও টিউটোরিয়াল:
সহজভাবে বোঝার জন্য নিচের ভিডিওগুলো দেখতে পারো:

টিপস: পরীক্ষার খাতায় চিত্র অঙ্কন অপরিহার্য।`;

  const parsed = parseAssistantResponseBlocks(sampleWithDangling);
  assert.equal(parsed.youtubeVideos.length, 0);
  assert.equal(parsed.cleanText.includes('ইউটিউব ভিডিও টিউটোরিয়াল'), false);
  assert.equal(parsed.cleanText.includes('সহজভাবে বোঝার জন্য নিচের ভিডিওগুলো দেখতে পারো'), false);
  assert.ok(parsed.cleanText.includes('টিপস: পরীক্ষার খাতায়'));
});

test('shouldRecommendVideos only triggers when video is requested or student expresses difficulty', () => {
  assert.equal(shouldRecommendVideos('What are the most important chapters for this year and why?'), false);
  assert.equal(shouldRecommendVideos('কোনি গল্প এর গুরুত্বপূর্ণ প্রশ্ন গুলো দাও'), false);
  assert.equal(shouldRecommendVideos('Father Help unit 1 summary'), false);
  assert.equal(shouldRecommendVideos('ভৌত বিজ্ঞান আলোর প্রতিসরণ সহজ ভাষায় বোঝাও'), true);
  assert.equal(shouldRecommendVideos('I am not understanding refraction of light'), true);
  assert.equal(shouldRecommendVideos('Give me a youtube video for electric current'), true);
  assert.equal(shouldRecommendVideos('আলোর প্রতিসরণ বুঝতে পারছি না'), true);
});

test('parseAssistantResponseBlocks sanitizes cross-subject hallucinations (Koni in English)', () => {
  const mixedOutput = `English syllabus suggestions for 2026.

\`\`\`json:pyq
[
  {
    "question": "How did Swami's father react to his excuse?",
    "chapter": "Father's Help",
    "subject": "English",
    "years": [2018, 2022],
    "marks": "2 Marks"
  },
  {
    "question": "How did Koni evolve through Kshitis's training?",
    "chapter": "Koni",
    "subject": "English",
    "years": [2017, 2020],
    "marks": "5 Marks"
  }
]
\`\`\`
`;

  const sanitized = parseAssistantResponseBlocks(mixedOutput, 'English', false);
  assert.equal(sanitized.pyqItems.length, 1);
  assert.equal(sanitized.pyqItems[0].chapter, "Father's Help");
  assert.equal(sanitized.youtubeVideos.length, 0);
});

test('cleanVoiceRecognitionText normalizes repeated Banglish voice input and deduplicates', () => {
  const repeated = 'Bangla Bangla Bangla important question';
  const cleaned = cleanVoiceRecognitionText(repeated, 'bn');
  assert.equal(cleaned, 'বাংলা গুরুত্বপূর্ণ প্রশ্ন');
});

test('parseAssistantResponseBlocks strips hallucinated Koni / Rapid Reader prose under English', () => {
  const englishProseWithKoni = `For Madhyamik 2026, the WBBSE English syllabus:
Prose: Father's Help and The Passing Away of Bapu.
Poetry: Fable and My Own True Family.
Rapid Reader (12 marks): Koni (Moti Nandi). 3-mark and 5-mark questions are mandatory.
Grammar: Voice change and phrasal verbs.`;

  const cleaned = parseAssistantResponseBlocks(englishProseWithKoni, 'English', false);
  assert.equal(cleaned.cleanText.includes('Rapid Reader'), false);
  assert.equal(cleaned.cleanText.includes('Koni'), false);
  assert.ok(cleaned.cleanText.includes("Father's Help"));
  assert.ok(cleaned.cleanText.includes('Fable'));
});



