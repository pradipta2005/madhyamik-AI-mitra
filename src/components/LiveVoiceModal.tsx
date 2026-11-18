import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Volume2, X } from 'lucide-react';
import type { LanguageCode, LiveTranscriptTurn, WbbseSubject } from '../types';

interface LiveVoiceModalProps {
  isOpen: boolean;
  subject: WbbseSubject;
  language: LanguageCode;
  onCloseAndSave: (turns: LiveTranscriptTurn[]) => void;
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

export function LiveVoiceModal({
  isOpen,
  subject,
  language,
  onCloseAndSave,
}: LiveVoiceModalProps) {
  const [status, setStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [turns, setTurns] = useState<LiveTranscriptTurn[]>([]);

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

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    turnsRef.current = turns;
    captionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let rafId = 0;
    setStatus('connecting');
    setErrorMsg(null);
    setTurns([]);
    turnsRef.current = [];
    setIsMuted(false);
    isMutedRef.current = false;

    const appendTranscript = (speaker: 'student' | 'tutor', chunk: string) => {
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
    };

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
          const level = Math.max(0.08, Math.min(1, energyRef.current));
          energyRef.current = Math.max(0.08, energyRef.current * 0.92);

          for (let i = 0; i < bars; i++) {
            const centerWeight = 1 - Math.abs(i - bars / 2) / (bars / 2);
            const wave = 0.35 + 0.65 * Math.abs(Math.sin(now + i * 0.45));
            const barH = Math.max(6, h * level * centerWeight * wave);
            const x = i * (barW + gap);
            const y = (h - barH) / 2;
            ctx.fillStyle = isMutedRef.current ? '#94a3b8' : '#0F4C5C';
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

    const startSession = async () => {
      try {
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
          if (cancelled) return;
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (cancelled) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            streamRef.current = stream;

            const inputCtx = new AudioContext({ sampleRate: 16000 });
            inputCtxRef.current = inputCtx;
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            source.connect(processor);
            processor.connect(inputCtx.destination);

            processor.onaudioprocess = (e) => {
              if (cancelled || isMutedRef.current || ws.readyState !== WebSocket.OPEN) {
                return;
              }
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
          if (cancelled) return;
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
                  // Ignore already stopped sources
                }
              }
              activeSourcesRef.current.clear();
              if (outputCtxRef.current) {
                nextStartTimeRef.current = outputCtxRef.current.currentTime;
              }
            } else if (msg.type === 'error') {
              setStatus('error');
              setErrorMsg(msg.message || 'Live voice connection failed.');
            }
          } catch {
            // Ignore malformed socket message
          }
        };

        ws.onerror = () => {
          if (!cancelled) {
            setStatus('error');
            setErrorMsg('WebSocket connection error with Live Voice Tutor.');
          }
        };
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(
            err instanceof Error ? err.message : 'Unable to start Live Voice Prep.'
          );
        }
      }
    };

    void startSession();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      for (const src of activeSourcesRef.current) {
        try {
          src.stop();
        } catch {
          // Ignore
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
  }, [isOpen, subject, language]);

  if (!isOpen) return null;

  const handleEndSession = () => {
    onCloseAndSave(turnsRef.current);
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
            <h2 className="font-display text-base font-semibold text-[#141517]">
              {language === 'bn'
                ? 'লাইভ ভয়েস প্রস্তুতি (Live Viva & Tutor)'
                : 'Live Voice Prep · Viva & Concept Tutor'}
            </h2>
            <p className="text-xs text-[#5A5C60] mt-0.5">
              {subject}
              <span aria-hidden="true"> · </span>
              <span>
                {status === 'connecting'
                  ? language === 'bn'
                    ? 'সংযোগ হচ্ছে...'
                    : 'Connecting to Gemini Live...'
                  : status === 'error'
                    ? 'Connection Notice'
                    : isMuted
                      ? language === 'bn'
                        ? 'মিউট করা আছে'
                        : 'Microphone Muted'
                      : language === 'bn'
                        ? 'সক্রিয় · বাংলা বা ইংরেজিতে কথা বলো'
                        : 'Live · Speak in Bengali or English'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleEndSession}
            aria-label="Close Live Voice Prep"
            className="p-2 rounded-lg text-[#5A5C60] hover:text-[#141517] hover:bg-[#F3F1EC] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Audio Visualizer */}
        <div className="px-6 py-6 bg-[#FAF9F6] border-b border-[#E4E2DC] flex flex-col items-center justify-center">
          <div className="flex items-center gap-2 text-xs font-medium text-[#0F4C5C] mb-3">
            <Volume2 className="w-4 h-4" aria-hidden="true" />
            <span>
              {language === 'bn'
                ? 'মিত্র টিউটর শুনছে — মাঝপথেও প্রশ্ন করতে পারো'
                : 'Mitra Tutor is listening — interrupt naturally anytime'}
            </span>
          </div>
          <canvas
            ref={canvasRef}
            width={360}
            height={68}
            className="w-full max-w-sm h-[68px]"
            aria-label="Live audio visualizer"
          />
          {errorMsg && (
            <p role="status" className="text-xs text-amber-800 mt-3 text-center">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Live Scrolling Captions */}
        <div
          aria-live="polite"
          className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[180px] max-h-[300px] bg-white"
        >
          {turns.length === 0 ? (
            <p className="text-sm text-[#73767D] text-center py-8">
              {language === 'bn'
                ? 'লাইভ ক্যাপশন এখানে দেখা যাবে। যেকোনো অধ্যায়ের নাম বলো অথবা ভাইভা প্রশ্ন চাও...'
                : 'Live captions will appear here as you speak. Ask a concept or request a 1-mark viva quiz...'}
            </p>
          ) : (
            turns.map((turn, idx) => (
              <div
                key={`turn-${idx}`}
                className={`text-sm leading-relaxed rounded-xl px-3.5 py-2.5 ${
                  turn.speaker === 'student'
                    ? 'bg-[#143326] text-[#F7F6F2] ml-6'
                    : 'bg-[#FAF9F6] text-[#141517] border border-[#E4E2DC] mr-6'
                }`}
              >
                <span
                  className={`block text-[11px] font-semibold mb-0.5 ${
                    turn.speaker === 'student' ? 'text-amber-200' : 'text-[#5A5C60]'
                  }`}
                >
                  {turn.speaker === 'student'
                    ? language === 'bn'
                      ? 'তুমি'
                      : 'You'
                    : 'Mitra Tutor'}
                </span>
                {turn.text}
              </div>
            ))
          )}
          <div ref={captionsEndRef} />
        </div>

        {/* Controls */}
        <div className="px-5 py-4 border-t border-[#E4E2DC] bg-[#FAF9F6] flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            aria-pressed={isMuted}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
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

          <button
            type="button"
            onClick={handleEndSession}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer"
          >
            <PhoneOff className="w-4 h-4" />
            <span>
              {language === 'bn' ? 'সেশন শেষ করো ও সেভ করো' : 'End Session'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
