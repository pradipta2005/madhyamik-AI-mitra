import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { LanguageCode } from '../types';

export type BrandLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface BrandLogoProps {
  size?: BrandLogoSize;
  variant?: 'emblem' | 'mark';
  interactive?: boolean;
  className?: string;
}

const SIZE_PX: Record<BrandLogoSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 72,
};

/**
 * Handcrafted WBBSE Scholar's Folio + Guiding Mitra Star emblem.
 * Combines an open textbook folio forming an architectural "M" monogram,
 * a central fountain-pen nib axis, and a 4-point guiding star ("Mitra").
 */
export function BrandLogo({
  size = 'sm',
  variant = 'emblem',
  interactive = false,
  className = '',
}: BrandLogoProps) {
  const uid = useId().replace(/:/g, '');
  const tileGradId = `mitra-tile-${uid}`;
  const starGradId = `mitra-star-${uid}`;
  const px = SIZE_PX[size];
  const shouldReduceMotion = useReducedMotion();

  const isMark = variant === 'mark';
  const strokeColor = isMark ? 'currentColor' : '#F7F6F2';
  const baseFolioColor = isMark ? 'currentColor' : 'rgba(247, 246, 242, 0.56)';
  const nibColor = isMark ? '#0F4C5C' : '#A7F3D0';

  return (
    <motion.span
      className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
      style={{ width: px, height: px }}
      whileHover={
        interactive && !shouldReduceMotion
          ? { scale: 1.05, rotate: -1.5 }
          : undefined
      }
      whileTap={
        interactive && !shouldReduceMotion ? { scale: 0.96 } : undefined
      }
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      aria-hidden="true"
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full overflow-visible"
      >
        <defs>
          <linearGradient
            id={tileGradId}
            x1="6"
            y1="4"
            x2="42"
            y2="44"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#1B4735" />
            <stop offset="55%" stopColor="#143326" />
            <stop offset="100%" stopColor="#0B2017" />
          </linearGradient>
          <linearGradient
            id={starGradId}
            x1="20"
            y1="8"
            x2="28"
            y2="19"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="55%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
        </defs>

        {!isMark && (
          <>
            <rect
              x="2"
              y="2"
              width="44"
              height="44"
              rx="12"
              fill={`url(#${tileGradId})`}
            />
            <rect
              x="2.75"
              y="2.75"
              width="42.5"
              height="42.5"
              rx="11.25"
              stroke="rgba(247, 246, 242, 0.16)"
              strokeWidth="1"
            />
          </>
        )}

        {/* Open-folio curved book baseline under the M pillars */}
        <path
          d="M10.5 35.5Q17.2 33.4 24 36.6Q30.8 33.4 37.5 35.5"
          stroke={baseFolioColor}
          strokeWidth="1.9"
          strokeLinecap="round"
        />

        {/* Central fountain-nib / compass spire */}
        <path
          d="M24 36.2V21.5"
          stroke={nibColor}
          strokeWidth="1.85"
          strokeLinecap="round"
        />
        <circle cx="24" cy="21" r="1.25" fill={nibColor} />

        {/* Architectural M Folio Monogram */}
        <path
          d="M11.5 34.2V19.2L24 29.2L36.5 19.2V34.2"
          stroke={strokeColor}
          strokeWidth="2.85"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Guiding 4-point Mitra Star */}
        <path
          d="M24 7.8Q24.85 12.65 29.7 13.5Q24.85 14.35 24 19.2Q23.15 14.35 18.3 13.5Q23.15 12.65 24 7.8Z"
          fill={isMark ? '#D97706' : `url(#${starGradId})`}
        />
      </svg>
    </motion.span>
  );
}

interface BrandLoaderProps {
  variant?: 'fullscreen' | 'inline';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  label?: string;
  sublabel?: string;
  language?: LanguageCode;
  iconOnly?: boolean;
  className?: string;
}

const LOADER_PX: Record<'xs' | 'sm' | 'md' | 'lg', number> = {
  xs: 18,
  sm: 28,
  md: 38,
  lg: 72,
};

/**
 * Animated logo loader derived directly from the Madhyamik AI Mitra emblem.
 * Uses only compositor-friendly transform, opacity, and SVG pathLength properties,
 * with a clean static/pulse fallback when prefers-reduced-motion is active.
 */
