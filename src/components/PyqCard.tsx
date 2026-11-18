import { Flame, Repeat, Lightbulb } from 'lucide-react';
import type { ImportanceLevel, LanguageCode, SuggestedPyqItem } from '../types';

interface PyqCardProps {
  item: SuggestedPyqItem;
  index: number;
  language: LanguageCode;
}

function getImportanceStyle(level: ImportanceLevel) {
  switch (level) {
    case 'High Probability':
      return {
        labelEn: 'High Probability',
        labelBn: 'অত্যন্ত সম্ভাব্য · High Probability',
        textClass: 'text-rose-700',
        dotClass: 'bg-rose-600',
        Icon: Flame,
      };
    case 'Repeated Trend':
      return {
        labelEn: 'Repeated Trend',
        labelBn: 'পুনরাবৃত্ত প্রশ্ন · Repeated Trend',
        textClass: 'text-amber-800',
        dotClass: 'bg-amber-600',
        Icon: Repeat,
      };
    default:
      return {
        labelEn: 'Concept Builder',
        labelBn: 'ধারণা গঠন · Concept Builder',
        textClass: 'text-[#0F4C5C]',
        dotClass: 'bg-[#0F4C5C]',
        Icon: Lightbulb,
      };
  }
}

export function PyqCard({ item, index, language }: PyqCardProps) {
  const badge = getImportanceStyle(item.importance);
  const Icon = badge.Icon;
  const yearsText =
    item.years && item.years.length > 0
      ? item.years.join(', ')
      : language === 'bn'
        ? 'সাম্প্রতিক পর্ষদ প্যাটার্ন'
        : 'Recent WBBSE Pattern';

  return (
    <article className="bg-[#FAF9F6] border border-[#E4E2DC] rounded-xl p-4 sm:p-5 transition-colors hover:border-[#C9C5B9]">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#5A5C60]">
          <span className="font-mono font-semibold text-[#141517] tabular-nums">
            Q{index + 1}
          </span>
          {item.subject && (
            <>
              <span aria-hidden="true">·</span>
              <span>{item.subject}</span>
            </>
          )}
          {item.chapter && (
            <>
              <span aria-hidden="true">·</span>
              <span>{item.chapter}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="font-mono font-medium text-[#141517] tabular-nums">
            {item.marks}
          </span>
        </div>

        {/* Clean inline zero-pill semantic signal */}
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${badge.textClass}`}
        >
          <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
          <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{language === 'bn' ? badge.labelBn : badge.labelEn}</span>
        </span>
      </div>

      <p className="text-[15px] leading-relaxed font-medium text-[#141517] mb-3.5">
        {item.question}
      </p>

      <div className="pt-3 border-t border-[#E4E2DC] space-y-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-1.5 text-[#4B4E54]">
          <span className="font-semibold text-[#141517]">
            {language === 'bn' ? 'পূর্ববর্তী মাধ্যমিক বছর:' : 'Appeared in:'}
          </span>
          <span className="font-mono tabular-nums text-[#141517]">
            {language === 'bn' ? `মাধ্যমিক ${yearsText}` : `Madhyamik ${yearsText}`}
          </span>
        </div>
        {item.testPaperRefs && item.testPaperRefs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[#4B4E54]">
            <span className="font-semibold text-[#141517]">
              {language === 'bn' ? 'ABTA / WBTA টেস্ট পেপার:' : 'ABTA / WBTA Test Papers:'}
            </span>
            <span className="text-[#0F4C5C] font-medium">
              {item.testPaperRefs.join(' · ')}
            </span>
          </div>
        )}
        {item.trendNote && (
          <p className="text-[#4B4E54] leading-snug">
            <span className="font-semibold text-[#141517]">
              {language === 'bn' ? 'পরীক্ষার প্রবণতা: ' : 'WBBSE & Test Paper Trend: '}
            </span>
            {item.trendNote}
          </p>
        )}
      </div>
    </article>
  );
}
