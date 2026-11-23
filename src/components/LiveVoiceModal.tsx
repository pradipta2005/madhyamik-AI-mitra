import { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, PhoneOff, Volume2, X, Send, Square, Sparkles } from 'lucide-react';
import type { LanguageCode, LiveTranscriptTurn, WbbseSubject } from '../types';
import {
  cleanVoiceRecognitionText,
  deduplicateConsecutiveWords,
  formatTeacherSpeechForAudio,
} from '../utils/wbbseResearch';

interface LiveVoiceModalProps {
  isOpen: boolean;
  subject: WbbseSubject;
  language: LanguageCode;
  onCloseAndSave: (turns: LiveTranscriptTurn[]) => void;
}

interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function float32ToResampledPcm16Base64(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): string {
  let samples: Float32Array;
  if (inputSampleRate === targetSampleRate) {
    samples = input;
  } else {
    const ratio = inputSampleRate / targetSampleRate;
    const newLen = Math.max(1, Math.round(input.length / ratio));
    samples = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const idx = Math.min(input.length - 1, Math.floor(i * ratio));
      samples[i] = input[idx];
    }
  }

  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const numSamples = Math.floor(bytes.length / 2);
  const floats = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    floats[i] = view.getInt16(i * 2, true) / 32768;
  }
  return floats;
}

/**
 * Splits text stream into completed sentences by punctuation (। , ? , ! , . or newline)
 */
function splitCompletedSentences(buffer: string): { sentences: string[]; remainder: string } {
  const regex = /([^।?!.\n]+[।?!.\n]+)/g;
  let lastIndex = 0;
  const sentences: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(buffer)) !== null) {
    const text = match[1].trim();
    if (text) {
      sentences.push(text);
    }
    lastIndex = regex.lastIndex;
  }

  if (sentences.length > 0) {
    return { sentences, remainder: buffer.slice(lastIndex).trimStart() };
  }

  // If buffer is getting long without terminal punctuation, split at a natural pause (comma or semicolon)
  if (buffer.length > 110) {
    const commaMatch = buffer.match(/^([^,;]+[,;]+)\s*(.*)$/);
    if (commaMatch && commaMatch[1]) {
      return { sentences: [commaMatch[1].trim()], remainder: commaMatch[2].trimStart() };
    }
  }

  return { sentences, remainder: buffer };
}

