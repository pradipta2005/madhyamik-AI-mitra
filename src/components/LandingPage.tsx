import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Calculator,
  CheckCircle2,
  Languages,
  LogIn,
  MessageSquare,
  PlayCircle,
  Search,
  Volume2,
} from 'lucide-react';
import type { LanguageCode, WbbseSubject } from '../types';
import { SUBJECT_META } from '../utils/wbbseResearch';
import { BrandLogo } from './BrandLogo';
import {
  AnimatedSegmented,
  BlurRevealText,
  EditorialReveal,
  SpotlightCard,
} from './ui/CraftMotion';

interface LandingPageProps {
  onRequireLogin: (
    reason?: string,
    pendingPrompt?: string,
    pendingSubject?: WbbseSubject
  ) => void;
  onDirectSignIn: () => void;
  onContinueAsGuest?: () => void;
  authLoading: boolean;
  language: LanguageCode;
  onToggleLanguage: (lang: LanguageCode) => void;
}

type StudioTabId = 'pyq' | 'blackboard' | 'bilingual';

const SUBJECT_HIGHLIGHTS: Record<
  WbbseSubject,
  { chaptersEn: string; chaptersBn: string; hasBlackboard?: boolean }
> = {
  'All Subjects': {
    chaptersEn: 'Cross-subject Madhyamik planning, time allocation & mixed revision',
    chaptersBn: 'সকল বিষয়ের সমন্বিত প্রস্তুতি, রুটিন ও মিশ্র রিভিশন',
  },
  'Physical Science': {
    chaptersEn: 'Light, Current Electricity, Behaviour of Gases, Organic Chemistry',
    chaptersBn: 'আলো, চলতড়িৎ, গ্যাসের আচরণ, জৈব রসায়ন',
    hasBlackboard: true,
  },
  'Life Science': {
    chaptersEn: 'Control & Coordination, Cell Division, Heredity, Nitrogen Cycle',
    chaptersBn: 'নিয়ন্ত্রণ ও সমন্বয়, কোষ বিভাজন, বংশগতি, নাইট্রোজেন চক্র',
  },
  Mathematics: {
    chaptersEn: 'Circle Theorems, Pythagoras, Quadratic Equations, Trigonometry, Statistics',
    chaptersBn: 'বৃত্ত সংক্রান্ত উপপাদ্য, দ্বিঘাত সমীকরণ, ত্রিকোণমিতি, রাশিবিজ্ঞান',
    hasBlackboard: true,
  },
  History: {
    chaptersEn: 'Bengal Renaissance, Santhal & Indigo Revolts, 1857, Freedom Struggle',
    chaptersBn: 'বাংলার নবজাগরণ, সাঁওতাল ও নীল বিদ্রোহ, মহাবিদ্রোহ ১৮৫৭',
  },
  Geography: {
    chaptersEn: 'River & Glacier Landforms, Atmosphere, Hydrosphere, India Regional',
    chaptersBn: 'নদী ও হিমবাহের ভূমিরূপ, বায়ুমণ্ডল, বারিমণ্ডল, ভারত',
  },
  Bengali: {
    chaptersEn: 'জ্ঞানচক্ষু, বহুরূপী, পথের দাবী, আফ্রিকা, অভিষেক, কোনি ও ব্যাকরণ',
    chaptersBn: 'জ্ঞানচক্ষু, বহুরূপী, পথের দাবী, আফ্রিকা, অভিষেক, কোনি ও ব্যাকরণ',
  },
  English: {
    chaptersEn: "Father's Help, Fable, Passing Away of Bapu, Grammar & Writing Skills",
    chaptersBn: "Father's Help, Fable, Bapu, Grammar ও Writing Skills",
  },
};

