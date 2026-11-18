import { useEffect, useRef, useState } from 'react';
import {
  Calculator,
  FileText,
  Mic,
  MicOff,
  Paperclip,
  Send,
  X,
} from 'lucide-react';
import type { LanguageCode, UploadedPaperContext } from '../types';
import { BrandLoader } from './BrandLogo';

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface ChatInputBarProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  micLang: LanguageCode;
  onToggleMicLang: (lang: LanguageCode) => void;
  disabled: boolean;
  attachment: UploadedPaperContext | null;
  isUploading: boolean;
  uploadError: string | null;
  onUploadFile: (file: File) => void;
  onRemoveAttachment: () => void;
  onRequireSignInForUpload?: () => boolean;
  solveMode: boolean;
  onToggleSolveMode: (next: boolean) => void;
  problemSolveAvailable?: boolean;
}

export function ChatInputBar({
  value,
  onChange,
  onSend,
  micLang,
  onToggleMicLang,
  disabled,
  attachment,
  isUploading,
  uploadError,
  onUploadFile,
  onRemoveAttachment,
  onRequireSignInForUpload,
  solveMode,
  onToggleSolveMode,
  problemSolveAvailable = false,
}: ChatInputBarProps) {
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const baseTextRef = useRef('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 156)}px`;
  }, [value]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, []);

  const toggleDictation = () => {
    setSpeechError(null);
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore stop errors
      }
      setIsListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      setSpeechError(
        micLang === 'bn'
          ? 'এই ব্রাউজারে স্পিচ ডিক্টেশন সমর্থিত নয়। অনুগ্রহ করে টাইপ করুন অথবা Live Voice Prep ব্যবহার করুন।'
          : 'Browser speech dictation is not supported here. Please type or use Live Voice Prep.'
      );
      return;
    }

    const recognition = new SpeechRec();
    recognition.lang = micLang === 'bn' ? 'bn-IN' : 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = true;

    baseTextRef.current = value.trim() ? `${value.trim()} ` : '';

    recognition.onresult = (event) => {
      let finalSegment = '';
      let interimSegment = '';
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalSegment += `${res[0].transcript} `;
        } else {
          interimSegment += res[0].transcript;
        }
      }
      onChange(`${baseTextRef.current}${finalSegment}${interimSegment}`.trimStart());
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setSpeechError(
          micLang === 'bn'
            ? 'মাইক্রোফোন অ্যাক্সেস করা যায়নি। অনুগ্রহ করে অনুমতি পরীক্ষা করুন।'
            : 'Microphone access failed. Please check browser mic permission.'
        );
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setSpeechError('Could not start voice dictation.');
      setIsListening(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(file);
    }
    e.target.value = '';
  };

  const handleUploadButtonClick = () => {
    if (onRequireSignInForUpload && onRequireSignInForUpload()) {
      return;
    }
    fileInputRef.current?.click();
  };

  const canSend = !disabled && !isUploading && (Boolean(value.trim()) || Boolean(attachment));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        if (isListening) {
          recognitionRef.current?.stop();
          setIsListening(false);
        }
        onSend();
      }
    }
  };

  return (
    <div className="border-t border-[#E4E2DC] bg-white px-3 sm:px-6 py-3">
      <div className="max-w-3xl mx-auto">
        {speechError && (
          <p role="alert" className="text-xs text-rose-700 mb-2 px-1">
            {speechError}
          </p>
        )}

        {uploadError && (
          <p role="alert" className="text-xs text-rose-700 mb-2 px-1">
            {uploadError}
          </p>
        )}

        {/* Attachment Preview Strip */}
        {(attachment || isUploading) && (
          <div className="mb-2 flex items-center justify-between gap-3 bg-[#FAF9F6] border border-[#DFDCD2] rounded-xl px-3 py-2">
            {isUploading ? (
              <BrandLoader
                variant="inline"
                size="xs"
                language={micLang}
                label={
                  micLang === 'bn'
                    ? 'আপলোড করা ছবি / PDF বিশ্লেষণ করা হচ্ছে...'
                    : 'Inspecting uploaded image / PDF...'
                }
              />
            ) : attachment ? (
              <>
                <div className="flex items-center gap-2.5 min-w-0">
                  {attachment.previewUrl ? (
                    <img
                      src={attachment.previewUrl}
                      alt={attachment.fileName}
                      className="w-10 h-10 rounded-lg object-cover border border-[#DFDCD2] shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-white border border-[#DFDCD2] text-[#0F4C5C] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#141517] truncate">
                      {attachment.fileName}
                    </div>
                    {attachment.summary && (
                      <div className="text-[11px] text-[#5A5C60] truncate">
                        {attachment.summary}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onRemoveAttachment}
                  aria-label={`Remove ${attachment.fileName}`}
                  className="p-1.5 rounded-lg text-[#5A5C60] hover:text-rose-700 hover:bg-white transition-colors shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : null}
          </div>
        )}

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2 bg-[#F7F6F2] border border-[#D7D4CB] focus-within:border-[#0F4C5C] focus-within:bg-white rounded-2xl p-2 transition-colors shadow-[0_2px_12px_-8px_rgba(20,21,23,0.12)]">
          {/* Textarea: full-width first row on mobile, centered flex-1 on desktop */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            aria-label="Ask a Madhyamik question"
            placeholder={
              problemSolveAvailable && solveMode
                ? micLang === 'bn'
                  ? 'সমস্যা লিখুন বা ছবি/PDF আপলোড করুন...'
                  : 'Type or upload a problem to solve...'
                : micLang === 'bn'
                  ? 'ABTA/WBTA প্রশ্ন বা ছবি/PDF আপলোড করুন...'
                  : 'Ask WBBSE / ABTA PYQs or upload image/PDF...'
            }
            className="w-full sm:order-2 sm:flex-1 sm:min-w-0 bg-transparent resize-none border-0 focus:outline-none text-[15px] text-[#141517] placeholder:text-[#888B92] py-1.5 px-1.5 sm:px-1 max-h-40 leading-normal"
          />

          <div className="flex items-center justify-between gap-1.5 sm:contents">
            <div className="flex items-center gap-1 sm:order-1 shrink-0">
              {/* Compact Speech Language Toggle */}
              <div
                role="group"
                aria-label="Dictation Language"
                className="flex items-center bg-[#EAE7DF] border border-[#DFDCD2] rounded-lg p-0.5 shrink-0"
              >
                <button
                  type="button"
                  onClick={() => onToggleMicLang('bn')}
                  aria-pressed={micLang === 'bn'}
                  className={`px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    micLang === 'bn'
                      ? 'bg-white text-[#141517] shadow-xs'
                      : 'text-[#5A5C60] hover:text-[#141517]'
                  }`}
                >
                  বাংলা
                </button>
                <button
                  type="button"
                  onClick={() => onToggleMicLang('en')}
                  aria-pressed={micLang === 'en'}
                  className={`px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    micLang === 'en'
                      ? 'bg-white text-[#141517] shadow-xs'
                      : 'text-[#5A5C60] hover:text-[#141517]'
                  }`}
                >
                  EN
                </button>
              </div>

              {/* Document / Image Upload Button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,application/pdf,text/plain"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Upload Image or PDF document in chat"
              />
              <button
                type="button"
                disabled={isUploading || disabled}
                onClick={handleUploadButtonClick}
                aria-label="Attach problem image or PDF"
                title={
                  micLang === 'bn'
                    ? 'ছবি বা PDF আপলোড করো (অঙ্ক, প্রশ্নপত্র, ABTA/WBTA)'
                    : 'Upload Image or PDF (Math/Physics problem, ABTA/WBTA paper)'
                }
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors cursor-pointer disabled:opacity-50 ${
                  attachment
                    ? 'bg-[#0F4C5C]/12 text-[#0F4C5C] hover:bg-[#0F4C5C]/20'
                    : 'text-[#5A5C60] hover:text-[#141517] hover:bg-[#EAE7DF]'
                }`}
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Microphone Dictation Button */}
              <button
                type="button"
                onClick={toggleDictation}
                aria-label={isListening ? 'Stop voice dictation' : 'Start voice dictation'}
                aria-pressed={isListening}
                title={
                  micLang === 'bn'
                    ? 'বাংলা ভয়েস টাইপিং (bn-IN)'
                    : 'English voice dictation (en-IN)'
                }
                className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                  isListening
                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                    : 'text-[#5A5C60] hover:text-[#141517] hover:bg-[#EAE7DF]'
                }`}
              >
                {isListening ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-xl bg-rose-500 animate-ping opacity-35"
                    />
                    <MicOff className="w-4 h-4 relative z-10" />
                  </>
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-1 sm:order-3 shrink-0 sm:self-end">
              {/* Step-by-Step Blackboard Problem Solve Toggle (Mathematics & Physical Science only) */}
              {problemSolveAvailable && (
                <button
                  type="button"
                  onClick={() => onToggleSolveMode(!solveMode)}
                  aria-label={micLang === 'bn' ? 'সমাধান মোড চালু/বন্ধ' : 'Toggle Problem Solve Mode'}
                  aria-pressed={solveMode}
                  title={
                    micLang === 'bn'
                      ? 'ব্ল্যাকবোর্ড সমাধান মোড (গণিত ও ভৌত বিজ্ঞান)'
                      : 'Blackboard Problem Solve mode (Math & Physical Science)'
                  }
                  className={`inline-flex items-center justify-center gap-1.5 px-2.5 h-9 sm:h-10 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    solveMode
                      ? 'bg-[#143326] text-amber-100 border border-[#6B4429]'
                      : 'text-[#5A5C60] hover:text-[#141517] hover:bg-[#EAE7DF]'
                  }`}
                >
                  <Calculator className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" aria-hidden="true" />
                  <span className="hidden sm:inline">{micLang === 'bn' ? 'ব্ল্যাকবোর্ড সমাধান' : 'Problem Solve'}</span>
                </button>
              )}

              {/* Send Button */}
              <button
                type="button"
                onClick={() => {
                  if (isListening) {
                    recognitionRef.current?.stop();
                    setIsListening(false);
                  }
                  onSend();
                }}
                disabled={!canSend}
                aria-label="Send message"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#141517] hover:bg-[#0F4C5C] disabled:bg-[#EAE7DF] disabled:text-[#9CA3AF] text-[#F7F6F2] flex items-center justify-center shrink-0 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-[#6B6E75] mt-1.5 px-1">
          <span className={isListening ? 'text-[#0F4C5C] font-medium' : ''}>
            {isListening
              ? micLang === 'bn'
                ? 'শুনছি (বাংলা)... কথা শেষ হলে থামিয়ে পাঠাও'
                : 'Listening (en-IN)... review text before sending'
              : micLang === 'bn'
                ? 'আমি একটি AI, এবং আমার ভুল হতে পারে · গুরুত্বপূর্ণ তথ্য WBBSE পাঠ্যবই থেকে যাচাই করো'
                : 'I am an AI, and I can make mistakes · Verify key details with your WBBSE textbook'}
          </span>
          <span className="hidden sm:inline shrink-0">
            Enter to send · Shift+Enter for new line
          </span>
        </div>
      </div>
    </div>
  );
}
