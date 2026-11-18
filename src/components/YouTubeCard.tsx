import { useState } from 'react';
import { CheckCircle2, ExternalLink, PlayCircle } from 'lucide-react';
import type { LanguageCode, YouTubeRecommendation } from '../types';

interface YouTubeCardProps {
  video: YouTubeRecommendation;
  language: LanguageCode;
}

export function YouTubeCard({ video, language }: YouTubeCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 bg-[#FAF9F6] border border-[#E4E2DC] hover:border-[#0F4C5C]/45 hover:bg-white rounded-xl p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C5C]"
    >
      {video.thumbnailUrl && !imgFailed ? (
        <div className="relative w-24 h-16 rounded-lg overflow-hidden bg-[#ECEAE3] border border-[#DFDCD2] shrink-0">
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/25 flex items-center justify-center group-hover:bg-black/35 transition-colors">
            <PlayCircle className="w-6 h-6 text-white drop-shadow" aria-hidden="true" />
          </div>
        </div>
      ) : (
        <div className="w-11 h-11 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0 text-rose-700 group-hover:bg-rose-100 transition-colors">
          <PlayCircle className="w-5 h-5" aria-hidden="true" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-[#141517] group-hover:text-[#0F4C5C] transition-colors line-clamp-2">
            {video.title}
          </h4>
          <ExternalLink
            className="w-3.5 h-3.5 text-[#73767D] group-hover:text-[#0F4C5C] shrink-0 mt-0.5"
            aria-hidden="true"
          />
        </div>
        <p className="text-xs text-[#5A5C60] mt-1 flex flex-wrap items-center gap-1.5">
          <span className="truncate max-w-[140px]">{video.channel}</span>
          <span aria-hidden="true">·</span>
          {video.verified ? (
            <span className="inline-flex items-center gap-1 text-[#143326] font-medium">
              <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>
                {language === 'bn' ? 'ইউটিউবে যাচাইকৃত' : 'Verified on YouTube'}
              </span>
            </span>
          ) : (
            <span>{language === 'bn' ? 'ইউটিউব ভিডিও' : 'YouTube'}</span>
          )}
        </p>
        {video.reason && (
          <p className="text-xs text-[#4B4E54] mt-1 line-clamp-2">
            {video.reason}
          </p>
        )}
      </div>
    </a>
  );
}
