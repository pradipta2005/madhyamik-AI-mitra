import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { MotionConfig, motion } from 'motion/react';
import {
  AudioLines,
  BookOpen,
  PanelLeft,
  Sparkles,
} from 'lucide-react';
import {
  auth,
  createFirestoreSession,
  deleteFirestoreSession,
  ensureUserProfile,
  saveFirestoreMessage,
  signInWithGoogle,
  signOutUser,
  subscribeSessionMessages,
  subscribeUserSessions,
  updateFirestoreSessionMeta,
} from './firebase';
import type {
  AppUser,
  BlackboardSectionSnapshot,
  ChatMessage,
  GroundingLink,
  LanguageCode,
  LiveTranscriptTurn,
  MessageMode,
  ProblemSolveData,
  StudySession,
  SuggestedPyqItem,
  UploadedPaperContext,
  WbbseSubject,
  YouTubeRecommendation,
} from './types';
import {
  SUBJECT_META,
  clampString,
  detectLanguage,
  formatLiveTranscriptSummary,
  isGuestUser,
  isProblemSolveSubject,
  isSupportedDocumentType,
  sanitizeMessageForStorage,
  stripInternalFences,
} from './utils/wbbseResearch';
import { Sidebar } from './components/Sidebar';
import { SubjectBar } from './components/SubjectBar';
import { ChatMessageBubble } from './components/ChatMessageBubble';
import { ChatInputBar } from './components/ChatInputBar';
import { LiveVoiceModal } from './components/LiveVoiceModal';
import { LandingPage } from './components/LandingPage';
import { SignInGateModal } from './components/SignInGateModal';
import { ProblemSolverBanner } from './components/ProblemSolverBanner';
import { BrandLoader, BrandLogo } from './components/BrandLogo';
import { BlurRevealText, SpotlightCard } from './components/ui/CraftMotion';

interface StarterPrompt {
  id: string;
  subject: WbbseSubject;
  lang: LanguageCode;
  label: string;
  query: string;
}

const STARTER_PROMPTS: StarterPrompt[] = [
  {
    id: 'st-ps-en',
    subject: 'Physical Science',
    lang: 'en',
    label: 'Physical Science Light chapter 10-year important questions',
    query: 'Physical Science Light chapter 10-year important questions',
  },
  {
    id: 'st-ps-bn',
    subject: 'Physical Science',
    lang: 'bn',
    label: 'ভৌত বিজ্ঞান আলোর প্রতিসরণ সহজ ভাষায় বোঝাও',
    query: 'ভৌত বিজ্ঞান আলোর প্রতিসরণ সহজ ভাষায় বোঝাও',
  },
  {
    id: 'st-ls-en',
    subject: 'Life Science',
    lang: 'en',
    label: 'Life Science Neuron & Heredity most probable 5-mark questions',
    query: 'Life Science Neuron and Heredity chapter most probable 5-mark WBBSE questions',
  },
  {
    id: 'st-ls-bn',
    subject: 'Life Science',
    lang: 'bn',
    label: 'জীবন বিজ্ঞান কোষ বিভাজন ও বংশগতি সহজ করে বোঝাও',
    query: 'জীবন বিজ্ঞান কোষ বিভাজন ও বংশগতি অধ্যায়ের গুরুত্বপূর্ণ প্রশ্ন ও সহজ ব্যাখ্যা দাও',
  },
  {
    id: 'st-math-bn',
    subject: 'Mathematics',
    lang: 'bn',
    label: 'মাধ্যমিক গণিত বৃত্ত সংক্রান্ত উপপাদ্য ও ত্রিকোণমিতি সাজেশন দাও',
    query: 'মাধ্যমিক গণিত বৃত্ত সংক্রান্ত উপপাদ্য ও ত্রিকোণমিতি বিগত ১০ বছরের সাজেশন দাও',
  },
  {
    id: 'st-math-en',
    subject: 'Mathematics',
    lang: 'en',
    label: 'Mathematics Quadratic Equations & Mensuration 10-year PYQs',
    query: 'Give WBBSE Class 10 Mathematics Quadratic Equations and Mensuration 10-year important questions',
  },
  {
    id: 'st-hist-en',
    subject: 'History',
    lang: 'en',
    label: 'Explain 1857 Revolt & Bengal Renaissance for 8-mark answers',
    query: 'Explain 1857 Revolt and 19th century Bengal Renaissance simply for WBBSE 8-mark answers',
  },
  {
    id: 'st-hist-bn',
    subject: 'History',
    lang: 'bn',
    label: 'ইতিহাস সাঁওতাল ও নীল বিদ্রোহের কারণ ও গুরুত্ব লেখো',
    query: 'মাধ্যমিক ইতিহাস সাঁওতাল ও নীল বিদ্রোহের গুরুত্বপূর্ণ প্রশ্ন ও সহজ ব্যাখ্যা দাও',
  },
  {
    id: 'st-geo-bn',
    subject: 'Geography',
    lang: 'bn',
    label: 'ভূগোল নদীর ক্ষয়কার্য ও বায়ুমণ্ডলের চাপ বলয় সহজ করে বোঝাও',
    query: 'ভূগোল নদীর ক্ষয়কার্য ও বায়ুমণ্ডলের চাপ বলয় সহজ ভাষায় বোঝাও',
  },
  {
    id: 'st-geo-en',
    subject: 'Geography',
    lang: 'en',
    label: 'Geography Exogenetic Processes & India Regional 5-mark PYQs',
    query: 'Geography Exogenetic Processes and India Regional Geography WBBSE 10-year important questions',
  },
  {
    id: 'st-ben-bn',
    subject: 'Bengali',
    lang: 'bn',
    label: 'বাংলা জ্ঞানচক্ষু ও কোনি অধ্যায়ের গুরুত্বপূর্ণ প্রশ্ন দাও',
    query: 'বাংলা জ্ঞানচক্ষু ও কোনি উপন্যাসের গুরুত্বপূর্ণ ৫ নম্বরের প্রশ্ন ও ট্রেন্ড দাও',
  },
  {
    id: 'st-ben-bn2',
    subject: 'Bengali',
    lang: 'bn',
    label: 'বহুরূপী গল্প ও বাংলা সমাস-কারক সহজ উদাহরণসহ বোঝাও',
    query: 'মাধ্যমিক বাংলা বহুরূপী গল্পের বিষয়বস্তু ও সমাস-কারকের গুরুত্বপূর্ণ প্রশ্ন সহজ ভাষায় বোঝাও',
  },
  {
    id: 'st-eng-en',
    subject: 'English',
    lang: 'en',
    label: "English Father's Help & Report Writing WBBSE suggestions",
    query: "Give important WBBSE Madhyamik questions for Father's Help and English Writing Skills",
  },
  {
    id: 'st-eng-bn',
    subject: 'English',
    lang: 'bn',
    label: 'ইংরেজি ফাদার্স হেল্প ও গ্রামার ট্রান্সফর্মেশন সহজ বাংলায় বোঝাও',
    query: "WBBSE English Father's Help এবং মাধ্যমিক গ্রামার ও রাইটিং স্কিলের সাজেশন বাংলায় বোঝাও",
  },
  {
    id: 'st-all-en',
    subject: 'All Subjects',
    lang: 'en',
    label: 'Complete Madhyamik 7-subject high-weightage chapter roadmap',
    query: 'Give a complete WBBSE Class 10 Madhyamik high-weightage chapter roadmap across all 7 subjects',
  },
  {
    id: 'st-all-bn',
    subject: 'All Subjects',
    lang: 'bn',
    label: 'মাধ্যমিকের সব বিষয়ের কোন অধ্যায় থেকে বেশি নম্বর আসে? বিশ্লেষণ দাও',
    query: 'মাধ্যমিক পরীক্ষার সব বিষয়ের কোন অধ্যায়গুলো থেকে বিগত ১০ বছরে সবচেয়ে বেশি প্রশ্ন এসেছে? বিশ্লেষণ দাও',
  },
];

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface PendingAction {
  prompt?: string;
  subject?: WbbseSubject;
  openLiveVoice?: boolean;
}

