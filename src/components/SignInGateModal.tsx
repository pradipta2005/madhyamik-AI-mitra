import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Globe,
  LogIn,
  RotateCcw,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import type { LanguageCode } from '../types';
import { parseAuthError } from '../utils/wbbseResearch';
import { BrandLogo } from './BrandLogo';

interface SignInGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignIn: () => void;
  onContinueAsGuest?: () => void;
  authLoading: boolean;
  reason?: string | null;
  error?: string | null;
  language: LanguageCode;
}

export function SignInGateModal({
  isOpen,
  onClose,
  onSignIn,
  onContinueAsGuest,
  authLoading,
  reason,
  error,
  language,
}: SignInGateModalProps) {
  const [copied, setCopied] = useState(false);
  const parsedError = parseAuthError(error);

  const handleCopyHostname = async (hostname: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(hostname);
        setCopied(true);
        setTimeout(() => setCopied(false), 2400);
      }
    } catch {
      // Ignore clipboard write errors
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Sign in required"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-[#141517]/60 backdrop-blur-[2px] overflow-y-auto flex items-start lg:items-center justify-center pt-16 sm:pt-20 lg:pt-6 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white border border-[#DFDCD2] rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 max-h-[calc(100dvh-5rem)] lg:max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <BrandLogo size="md" />
                <div>
                  <h2 className="font-display text-base font-semibold text-[#141517]">
                    {language === 'bn'
                      ? 'AI ব্যবহার করতে সাইন-ইন বা গেস্ট মোড'
                      : 'Sign in or Continue as Guest'}
                  </h2>
                  <p className="font-mono text-[11px] text-[#6B6E75] mt-0.5">
                    Madhyamik AI Mitra · WBBSE Class 10
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close sign in dialog"
                className="p-1.5 rounded-lg text-[#73767D] hover:text-[#141517] hover:bg-[#F3F1EC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-[#4B4E54] leading-relaxed">
              {reason ||
                (language === 'bn'
                  ? 'বিগত ১০ বছরের PYQ বিশ্লেষণ, সহজ বাংলা ব্যাখ্যা, PDF আপলোড এবং লাইভ ভয়েস টিউটর ব্যবহার করতে তোমার Google অ্যাকাউন্ট দিয়ে সাইন ইন করো।'
                  : 'Sign in with your Google account to run WBBSE PYQ research, attach syllabus PDFs, save study threads to Cloud Firestore, and practice with the Live Voice Tutor.')}
            </p>

            {/* Specialized, actionable rendering for auth/unauthorized-domain & common auth errors */}
            {parsedError && (
              <div
                role="alert"
                className={`rounded-xl border p-4 text-xs space-y-3 ${
                  parsedError.isUnauthorizedDomain
                    ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      parsedError.isUnauthorizedDomain
                        ? 'text-amber-700'
                        : 'text-rose-600'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="space-y-1 flex-1 min-w-0">
                    <h3 className="font-semibold text-[13px] leading-snug">
                      {language === 'bn'
                        ? parsedError.titleBn
                        : parsedError.titleEn}
                    </h3>
                    <p className="leading-relaxed opacity-90">
                      {language === 'bn'
                        ? parsedError.messageBn
                        : parsedError.messageEn}
                    </p>
                  </div>
                </div>

                {parsedError.isUnauthorizedDomain && (
                  <div className="space-y-2.5 pt-1 border-t border-amber-200/80">
                    {/* Domain pill with copy action */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-white/80 border border-amber-200 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-1.5 text-slate-700 font-mono text-[11px] truncate">
                        <Globe className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
                        <span className="font-semibold">{parsedError.hostname}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopyHostname(parsedError.hostname)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-medium text-[11px] transition-colors cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                            <span>{language === 'bn' ? 'কপি হয়েছে' : 'Copied!'}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" aria-hidden="true" />
                            <span>{language === 'bn' ? 'ডোমেন কপি করো' : 'Copy Domain'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Quick switch if user is visiting via 127.0.0.1 */}
                    {parsedError.canSwitchToLocalhost && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-emerald-950 leading-snug">
                          {language === 'bn'
                            ? 'টিপস: ফায়ারবেসে সাধারণত localhost আগে থেকেই অনুমোদিত থাকে।'
                            : 'Tip: Firebase authorizes "localhost" by default. Switch to localhost to sign in immediately.'}
                        </p>
                        <a
                          href={parsedError.localhostUrl}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-[11px] whitespace-nowrap cursor-pointer transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" aria-hidden="true" />
                          <span>{language === 'bn' ? 'localhost-এ যান' : 'Use localhost'}</span>
                        </a>
                      </div>
                    )}

                    {/* 3-Step Guide */}
                    <div className="space-y-1 text-[11px] text-amber-950/90">
                      <div className="font-semibold">
                        {language === 'bn'
                          ? 'ফায়ারবেসে যেভাবে ডোমেনটি যোগ করবেন (৩টি সহজ ধাপ):'
                          : 'How to authorize this domain (3 quick steps):'}
                      </div>
                      <ol className="list-decimal pl-4 space-y-0.5">
                        {(language === 'bn'
                          ? parsedError.stepsBn
                          : parsedError.stepsEn
                        ).map((step, idx) => (
                          <li key={idx} className="leading-snug">
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Direct link to Firebase Console */}
                    <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                      <a
                        href={parsedError.firebaseConsoleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 hover:text-amber-950 underline underline-offset-2"
                      >
                        <span>
                          {language === 'bn'
                            ? 'Firebase Console সেটিংস খুলুন'
                            : 'Open Firebase Console Authorized Domains'}
                        </span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>

                      {onContinueAsGuest && (
                        <button
                          type="button"
                          onClick={onContinueAsGuest}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                        >
                          <span>
                            {language === 'bn'
                              ? 'অথবা গেস্ট মোডে পরীক্ষা করো'
                              : 'Or continue as Guest Student'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-start gap-2.5 bg-[#FAF9F6] border border-[#E4E2DC] rounded-xl p-3.5 text-xs text-[#4B4E54]">
              <ShieldCheck
                className="w-4 h-4 text-[#143326] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>
                {language === 'bn'
                  ? 'তোমার প্রতিটি বিষয়ের চ্যাট এবং ভয়েস ট্রান্সক্রিপ্ট সুরক্ষিতভাবে সংরক্ষিত থাকবে।'
                  : 'Your subject-focused chats, uploaded papers, and voice transcripts stay synced to your personal account.'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
              {onContinueAsGuest ? (
                <button
                  type="button"
                  onClick={onContinueAsGuest}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#DCD8CE] text-xs sm:text-sm font-medium text-[#3A3D42] hover:bg-[#F3F1EC] transition-colors cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-[#5A5C60]" aria-hidden="true" />
                  <span>
                    {language === 'bn'
                      ? 'গেস্ট মোডে চালিয়ে যান'
                      : 'Continue as Guest'}
                  </span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl border border-[#DCD8CE] text-xs sm:text-sm font-medium text-[#3A3D42] hover:bg-[#F3F1EC] transition-colors cursor-pointer"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={authLoading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#141517] hover:bg-[#0F4C5C] text-[#F7F6F2] text-xs sm:text-sm font-medium transition-colors cursor-pointer disabled:opacity-60"
                >
                  <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>
                    {authLoading
                      ? 'Signing in...'
                      : language === 'bn'
                        ? 'Google দিয়ে সাইন ইন করো'
                        : 'Sign in with Google'}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