export function LiveVoiceModal({
  isOpen,
  subject,
  language,
  onCloseAndSave,
}: LiveVoiceModalProps) {
  const [engine, setEngine] = useState<'high-capacity' | 'gemini-live'>('high-capacity');
  const [status, setStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [turns, setTurns] = useState<LiveTranscriptTurn[]>([]);
  const [interimText, setInterimText] = useState('');
  const [isTeacherSpeaking, setIsTeacherSpeaking] = useState(false);
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);
  const isProcessingTurnRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMutedRef = useRef(false);
  const turnsRef = useRef<LiveTranscriptTurn[]>([]);
  const energyRef = useRef<number>(0.08);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const captionsEndRef = useRef<HTMLDivElement | null>(null);

  // High-Capacity Web Voice Engine refs
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isRecognitionActiveRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);
  const currentSentenceBufferRef = useRef('');
  const committedStudentTurnRef = useRef('');
  const isSessionActiveRef = useRef(false);
  const activeUtterancesRef = useRef<Set<SpeechSynthesisUtterance>>(new Set());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const spokenTextRef = useRef('');
  const fullTutorTextRef = useRef('');

  // Chromium speech synthesis watchdog and voice pre-warming
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const preloadVoices = () => {
      window.speechSynthesis.getVoices();
    };
    window.speechSynthesis.onvoiceschanged = preloadVoices;
    preloadVoices();

    const watchdog = window.setInterval(() => {
      if (isSpeakingRef.current && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 2500);

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.clearInterval(watchdog);
    };
  }, []);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    turnsRef.current = turns;
    captionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const appendTranscript = useCallback((speaker: 'student' | 'tutor', chunk: string) => {
    if (!chunk || !chunk.trim()) return;
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          text: `${last.text}${chunk}`,
        };
        return updated;
      }
      return [...prev, { speaker, text: chunk, timestamp: Date.now() }];
    });
  }, []);

  const tryFallbackSpeechSynthesis = useCallback(
    (text: string, onComplete: () => void) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        onComplete();
        return;
      }
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        activeUtterancesRef.current.add(utterance);
        utterance.lang = language === 'bn' ? 'bn-IN' : 'en-IN';
        const voices = window.speechSynthesis.getVoices();
        const matchingVoice = voices.find(
          (v) =>
            v.lang.toLowerCase().startsWith(language === 'bn' ? 'bn' : 'en') ||
            (language === 'bn' && v.name.toLowerCase().includes('bengali'))
        );
        if (matchingVoice) utterance.voice = matchingVoice;

        utterance.onend = () => {
          activeUtterancesRef.current.delete(utterance);
          onComplete();
        };
        utterance.onerror = () => {
          activeUtterancesRef.current.delete(utterance);
          onComplete();
        };

        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      } catch {
        onComplete();
      }
    },
    [language]
  );

  // --- Sentence-by-Sentence Audio Playback Queue via Real Audio / TTS ---
  const playNextSentence = useCallback(() => {
    if (isSpeakingRef.current || audioQueueRef.current.length === 0) return;
    const nextSentence = audioQueueRef.current.shift();
    if (!nextSentence || !nextSentence.trim()) return;

    isSpeakingRef.current = true;
    setIsTeacherSpeaking(true);

    // Synchronously reveal each spoken sentence as it begins playing
    spokenTextRef.current = spokenTextRef.current
      ? `${spokenTextRef.current}\n\n${nextSentence}`
      : nextSentence;

    setTurns((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last && last.speaker === 'tutor') {
        copy[copy.length - 1] = { ...last, text: spokenTextRef.current };
      }
      return copy;
    });

    // Pause recognition to prevent feedback echo
    if (recognitionRef.current && isRecognitionActiveRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      isRecognitionActiveRef.current = false;
    }

    let safetyTimer: number | null = null;
    let completed = false;

    const onAudioComplete = () => {
      if (completed) return;
      completed = true;
      if (safetyTimer) {
        window.clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      currentAudioRef.current = null;
      isSpeakingRef.current = false;

      if (audioQueueRef.current.length > 0) {
        playNextSentence();
      } else {
        setIsTeacherSpeaking(false);
        // Once all spoken audio completes, ensure the full response is fully visible
        if (fullTutorTextRef.current) {
          setTurns((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.speaker === 'tutor') {
              copy[copy.length - 1] = { ...last, text: fullTutorTextRef.current };
            }
            return copy;
          });
        }
        // Resume microphone recognition once teacher finishes (if no turn is currently being processed)
        if (
          !isMutedRef.current &&
          isSessionActiveRef.current &&
          !isProcessingTurnRef.current &&
          recognitionRef.current
        ) {
          try {
            recognitionRef.current.start();
            isRecognitionActiveRef.current = true;
          } catch {
            // ignore
          }
        }
      }
    };

    // Safety watchdog: prevent stuck speaking state if audio stalls
    const maxDurationMs = Math.max(4500, nextSentence.length * 140);
    safetyTimer = window.setTimeout(() => {
      console.warn('Audio sentence watchdog triggered.');
      onAudioComplete();
    }, maxDurationMs);

    try {
      const audioUrl = `/api/tts-audio?text=${encodeURIComponent(nextSentence)}&lang=${language === 'bn' ? 'bn' : 'en'}`;
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onplay = () => {
        setIsTeacherSpeaking(true);
        energyRef.current = Math.max(energyRef.current, 0.75);
      };

      audio.ontimeupdate = () => {
        energyRef.current = Math.max(energyRef.current, 0.55 + Math.random() * 0.35);
      };

      audio.onended = () => {
        onAudioComplete();
      };

      audio.onerror = () => {
        console.warn('TTS audio fetch error, falling back to browser SpeechSynthesis');
        tryFallbackSpeechSynthesis(nextSentence, onAudioComplete);
      };

      audio.play().catch((playErr) => {
        console.warn('Audio play() failed, trying SpeechSynthesis fallback:', playErr);
        tryFallbackSpeechSynthesis(nextSentence, onAudioComplete);
      });
    } catch {
      tryFallbackSpeechSynthesis(nextSentence, onAudioComplete);
    }
  }, [language, tryFallbackSpeechSynthesis]);

  const queueSentenceForAudio = useCallback(
    (sentence: string) => {
      const normalized = formatTeacherSpeechForAudio(sentence, language);
      if (normalized.trim()) {
        audioQueueRef.current.push(normalized.trim());
        if (!isSpeakingRef.current) {
          playNextSentence();
        }
      }
    },
    [language, playNextSentence]
  );

  // --- Dispatch Student Voice Turn to High-Capacity Endpoint ---
  const submitStudentTurn = useCallback(
    async (textToSend: string) => {
      if (!textToSend || !textToSend.trim() || isProcessingTurnRef.current) return;

      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      // If teacher was speaking when student sends turn, interrupt immediately
      if (isSpeakingRef.current || currentAudioRef.current) {
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
          currentAudioRef.current = null;
        }
        window.speechSynthesis.cancel();
        activeUtterancesRef.current.clear();
        audioQueueRef.current = [];
        isSpeakingRef.current = false;
        setIsTeacherSpeaking(false);
        if (fullTutorTextRef.current) {
          setTurns((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.speaker === 'tutor') {
              copy[copy.length - 1] = { ...last, text: fullTutorTextRef.current };
            }
            return copy;
          });
        }
      }

      const cleanedQuery = deduplicateConsecutiveWords(
        cleanVoiceRecognitionText(textToSend, language)
      );
      if (!cleanedQuery) return;

      // Mark turn processing true BEFORE stopping recognition so onend will not restart
      isProcessingTurnRef.current = true;
      setIsProcessingTurn(true);

      // IMMEDIATELY pause speech recognition so room noise/feedback is not recorded while waiting
      if (recognitionRef.current && isRecognitionActiveRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        isRecognitionActiveRef.current = false;
      }

      appendTranscript('student', cleanedQuery);
      setInterimText('');
      committedStudentTurnRef.current = '';
      spokenTextRef.current = '';
      fullTutorTextRef.current = '';

      // Add placeholder for tutor
      const tutorPlaceholderId = Date.now();
      setTurns((prev) => [
        ...prev,
        { speaker: 'tutor', text: '', timestamp: tutorPlaceholderId },
      ]);

      currentSentenceBufferRef.current = '';

      try {
        const historyPayload = turnsRef.current
          .slice(-6)
          .map((t) => ({ speaker: t.speaker, text: t.text }));

        const res = await fetch('/api/live-voice-turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            message: cleanedQuery,
            subject,
            language,
            history: historyPayload,
            preferOpenRouter: engine === 'high-capacity',
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error('Live voice response service error.');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.replace(/^data:\s*/, '');
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);
              if (event.type === 'chunk' && typeof event.text === 'string') {
                fullTutorTextRef.current += event.text;
                currentSentenceBufferRef.current += event.text;

                // Check for completed sentences to pipeline audio and synchronize visible text
                const { sentences, remainder } = splitCompletedSentences(
                  currentSentenceBufferRef.current
                );
                for (const sentence of sentences) {
                  queueSentenceForAudio(sentence);
                }
                currentSentenceBufferRef.current = remainder;
              } else if (event.type === 'done') {
                if (currentSentenceBufferRef.current.trim()) {
                  queueSentenceForAudio(currentSentenceBufferRef.current.trim());
                  currentSentenceBufferRef.current = '';
                }
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (err) {
        console.error('Turn dispatch error:', err);
        setTurns((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.speaker === 'tutor' && !last.text) {
            copy[copy.length - 1] = {
              ...last,
              text:
                language === 'bn'
                  ? 'সংযোগজনিত সমস্যা হয়েছে। অনুগ্রহ করে আবার বলো।'
                  : 'A brief connection issue occurred. Please try speaking again.',
            };
          }
          return copy;
        });
      } finally {
        isProcessingTurnRef.current = false;
        setIsProcessingTurn(false);
      }
    },
    [appendTranscript, engine, language, queueSentenceForAudio, subject]
  );

  // Keep a stable ref to submitStudentTurn to prevent startHighCapacityEngine recreation
  const submitStudentTurnRef = useRef(submitStudentTurn);
  useEffect(() => {
    submitStudentTurnRef.current = submitStudentTurn;
  }, [submitStudentTurn]);

  // --- Interrupt Teacher ---
  const handleInterruptTeacher = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    window.speechSynthesis.cancel();
    activeUtterancesRef.current.clear();
    audioQueueRef.current = [];
    isSpeakingRef.current = false;
    setIsTeacherSpeaking(false);

    if (fullTutorTextRef.current) {
      setTurns((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.speaker === 'tutor') {
          copy[copy.length - 1] = { ...last, text: fullTutorTextRef.current };
        }
        return copy;
      });
    }

    if (!isMutedRef.current && isSessionActiveRef.current && !isProcessingTurnRef.current && recognitionRef.current) {
      try {
        recognitionRef.current.start();
        isRecognitionActiveRef.current = true;
      } catch {
        // ignore
      }
    }
  }, []);

  // --- High-Capacity Speech Recognition Setup ---
  const startHighCapacityEngine = useCallback(() => {
    setStatus('connecting');
    setErrorMsg(null);

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      setErrorMsg(
        language === 'bn'
          ? 'এই ব্রাউজারে ভয়েস রিকগনিশন সমর্থিত নয়। অনুগ্রহ করে ক্রোম ব্রাউজার ব্যবহার করুন।'
          : 'Browser speech recognition not supported. Please use Chrome.'
      );
      setStatus('error');
      return;
    }

    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    const recognition = new SpeechRec();
    recognition.lang = language === 'bn' ? 'bn-IN' : 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalStr = '';
      let interimStr = '';
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalStr += `${res[0].transcript} `;
        } else {
          interimStr += res[0].transcript;
        }
      }

      energyRef.current = Math.max(energyRef.current, 0.65);
      const combined = `${committedStudentTurnRef.current}${finalStr}${interimStr}`.trimStart();
      setInterimText(combined);

      // Auto-silence detection: 1.8 seconds of silence triggers automatic submission
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
      }
      if (combined.trim().length > 0) {
        silenceTimerRef.current = window.setTimeout(() => {
          if (combined.trim().length > 0) {
            void submitStudentTurnRef.current(combined);
          }
        }, 1800);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (event.error === 'not-allowed') {
        setErrorMsg(
          language === 'bn'
            ? 'মাইক্রোফোনের অনুমতি দিন।'
            : 'Microphone permission denied.'
        );
        setStatus('error');
      }
    };

    recognition.onend = () => {
      isRecognitionActiveRef.current = false;
      // Restart recognition if session is active, teacher is not speaking, and no turn is processing
      if (
        isSessionActiveRef.current &&
        !isMutedRef.current &&
        !isSpeakingRef.current &&
        !isProcessingTurnRef.current
      ) {
        try {
          recognition.start();
          isRecognitionActiveRef.current = true;
        } catch {
          // ignore
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      isRecognitionActiveRef.current = true;
      setStatus('live');
    } catch (err) {
      console.warn('Recognition start warning:', err);
      setStatus('live');
    }
  }, [language]);

  // --- Gemini Native Live WebSocket Session ---
  const startGeminiLiveSession = useCallback(() => {
    setStatus('connecting');
    setErrorMsg(null);

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/api/live-ws?subject=${encodeURIComponent(
      subject
    )}&lang=${language}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const outputCtx = new AudioContext({ sampleRate: 24000 });
    outputCtxRef.current = outputCtx;
    nextStartTimeRef.current = outputCtx.currentTime;

    ws.onopen = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const inputCtx = new AudioContext({ sampleRate: 16000 });
        inputCtxRef.current = inputCtx;
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(inputCtx.destination);

        processor.onaudioprocess = (e) => {
          if (isMutedRef.current || ws.readyState !== WebSocket.OPEN) return;
          const channel = e.inputBuffer.getChannelData(0);
          let peak = 0;
          for (let i = 0; i < channel.length; i += 8) {
            const abs = Math.abs(channel[i]);
            if (abs > peak) peak = abs;
          }
          if (peak > 0.02) {
            energyRef.current = Math.max(energyRef.current, Math.min(1, peak * 3.5));
          }
          const base64 = float32ToResampledPcm16Base64(
            channel,
            inputCtx.sampleRate,
            16000
          );
          ws.send(JSON.stringify({ audio: base64 }));
        };

        setStatus('live');
      } catch {
        setStatus('live');
        setErrorMsg(
          language === 'bn'
            ? 'মাইক্রোফোন অনুমতি না থাকায় শুধু শোনার মোডে যুক্ত হয়েছে।'
            : 'Microphone unavailable — connected in listen-only mode.'
        );
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type?: string;
          data?: string;
          text?: string;
          message?: string;
        };

        if (msg.type === 'ready') {
          setStatus('live');
        } else if (msg.type === 'inputTranscript' && msg.text) {
          appendTranscript('student', msg.text);
        } else if (msg.type === 'outputTranscript' && msg.text) {
          appendTranscript('tutor', msg.text);
        } else if (msg.type === 'audio' && msg.data && outputCtxRef.current) {
          const ctx = outputCtxRef.current;
          const floats = base64Pcm16ToFloat32(msg.data);
          energyRef.current = Math.max(energyRef.current, 0.72);
          const audioBuffer = ctx.createBuffer(1, floats.length, 24000);
          audioBuffer.copyToChannel(new Float32Array(floats), 0);

          const src = ctx.createBufferSource();
          src.buffer = audioBuffer;
          src.connect(ctx.destination);

          const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
          src.start(startTime);
          nextStartTimeRef.current = startTime + audioBuffer.duration;
          activeSourcesRef.current.add(src);
          src.onended = () => {
            activeSourcesRef.current.delete(src);
          };
        } else if (msg.type === 'interrupted') {
          for (const src of activeSourcesRef.current) {
            try {
              src.stop();
            } catch {
              // ignore
            }
          }
          activeSourcesRef.current.clear();
          if (outputCtxRef.current) {
            nextStartTimeRef.current = outputCtxRef.current.currentTime;
          }
        } else if (msg.type === 'error') {
          console.warn('Gemini live error, auto-failing over to High-Capacity engine:', msg.message);
          setErrorMsg(
            language === 'bn'
              ? 'Gemini Live কোটা পূর্ণ হয়েছে — স্বয়ংক্রিয়ভাবে আনলিমিটেড হাই-ক্যাপাসিটি মোডে সুইচ করা হলো।'
              : 'Switching automatically to High-Capacity Voice Engine...'
          );
          setEngine('high-capacity');
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      console.warn('Gemini Live WS error, auto-failing over to High-Capacity engine.');
      setErrorMsg(
        language === 'bn'
          ? 'স্বয়ংক্রিয়ভাবে আনলিমিটেড হাই-ক্যাপাসিটি মোডে সুইচ করা হলো।'
          : 'Switching automatically to High-Capacity Voice Engine...'
      );
      setEngine('high-capacity');
    };
  }, [appendTranscript, language, subject]);

  // --- Main Lifecycle ---
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let rafId = 0;
    isSessionActiveRef.current = true;
    setTurns([]);
    turnsRef.current = [];
    setIsMuted(false);
    isMutedRef.current = false;
    setInterimText('');

    const drawVisualizer = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          const bars = 28;
          const gap = 6;
          const barW = (w - (bars - 1) * gap) / bars;
          const now = Date.now() / 180;

          // Pulse simulated energy if teacher is speaking
          if (isSpeakingRef.current) {
            energyRef.current = Math.max(energyRef.current, 0.45 + 0.35 * Math.sin(now * 3));
          }

          const level = Math.max(0.08, Math.min(1, energyRef.current));
          energyRef.current = Math.max(0.08, energyRef.current * 0.92);

          for (let i = 0; i < bars; i++) {
            const centerWeight = 1 - Math.abs(i - bars / 2) / (bars / 2);
            const wave = 0.35 + 0.65 * Math.abs(Math.sin(now + i * 0.45));
            const barH = Math.max(6, h * level * centerWeight * wave);
            const x = i * (barW + gap);
            const y = (h - barH) / 2;
            ctx.fillStyle = isMutedRef.current
              ? '#94a3b8'
              : isSpeakingRef.current
                ? '#10B981'
                : '#0F4C5C';
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, 3);
            ctx.fill();
          }
        }
      }
      if (!cancelled) {
        rafId = requestAnimationFrame(drawVisualizer);
      }
    };

    rafId = requestAnimationFrame(drawVisualizer);

    if (engine === 'high-capacity') {
      startHighCapacityEngine();
    } else {
      startGeminiLiveSession();
    }

    return () => {
      cancelled = true;
      isSessionActiveRef.current = false;
      cancelAnimationFrame(rafId);
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
      }
      window.speechSynthesis.cancel();
      audioQueueRef.current = [];
      isSpeakingRef.current = false;

      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }

      for (const src of activeSourcesRef.current) {
        try {
          src.stop();
        } catch {
          // ignore
        }
      }
      activeSourcesRef.current.clear();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void inputCtxRef.current?.close();
      void outputCtxRef.current?.close();
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [isOpen, engine, startHighCapacityEngine, startGeminiLiveSession]);

  if (!isOpen) return null;

  const handleEndSession = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    window.speechSynthesis.cancel();
    isSessionActiveRef.current = false;
    onCloseAndSave(turnsRef.current);
  };

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      if (next && recognitionRef.current && isRecognitionActiveRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      } else if (!next && recognitionRef.current && !isSpeakingRef.current) {
        try {
          recognitionRef.current.start();
          isRecognitionActiveRef.current = true;
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live Voice Prep Tutor"
      className="fixed inset-0 z-50 bg-[#141517]/65 backdrop-blur-[2px] overflow-y-auto flex items-start lg:items-center justify-center pt-10 sm:pt-14 lg:pt-4 p-4"
    >
      <div className="bg-white border border-[#DFDCD2] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-3.5rem)] lg:max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E4E2DC] flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-semibold text-[#141517]">
                {language === 'bn'
                  ? 'লাইভ ভাইভা ও মৌখিক প্রস্তুতি'
                  : 'Live Oral Exam & Viva Prep'}
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6]">
                <Sparkles className="w-2.5 h-2.5" />
                {engine === 'high-capacity'
                  ? language === 'bn'
                    ? 'আনলিমিটেড মোড'
                    : 'Unlimited OpenRouter'
                  : 'Gemini Direct Live'}
              </span>
            </div>
            <p className="text-xs text-[#5A5C60] mt-0.5">
              {subject}
              <span aria-hidden="true"> · </span>
              <span>
                {status === 'connecting'
                  ? language === 'bn'
                    ? 'সংযোগ হচ্ছে...'
                    : 'Connecting...'
                  : isTeacherSpeaking
                    ? language === 'bn'
                      ? 'শিক্ষক বলছেন...'
                      : 'Teacher is speaking...'
                    : isProcessingTurn
                      ? language === 'bn'
                        ? 'উত্তর মূল্যায়ন হচ্ছে...'
                        : 'Evaluating answer...'
                      : isMuted
                        ? language === 'bn'
                          ? 'মিউট করা আছে'
                          : 'Microphone Muted'
                        : language === 'bn'
                          ? 'সক্রিয় · বড় উত্তর বা প্রশ্ন বলতে পারো'
                          : 'Live · Ready for short or long answers'}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Engine Switch Toggle */}
            <button
              type="button"
              onClick={() => {
                if (currentAudioRef.current) {
                  currentAudioRef.current.pause();
                  currentAudioRef.current.currentTime = 0;
                  currentAudioRef.current = null;
                }
                window.speechSynthesis.cancel();
                setEngine((e) => (e === 'high-capacity' ? 'gemini-live' : 'high-capacity'));
              }}
              className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-[#E4E2DC] bg-[#FAF9F6] hover:bg-[#F3F1EC] text-[#5A5C60] transition-colors cursor-pointer"
              title="Switch Voice Engine"
            >
              {engine === 'high-capacity' ? 'Switch to Live WS' : 'Switch to Unlimited'}
            </button>
            <button
              type="button"
              onClick={handleEndSession}
              aria-label="Close Live Voice Prep"
              className="p-2 rounded-lg text-[#5A5C60] hover:text-[#141517] hover:bg-[#F3F1EC] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Audio Visualizer & Realtime Speaking Banner */}
        <div className="px-6 py-5 bg-[#FAF9F6] border-b border-[#E4E2DC] flex flex-col items-center justify-center">
          <div className="flex items-center gap-2 text-xs font-medium text-[#0F4C5C] mb-2.5">
            <Volume2 className="w-4 h-4" aria-hidden="true" />
            <span>
              {isTeacherSpeaking
                ? language === 'bn'
                  ? 'মিত্র টিউটর কথা বলছেন (মাঝপথে থামাতে "থামাও" চাপো)'
                  : 'Teacher is speaking (click Interrupt to cut in)'
                : isProcessingTurn
                  ? language === 'bn'
                    ? 'মিত্র উত্তর তৈরি করছে...'
                    : 'Mitra is thinking...'
                  : language === 'bn'
                    ? 'তুমি কথা বলো — ছোট বা বড় যেকোনো প্রশ্ন বা উত্তর দিতে পারো'
                    : 'Speak naturally — ask long questions or recite long answers'}
            </span>
          </div>

          <canvas
            ref={canvasRef}
            width={360}
            height={60}
            className="w-full max-w-sm h-[60px]"
            aria-label="Live audio visualizer"
          />

          {/* Real-time Interim Voice Bar */}
          {interimText && (
            <div className="mt-2.5 w-full max-w-md px-3.5 py-2 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2 shadow-xs">
              <span className="truncate flex-1 font-medium">
                🎤 {interimText}
              </span>
              <button
                type="button"
                onClick={() => void submitStudentTurn(interimText)}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F4C5C] text-white text-[11px] font-semibold hover:bg-[#0B3A46] transition-colors cursor-pointer"
              >
                <Send className="w-3 h-3" />
                <span>{language === 'bn' ? 'পাঠাও' : 'Send'}</span>
              </button>
            </div>
          )}

          {errorMsg && (
            <p role="status" className="text-xs text-amber-800 mt-2 text-center">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Live Scrolling Captions with Full Long-Answer Rendering */}
        <div
          aria-live="polite"
          className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 min-h-[190px] max-h-[320px] bg-white"
        >
          {turns.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm font-medium text-[#5A5C60]">
                {language === 'bn'
                  ? 'লাইভ ভাইভা ক্যাপশন এখানে দেখা যাবে।'
                  : 'Live oral transcripts will appear here.'}
              </p>
              <p className="text-xs text-[#73767D] max-w-sm mx-auto">
                {language === 'bn'
                  ? 'যেকোনো ছোট ভাইভা প্রশ্ন জিজ্ঞাসা করতে পারো, অথবা ৫ নম্বরের বড় উত্তর মুখে বলে পরীক্ষকের মতো নম্বর ও মূল্যায়ন চাইতে পারো।'
                  : 'Ask quick 1-mark viva checks, or recite long 5-mark board answers for examiner scoring & feedback.'}
              </p>
            </div>
          ) : (
            turns.map((turn, idx) => (
              <div
                key={`turn-${idx}`}
                className={`text-sm leading-relaxed rounded-2xl p-4 shadow-xs ${
                  turn.speaker === 'student'
                    ? 'bg-[#143326] text-[#F7F6F2] ml-4'
                    : 'bg-[#FAF9F6] text-[#141517] border border-[#E4E2DC] mr-4'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className={`text-[11px] font-bold ${
                      turn.speaker === 'student' ? 'text-amber-200' : 'text-[#0F4C5C]'
                    }`}
                  >
                    {turn.speaker === 'student'
                      ? language === 'bn'
                        ? '👤 তুমি (Student)'
                        : '👤 You (Student)'
                      : '🎓 Madhyamik AI Mitra (Examiner)'}
                  </span>
                  <span className="text-[10px] opacity-60">
                    {new Date(turn.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="whitespace-pre-line study-prose text-[14px]">
                  {turn.text || (
                    <span className="inline-flex items-center gap-1.5 text-xs text-stone-500 italic">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0F4C5C] animate-ping" />
                      {language === 'bn'
                        ? 'পরীক্ষক উত্তর তৈরি করছেন...'
                        : 'Examiner is preparing response...'}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={captionsEndRef} />
        </div>

        {/* Controls Bar */}
        <div className="px-5 py-4 border-t border-[#E4E2DC] bg-[#FAF9F6] flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={isMuted}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
                isMuted
                  ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                  : 'bg-white border-[#D7D4CB] text-[#141517] hover:bg-[#F3F1EC]'
              }`}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span>
                {isMuted
                  ? language === 'bn'
                    ? 'আনমিউট'
                    : 'Unmute'
                  : language === 'bn'
                    ? 'মিউট'
                    : 'Mute'}
              </span>
            </button>

            {isTeacherSpeaking && (
              <button
                type="button"
                onClick={handleInterruptTeacher}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium bg-amber-100 border border-amber-300 text-amber-900 hover:bg-amber-200 transition-colors cursor-pointer"
                title="Interrupt Teacher Spoken Audio"
              >
                <Square className="w-3.5 h-3.5 fill-amber-900" />
                <span>{language === 'bn' ? 'থামাও' : 'Interrupt'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleEndSession}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer shadow-xs"
            >
              <PhoneOff className="w-4 h-4" />
              <span>
                {language === 'bn' ? 'সেশন শেষ ও সেভ' : 'End & Save Session'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