export function LandingPage({
  onRequireLogin,
  onDirectSignIn,
  onContinueAsGuest,
  authLoading,
  language,
  onToggleLanguage,
}: LandingPageProps) {
  const [heroDraft, setHeroDraft] = useState('');
  const [heroImgError, setHeroImgError] = useState(false);
  const [vivaImgError, setVivaImgError] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTabId>('pyq');

  const handleHeroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = heroDraft.trim();
    onRequireLogin(
      language === 'bn'
        ? 'তোমার প্রশ্নটি বিশ্লেষণ করতে এবং সংরক্ষণ করতে প্রথমে Google দিয়ে সাইন ইন করো।'
        : 'Sign in with Google first to research this WBBSE topic with AI and save your study thread.',
      trimmed || undefined
    );
  };

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#141517] flex flex-col overflow-x-clip">
      {/* 3-Zone Top Navigation Contract */}
      <header className="sticky top-0 z-30 bg-[#F7F6F2]/90 backdrop-blur-md border-b border-[#E4E2DC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <a
            href="#top"
            className="flex items-center gap-2.5 font-display font-bold text-base sm:text-lg tracking-tight text-[#141517] whitespace-nowrap shrink-0"
          >
            <BrandLogo size="sm" interactive />
            <span>Madhyamik AI Mitra</span>
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-6 xl:gap-8 text-sm font-medium text-[#5A5C60]"
          >
            <a
              href="#capabilities"
              className="hover:text-[#141517] transition-colors whitespace-nowrap shrink-0"
            >
              {language === 'bn' ? 'সক্ষমতা' : 'Capabilities'}
            </a>
            <a
              href="#pyq-sample"
              className="hover:text-[#141517] transition-colors whitespace-nowrap shrink-0"
            >
              {language === 'bn' ? 'স্টুডিও প্রিভিউ' : 'Study Studio'}
            </a>
            <a
              href="#voice-prep"
              className="hover:text-[#141517] transition-colors whitespace-nowrap shrink-0"
            >
              {language === 'bn' ? 'ভয়েস ভাইভা' : 'Voice Prep'}
            </a>
            <a
              href="#subjects"
              className="hover:text-[#141517] transition-colors whitespace-nowrap shrink-0"
            >
              {language === 'bn' ? 'বিষয়সমূহ' : 'Subjects'}
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {onContinueAsGuest && (
              <button
                type="button"
                onClick={onContinueAsGuest}
                className="px-3 py-1.5 rounded-xl border border-[#DCD8CE] bg-white hover:bg-[#F3F1EC] text-[#3A3D42] text-xs font-medium transition-colors cursor-pointer"
              >
                {language === 'bn' ? 'গেস্ট মোড' : 'Guest Mode'}
              </button>
            )}
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={onDirectSignIn}
              disabled={authLoading}
              aria-label="Sign in with Google"
              className="inline-flex items-center gap-2 px-3.5 sm:px-4.5 py-2 rounded-xl bg-[#141517] hover:bg-[#0F4C5C] text-[#F7F6F2] text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" aria-hidden="true" />
              <span className="sm:hidden">
                {authLoading ? 'Signing in...' : 'Sign in'}
              </span>
              <span className="hidden sm:inline">
                {authLoading
                  ? language === 'bn'
                    ? 'সাইন ইন হচ্ছে...'
                    : 'Signing in...'
                  : language === 'bn'
                    ? 'Google দিয়ে সাইন ইন'
                    : 'Sign in with Google'}
              </span>
            </motion.button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Editorial Hero Section */}
        <section className="paper-grid-bg border-b border-[#E4E2DC]">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-10 pb-14 lg:pt-16 lg:pb-18">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              {/* Left Proposition & Interactive Gate */}
              <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#0F4C5C] font-medium">
                      {language === 'bn'
                        ? 'WBBSE দশম শ্রেণি · মাধ্যমিক ২০২৬–২৭'
                        : 'WBBSE CLASS 10 · MADHYAMIK 2026–27'}
                    </span>
                    <AnimatedSegmented
                      layoutId="landing-lang-toggle"
                      ariaLabel="Landing language"
                      value={language}
                      onChange={onToggleLanguage}
                      options={[
                        { id: 'en', label: 'EN' },
                        { id: 'bn', label: 'বাংলা' },
                      ]}
                    />
                  </div>

                  <h1 className="text-[clamp(2.25rem,4.1vw,3.75rem)] font-bold leading-[1.08] tracking-[-0.028em] text-[#141517] text-balance">
                    {language === 'bn' ? (
                      <>
                        <BlurRevealText text="বিগত ১০ বছরের মাধ্যমিক প্রশ্ন ও" />{' '}
                        <span className="font-serif-accent italic font-medium text-[#0F4C5C]">
                          সহজ বাংলায় পূর্ণ প্রস্তুতি।
                        </span>
                      </>
                    ) : (
                      <>
                        <BlurRevealText text="Master Madhyamik with" />{' '}
                        <span className="font-serif-accent italic font-medium text-[#0F4C5C]">
                          10-Year PYQ Clarity.
                        </span>
                      </>
                    )}
                  </h1>

                  <p className="text-base sm:text-[17px] text-[#4B4E54] leading-relaxed max-w-2xl">
                    {language === 'bn'
                      ? 'পশ্চিমবঙ্গ মধ্যশিক্ষা পর্ষদের (WBBSE) দশম শ্রেণির ৭টি বিষয়ের সম্ভাব্য প্রশ্ন, ABTA ও WBTA টেস্ট পেপার বিশ্লেষণ, গণিত ও ভৌত বিজ্ঞানের ক্লাসরুম ব্ল্যাকবোর্ড সমাধান এবং লাইভ ভয়েস ভাইভা—সব এক ঠিকানায়।'
                      : 'Engineered for West Bengal Board Class 10 students across all 7 subjects. Cross-reference 2016–2026 board papers with ABTA & WBTA test papers, solve Math & Physical Science step-by-step on an interactive blackboard, and practice oral viva live.'}
                  </p>
                </div>

                {/* Tactile Ask Gate Bar */}
                <div className="space-y-4 max-w-2xl">
                  <form
                    onSubmit={handleHeroSubmit}
                    className="bg-white border border-[#D7D4CB] focus-within:border-[#0F4C5C] rounded-2xl p-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 transition-colors shadow-[0_8px_30px_-14px_rgba(20,21,23,0.12)]"
                  >
                    <div className="flex items-center gap-2.5 px-3 flex-1 min-w-0">
                      <Search
                        className="w-4 h-4 text-[#73767D] shrink-0"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        value={heroDraft}
                        onChange={(e) => setHeroDraft(e.target.value)}
                        aria-label="Ask a Madhyamik question"
                        placeholder={
                          language === 'bn'
                            ? 'যেমন: ভৌত বিজ্ঞান আলোর প্রতিসরণ বা দ্বিঘাত সমীকরণ বোঝাও...'
                            : 'Ask any WBBSE chapter, ABTA question, or paste a Math problem...'
                        }
                        className="w-full py-2 text-sm text-[#141517] placeholder:text-[#888B92] bg-transparent focus:outline-none"
                      />
                    </div>
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#143326] hover:bg-[#1A4332] text-[#F7F6F2] text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      <span>
                        {language === 'bn' ? 'AI দিয়ে উত্তর দেখো' : 'Ask Mitra AI'}
                      </span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </motion.button>
                  </form>

                  {onContinueAsGuest && (
                    <div className="flex items-center gap-2 text-xs text-[#5A5C60] -mt-1">
                      <span>{language === 'bn' ? 'লগইন করতে অসুবিধা হচ্ছে?' : 'Need to test without Google login?'}</span>
                      <button
                        type="button"
                        onClick={onContinueAsGuest}
                        className="text-[#0F4C5C] hover:text-[#143326] font-medium underline underline-offset-2 cursor-pointer"
                      >
                        {language === 'bn' ? 'গেস্ট মোডে সরাসরি প্রবেশ করো' : 'Explore directly in Guest Mode'}
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-[#5A5C60]">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <CheckCircle2
                        className="w-3.5 h-3.5 text-[#143326]"
                        aria-hidden="true"
                      />
                      <span>
                        {language === 'bn'
                          ? '২০১৬–২০২৬ পর্ষদ ও ABTA/WBTA সূচি'
                          : '2016–2026 WBBSE & ABTA Index'}
                      </span>
                    </span>
                    <span aria-hidden="true" className="hidden sm:inline text-[#C7C4BA]">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <CheckCircle2
                        className="w-3.5 h-3.5 text-[#143326]"
                        aria-hidden="true"
                      />
                      <span>
                        {language === 'bn'
                          ? 'বাংলা ও English দ্বিভাষিক উত্তর'
                          : 'Strict বাংলা & EN Mirroring'}
                      </span>
                    </span>
                    <span aria-hidden="true" className="hidden sm:inline text-[#C7C4BA]">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <CheckCircle2
                        className="w-3.5 h-3.5 text-[#143326]"
                        aria-hidden="true"
                      />
                      <span>
                        {language === 'bn'
                          ? 'সংরক্ষিত চ্যাটের জন্য Google লগইন'
                          : 'Google Sync & Saved Threads'}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Editorial Photo Plate */}
              <div className="lg:col-span-5">
                <div className="rounded-2xl overflow-hidden border border-[#DFDCD2] bg-white shadow-[0_18px_45px_-22px_rgba(20,21,23,0.18)]">
                  <div className="aspect-[4/3] lg:aspect-[5/4] bg-[#ECEAE3] overflow-hidden">
                    {!heroImgError ? (
                      <img
                        src="/src/assets/images/hero_madhyamik_study_1794975153515.jpg"
                        alt="WBBSE Class 10 Bengali and Physical Science textbooks beside handwritten optics notes and glass prism"
                        referrerPolicy="no-referrer"
                        onError={() => setHeroImgError(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-[#4B4E54]">
                        <BookOpen className="w-10 h-10 text-[#143326] mb-3" />
                        <p className="text-sm font-medium">
                          WBBSE Class 10 Study Workspace
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="px-4 py-3 bg-white border-t border-[#E8E5DD] flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-[#141517]">
                      {language === 'bn'
                        ? 'মাধ্যমিক ক্লাস ১০ · গবেষণানির্ভর পাঠ্য সহায়ক'
                        : 'Class 10 Board Study Desk'}
                    </span>
                    <span className="font-mono text-[11px] text-[#5A5C60] tabular-nums">
                      WBBSE · ABTA · WBTA
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 4-Column Quantitative Architectural Ledger */}
            <div className="mt-14 grid grid-cols-2 lg:grid-cols-4 border-t border-b border-[#DFDCD2] divide-y lg:divide-y-0 lg:divide-x divide-[#DFDCD2]">
              <div className="py-5 pr-4 lg:pr-6">
                <div className="font-display text-2xl sm:text-3xl font-bold text-[#141517] tabular-nums">
                  7 Subjects
                </div>
                <div className="text-xs text-[#5A5C60] mt-1">
                  {language === 'bn'
                    ? 'সম্পূর্ণ মাধ্যমিক পাঠ্যক্রম ও বিষয়ভিত্তিক চ্যাট'
                    : 'Complete WBBSE Class 10 syllabus lock'}
                </div>
              </div>
              <div className="py-5 pl-4 lg:px-6">
                <div className="font-display text-2xl sm:text-3xl font-bold text-[#141517] tabular-nums">
                  2016–2026
                </div>
                <div className="text-xs text-[#5A5C60] mt-1">
                  {language === 'bn'
                    ? '১০ বছরের বোর্ড ও টেস্ট পেপার ট্রেন্ড বিশ্লেষণ'
                    : 'Board PYQ + ABTA & WBTA frequency index'}
                </div>
              </div>
              <div className="py-5 pr-4 lg:px-6">
                <div className="font-display text-2xl sm:text-3xl font-bold text-[#141517] tabular-nums">
                  বাংলা + EN
                </div>
                <div className="text-xs text-[#5A5C60] mt-1">
                  {language === 'bn'
                    ? 'স্বয়ংক্রিয় বাংলা ও ইংরেজি ভয়েস ডিক্টেশন'
                    : 'Auto bilingual mirroring & voice typing'}
                </div>
              </div>
              <div className="py-5 pl-4 lg:pl-6">
                <div className="font-display text-2xl sm:text-3xl font-bold text-[#141517] tabular-nums">
                  1-on-1 Viva
                </div>
                <div className="text-xs text-[#5A5C60] mt-1">
                  {language === 'bn'
                    ? 'ব্ল্যাকবোর্ড অঙ্ক ও রিয়েল-টাইম মৌখিক অনুশীলন'
                    : 'Blackboard teacher + live oral practice'}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Capabilities Studio */}
        <section id="capabilities" className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
          <EditorialReveal>
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
              <div className="max-w-2xl">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#0F4C5C] font-medium mb-2">
                  {language === 'bn' ? 'কাজের পদ্ধতি' : 'HOW IT WORKS'}
                </div>
                <h2 className="text-2xl sm:text-4xl font-bold text-[#141517] tracking-[-0.02em] text-balance">
                  {language === 'bn'
                    ? 'মাধ্যমিক পরীক্ষার প্রতিটি ধাপের জন্য নিখুঁতভাবে তৈরি'
                    : 'Crafted Around How Madhyamik Exams Actually Work'}
                </h2>
              </div>

              <AnimatedSegmented
                layoutId="landing-studio-tabs"
                ariaLabel="Interactive Study Studio Preview"
                value={studioTab}
                onChange={setStudioTab}
                size="md"
                options={[
                  {
                    id: 'pyq',
                    label: language === 'bn' ? '০১ · PYQ ও ABTA' : '01 · PYQ & ABTA',
                  },
                  {
                    id: 'blackboard',
                    label:
                      language === 'bn'
                        ? '০২ · ব্ল্যাকবোর্ড শিক্ষক'
                        : '02 · Blackboard Teacher',
                  },
                  {
                    id: 'bilingual',
                    label:
                      language === 'bn'
                        ? '০৩ · বাংলা + ভিডিও'
                        : '03 · Bilingual + Video',
                  },
                ]}
              />
            </div>
          </EditorialReveal>

          {/* Interactive Flush Split Studio Preview (no cards-inside-cards clutter) */}
          <div
            id="pyq-sample"
            className="bg-white border border-[#DFDCD2] rounded-2xl overflow-hidden shadow-[0_14px_40px_-24px_rgba(20,21,23,0.16)]"
          >
            <AnimatePresence mode="wait">
              {studioTab === 'pyq' && (
                <motion.div
                  key="tab-pyq"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#E4E2DC]"
                >
                  <div className="lg:col-span-5 p-6 sm:p-9 flex flex-col justify-between space-y-6">
                    <div className="space-y-3">
                      <span className="font-mono text-xs text-[#0F4C5C] font-medium">
                        01 · WBBSE + ABTA &amp; WBTA Research
                      </span>
                      <h3 className="text-xl sm:text-2xl font-bold text-[#141517] tracking-tight">
                        {language === 'bn'
                          ? 'কোন প্রশ্নগুলো বারবার আসে—কারণসহ জানো'
                          : 'Know Which Questions Repeat—and Why'}
                      </h3>
                      <p className="text-sm text-[#4B4E54] leading-relaxed">
                        {language === 'bn'
                          ? '২০১৬–২০২৬ পর্ষদের প্রশ্নপত্র এবং ABTA ও WBTA টেস্ট পেপার মিলিয়ে প্রতিটি অধ্যায়ের সম্ভাব্য প্রশ্ন, নম্বর বিভাজন ও প্রবণতা একসাথে দেখায়।'
                          : 'Cross-references our structured 2016–2026 WBBSE PYQ bank with live Google Search grounding across ABTA & WBTA test papers—surfacing exact marks and exam frequency.'}
                      </p>
                    </div>
                    <div className="pt-4 border-t border-[#EEECE6] text-xs text-[#5A5C60] flex flex-wrap gap-x-4 gap-y-1.5">
                      <span>● High Probability Rating</span>
                      <span>● Exact Past Exam Years</span>
                      <span>● ABTA / WBTA Page Trends</span>
                    </div>
                  </div>

                  <div className="lg:col-span-7 p-6 sm:p-9 bg-[#FAF9F6] flex flex-col justify-center space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-[#4B4E54] tabular-nums">
                        Q1 · Physical Science · Light · 3 Marks
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700">
                        <span
                          aria-hidden="true"
                          className="w-1.5 h-1.5 rounded-full bg-rose-600"
                        />
                        <span>High Probability</span>
                      </span>
                    </div>

                    <p className="text-base sm:text-lg font-semibold text-[#141517] leading-snug">
                      State Snell&apos;s law of refraction of light. Explain why a glass prism produces dispersion of white light, and identify which colour deviates the most and the least.
                    </p>

                    <div className="pt-4 border-t border-[#E4E2DC] grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="block font-medium text-[#5A5C60] mb-0.5">
                          Appeared in WBBSE
                        </span>
                        <span className="font-mono font-semibold text-[#141517] tabular-nums">
                          Madhyamik 2017, 2019, 2022, 2024
                        </span>
                      </div>
                      <div>
                        <span className="block font-medium text-[#5A5C60] mb-0.5">
                          Test Paper Consensus
                        </span>
                        <span className="font-medium text-[#0F4C5C]">
                          ABTA Set 14, 42 · WBTA Model Paper 3
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {studioTab === 'blackboard' && (
                <motion.div
                  key="tab-blackboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#E4E2DC]"
                >
                  <div className="lg:col-span-5 p-6 sm:p-9 flex flex-col justify-between space-y-6">
                    <div className="space-y-3">
                      <span className="font-mono text-xs text-[#143326] font-medium inline-flex items-center gap-1.5">
                        <Calculator className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>02 · Mathematics &amp; Physical Science Only</span>
                      </span>
                      <h3 className="text-xl sm:text-2xl font-bold text-[#141517] tracking-tight">
                        {language === 'bn'
                          ? 'একজন ক্লাসরুম শিক্ষকের মতো ব্ল্যাকবোর্ডে শেখো'
                          : 'A Classroom Teacher Who Writes & Checks Each Step'}
                      </h3>
                      <p className="text-sm text-[#4B4E54] leading-relaxed">
                        {language === 'bn'
                          ? 'গণিত বা ভৌত বিজ্ঞানের যেকোনো অঙ্ক টাইপ করো বা ছবি আপলোড করো। শিক্ষক ব্ল্যাকবোর্ডে এক-একটি অংশ চক দিয়ে লিখে বাংলা বা ইংরেজি কণ্ঠে বোঝাবেন এবং তুমি বুঝলে তবেই পরের অংশে যাবেন।'
                          : 'Upload a handwritten problem or question paper photo. Mitra writes one chalk section at a time on a classroom slate, speaks it aloud in Bengali or English, and asks if you understood before moving forward.'}
                      </p>
                    </div>
                    <div className="pt-4 border-t border-[#EEECE6] flex items-center justify-between gap-3 text-xs text-[#5A5C60]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#143326]">
                        <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Natural Bengali &amp; English Teacher Voice</span>
                      </span>
                    </div>
                  </div>

                  <div className="lg:col-span-7 p-5 sm:p-8 bg-[#143326] text-[#F7F6F2] flex flex-col justify-between border-4 border-[#6B4429]">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs border-b border-emerald-800/80 pb-2.5">
                        <span className="font-mono text-amber-200">
                          Section 1 of 3 · Quadratic Equation
                        </span>
                        <span className="text-emerald-300/85 font-mono">
                          Chalkboard Live
                        </span>
                      </div>
                      <div className="space-y-2.5 font-mono text-xs sm:text-sm">
                        <div className="text-amber-200 font-semibold">
                          Given: 2x² - 5x + 3 = 0
                        </div>
                        <div className="bg-[#0D241A] border border-sky-400/35 rounded-lg px-3 py-2 text-sky-200">
                          Split middle term: a·c = 2 × 3 = 6  ⇒  -2 - 3 = -5
                        </div>
                        <div className="pl-2 text-white/95">
                          › 2x² - 2x - 3x + 3 = 0
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-3.5 border-t border-emerald-800/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-emerald-100/90">
                        {language === 'bn'
                          ? 'মধ্যপদ বিশ্লেষণের ধাপটা কি পরিষ্কার হয়েছে?'
                          : 'Did splitting -5x into -2x and -3x make sense?'}
                      </span>
                      <span className="font-medium text-amber-200">
                        Yes, Next Section → · Explain Simpler
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

              {studioTab === 'bilingual' && (
                <motion.div
                  key="tab-bilingual"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#E4E2DC]"
                >
                  <div className="lg:col-span-5 p-6 sm:p-9 flex flex-col justify-between space-y-6">
                    <div className="space-y-3">
                      <span className="font-mono text-xs text-[#0F4C5C] font-medium inline-flex items-center gap-1.5">
                        <Languages className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>03 · Strict Bilingual + Verified YouTube</span>
                      </span>
                      <h3 className="text-xl sm:text-2xl font-bold text-[#141517] tracking-tight">
                        {language === 'bn'
                          ? 'বাংলা, Banglish বা English—যেভাবে সহজ, সেভাবেই উত্তর'
                          : 'Ask in বাংলা, Banglish, or English—Zero Friction'}
                      </h3>
                      <p className="text-sm text-[#4B4E54] leading-relaxed">
                        {language === 'bn'
                          ? 'বাংলা বা বাংলিশে প্রশ্ন লিখলে বা মাইকে বললে পুরো উত্তর আসবে প্রামাণ্য বাংলা পাঠ্যবইয়ের ভাষায়, সাথে থাকবে যাচাইকৃত ১–২টি YouTube ভিডিও লেকচার।'
                          : 'Write or dictate in Bengali, Banglish, or English. Every heading, analysis, and explanation mirrors your script cleanly, paired with 1–2 live-verified YouTube lectures.'}
                      </p>
                    </div>
                    <div className="pt-4 border-t border-[#EEECE6] text-xs text-[#5A5C60]">
                      <span>Web Speech API (bn-IN / en-IN) · Live oEmbed Video Check</span>
                    </div>
                  </div>

                  <div className="lg:col-span-7 p-6 sm:p-9 bg-[#FAF9F6] flex flex-col justify-center space-y-5">
                    <div>
                      <div className="text-[11px] font-mono uppercase tracking-wider text-[#0F4C5C] mb-1">
                        Student Query · বাংলা মাধ্যম
                      </div>
                      <p className="text-base font-semibold text-[#141517]">
                        &ldquo;ভৌত বিজ্ঞান আলোর প্রতিসরণ ও স্নেলের সূত্র সহজ উদাহরণসহ বোঝাও&rdquo;
                      </p>
                    </div>

                    <div className="pt-4 border-t border-[#E4E2DC] flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
                        <PlayCircle className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#141517] truncate">
                          1–2 Live-Verified YouTube Video Lectures
                        </div>
                        <div className="text-xs text-[#5A5C60] mt-0.5">
                          Every link is verified online before it appears in your study thread
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* 03. Live Voice Prep Split Showcase */}
        <section id="voice-prep" className="max-w-7xl mx-auto px-4 sm:px-8 pb-16">
          <EditorialReveal>
            <div className="rounded-2xl overflow-hidden bg-[#141517] text-[#F7F6F2] grid grid-cols-1 lg:grid-cols-12 items-stretch border border-[#26282C]">
              <div className="lg:col-span-6 p-7 sm:p-11 flex flex-col justify-center space-y-6">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-amber-300 font-medium">
                  04 · LIVE VOICE VIVA &amp; CONCEPT TUTOR
                </span>
                <h2 className="text-2xl sm:text-4xl font-bold tracking-[-0.02em] text-white text-balance">
                  {language === 'bn'
                    ? '১ ও ২ নম্বরের মৌখিক প্রশ্ন মুখে বলে অনুশীলন করো'
                    : 'Practice 1-Mark & 2-Mark Board Questions Aloud'}
                </h2>
                <p className="text-sm sm:text-base text-[#C4C7CE] leading-relaxed">
                  {language === 'bn'
                    ? 'জেমিনি লাইভ অডিওর মাধ্যমে সরাসরি বাংলা বা ইংরেজিতে কথা বলো। মাঝপথে থামিয়ে যেকোনো ধাপ আবার জেনে নাও—কথা শেষ হলে পুরো ট্রান্সক্রিপ্ট স্বয়ংক্রিয়ভাবে চ্যাটে সেভ হয়ে যাবে।'
                    : 'Start a real-time two-way voice conversation. Interrupt naturally anytime to clarify a concept in Bengali or English, and save the entire transcript directly into your study session.'}
                </p>
                <div className="pt-1">
                  <motion.button
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() =>
                      onRequireLogin(
                        language === 'bn'
                          ? 'লাইভ ভয়েস ভাইভা টিউটর শুরু করতে Google দিয়ে সাইন ইন করো।'
                          : 'Sign in with Google to start a Live Voice Viva Prep session.'
                      )
                    }
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F7F6F2] hover:bg-amber-200 text-[#141517] text-sm font-semibold transition-colors cursor-pointer"
                  >
                    <AudioLines className="w-4 h-4" aria-hidden="true" />
                    <span>
                      {language === 'bn'
                        ? 'লাইভ ভয়েস প্র্যাকটিস শুরু করো'
                        : 'Try Live Voice Prep'}
                    </span>
                  </motion.button>
                </div>
              </div>

              <div className="lg:col-span-6 min-h-[280px] bg-[#1D1F22]">
                {!vivaImgError ? (
                  <img
                    src="/src/assets/images/feature_viva_tutor_1794975155257.jpg"
                    alt="Study notebook with science diagrams, magnifying lens, and headphones for live voice tutoring"
                    referrerPolicy="no-referrer"
                    onError={() => setVivaImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-8 text-[#9CA3AF] text-sm">
                    Live Voice Prep Studio
                  </div>
                )}
              </div>
            </div>
          </EditorialReveal>
        </section>

        {/* 7 WBBSE Subjects Directory */}
        <section
          id="subjects"
          className="border-t border-[#E4E2DC] bg-white/60 py-16"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <EditorialReveal>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
                <div className="max-w-2xl">
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#0F4C5C] font-medium mb-2">
                    {language === 'bn' ? 'বিষয়ভিত্তিক কর্মক্ষেত্র' : 'SUBJECT WORKSPACES'}
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#141517] tracking-[-0.02em]">
                    {language === 'bn'
                      ? 'যেকোনো একটি বিষয় বেছে নিয়ে চ্যাট শুরু করো'
                      : 'Choose a Subject to Open a Dedicated Study Thread'}
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-[#5A5C60] max-w-md">
                  {language === 'bn'
                    ? 'প্রতিটি চ্যাট একটি বিষয়ে লক থাকে যাতে প্রস্তুতি পরিচ্ছন্ন থাকে। বিষয় বদলাতে নতুন চ্যাট খুলুন।'
                    : 'Every thread locks cleanly to your selected subject. Open a new chat anytime to switch.'}
                </p>
              </div>
            </EditorialReveal>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {SUBJECT_META.map((subj, idx) => {
                const info = SUBJECT_HIGHLIGHTS[subj.id];
                const numLabel = String(idx + 1).padStart(2, '0');
                return (
                  <SpotlightCard
                    key={subj.id}
                    className="bg-white border border-[#DFDCD2] hover:border-[#0F4C5C]/45 rounded-2xl transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onRequireLogin(
                          language === 'bn'
                            ? `${subj.labelBn} নিয়ে আলোচনা শুরু করতে Google দিয়ে সাইন ইন করো।`
                            : `Sign in with Google to start a dedicated ${subj.labelEn} study chat.`,
                          undefined,
                          subj.id
                        )
                      }
                      className="w-full h-full text-left p-5 cursor-pointer group flex flex-col justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className="font-mono text-[11px] text-[#73767D] tabular-nums">
                            {numLabel}
                          </span>
                          {info.hasBlackboard && (
                            <span className="text-[11px] font-medium text-[#143326]">
                              {language === 'bn'
                                ? '● ব্ল্যাকবোর্ড মোড'
                                : '● Blackboard Solver'}
                            </span>
                          )}
                        </div>
                        <div className="font-display text-base font-semibold text-[#141517] group-hover:text-[#0F4C5C] transition-colors">
                          {language === 'bn' ? subj.labelBn : subj.labelEn}
                        </div>
                        <div className="text-xs text-[#5A5C60] mt-0.5">
                          {language === 'bn' ? subj.labelEn : subj.labelBn}
                        </div>
                        <p className="text-xs text-[#4B4E54] mt-3 leading-relaxed">
                          {language === 'bn' ? info.chaptersBn : info.chaptersEn}
                        </p>
                      </div>

                      <div className="text-xs font-semibold text-[#0F4C5C] inline-flex items-center gap-1.5 pt-2 border-t border-[#F0EEE8]">
                        <span>
                          {language === 'bn'
                            ? `${subj.labelBn} শুরু করো`
                            : `Open ${subj.labelEn}`}
                        </span>
                        <ArrowRight
                          className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                  </SpotlightCard>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Architectural Footer */}
      <footer className="border-t border-[#E4E2DC] bg-[#F7F6F2]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#5A5C60]">
          <div className="flex items-center gap-2.5 font-medium text-[#141517] text-center sm:text-left">
            <BrandLogo size="xs" />
            <span>Madhyamik AI Mitra · WBBSE Class 10 Autonomous Exam Companion</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <a
              href="#capabilities"
              className="hover:text-[#141517] transition-colors whitespace-nowrap shrink-0"
            >
              {language === 'bn' ? 'সক্ষমতা' : 'Capabilities'}
            </a>
            <a
              href="#subjects"
              className="hover:text-[#141517] transition-colors whitespace-nowrap shrink-0"
            >
              {language === 'bn' ? 'বিষয়সমূহ' : 'Subjects'}
            </a>
            <button
              type="button"
              onClick={onDirectSignIn}
              className="text-[#0F4C5C] font-semibold hover:underline cursor-pointer whitespace-nowrap shrink-0"
            >
              {language === 'bn' ? 'Google সাইন ইন' : 'Sign in with Google'}
            </button>
            <a
              href="https://pradipta2005.github.io/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Contact and discussion on developer portfolio website (opens in a new tab)"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#DCD8CE] hover:border-[#0F4C5C] text-[#141517] hover:text-[#0F4C5C] font-semibold transition-colors whitespace-nowrap shrink-0 shadow-[0_2px_8px_-4px_rgba(20,21,23,0.12)]"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#0F4C5C] shrink-0" aria-hidden="true" />
              <span>
                {language === 'bn' ? 'যোগাযোগ ও আলোচনা' : 'Contact & Discussion'}
              </span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-70 shrink-0" aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