export default function App() {
  const autostartWorkspace = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  }, []);

  const previewLoader = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('preview') === 'loader';
  }, []);

  const [user, setUser] = useState<User | AppUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [minLoadingDone, setMinLoadingDone] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // Deliberate brand entrance: ensures the loading animation displays smoothly
  // for at least 1.6s on first arrival rather than flickering away in 50ms.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMinLoadingDone(true);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, []);
  const [authError, setAuthError] = useState<string | null>(null);

  const [signInGateOpen, setSignInGateOpen] = useState(false);
  const [signInReason, setSignInReason] = useState<string | null>(null);
  const pendingActionRef = useRef<PendingAction | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [lockedSubject, setLockedSubject] = useState<WbbseSubject | null>(null);
  const [micLang, setMicLang] = useState<LanguageCode>('en');

  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => makeId('sess'));
  const [firestoreMessages, setFirestoreMessages] = useState<ChatMessage[]>([]);

  const [inputValue, setInputValue] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [attachment, setAttachment] = useState<UploadedPaperContext | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localImagePreviews, setLocalImagePreviews] = useState<Record<string, string>>({});

  const [solveMode, setSolveMode] = useState(false);
  const [liveVoiceOpen, setLiveVoiceOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const hasAutoSelectedSessionRef = useRef(false);
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveSubject: WbbseSubject = lockedSubject ?? 'All Subjects';

  const latestAssistantMsgId = useMemo(() => {
    const assistants = (user ? firestoreMessages : []).filter(
      (m) => m.role === 'assistant'
    );
    return assistants[assistants.length - 1]?.id || null;
  }, [user, firestoreMessages]);

  const activeMessages = useMemo(() => {
    if (!user) return [];
    return firestoreMessages;
  }, [user, firestoreMessages]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  // Listen to Firebase Auth state (with guest profile restoration fallback)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser) {
        setUser(nextUser);
        setAuthReady(true);
        try {
          await ensureUserProfile(nextUser, micLang);
        } catch (err) {
          console.error('Failed to sync user profile:', err);
        }
      } else {
        // Restore guest mode if user previously chose guest access
        const storedGuest =
          typeof window !== 'undefined' ? localStorage.getItem('mitra_guest_user') : null;
        if (storedGuest) {
          try {
            const guestObj = JSON.parse(storedGuest) as AppUser;
            setUser(guestObj);
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
          hasAutoSelectedSessionRef.current = false;
          setSessions([]);
          setFirestoreMessages([]);
        }
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to user sessions (cloud Firestore for signed-in, localStorage for guest)
  useEffect(() => {
    if (!authReady || !user) return;
    if (isGuestUser(user)) {
      const stored =
        typeof window !== 'undefined'
          ? localStorage.getItem(`mitra_guest_sessions_${user.uid}`) || '[]'
          : '[]';
      try {
        const parsed = JSON.parse(stored) as StudySession[];
        setSessions(parsed);
        if (
          !hasAutoSelectedSessionRef.current &&
          parsed.length > 0 &&
          !pendingActionRef.current
        ) {
          hasAutoSelectedSessionRef.current = true;
          const first = parsed[0];
          setActiveSessionId(first.id);
          setLockedSubject(first.subject);
        }
      } catch {
        setSessions([]);
      }
      return;
    }

    const unsub = subscribeUserSessions(
      user.uid,
      (cloudSessions) => {
        setSessions(cloudSessions);
        if (
          !hasAutoSelectedSessionRef.current &&
          cloudSessions.length > 0 &&
          !pendingActionRef.current
        ) {
          hasAutoSelectedSessionRef.current = true;
          const first = cloudSessions[0];
          setActiveSessionId(first.id);
          setLockedSubject(first.subject);
        }
      },
      (err) => {
        console.error('Session subscription error:', err);
      }
    );
    return () => unsub();
  }, [authReady, user]);

  // Subscribe to messages for active session (cloud Firestore or localStorage)
  useEffect(() => {
    if (!authReady || !user || !activeSessionId) {
      setFirestoreMessages([]);
      return;
    }
    const sessionExists = sessions.some((s) => s.id === activeSessionId);
    if (!sessionExists) {
      setFirestoreMessages([]);
      return;
    }

    if (isGuestUser(user)) {
      const stored =
        typeof window !== 'undefined'
          ? localStorage.getItem(`mitra_guest_messages_${activeSessionId}`) || '[]'
          : '[]';
      try {
        const msgs = JSON.parse(stored) as ChatMessage[];
        setFirestoreMessages(msgs);
      } catch {
        setFirestoreMessages([]);
      }
      return;
    }

    const unsub = subscribeSessionMessages(
      user.uid,
      activeSessionId,
      (msgs) => {
        setFirestoreMessages(msgs);
      },
      (err) => {
        console.error('Messages subscription error:', err);
      }
    );
    return () => unsub();
  }, [authReady, user, activeSessionId, sessions]);

  const lastMsgTextLength = activeMessages[activeMessages.length - 1]?.text?.length ?? 0;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, isResearching, lastMsgTextLength]);

  const openSignInGate = useCallback(
    (
      reason?: string,
      pendingPrompt?: string,
      pendingSubject?: WbbseSubject,
      openLiveVoice?: boolean
    ) => {
      setAuthError(null);
      setSignInReason(reason || null);
      pendingActionRef.current =
        pendingPrompt || pendingSubject || openLiveVoice
          ? { prompt: pendingPrompt, subject: pendingSubject, openLiveVoice }
          : null;
      setSignInGateOpen(true);
    },
    []
  );

  const handleSelectSubject = useCallback((subj: WbbseSubject) => {
    setLockedSubject(subj);
    setSolveMode(subj === 'Mathematics' || subj === 'Physical Science');
  }, []);

  // Sync subject lock with selected session when switching sessions
  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    setChatError(null);
    const target = sessions.find((s) => s.id === id);
    if (target) {
      handleSelectSubject(target.subject);
      if (target.hasAttachment && target.attachmentName) {
        setAttachment({
          fileName: target.attachmentName,
          mimeType: 'application/pdf',
          summary: target.attachmentSummary || '',
          sizeBytes: 0,
        });
      } else {
        setAttachment(null);
      }
    }
  };

  // Start a fresh chat and unlock all subject choices again
  const handleNewSession = () => {
    hasAutoSelectedSessionRef.current = true;
    const newId = makeId('sess');
    setActiveSessionId(newId);
    setLockedSubject(null);
    setSolveMode(false);
    setFirestoreMessages([]);
    setChatError(null);
    setAttachment(null);
  };

  const handleDeleteSession = async (id: string) => {
    if (!user) return;
    try {
      if (isGuestUser(user)) {
        const sessionKey = `mitra_guest_sessions_${user.uid}`;
        const storedSessionsStr =
          typeof window !== 'undefined'
            ? localStorage.getItem(sessionKey) || '[]'
            : '[]';
        const parsed = (JSON.parse(storedSessionsStr) as StudySession[]).filter(
          (s) => s.id !== id
        );
        if (typeof window !== 'undefined') {
          localStorage.setItem(sessionKey, JSON.stringify(parsed));
          localStorage.removeItem(`mitra_guest_messages_${id}`);
        }
        setSessions(parsed);
      } else {
        await deleteFirestoreSession(user.uid, id);
      }
      if (id === activeSessionId) {
        handleNewSession();
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Failed to delete session.');
    }
  };

  const persistMessageAndSession = useCallback(
    async (
      targetUser: User | AppUser,
      sessionId: string,
      sessionTitle: string,
      lang: LanguageCode,
      subj: WbbseSubject,
      msg: ChatMessage,
      isFirstInSession: boolean,
      newCount: number
    ) => {
      const sanitized = sanitizeMessageForStorage(msg);

      if (isGuestUser(targetUser)) {
        const sessionKey = `mitra_guest_sessions_${targetUser.uid}`;
        const storedSessionsStr =
          typeof window !== 'undefined'
            ? localStorage.getItem(sessionKey) || '[]'
            : '[]';
        let currentGuestSessions: StudySession[] = [];
        try {
          currentGuestSessions = JSON.parse(storedSessionsStr);
        } catch {
          currentGuestSessions = [];
        }

        if (isFirstInSession) {
          const newSession: StudySession = {
            id: sessionId,
            userId: targetUser.uid,
            title: clampString(sessionTitle, 200),
            subject: subj,
            language: lang,
            messageCount: newCount,
            hasAttachment: Boolean(attachment),
            attachmentName: attachment?.fileName,
            attachmentSummary: attachment?.summary,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          currentGuestSessions = [
            newSession,
            ...currentGuestSessions.filter((s) => s.id !== sessionId),
          ];
        } else {
          currentGuestSessions = currentGuestSessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  subject: subj,
                  language: lang,
                  messageCount: newCount,
                  updatedAt: Date.now(),
                }
              : s
          );
        }

        if (typeof window !== 'undefined') {
          localStorage.setItem(sessionKey, JSON.stringify(currentGuestSessions));
        }
        setSessions(currentGuestSessions);

        const msgKey = `mitra_guest_messages_${sessionId}`;
        const storedMsgsStr =
          typeof window !== 'undefined'
            ? localStorage.getItem(msgKey) || '[]'
            : '[]';
        let currentGuestMsgs: ChatMessage[] = [];
        try {
          currentGuestMsgs = JSON.parse(storedMsgsStr);
        } catch {
          currentGuestMsgs = [];
        }
        currentGuestMsgs.push(sanitized);
        if (typeof window !== 'undefined') {
          localStorage.setItem(msgKey, JSON.stringify(currentGuestMsgs));
        }
        setFirestoreMessages(currentGuestMsgs);
        return;
      }

      try {
        if (isFirstInSession) {
          await createFirestoreSession(targetUser.uid, {
            id: sessionId,
            userId: targetUser.uid,
            title: clampString(sessionTitle, 200),
            subject: subj,
            language: lang,
            messageCount: newCount,
            hasAttachment: Boolean(attachment),
            attachmentName: attachment?.fileName,
            attachmentSummary: attachment?.summary,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        } else {
          await updateFirestoreSessionMeta(targetUser.uid, sessionId, {
            subject: subj,
            language: lang,
            messageCount: newCount,
          });
        }
        await saveFirestoreMessage(targetUser.uid, sessionId, sanitized);
      } catch (cloudErr) {
        console.warn('Firestore write failed, falling back to local session state:', cloudErr);
        setFirestoreMessages((prev) => [...prev, sanitized]);
      }
    },
    [attachment]
  );

  const sendPrompt = useCallback(
    async (
      promptOverride?: string,
      subjectOverride?: WbbseSubject,
      authenticatedUserOverride?: User | AppUser,
      sessionIdOverride?: string,
      options?: {
        solveModeOverride?: boolean;
        simplificationLevel?: number;
        solveAction?: 'start' | 'next_section' | 'simplify_section';
        currentSection?: number;
        boardHistory?: BlackboardSectionSnapshot[];
      }
    ) => {
      const rawText = (promptOverride ?? inputValue).trim();
      const queryText =
        rawText ||
        (attachment
          ? micLang === 'bn'
            ? `আমার আপলোড করা ডকুমেন্ট/ছবি (${attachment.fileName}) দেখে সহজ ভাষায় মূল বিষয়টি বুঝিয়ে ধাপে ধাপে সমাধান করে দাও।`
            : `Please inspect my uploaded document/image (${attachment.fileName}), explain the core topic in simple words, and solve or analyze it step by step.`
          : '');
      if (!queryText || isResearching) return;

      const activeUser = authenticatedUserOverride ?? user;
      if (!activeUser) {
        openSignInGate(
          micLang === 'bn'
            ? 'AI দিয়ে প্রশ্নোত্তর ও PYQ বিশ্লেষণ শুরু করতে Google দিয়ে সাইন ইন করো।'
            : 'Sign in with Google first to use Madhyamik AI Mitra and save your study thread.',
          queryText,
          subjectOverride ?? lockedSubject ?? undefined
        );
        return;
      }

      const chosenSubject: WbbseSubject =
        subjectOverride ?? lockedSubject ?? 'All Subjects';
      const allowSolveForSubject = isProblemSolveSubject(chosenSubject);
      const effectiveSolveMode = allowSolveForSubject
        ? (options?.solveModeOverride ?? (solveMode || Boolean(attachment)))
        : false;

      setLockedSubject(chosenSubject);
      if (!allowSolveForSubject) {
        setSolveMode(false);
      } else if (options?.solveModeOverride !== undefined) {
        setSolveMode(options.solveModeOverride);
      } else {
        setSolveMode(true);
      }
      setChatError(null);
      if (!promptOverride) {
        setInputValue('');
      }

      const detectedLang = detectLanguage(queryText);
      setMicLang(detectedLang);

      const sessionId = sessionIdOverride ?? activeSessionId;
      const isNewSession =
        Boolean(sessionIdOverride) || !sessions.some((s) => s.id === sessionId);
      const baseMessages = sessionIdOverride ? [] : activeMessages;
      const currentCount = baseMessages.length;

      const userMsgId = makeId('msg');
      const currentAttachment = attachment;

      if (currentAttachment?.previewUrl) {
        setLocalImagePreviews((prev) => ({
          ...prev,
          [userMsgId]: currentAttachment.previewUrl!,
        }));
      }

      const userMsg: ChatMessage = {
        id: userMsgId,
        sessionId,
        userId: activeUser.uid,
        role: 'user',
        text: queryText,
        language: detectedLang,
        subject: chosenSubject,
        mode: effectiveSolveMode ? 'problem_solve' : 'general',
        attachmentName: currentAttachment?.fileName,
        attachmentMimeType: currentAttachment?.mimeType,
        createdAt: Date.now(),
      };

      try {
        await persistMessageAndSession(
          activeUser,
          sessionId,
          queryText.slice(0, 80),
          detectedLang,
          chosenSubject,
          userMsg,
          isNewSession,
          currentCount + 1
        );
      } catch (err) {
        setChatError(err instanceof Error ? err.message : 'Failed to save message.');
        return;
      }

      // Clear pending attachment preview from input bar once dispatched in chat
      if (currentAttachment) {
        setAttachment(null);
      }

      // Create immediate assistant placeholder bubble with streaming cursor
      const assistantMsgId = makeId('msg');
      const tempStreamingMsg: ChatMessage = {
        id: assistantMsgId,
        sessionId,
        userId: activeUser.uid,
        role: 'assistant',
        text: '',
        language: detectedLang,
        subject: chosenSubject,
        mode: effectiveSolveMode ? 'problem_solve' : 'general',
        createdAt: Date.now(),
        isStreaming: true,
      };

      setFirestoreMessages((prev) => [...prev, tempStreamingMsg]);
      setIsResearching(true);

      try {
        const historyPayload = [...baseMessages, userMsg]
          .slice(-8)
          .map((m) => ({
            role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
            text: m.text,
          }));

        const res = await fetch('/api/research', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream, application/json',
          },
          body: JSON.stringify({
            message: queryText,
            subject: chosenSubject,
            history: historyPayload,
            solveMode: effectiveSolveMode,
            simplificationLevel: options?.simplificationLevel ?? 1,
            solveAction: options?.solveAction ?? 'start',
            currentSection: options?.currentSection ?? 1,
            boardHistory: options?.boardHistory,
            attachment: currentAttachment
              ? {
                  fileName: currentAttachment.fileName,
                  mimeType: currentAttachment.mimeType,
                  base64Data: currentAttachment.base64Data,
                  summary: currentAttachment.summary,
                }
              : undefined,
          }),
        });

        if (!res.ok) {
          let errMessage = 'Research service returned an error.';
          try {
            const errData = await res.json();
            if (errData?.error) errMessage = errData.error;
          } catch {
            // fallback
          }
          throw new Error(errMessage);
        }

        const contentType = res.headers.get('content-type') || '';
        let finalAssistantMsg: ChatMessage;

        if (contentType.includes('text/event-stream') && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';
          let rawAccumulatedText = '';
          interface StreamDonePayload {
            text?: string;
            language?: LanguageCode;
            mode?: MessageMode;
            problemSolve?: ProblemSolveData;
            pyqItems?: SuggestedPyqItem[];
            youtubeVideos?: YouTubeRecommendation[];
            groundingLinks?: GroundingLink[];
          }
          let donePayload: StreamDonePayload | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';

            for (const part of parts) {
              const trimmed = part.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.replace(/^data:\s*/, '');
              if (!jsonStr) continue;

              try {
                const event = JSON.parse(jsonStr);
                if (event.type === 'chunk' && typeof event.text === 'string') {
                  rawAccumulatedText += event.text;
                  const displayProse = stripInternalFences(rawAccumulatedText);
                  setFirestoreMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, text: displayProse } : m
                    )
                  );
                } else if (event.type === 'done') {
                  donePayload = event as StreamDonePayload;
                } else if (event.type === 'error') {
                  throw new Error(event.error || 'Streaming error occurred.');
                }
              } catch (parseErr) {
                if (
                  parseErr instanceof Error &&
                  parseErr.message.includes('Streaming error')
                ) {
                  throw parseErr;
                }
              }
            }
          }

          const resolvedText =
            donePayload?.text || stripInternalFences(rawAccumulatedText) || rawAccumulatedText;

          finalAssistantMsg = {
            id: assistantMsgId,
            sessionId,
            userId: activeUser.uid,
            role: 'assistant',
            text: resolvedText,
            language: donePayload?.language || detectedLang,
            subject: chosenSubject,
            mode: donePayload?.mode || (effectiveSolveMode ? 'problem_solve' : 'general'),
            problemSolve: donePayload?.problemSolve,
            pyqItems: donePayload?.pyqItems,
            youtubeVideos: donePayload?.youtubeVideos,
            groundingLinks: donePayload?.groundingLinks,
            createdAt: Date.now(),
            isStreaming: false,
          };
        } else {
          // Standard JSON fallback
          const data = await res.json();
          finalAssistantMsg = {
            id: assistantMsgId,
            sessionId,
            userId: activeUser.uid,
            role: 'assistant',
            text: data.text,
            language: data.language || detectedLang,
            subject: chosenSubject,
            mode: data.mode || 'general',
            problemSolve: data.problemSolve,
            pyqItems: data.pyqItems,
            youtubeVideos: data.youtubeVideos,
            groundingLinks: data.groundingLinks,
            createdAt: Date.now(),
            isStreaming: false,
          };
        }

        // Finalize local state
        setFirestoreMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? finalAssistantMsg : m))
        );

        // Persist final message once streaming finishes
        await persistMessageAndSession(
          activeUser,
          sessionId,
          queryText.slice(0, 80),
          finalAssistantMsg.language,
          chosenSubject,
          finalAssistantMsg,
          false,
          currentCount + 2
        );
      } catch (err) {
        setFirestoreMessages((prev) =>
          prev.filter((m) => m.id !== assistantMsgId || Boolean(m.text.trim()))
        );
        setChatError(
          err instanceof Error
            ? err.message
            : 'Could not reach Madhyamik AI Mitra research server.'
        );
      } finally {
        setIsResearching(false);
      }
    },
    [
      inputValue,
      isResearching,
      user,
      micLang,
      lockedSubject,
      solveMode,
      activeSessionId,
      sessions,
      activeMessages,
      attachment,
      openSignInGate,
      persistMessageAndSession,
    ]
  );

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    setChatError(null);
    try {
      const signedInUser = await signInWithGoogle();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('mitra_guest_user');
      }
      await ensureUserProfile(signedInUser, micLang);

      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      setSignInGateOpen(false);
      setSignInReason(null);

      if (pending) {
        hasAutoSelectedSessionRef.current = true;
        const freshId = makeId('sess');
        setActiveSessionId(freshId);
        setFirestoreMessages([]);
        setAttachment(null);
        setLockedSubject(pending.subject ?? null);

        if (pending.prompt) {
          void sendPrompt(
            pending.prompt,
            pending.subject ?? 'All Subjects',
            signedInUser,
            freshId
          );
        } else if (pending.openLiveVoice) {
          setLiveVoiceOpen(true);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
        setSignInGateOpen(true);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleContinueAsGuest = useCallback(() => {
    const guestUser: AppUser = {
      uid: 'guest_student',
      displayName: 'Madhyamik Student (Guest)',
      email: 'guest@student.local',
      isGuest: true,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('mitra_guest_user', JSON.stringify(guestUser));
    }
    setUser(guestUser);
    setSignInGateOpen(false);
    setSignInReason(null);
    setAuthError(null);

    const pending = pendingActionRef.current;
    pendingActionRef.current = null;
    if (pending) {
      hasAutoSelectedSessionRef.current = true;
      const freshId = makeId('sess');
      setActiveSessionId(freshId);
      setFirestoreMessages([]);
      setAttachment(null);
      setLockedSubject(pending.subject ?? null);

      if (pending.prompt) {
        void sendPrompt(
          pending.prompt,
          pending.subject ?? 'All Subjects',
          guestUser,
          freshId
        );
      } else if (pending.openLiveVoice) {
        setLiveVoiceOpen(true);
      }
    }
  }, [sendPrompt]);

  const handleSignOut = async () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('mitra_guest_user');
      }
      if (user && !isGuestUser(user)) {
        await signOutUser();
      }
      setUser(null);
      hasAutoSelectedSessionRef.current = false;
      setSessions([]);
      setActiveSessionId(makeId('sess'));
      setLockedSubject(null);
      setFirestoreMessages([]);
      setAttachment(null);
      setChatError(null);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Sign-out failed.');
    }
  };

  const handleUploadFile = async (file: File) => {
    if (!user) {
      openSignInGate(
        micLang === 'bn'
          ? 'ছবি বা PDF আপলোড ও বিশ্লেষণ করতে Google দিয়ে সাইন ইন করো।'
          : 'Sign in with Google first to upload and analyze a problem image or PDF.'
      );
      return;
    }

    setUploadError(null);
    if (!isSupportedDocumentType(file.name, file.type)) {
      setUploadError(
        micLang === 'bn'
          ? 'অনুগ্রহ করে PNG, JPG, WEBP ছবি অথবা PDF/TXT ফাইল আপলোড করো।'
          : 'Please upload an Image (PNG, JPG, WEBP), PDF (.pdf), or Text (.txt) file.'
      );
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setUploadError('File size must be under 8 MB.');
      return;
    }

    const previewUrl = file.type.startsWith('image/')
      ? URL.createObjectURL(file)
      : undefined;

    setIsUploading(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const commaIdx = result.indexOf(',');
          resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
        };
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/upload-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          base64Data,
        }),
      });

      const data = (await res.json()) as {
        fileName?: string;
        mimeType?: string;
        summary?: string;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload document.');
      }

      const nextAttachment: UploadedPaperContext = {
        fileName: data.fileName || file.name,
        mimeType: data.mimeType || file.type || 'application/pdf',
        summary: data.summary || '',
        base64Data,
        previewUrl,
        sizeBytes: file.size,
      };
      setAttachment(nextAttachment);

      if (activeSession) {
        await updateFirestoreSessionMeta(user.uid, activeSession.id, {
          hasAttachment: true,
          attachmentName: nextAttachment.fileName,
          attachmentSummary: nextAttachment.summary,
        });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Document upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAttachment = async () => {
    setAttachment(null);
    setUploadError(null);
    if (user && activeSession) {
      try {
        await updateFirestoreSessionMeta(user.uid, activeSession.id, {
          hasAttachment: false,
          attachmentName: '',
          attachmentSummary: '',
        });
      } catch {
        // Ignore metadata update error
      }
    }
  };

  const handleSaveLiveTranscript = async (turns: LiveTranscriptTurn[]) => {
    setLiveVoiceOpen(false);
    const formatted = formatLiveTranscriptSummary(turns, micLang);
    if (!formatted || !user) return;

    const sessionId = activeSessionId;
    const isNewSession = !sessions.some((s) => s.id === sessionId);
    const currentCount = activeMessages.length;
    const chosenSubject = effectiveSubject;
    if (lockedSubject === null) {
      setLockedSubject(chosenSubject);
    }

    const transcriptMsg: ChatMessage = {
      id: makeId('voice'),
      sessionId,
      userId: user.uid,
      role: 'voice_transcript',
      text: formatted,
      language: micLang,
      subject: chosenSubject,
      mode: 'voice',
      createdAt: Date.now(),
    };

    try {
      await persistMessageAndSession(
        user,
        sessionId,
        micLang === 'bn'
          ? `লাইভ ভয়েস প্রস্তুতি · ${chosenSubject}`
          : `Live Voice Prep · ${chosenSubject}`,
        micLang,
        chosenSubject,
        transcriptMsg,
        isNewSession,
        currentCount + 1
      );
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : 'Failed to save voice transcript.'
      );
    }
  };

  const handleOpenLiveVoice = () => {
    if (!user) {
      openSignInGate(
        micLang === 'bn'
          ? 'লাইভ ভয়েস ভাইভা টিউটর ব্যবহার করতে প্রথমে Google দিয়ে সাইন ইন করো।'
          : 'Sign in with Google first to start a real-time Live Voice Prep session.',
        undefined,
        lockedSubject ?? undefined,
        true
      );
      return;
    }
    setLiveVoiceOpen(true);
  };

  const visibleStarters = useMemo(() => {
    if (lockedSubject === null) {
      return [
        STARTER_PROMPTS[0],
        STARTER_PROMPTS[1],
        STARTER_PROMPTS[4],
        STARTER_PROMPTS[6],
        STARTER_PROMPTS[8],
        STARTER_PROMPTS[10],
      ];
    }
    return STARTER_PROMPTS.filter((s) => s.subject === lockedSubject);
  }, [lockedSubject]);

  if (!authReady || !minLoadingDone || previewLoader) {
    return (
      <MotionConfig reducedMotion="user">
        <BrandLoader variant="fullscreen" size="lg" language={micLang} />
      </MotionConfig>
    );
  }

  // Show creative landing page when not authenticated (unless ?autostart=1 workspace preview is requested)
  if (!user && !autostartWorkspace) {
    return (
      <MotionConfig reducedMotion="user">
        <LandingPage
          onRequireLogin={(reason, pendingPrompt, pendingSubject) => {
            const isVoice = Boolean(
              reason && (reason.toLowerCase().includes('voice') || reason.includes('ভয়েস'))
            );
            openSignInGate(reason, pendingPrompt, pendingSubject, isVoice);
          }}
          onDirectSignIn={() => void handleGoogleSignIn()}
          onContinueAsGuest={handleContinueAsGuest}
          authLoading={authLoading}
          language={micLang}
          onToggleLanguage={setMicLang}
        />
        <SignInGateModal
          isOpen={signInGateOpen}
          onClose={() => setSignInGateOpen(false)}
          onSignIn={() => void handleGoogleSignIn()}
          onContinueAsGuest={handleContinueAsGuest}
          authLoading={authLoading}
          reason={signInReason}
          error={authError}
          language={micLang}
        />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="h-screen flex flex-col bg-[#F7F6F2] text-[#141517] overflow-hidden">
      {/* Top Header */}
      <header className="h-14 bg-white border-b border-[#E4E2DC] px-3 sm:px-6 flex items-center justify-between gap-4 shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Open sidebar'}
            aria-expanded={sidebarOpen}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#4B4E54] hover:text-[#141517] hover:bg-[#F3F1EC] transition-colors shrink-0 cursor-pointer"
          >
            <PanelLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandLogo size="sm" interactive />
            <span className="font-display font-bold text-base sm:text-lg tracking-tight text-[#141517] whitespace-nowrap truncate">
              Madhyamik AI Mitra
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={handleOpenLiveVoice}
            className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl bg-[#141517] hover:bg-[#0F4C5C] text-[#F7F6F2] text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <AudioLines className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Live Voice Prep</span>
          </motion.button>
        </div>
      </header>

      {/* Subject Selector / Locked Subject Bar */}
      <SubjectBar
        lockedSubject={lockedSubject}
        onSelectSubject={handleSelectSubject}
        onStartNewChat={handleNewSession}
        language={micLang}
      />

      {/* Main Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          isOpen={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          user={user}
          onGoogleSignIn={() => void handleGoogleSignIn()}
          onSignOut={() => void handleSignOut()}
          authLoading={authLoading}
          attachment={attachment}
          onUploadFile={handleUploadFile}
          onRemoveAttachment={handleRemoveAttachment}
          isUploading={isUploading}
          uploadError={uploadError}
          language={micLang}
          onRequireSignIn={(reason) => openSignInGate(reason)}
        />

        {/* Chat Workspace */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#F7F6F2]">
          <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-6">
            <div className="max-w-3xl mx-auto">
              {activeMessages.length === 0 ? (
                <div className="py-5 sm:py-10 space-y-8">
                  <div className="space-y-3 max-w-2xl">
                    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] font-medium text-[#0F4C5C]">
                      <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>WBBSE Class 10 Autonomous Exam Companion</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#141517] tracking-[-0.02em] text-balance">
                      {micLang === 'bn' ? (
                        <BlurRevealText text="স্বাগতম! মাধ্যমিক ২০২৬–২৭ পরীক্ষার জন্য কী প্রস্তুতি নেবে আজ?" />
                      ) : (
                        <BlurRevealText text="Master Madhyamik with 10-Year PYQ Trends & Clear Explanations" />
                      )}
                    </h1>
                    <p className="text-sm sm:text-[15px] text-[#4B4E54] leading-relaxed">
                      {micLang === 'bn'
                        ? 'যেকোনো অধ্যায়ের বিগত ১০ বছরের গুরুত্বপূর্ণ প্রশ্ন, নম্বরের গুরুত্ব অথবা সহজ বাংলায় কনসেপ্ট ও ভিডিও লেকচার জিজ্ঞাসা করো।'
                        : 'Ask for high-probability board questions with year-wise trend analysis, or request simple topic explanations with curated YouTube lectures in English or Bengali.'}
                    </p>
                  </div>

                  {/* Subject Selection (only shown before a subject is chosen in this new chat) */}
                  {lockedSubject === null && (
                    <section aria-label="Choose Subject for New Chat" className="space-y-3">
                      <h2 className="font-mono text-[11px] uppercase tracking-wider font-semibold text-[#5A5C60]">
                        {micLang === 'bn'
                          ? 'এই নতুন চ্যাটের জন্য একটি বিষয় বেছে নাও'
                          : 'Step 1 · Choose a Subject for This Chat'}
                      </h2>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {SUBJECT_META.map((subj) => (
                          <SpotlightCard
                            key={subj.id}
                            className="bg-white border border-[#DFDCD2] hover:border-[#0F4C5C]/50 rounded-xl transition-colors"
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectSubject(subj.id)}
                              className="w-full h-full text-left px-3.5 py-3 cursor-pointer group"
                            >
                              <div className="font-display text-xs sm:text-sm font-semibold text-[#141517] group-hover:text-[#0F4C5C] transition-colors">
                                {micLang === 'bn' ? subj.labelBn : subj.labelEn}
                              </div>
                              <div className="text-[11px] text-[#6B6E75] mt-0.5">
                                {micLang === 'bn' ? subj.labelEn : subj.labelBn}
                              </div>
                            </button>
                          </SpotlightCard>
                        ))}
                      </div>
                      <p className="text-xs text-[#5A5C60]">
                        {micLang === 'bn'
                          ? 'বিশেষ টিপস: গণিত (Mathematics) বা ভৌত বিজ্ঞান (Physical Science) বেছে নিলে ইন্টারেক্টিভ ব্ল্যাকবোর্ড প্রবলেম সলভার মোড চালু হবে।'
                          : 'Tip: Selecting Mathematics or Physical Science unlocks the interactive Blackboard Teacher Problem Solver.'}
                      </p>
                    </section>
                  )}

                  {/* Dedicated Blackboard Teacher Problem Solve Section — strictly for Mathematics & Physical Science */}
                  {(lockedSubject === 'Mathematics' || lockedSubject === 'Physical Science') && (
                    <>
                      <input
                        ref={bannerFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,application/pdf,text/plain"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            void handleUploadFile(file);
                          }
                          e.target.value = '';
                        }}
                        className="hidden"
                        aria-label="Upload Math or Physical Science problem image or PDF"
                      />
                      <ProblemSolverBanner
                        subject={lockedSubject}
                        language={micLang}
                        solveMode={solveMode}
                        onToggleSolveMode={setSolveMode}
                        onTriggerUpload={() => {
                          if (!user) {
                            openSignInGate(
                              micLang === 'bn'
                                ? 'অঙ্ক বা ভৌত বিজ্ঞানের ছবি/PDF আপলোড করতে প্রথমে Google দিয়ে সাইন ইন করো।'
                                : 'Sign in with Google first to upload a Math or Physical Science problem image/PDF.'
                            );
                            return;
                          }
                          bannerFileInputRef.current?.click();
                        }}
                        onTrySampleProblem={(query, targetSubj) => {
                          if (!user) {
                            openSignInGate(
                              micLang === 'bn'
                                ? 'ধাপে ধাপে সমস্যা সমাধান দেখতে প্রথমে Google দিয়ে সাইন ইন করো।'
                                : 'Sign in with Google first to run the Blackboard Teacher Problem Solver.',
                              query,
                              targetSubj
                            );
                            return;
                          }
                          handleSelectSubject(targetSubj);
                          void sendPrompt(query, targetSubj, undefined, undefined, {
                            solveModeOverride: true,
                            solveAction: 'start',
                          });
                        }}
                      />
                    </>
                  )}

                  {/* Quick-Action Starter Chips */}
                  <section aria-label="Quick Study Starters" className="space-y-3">
                    <h2 className="font-mono text-[11px] uppercase tracking-wider font-semibold text-[#5A5C60] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#0F4C5C]" aria-hidden="true" />
                      <span>
                        {micLang === 'bn'
                          ? 'দ্রুত শুরু করার নমুনা প্রশ্ন'
                          : 'Try a Quick Research Query'}
                      </span>
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {visibleStarters.map((starter) => (
                        <SpotlightCard
                          key={starter.id}
                          className="bg-white border border-[#DFDCD2] hover:border-[#0F4C5C]/45 rounded-xl transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (!user) {
                                openSignInGate(
                                  micLang === 'bn'
                                    ? 'AI দিয়ে উত্তর ও PYQ বিশ্লেষণ দেখতে প্রথমে Google দিয়ে সাইন ইন করো।'
                                    : 'Sign in with Google first to run this WBBSE research query.',
                                  starter.query,
                                  lockedSubject === 'All Subjects'
                                    ? 'All Subjects'
                                    : starter.subject
                                );
                                return;
                              }
                              const targetSubject =
                                lockedSubject === 'All Subjects'
                                  ? 'All Subjects'
                                  : starter.subject;
                              handleSelectSubject(targetSubject);
                              void sendPrompt(starter.query, targetSubject);
                            }}
                            className="w-full h-full text-left p-4 cursor-pointer group"
                          >
                            <div className="font-mono text-[11px] font-medium text-[#6B6E75] mb-1">
                              {starter.subject}
                              <span aria-hidden="true"> · </span>
                              <span>{starter.lang === 'bn' ? 'বাংলা' : 'English'}</span>
                            </div>
                            <div className="text-sm font-medium text-[#141517] group-hover:text-[#0F4C5C] leading-snug transition-colors">
                              {starter.label}
                            </div>
                          </button>
                        </SpotlightCard>
                      ))}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="space-y-6 pb-4">
                  {activeMessages.map((msg) => (
                    <ChatMessageBubble
                      key={msg.id}
                      message={msg}
                      isLatestAssistant={msg.id === latestAssistantMsgId}
                      localPreviewUrl={localImagePreviews[msg.id]}
                      disabled={isResearching}
                      onAdvanceSection={(secNum, updatedBoardHistory, topicTitle) => {
                        const nextSec = secNum + 1;
                        const followUp =
                          msg.language === 'bn'
                            ? `হ্যাঁ, আমি "${topicTitle}"-এর অংশ ${secNum} পরিষ্কার বুঝেছি। এবার ব্ল্যাকবোর্ডে অংশ ${nextSec} শুরু করো।`
                            : `Yes, I clearly understood Section ${secNum} of "${topicTitle}". Please continue on the blackboard with Section ${nextSec}.`;

                        void sendPrompt(followUp, effectiveSubject, undefined, undefined, {
                          solveModeOverride: true,
                          solveAction: 'next_section',
                          currentSection: secNum,
                          boardHistory: updatedBoardHistory,
                        });
                      }}
                      onRequestSimpler={(
                        nextLevel,
                        confusionNote,
                        targetSection,
                        boardHistory
                      ) => {
                        const sec = targetSection ?? 1;
                        const followUp =
                          msg.language === 'bn'
                            ? confusionNote
                              ? `আমি অংশ ${sec} এখনও বুঝতে পারিনি (${confusionNote})। অনুগ্রহ করে ব্ল্যাকবোর্ডের এই অংশটাই আরও সহজ উদাহরণ দিয়ে লেভেল ${nextLevel}-এ ভেঙে বোঝাও।`
                              : `আমি অংশ ${sec} এখনও বুঝতে পারিনি। অনুগ্রহ করে এই অংশটাই আরও সহজ ভাষায় লেভেল ${nextLevel}-এ ভেঙে বোঝাও।`
                            : confusionNote
                              ? `I am still confused about Section ${sec}: "${confusionNote}". Please re-teach this exact section on the blackboard in simpler words (Simplification Level ${nextLevel}).`
                              : `I didn't fully understand Section ${sec} yet. Please simplify this exact section on the blackboard with an everyday analogy and tiny steps (Simplification Level ${nextLevel}).`;

                        void sendPrompt(followUp, effectiveSubject, undefined, undefined, {
                          solveModeOverride: true,
                          simplificationLevel: nextLevel,
                          solveAction: 'simplify_section',
                          currentSection: sec,
                          boardHistory,
                        });
                      }}
                      onTryPractice={(topicTitle) => {
                        const practicePrompt =
                          msg.language === 'bn'
                            ? `আমি "${topicTitle}" বুঝেছি! এবার আমাকে ABTA বা WBTA টেস্ট পেপার থেকে ওই একই বিষয়ের একটি অনুরূপ অনুশীলনী প্রশ্ন দাও, যাতে আমি নিজে চেষ্টা করতে পারি (উত্তরটা শেষে সংক্ষেপে দিও বা হিন্ট দিও)।`
                            : `I understood "${topicTitle}"! Give me one similar practice problem from WBBSE / ABTA / WBTA test papers on this exact topic so I can test my understanding.`;

                        void sendPrompt(practicePrompt, effectiveSubject, undefined, undefined, {
                          solveModeOverride: false,
                        });
                      }}
                      onSwitchSubjectChat={handleNewSession}
                    />
                  ))}

                  {isResearching && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="inline-flex bg-white border border-[#DFDCD2] rounded-2xl px-4 py-3 shadow-[0_6px_22px_-16px_rgba(20,21,23,0.14)] max-w-md"
                    >
                      <BrandLoader
                        variant="inline"
                        size="sm"
                        language={micLang}
                        label={
                          micLang === 'bn'
                            ? 'WBBSE, ABTA ও WBTA তথ্য বিশ্লেষণ করা হচ্ছে...'
                            : 'Researching WBBSE, ABTA & WBTA sources...'
                        }
                        sublabel={
                          micLang === 'bn'
                            ? 'বিগত মাধ্যমিক প্রশ্ন ও পাঠ্যবই মিলিয়ে দেখা হচ্ছে'
                            : 'Cross-checking PYQs, syllabus weightage & guides'
                        }
                      />
                    </div>
                  )}

                  {chatError && (
                    <div
                      role="alert"
                      className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm"
                    >
                      {chatError}
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </div>

          <ChatInputBar
            value={inputValue}
            onChange={setInputValue}
            onSend={() => void sendPrompt()}
            micLang={micLang}
            onToggleMicLang={setMicLang}
            disabled={isResearching}
            attachment={attachment}
            isUploading={isUploading}
            uploadError={uploadError}
            onUploadFile={(f) => void handleUploadFile(f)}
            onRemoveAttachment={() => void handleRemoveAttachment()}
            onRequireSignInForUpload={() => {
              if (!user) {
                openSignInGate(
                  micLang === 'bn'
                    ? 'চ্যাটে ছবি বা PDF আপলোড করতে প্রথমে Google দিয়ে সাইন ইন করো।'
                    : 'Sign in with Google first to upload an image or PDF in chat.'
                );
                return true;
              }
              return false;
            }}
            problemSolveAvailable={isProblemSolveSubject(effectiveSubject)}
            solveMode={isProblemSolveSubject(effectiveSubject) && solveMode}
            onToggleSolveMode={(next) => {
              if (isProblemSolveSubject(effectiveSubject)) {
                setSolveMode(next);
              }
            }}
          />
        </main>
      </div>

      <LiveVoiceModal
        isOpen={liveVoiceOpen}
        subject={effectiveSubject}
        language={micLang}
        onCloseAndSave={(turns) => void handleSaveLiveTranscript(turns)}
      />

      <SignInGateModal
        isOpen={signInGateOpen}
        onClose={() => setSignInGateOpen(false)}
        onSignIn={() => void handleGoogleSignIn()}
        onContinueAsGuest={handleContinueAsGuest}
        authLoading={authLoading}
        reason={signInReason}
        error={authError}
        language={micLang}
      />
    </div>
    </MotionConfig>
  );
}