export function BrandLoader({
  variant = 'inline',
  size = variant === 'fullscreen' ? 'lg' : 'sm',
  label,
  sublabel,
  language = 'en',
  iconOnly = false,
  className = '',
}: BrandLoaderProps) {
  const uid = useId().replace(/:/g, '');
  const tileGradId = `loader-tile-${uid}`;
  const starGradId = `loader-star-${uid}`;
  const ringGradId = `loader-ring-${uid}`;
  const shouldReduceMotion = useReducedMotion();

  const px = LOADER_PX[size];
  const showHalo = size === 'lg' || size === 'md';
  const haloSize = size === 'lg' ? px + 34 : size === 'md' ? px + 22 : px;
  const haloCenter = haloSize / 2;
  const haloRadius = haloCenter - 3.5;

  const defaultLabel =
    label ??
    (language === 'bn'
      ? 'মাধ্যমিক এআই মিত্র প্রস্তুত হচ্ছে...'
      : 'Madhyamik AI Mitra');

  const defaultSublabel =
    sublabel ??
    (language === 'bn'
      ? 'WBBSE পাঠ্যক্রম ও স্টাডি সেশন লোড হচ্ছে'
      : 'Preparing your WBBSE study desk');

  const animatedSvg = (
    <div
      className="relative inline-flex items-center justify-center shrink-0 select-none"
      style={{
        width: haloSize,
        height: haloSize,
      }}
      aria-hidden="true"
    >
      {/* Ambient orbital compass arc sized cleanly outside the emblem corners */}
      {showHalo && (
        <motion.svg
          viewBox={`0 0 ${haloSize} ${haloSize}`}
          fill="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
          animate={
            shouldReduceMotion
              ? { opacity: [0.45, 0.75, 0.45] }
              : { rotate: 360 }
          }
          transition={
            shouldReduceMotion
              ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 6.0, repeat: Infinity, ease: 'linear' }
          }
        >
          <defs>
            <linearGradient
              id={ringGradId}
              x1={haloCenter * 0.2}
              y1={haloCenter * 0.2}
              x2={haloSize - haloCenter * 0.2}
              y2={haloSize - haloCenter * 0.2}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#0F4C5C" stopOpacity="0.45" />
              <stop offset="65%" stopColor="#F59E0B" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#143326" stopOpacity="0" />
            </linearGradient>
          </defs>
          <circle
            cx={haloCenter}
            cy={haloCenter}
            r={haloRadius}
            stroke="#DFDCD2"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
          <path
            d={`M ${haloCenter} ${haloCenter - haloRadius} A ${haloRadius} ${haloRadius} 0 0 1 ${haloCenter + haloRadius} ${haloCenter}`}
            stroke={`url(#${ringGradId})`}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle
            cx={haloCenter + haloRadius}
            cy={haloCenter}
            r="2.4"
            fill="#F59E0B"
          />
        </motion.svg>
      )}

      {/* Animated Emblem Core */}
      <motion.div
        style={{ width: px, height: px }}
        animate={
          shouldReduceMotion
            ? { opacity: [0.85, 1, 0.85] }
            : { scale: [0.97, 1.015, 0.97] }
        }
        transition={{
          duration: 2.4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <svg
          width={px}
          height={px}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full overflow-visible"
        >
          <defs>
            <linearGradient
              id={tileGradId}
              x1="6"
              y1="4"
              x2="42"
              y2="44"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#1B4735" />
              <stop offset="55%" stopColor="#143326" />
              <stop offset="100%" stopColor="#0B2017" />
            </linearGradient>
            <linearGradient
              id={starGradId}
              x1="20"
              y1="8"
              x2="28"
              y2="19"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FEF08A" />
              <stop offset="55%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
          </defs>

          <rect
            x="2"
            y="2"
            width="44"
            height="44"
            rx="12"
            fill={`url(#${tileGradId})`}
          />
          <rect
            x="2.75"
            y="2.75"
            width="42.5"
            height="42.5"
            rx="11.25"
            stroke="rgba(247, 246, 242, 0.18)"
            strokeWidth="1"
          />

          {/* Ghost track underneath chalk stroke for smooth visual continuity */}
          <path
            d="M11.5 34.2V19.2L24 29.2L36.5 19.2V34.2"
            stroke="rgba(247, 246, 242, 0.2)"
            strokeWidth="2.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Open-folio curved book baseline */}
          <motion.path
            d="M10.5 35.5Q17.2 33.4 24 36.6Q30.8 33.4 37.5 35.5"
            stroke="rgba(247, 246, 242, 0.62)"
            strokeWidth="1.9"
            strokeLinecap="round"
            initial={{ pathLength: shouldReduceMotion ? 1 : 0.2 }}
            animate={
              shouldReduceMotion
                ? { pathLength: 1 }
                : {
                    pathLength: [0.2, 1, 1, 0.2],
                    opacity: [0.4, 0.9, 0.9, 0.4],
                  }
            }
            transition={{
              duration: 2.4,
              times: [0, 0.45, 0.84, 1],
              repeat: Infinity,
              ease: [0.22, 1, 0.36, 1],
            }}
          />

          {/* Central nib axis + nib eye */}
          <motion.path
            d="M24 36.2V21.5"
            stroke="#A7F3D0"
            strokeWidth="1.9"
            strokeLinecap="round"
            initial={{ pathLength: shouldReduceMotion ? 1 : 0.1 }}
            animate={
              shouldReduceMotion
                ? { pathLength: 1 }
                : {
                    pathLength: [0.1, 1, 1, 0.1],
                    opacity: [0.35, 1, 1, 0.35],
                  }
            }
            transition={{
              duration: 2.4,
              times: [0, 0.5, 0.84, 1],
              repeat: Infinity,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
          <motion.circle
            cx="24"
            cy="21"
            r="1.25"
            fill="#A7F3D0"
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: [0.35, 1, 1, 0.35] }
            }
            transition={{
              duration: 2.4,
              times: [0, 0.5, 0.84, 1],
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Animated Chalk-Drawn M Folio Stroke */}
          <motion.path
            d="M11.5 34.2V19.2L24 29.2L36.5 19.2V34.2"
            stroke="#F7F6F2"
            strokeWidth="2.85"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: shouldReduceMotion ? 1 : 0.08 }}
            animate={
              shouldReduceMotion
                ? { pathLength: 1 }
                : {
                    pathLength: [0.08, 1, 1, 0.08],
                    opacity: [0.65, 1, 1, 0.65],
                  }
            }
            transition={{
              duration: 2.4,
              times: [0, 0.52, 0.85, 1],
              repeat: Infinity,
              ease: [0.22, 1, 0.36, 1],
            }}
          />

          {/* Guiding Mitra Star blooming & twinkling at the apex */}
          <motion.g
            style={{ transformOrigin: '24px 13.5px' }}
            animate={
              shouldReduceMotion
                ? { opacity: [0.75, 1, 0.75] }
                : {
                    scale: [0.8, 1.15, 0.96, 0.8],
                    rotate: [0, 45, 90, 90],
                    opacity: [0.75, 1, 1, 0.75],
                  }
            }
            transition={{
              duration: 2.8,
              times: [0, 0.45, 0.84, 1],
              repeat: Infinity,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <path
              d="M24 7.8Q24.85 12.65 29.7 13.5Q24.85 14.35 24 19.2Q23.15 14.35 18.3 13.5Q23.15 12.65 24 7.8Z"
              fill={`url(#${starGradId})`}
            />
          </motion.g>
        </svg>
      </motion.div>
    </div>
  );

  if (variant === 'fullscreen') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={defaultLabel}
        className={`min-h-screen bg-[#F7F6F2] flex flex-col items-center justify-center px-6 text-center ${className}`}
      >
        <div className="flex flex-col items-center gap-5 max-w-sm">
          {animatedSvg}

          <div className="space-y-1.5">
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#141517]">
              {defaultLabel}
            </h1>
            <p className="text-xs sm:text-sm text-[#5A5C60]">{defaultSublabel}</p>
          </div>

          {/* Compositor-only progress shimmer bar */}
          <div className="w-52 h-1.5 rounded-full bg-[#DFDCD2] overflow-hidden relative">
            <motion.div
              className="absolute inset-y-0 left-0 w-28 rounded-full bg-gradient-to-r from-[#143326] via-[#0F4C5C] to-[#F59E0B]"
              animate={
                shouldReduceMotion
                  ? { opacity: [0.5, 1, 0.5] }
                  : { x: ['-100%', '220%'] }
              }
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (iconOnly) {
    return (
      <span className={`inline-flex items-center justify-center shrink-0 ${className}`}>
        {animatedSvg}
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {animatedSvg}
      {(label || sublabel) && (
        <div className="min-w-0 text-left">
          {label && (
            <div className="text-sm font-medium text-[#141517] leading-snug">
              {label}
            </div>
          )}
          {sublabel && (
            <div className="text-[11px] text-[#5A5C60] mt-0.5 leading-snug">
              {sublabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
