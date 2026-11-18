import { Lock, MessageSquarePlus } from 'lucide-react';
import type { LanguageCode, WbbseSubject } from '../types';
import { getVisibleSubjects } from '../utils/wbbseResearch';

interface SubjectBarProps {
  lockedSubject: WbbseSubject | null;
  onSelectSubject: (subject: WbbseSubject) => void;
  onStartNewChat: () => void;
  language: LanguageCode;
}

export function SubjectBar({
  lockedSubject,
  onSelectSubject,
  onStartNewChat,
  language,
}: SubjectBarProps) {
  const visibleSubjects = getVisibleSubjects(lockedSubject);

  return (
    <nav
      aria-label="WBBSE Subject Filter"
      className="border-b border-[#E4E2DC] bg-[#FAF9F6]"
    >
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 min-w-0">
          {lockedSubject === null && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#6B6E75] whitespace-nowrap mr-1.5 hidden sm:inline">
              {language === 'bn' ? 'বিষয়:' : 'Subject:'}
            </span>
          )}

          {visibleSubjects.map((subj) => {
            const isLocked = lockedSubject === subj.id;
            const label = language === 'bn' ? subj.labelBn : subj.labelEn;
            return (
              <button
                key={subj.id}
                type="button"
                onClick={() => {
                  if (lockedSubject === null) {
                    onSelectSubject(subj.id);
                  }
                }}
                aria-pressed={isLocked}
                disabled={isLocked}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C5C] ${
                  isLocked
                    ? 'bg-[#143326] text-[#F7F6F2] cursor-default'
                    : 'text-[#3A3D42] bg-[#EFEDE6] hover:text-[#141517] hover:bg-[#E4E1D7] cursor-pointer'
                }`}
              >
                {isLocked && <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />}
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {lockedSubject !== null && (
          <button
            type="button"
            onClick={onStartNewChat}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DCD8CE] bg-white hover:bg-[#EFEDE6] text-xs font-medium text-[#141517] whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <MessageSquarePlus className="w-3.5 h-3.5 text-[#0F4C5C] shrink-0" aria-hidden="true" />
            <span>
              {language === 'bn'
                ? 'বিষয় বদলাতে নতুন চ্যাট শুরু করো'
                : 'New Chat to Change Subject'}
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}
