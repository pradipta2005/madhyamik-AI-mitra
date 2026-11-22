import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Lightbulb,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  BlackboardLine,
  BlackboardSectionSnapshot,
  LanguageCode,
  ProblemSolveData,
} from '../types';
import { formatTeacherSpeechForAudio } from '../utils/wbbseResearch';
import { BrandLoader, BrandLogo } from './BrandLogo';

interface ProblemSolveCardProps {
  data: ProblemSolveData;
  language: LanguageCode;
  isLatestAssistant: boolean;
  disabled?: boolean;
  onConfirmUnderstood?: (topicTitle: string) => void;
  onAdvanceSection?: (
    nextSection: number,
    updatedBoardHistory: BlackboardSectionSnapshot[],
    topicTitle: string
  ) => void;
  onRequestSimpler?: (
    nextLevel: number,
    confusionNote?: string,
    targetSection?: number,
    boardHistory?: BlackboardSectionSnapshot[]
  ) => void;
  onTryPractice?: (topicTitle: string) => void;
  onSwitchSubjectChat?: () => void;
}

function renderChalkLine(line: BlackboardLine, idx: number) {
  switch (line.kind) {
    case 'heading':
      return (
        <div
          key={idx}
          className="text-xs sm:text-sm font-semibold text-amber-200 border-b border-emerald-700/60 pb-1 pt-1 tracking-wide"
        >
          {line.content}
        </div>
      );
    case 'formula':
      return (
        <div
          key={idx}
          className="bg-[#0d241a] border border-sky-400/35 rounded-lg px-3 py-2 text-xs sm:text-sm font-mono text-sky-200 whitespace-pre-wrap break-words"
        >
          {line.content}
        </div>
      );
    case 'work':
      return (
        <div
          key={idx}
          className="pl-2 flex items-start gap-2 text-xs sm:text-sm font-mono text-white whitespace-pre-wrap break-words leading-relaxed"
        >
          <span aria-hidden="true" className="text-emerald-400/80 select-none shrink-0">
            ›
          </span>
          <span className="min-w-0 flex-1">{line.content}</span>
        </div>
      );
    case 'highlight':
      return (
        <div
          key={idx}
          className="bg-amber-400/10 border border-amber-300/30 rounded-lg px-3 py-2 text-xs sm:text-sm text-amber-100 whitespace-pre-wrap break-words leading-relaxed"
        >
          {line.content}
        </div>
      );
    case 'answer':
      return (
        <div
          key={idx}
          className="bg-emerald-400/15 border border-emerald-300/50 rounded-xl px-3.5 py-2.5 text-sm font-mono font-semibold text-emerald-100 whitespace-pre-wrap break-words"
        >
          {line.content}
        </div>
      );
    default:
      return (
        <p
          key={idx}
          className="text-xs sm:text-sm text-slate-100 whitespace-pre-wrap break-words leading-relaxed"
        >
          {line.content}
        </p>
      );
  }
}

