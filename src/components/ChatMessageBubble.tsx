import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpenCheck, FileText, Globe, Mic } from 'lucide-react';
import type { BlackboardSectionSnapshot, ChatMessage } from '../types';
import { PyqCard } from './PyqCard';
import { YouTubeCard } from './YouTubeCard';
import { ProblemSolveCard } from './ProblemSolveCard';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isLatestAssistant?: boolean;
  localPreviewUrl?: string;
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

export function ChatMessageBubble({
  message,
  isLatestAssistant = false,
  localPreviewUrl,
  disabled = false,
  onConfirmUnderstood,
  onAdvanceSection,
  onRequestSimpler,
  onTryPractice,
  onSwitchSubjectChat,
}: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isVoiceTranscript = message.role === 'voice_transcript';
  const lang = message.language;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[75%] bg-[#143326] text-[#F7F6F2] rounded-2xl rounded-br-sm px-4.5 py-3 shadow-[0_6px_18px_-10px_rgba(20,51,38,0.4)] space-y-2">
          {localPreviewUrl && (
            <img
              src={localPreviewUrl}
              alt={message.attachmentName || 'Uploaded problem'}
              className="max-h-56 w-auto rounded-xl border border-emerald-800/60 object-contain bg-white"
            />
          )}
          {message.attachmentName && !localPreviewUrl && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D241A] border border-emerald-800/70 text-xs text-emerald-100">
              <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[220px]">{message.attachmentName}</span>
            </div>
          )}
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {message.text}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-3xl space-y-3">
        <div className="flex items-center gap-2 text-xs text-[#6B6E75]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#141517]">
            {isVoiceTranscript ? (
              <Mic className="w-3.5 h-3.5 text-[#0F4C5C]" aria-hidden="true" />
            ) : (
              <BookOpenCheck className="w-3.5 h-3.5 text-[#0F4C5C]" aria-hidden="true" />
            )}
            <span>
              {isVoiceTranscript
                ? lang === 'bn'
                  ? 'লাইভ ভয়েস ট্রান্সক্রিপ্ট'
                  : 'Live Voice Transcript'
                : 'Madhyamik AI Mitra'}
            </span>
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-[11px]">{message.subject}</span>
        </div>

        <div className="bg-white border border-[#E4E2DC] rounded-2xl p-5 sm:p-6 shadow-[0_6px_26px_-18px_rgba(20,21,23,0.14)] space-y-5">
          <div className="study-prose text-[15px]">
            <Markdown remarkPlugins={[remarkGfm]}>{message.text}</Markdown>
          </div>

          {message.problemSolve && (
            <ProblemSolveCard
              data={message.problemSolve}
              language={lang}
              isLatestAssistant={isLatestAssistant}
              disabled={disabled}
              onConfirmUnderstood={onConfirmUnderstood}
              onAdvanceSection={onAdvanceSection}
              onRequestSimpler={onRequestSimpler}
              onTryPractice={onTryPractice}
              onSwitchSubjectChat={onSwitchSubjectChat}
            />
          )}

          {message.pyqItems && message.pyqItems.length > 0 && (
            <section aria-label="PYQ Trend Analysis" className="space-y-3 pt-4 border-t border-[#EEECE6]">
              <h3 className="font-display text-sm font-semibold text-[#141517]">
                {lang === 'bn'
                  ? 'বিগত মাধ্যমিক, ABTA ও WBTA প্রশ্ন বিশ্লেষণ'
                  : 'WBBSE, ABTA & WBTA Trend Analysis'}
              </h3>
              <div className="space-y-3">
                {message.pyqItems.map((item, idx) => (
                  <PyqCard
                    key={`${message.id}-pyq-${idx}`}
                    item={item}
                    index={idx}
                    language={lang}
                  />
                ))}
              </div>
            </section>
          )}

          {message.youtubeVideos && message.youtubeVideos.length > 0 && (
            <section aria-label="Recommended YouTube Videos" className="space-y-2.5 pt-4 border-t border-[#EEECE6]">
              <h3 className="font-display text-sm font-semibold text-[#141517]">
                {lang === 'bn'
                  ? 'সহজ ভিডিও লেকচার (YouTube)'
                  : 'Recommended Video Lectures (YouTube)'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {message.youtubeVideos.slice(0, 2).map((video, idx) => (
                  <YouTubeCard
                    key={`${message.id}-yt-${idx}`}
                    video={video}
                    language={lang}
                  />
                ))}
              </div>
            </section>
          )}

          {message.groundingLinks && message.groundingLinks.length > 0 && (
            <section aria-label="Verified Web Sources" className="pt-3 border-t border-[#EEECE6]">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#6B6E75] mb-2">
                <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {lang === 'bn' ? 'গুগল সার্চ তথ্যসূত্র' : 'Verified Search Sources'}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                {message.groundingLinks.slice(0, 5).map((link, idx) => (
                  <a
                    key={`${message.id}-src-${idx}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0F4C5C] hover:underline truncate max-w-[240px]"
                  >
                    {link.title}
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
