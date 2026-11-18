import { Calculator, ImagePlus, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import type { LanguageCode } from '../types';

interface ProblemSolverBannerProps {
  subject: 'Mathematics' | 'Physical Science';
  language: LanguageCode;
  solveMode: boolean;
  onToggleSolveMode: (next: boolean) => void;
  onTriggerUpload: () => void;
  onTrySampleProblem: (
    query: string,
    targetSubject: 'Mathematics' | 'Physical Science'
  ) => void;
}

export function ProblemSolverBanner({
  subject,
  language,
  solveMode,
  onToggleSolveMode,
  onTriggerUpload,
  onTrySampleProblem,
}: ProblemSolverBannerProps) {
  const isPhysics = subject === 'Physical Science';

  const sampleQuery = isPhysics
    ? language === 'bn'
      ? 'এই ভৌত বিজ্ঞানের অঙ্কটি ব্ল্যাকবোর্ডে ধাপে ধাপে শেখাও: ২২০ ভোল্ট মেইন লাইনে ১০০ ওহম ও ২০০ ওহম রোধ সমান্তরাল সমবায়ে যুক্ত করলে তুল্য রোধ ও মোট তড়িৎ প্রবাহমাত্রা কত হবে?'
      : 'Teach me this Physical Science problem section by section on the blackboard: Two resistors of 100 ohm and 200 ohm are connected in parallel across a 220V main line. Find the equivalent resistance and total current.'
    : language === 'bn'
      ? 'এই গণিত অঙ্কটি ব্ল্যাকবোর্ডে ধাপে ধাপে শেখাও: যদি ax² + bx + c = 0 দ্বিঘাত সমীকরণের একটি বীজ অপরটির দ্বিগুণ হয়, তবে দেখাও যে 2b² = 9ac।'
      : 'Teach me this Mathematics problem section by section on the blackboard: If one root of the quadratic equation ax² + bx + c = 0 is twice the other, prove that 2b² = 9ac.';

  return (
    <section
      aria-label="Blackboard Problem Solve Section"
      className="rounded-2xl border border-[#143326]/20 bg-white shadow-[0_6px_24px_-14px_rgba(20,51,38,0.18)] p-5 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#143326] text-amber-200 flex items-center justify-center shrink-0 mt-0.5 border border-[#6B4429]">
            <Calculator className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#5A5C60]">
              <h2 className="font-display text-sm sm:text-base font-semibold text-[#141517]">
                {language === 'bn'
                  ? `ব্ল্যাকবোর্ড প্রবলেম সলভার (${isPhysics ? 'শুধুমাত্র ভৌত বিজ্ঞান' : 'শুধুমাত্র গণিত'})`
                  : `Blackboard Teacher Mode (${subject} Only)`}
              </h2>
              <span aria-hidden="true" className="hidden sm:inline">
                ·
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-[#143326]">
                <span
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full ${
                    solveMode ? 'bg-emerald-600' : 'bg-[#888B92]'
                  }`}
                />
                <span>
                  {solveMode
                    ? language === 'bn'
                      ? 'সক্রিয়'
                      : 'Active'
                    : language === 'bn'
                      ? 'বন্ধ'
                      : 'Off'}
                </span>
              </span>
            </div>
            <p className="text-xs sm:text-[13px] text-[#4B4E54] mt-1 leading-relaxed max-w-2xl">
              {isPhysics
                ? language === 'bn'
                  ? 'এখানে শুধুমাত্র ভৌত বিজ্ঞানের (Physics ও Chemistry) অঙ্ক ও সমস্যা সমাধান করা হবে। শিক্ষক একজন আসল ক্লাস টিচারের মতো ব্ল্যাকবোর্ডে এক-একটি অংশ লিখে ও মুখে বুঝিয়ে তোমার মতামত নেবেন—তুমি বুঝলে তবেই পরের ধাপে যাবেন।'
                  : 'Strictly scoped to Physical Science (Physics & Chemistry) problems. Just like a classroom teacher, Mitra speaks and writes one section at a time on the blackboard, checks if you understood, and only advances when you are ready.'
                : language === 'bn'
                  ? 'এখানে শুধুমাত্র গণিতের (Arithmetic, Algebra, Geometry, Trigonometry, Mensuration) অঙ্ক সমাধান করা হবে। শিক্ষক ব্ল্যাকবোর্ডে একটি একটি অংশ লিখে ও বুঝিয়ে তোমার মতামত নেবেন—তুমি বুঝলে তবেই পরের ধাপে যাবেন।'
                  : 'Strictly scoped to Mathematics problems. Just like a classroom teacher, Mitra speaks and writes one section at a time on the blackboard, checks if you understood, and advances step-by-step until solved.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onToggleSolveMode(!solveMode)}
          aria-pressed={solveMode}
          className={`shrink-0 self-start px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
            solveMode
              ? 'bg-[#143326] text-amber-100 hover:bg-[#1A4332]'
              : 'bg-[#EFEDE6] text-[#3A3D42] hover:bg-[#E4E1D7]'
          }`}
        >
          {solveMode
            ? language === 'bn'
              ? 'ব্ল্যাকবোর্ড চালু'
              : 'Blackboard On'
            : language === 'bn'
              ? 'ব্ল্যাকবোর্ড চালু করো'
              : 'Enable Blackboard'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[#EFECE6]">
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={onTriggerUpload}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#143326] hover:bg-[#1A4332] text-[#F7F6F2] text-xs font-medium transition-colors cursor-pointer"
        >
          <ImagePlus className="w-3.5 h-3.5 shrink-0 text-amber-200" aria-hidden="true" />
          <span>
            {language === 'bn'
              ? `${isPhysics ? 'ভৌত বিজ্ঞানের' : 'গণিতের'} সমস্যার ছবি / PDF আপলোড করো`
              : `Upload ${subject} Image / PDF`}
          </span>
        </motion.button>

        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={() => onTrySampleProblem(sampleQuery, subject)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF9F6] hover:bg-[#EFEDE6] border border-[#DCD8CE] text-[#141517] text-xs font-medium transition-colors cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#0F4C5C] shrink-0" aria-hidden="true" />
          <span>
            {language === 'bn'
              ? 'নমুনা ব্ল্যাকবোর্ড পাঠ শুরু করো'
              : `Try Sample ${subject} Blackboard Lesson`}
          </span>
        </motion.button>
      </div>
    </section>
  );
}