export function ProblemSolveCard({
  data,
  language,
  isLatestAssistant,
  disabled = false,
  onConfirmUnderstood,
  onAdvanceSection,
  onRequestSimpler,
  onTryPractice,
  onSwitchSubjectChat,
}: ProblemSolveCardProps) {
  const [feedbackState, setFeedbackState] = useState<
    'idle' | 'understood' | 'clarify'
  >('idle');
  const [confusionNote, setConfusionNote] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingVoice, setIsLoadingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cachedAudioUrlRef = useRef<Record<string, string>>({});

  const lines = useMemo(() => data.blackboardLines ?? [], [data.blackboardLines]);
  const [revealedCount, setRevealedCount] = useState<number>(() =>
    isLatestAssistant ? Math.min(1, lines.length) : lines.length
  );

  // Stop speech/audio and release object URLs when unmounting
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      for (const url of Object.values(cachedAudioUrlRef.current)) {
        URL.revokeObjectURL(url);
      }
      cachedAudioUrlRef.current = {};
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Chalk-writing animation for the latest active blackboard section
  useEffect(() => {
    if (!isLatestAssistant || lines.length <= 1) {
      setRevealedCount(lines.length);
      return;
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setRevealedCount(lines.length);
      return;
    }

    setRevealedCount(1);
    const timer = window.setInterval(() => {
      setRevealedCount((prev) => {
        if (prev >= lines.length) {
          window.clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 240);
    return () => window.clearInterval(timer);
  }, [isLatestAssistant, lines]);

  const stopAllAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const playBrowserSpeechFallback = (normalizedText: string): boolean => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return false;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(normalizedText);
    utterance.lang = language === 'bn' ? 'bn-IN' : 'en-IN';
    utterance.rate = 0.94;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    synth.speak(utterance);
    return true;
  };

  const toggleSpeak = async () => {
    setVoiceError(null);
    if (isSpeaking || isLoadingVoice) {
      stopAllAudio();
      setIsLoadingVoice(false);
      return;
    }

    const rawSpeech = [data.teacherSpeech, data.feedbackQuestion]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!rawSpeech) return;

    const cacheKey = `${language}:${rawSpeech}`;
    const cachedUrl = cachedAudioUrlRef.current[cacheKey];

    const playAudioUrl = async (url: string) => {
      stopAllAudio();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setIsSpeaking(false);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        audioRef.current = null;
      };
      setIsSpeaking(true);
      await audio.play();
    };

    if (cachedUrl) {
      try {
        await playAudioUrl(cachedUrl);
        return;
      } catch {
        setIsSpeaking(false);
      }
    }

    setIsLoadingVoice(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawSpeech, language }),
      });
      if (res.ok) {
        const payload = (await res.json()) as {
          audioBase64?: string;
          mimeType?: string;
          useBrowserSpeech?: boolean;
          normalizedText?: string;
        };

        if (payload.audioBase64) {
          const binary = atob(payload.audioBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: payload.mimeType || 'audio/wav' });
          const objectUrl = URL.createObjectURL(blob);
          cachedAudioUrlRef.current[cacheKey] = objectUrl;
          await playAudioUrl(objectUrl);
          return;
        }

        if (payload.useBrowserSpeech || payload.normalizedText) {
          const spoken = payload.normalizedText || formatTeacherSpeechForAudio(rawSpeech, language);
          playBrowserSpeechFallback(spoken);
          return;
        }
      }
      throw new Error('TTS fallback');
    } catch {
      const normalized = formatTeacherSpeechForAudio(rawSpeech, language);
      const started = playBrowserSpeechFallback(normalized);
      if (!started) {
        setVoiceError(
          language === 'bn'
            ? 'এই ব্রাউজারে ভয়েস প্লেব্যাক সমর্থিত নয়।'
            : 'Browser speech playback is not supported.'
        );
      }
    } finally {
      setIsLoadingVoice(false);
    }
  };

  // Case 1: Subject Mismatch Guard (Math-only / Physical Science-only enforcement)
  if (data.subjectMismatch) {
    return (
      <section
        aria-label="Subject Scope Notice"
        className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 space-y-3"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1.5">
            <h3 className="text-sm sm:text-base font-semibold text-amber-950">
              {language === 'bn'
                ? `এই চ্যাটটি শুধুমাত্র ${data.subjectGuard === 'Physical Science' ? 'ভৌত বিজ্ঞান' : 'গণিত'}-এর সমস্যার জন্য`
                : `Subject Scope: ${data.subjectGuard || 'Subject'} Only`}
            </h3>
            <p className="text-xs sm:text-sm text-amber-900 leading-relaxed">
              {data.mismatchReason ||
                (language === 'bn'
                  ? `এই প্রশ্নটি ${data.detectedSubject || 'অন্য বিষয়ের'} মনে হচ্ছে। নতুন চ্যাট শুরু করে সঠিক বিষয়টি বেছে নিলে আমি সাহায্য করতে পারব।`
                  : `This problem belongs to ${data.detectedSubject || 'another subject'}. Please start a New Chat and select that subject to solve or research it.`)}
            </p>
          </div>
        </div>
        {onSwitchSubjectChat && (
          <div className="pl-8">
            <button
              type="button"
              onClick={onSwitchSubjectChat}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {language === 'bn'
                  ? 'বিষয় বদলাতে নতুন চ্যাট শুরু করো'
                  : 'Start New Chat to Switch Subject'}
              </span>
            </button>
          </div>
        )}
      </section>
    );
  }

  // Case 2: Interactive Classroom Blackboard Mode
  const isBlackboardMode = Boolean(
    data.blackboardLines && data.blackboardLines.length > 0
  );

  if (isBlackboardMode) {
    const secNum = data.sectionNumber || 1;
    const totalEst = Math.max(secNum, data.estimatedTotalSections || 3);
    const isFinal = Boolean(data.isFinalSection);
    const boardHistory = data.boardHistory || [];

    const nextBoardHistory: BlackboardSectionSnapshot[] = [
      ...boardHistory,
      {
        sectionNumber: secNum,
        sectionTitle: data.sectionTitle || `Section ${secNum}`,
        blackboardLines: lines,
      },
    ];

    const quickChips =
      language === 'bn'
        ? [
            'এই সূত্রটা কীভাবে এল বুঝিনি',
            'হিসাবটা আরেকটু ভেঙে দেখাও',
            'একদম সাধারণ উদাহরণ দিয়ে বোঝাও',
          ]
        : [
            "Why are we using this formula?",
            'Break down this arithmetic slower',
            'Give an everyday analogy first',
          ];

    const handleSubmitSimpler = () => {
      if (!onRequestSimpler || disabled) return;
      onRequestSimpler(
        Math.min(5, (data.simplificationLevel || 1) + 1),
        confusionNote.trim() || undefined,
        secNum,
        boardHistory
      );
      setConfusionNote('');
      setFeedbackState('idle');
    };

    const canSpeak =
      typeof window !== 'undefined' && 'speechSynthesis' in window;

    return (
      <section
        aria-label="Interactive Classroom Blackboard Solution"
        className="space-y-4 pt-2 border-t border-slate-100"
      >
        {/* Lesson Title & Section Progress */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-emerald-800 flex items-center gap-1.5">
              <span>
                {data.subjectGuard || 'Problem Solve'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {language === 'bn'
                  ? `অংশ ${secNum} / ${totalEst}`
                  : `Section ${secNum} of ${totalEst}`}
              </span>
              {data.simplificationLevel > 1 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {language === 'bn'
                      ? `সহজ লেভেল ${data.simplificationLevel}`
                      : `Simplified Level ${data.simplificationLevel}`}
                  </span>
                </>
              )}
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">
              {data.topicTitle}
            </h3>
          </div>

          {/* Segmented Section Progress Indicator */}
          <div
            aria-label={`Section ${secNum} of ${totalEst}`}
            className="flex items-center gap-1.5"
          >
            {Array.from({ length: totalEst }).map((_, i) => {
              const stepIdx = i + 1;
              const isDone = stepIdx < secNum || (isFinal && stepIdx === secNum);
              const isCurrent = stepIdx === secNum && !isFinal;
              return (
                <span
                  key={stepIdx}
                  className={`h-2 rounded-full transition-all ${
                    isCurrent
                      ? 'w-7 bg-amber-500'
                      : isDone
                        ? 'w-5 bg-emerald-600'
                        : 'w-4 bg-slate-200'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Teacher Spoken Explanation Strip */}
        {data.teacherSpeech && (
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 flex-1 min-w-0">
              <BrandLogo size="sm" className="mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-amber-950">
                  {language === 'bn'
                    ? 'শিক্ষকের কথা (ক্লাসরুম ব্যাখ্যা)'
                    : 'Teacher Speaking'}
                </div>
                <p className="text-sm text-slate-800 leading-relaxed mt-0.5 whitespace-pre-wrap">
                  {data.teacherSpeech}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
              <button
                type="button"
                onClick={() => void toggleSpeak()}
                aria-pressed={isSpeaking}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isSpeaking
                    ? 'bg-amber-800 text-white hover:bg-amber-900'
                    : 'bg-white border border-amber-300 text-amber-950 hover:bg-amber-100'
                }`}
              >
                {isLoadingVoice ? (
                  <>
                    <BrandLoader variant="inline" size="xs" iconOnly />
                    <span>
                      {language === 'bn' ? 'ভয়েস তৈরি হচ্ছে...' : 'Preparing voice...'}
                    </span>
                  </>
                ) : isSpeaking ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{language === 'bn' ? 'থামাও' : 'Stop Voice'}</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{language === 'bn' ? 'শিক্ষকের কণ্ঠে শুনুন' : 'Listen to Teacher'}</span>
                  </>
                )}
              </button>
              {voiceError && (
                <span role="alert" className="text-[11px] text-rose-700">
                  {voiceError}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Green Classroom Blackboard */}
        <div
          data-testid="classroom-blackboard"
          className="rounded-2xl border-[6px] border-[#785032] bg-[#143326] shadow-sm overflow-hidden"
        >
          {/* Blackboard Top Header Strip */}
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#0f281e] border-b border-emerald-800/70">
            <span className="text-xs font-semibold text-amber-200 tracking-wide truncate">
              {data.sectionTitle ||
                (language === 'bn' ? `অংশ ${secNum}` : `Section ${secNum}`)}
            </span>
            {revealedCount < lines.length ? (
              <button
                type="button"
                onClick={() => setRevealedCount(lines.length)}
                className="text-[11px] font-medium text-sky-200 hover:text-white underline cursor-pointer shrink-0"
              >
                {language === 'bn' ? 'সব লাইন দেখাও' : 'Show all lines'}
              </button>
            ) : (
              <span className="text-[11px] font-mono text-emerald-300/80 shrink-0 tabular-nums">
                {language === 'bn' ? 'ব্ল্যাকবোর্ড নোট' : 'Chalkboard'}
              </span>
            )}
          </div>

          {/* Chalk Writing Surface */}
          <div className="p-4 sm:p-5 space-y-4">
            {/* Previously completed sections remain visible on the board */}
            {boardHistory.length > 0 && (
              <div className="space-y-3 pb-3 border-b border-dashed border-emerald-700/70 opacity-85">
                {boardHistory.map((sec) => (
                  <div key={sec.sectionNumber} className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{sec.sectionTitle}</span>
                    </div>
                    <div className="space-y-1.5 pl-4">
                      {sec.blackboardLines.map((l, idx) => renderChalkLine(l, idx))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Active Section Chalk Lines */}
            <div className="space-y-2.5">
              {lines.slice(0, revealedCount).map((line, idx) => renderChalkLine(line, idx))}
            </div>
          </div>

          {/* Wooden Chalk Ledge Accent */}
          <div className="h-2.5 bg-[#5d3d25] border-t border-[#8b5e3c] px-5 flex items-center justify-end gap-2">
            <span aria-hidden="true" className="w-5 h-1 rounded-xs bg-white/90" />
            <span aria-hidden="true" className="w-4 h-1 rounded-xs bg-amber-200/90" />
            <span aria-hidden="true" className="w-3.5 h-1 rounded-xs bg-sky-200/90" />
          </div>
        </div>

        {/* Final Answer & Exam Tip Summary (only when solved) */}
        {isFinal && data.finalAnswer && (
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3.5 space-y-1.5">
            <div className="text-xs font-semibold text-emerald-900">
              {language === 'bn'
                ? 'সমস্যাটির সম্পূর্ণ সমাধান সম্পন্ন হয়েছে'
                : 'Problem Solved — Final Answer'}
            </div>
            <p className="text-sm font-semibold text-slate-900 font-mono whitespace-pre-wrap">
              {data.finalAnswer}
            </p>
            {data.examTip && (
              <p className="text-xs text-emerald-900 pt-1 border-t border-emerald-200/70 leading-relaxed">
                <span className="font-semibold">
                  {language === 'bn' ? 'মাধ্যমিক টিপস: ' : 'Board Exam Tip: '}
                </span>
                {data.examTip}
              </p>
            )}
          </div>
        )}

        {/* Interactive Student Understanding Check */}
        {isLatestAssistant && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  {isFinal
                    ? language === 'bn'
                      ? 'সম্পূর্ণ সমাধানটা কেমন বুঝলে?'
                      : 'Final Check — Did the full solution make sense?'
                    : language === 'bn'
                      ? `অংশ ${secNum} বুঝতে পেরেছ কি?`
                      : `Did you understand Section ${secNum}?`}
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  {data.feedbackQuestion}
                </p>
              </div>
            </div>

            {feedbackState === 'understood' ? (
              <div className="bg-white border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>
                    {language === 'bn'
                      ? 'দারুণ! অঙ্ক/সমস্যাটা ভালোভাবে আয়ত্ত হয়েছে।'
                      : 'Awesome! You mastered this problem step-by-step.'}
                  </span>
                </div>
                {onTryPractice && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onTryPractice(data.topicTitle)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#153326] hover:bg-[#1b4030] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>
                      {language === 'bn'
                        ? 'অনুরূপ ABTA/WBTA প্রশ্ন অনুশীলন করো'
                        : 'Practice Similar ABTA/WBTA Problem'}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {!isFinal && onAdvanceSection ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onAdvanceSection(secNum, nextBoardHistory, data.topicTitle)
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {language === 'bn'
                          ? `হ্যাঁ বুঝেছি — পরের অংশে চলো`
                          : `Yes, I understood — Next Section`}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setFeedbackState('understood');
                        onConfirmUnderstood?.(data.topicTitle);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {language === 'bn'
                          ? 'হ্যাঁ, পুরো সমাধান পরিষ্কার বুঝেছি!'
                          : 'Yes, I understood the full solution!'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      setFeedbackState((s) => (s === 'clarify' ? 'idle' : 'clarify'))
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-950 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {language === 'bn'
                        ? 'না, এই অংশটা আরও সহজ করে বোঝাও'
                        : 'No, explain this section simpler'}
                    </span>
                  </button>
                </div>

                {feedbackState === 'clarify' && (
                  <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {quickChips.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setConfusionNote(chip)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-[11px] font-medium text-slate-700 cursor-pointer transition-colors"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={confusionNote}
                        onChange={(e) => setConfusionNote(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSubmitSimpler();
                          }
                        }}
                        placeholder={
                          language === 'bn'
                            ? 'ব্ল্যাকবোর্ডের কোন লাইনটা বুঝতে অসুবিধা হয়েছে (ঐচ্ছিক)...'
                            : 'Which blackboard line confused you? (optional)...'
                        }
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-700"
                      />
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={handleSubmitSimpler}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#153326] hover:bg-[#1b4030] text-white text-xs font-medium whitespace-nowrap cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {language === 'bn' ? 'আবার সহজ করে বোঝাও' : 'Re-teach Simply'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  // Case 3: Legacy step-by-step card fallback for older saved chats
  const legacySteps = data.steps ?? [];
  return (
    <section
      aria-label="Live Step-by-Step Problem Solution"
      className="space-y-4 pt-2 border-t border-slate-100"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{data.topicTitle}</h3>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-800">
          <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Level {data.simplificationLevel}</span>
        </span>
      </div>

      {data.simpleConcept && (
        <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-950">
            <Lightbulb className="w-4 h-4 text-sky-700 shrink-0" aria-hidden="true" />
            <span>
              {language === 'bn'
                ? '১. সহজ কথায় মূল ধারণা'
                : '1. Understand the Topic Simply'}
            </span>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
            {data.simpleConcept}
          </p>
        </div>
      )}

      {legacySteps.length > 0 && (
        <div className="space-y-2.5">
          {legacySteps.map((step, idx) => (
            <div
              key={`${step.stepNumber}-${idx}`}
              className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-sky-800 text-white text-xs font-semibold flex items-center justify-center shrink-0 tabular-nums">
                  {step.stepNumber || idx + 1}
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {step.title}
                </span>
              </div>
              {step.whyThisStep && (
                <p className="text-xs text-slate-600 pl-8">{step.whyThisStep}</p>
              )}
              {step.work && (
                <div className="ml-8 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 whitespace-pre-wrap">
                  {step.work}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {data.finalAnswer && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5">
          <div className="text-xs font-semibold text-emerald-900 mb-1">
            {language === 'bn' ? 'চূড়ান্ত উত্তর' : 'Final Answer'}
          </div>
          <p className="text-sm font-semibold text-slate-900 font-mono whitespace-pre-wrap">
            {data.finalAnswer}
          </p>
        </div>
      )}
    </section>
  );
}
