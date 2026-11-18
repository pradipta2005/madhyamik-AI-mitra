import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface BlurRevealTextProps {
  text: string;
  className?: string;
  delay?: number;
}

/**
 * Editorial word-by-word reveal inspired by ReactBits BlurText & Awwwards kinetic type.
 * Uses only compositor-safe opacity, transform, and filter properties.
 */
export function BlurRevealText({
  text,
  className = '',
  delay = 0,
}: BlurRevealTextProps) {
  const shouldReduceMotion = useReducedMotion();
  const words = text.split(/\s+/).filter(Boolean);

  if (shouldReduceMotion) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {words.map((word, idx) => (
        <span key={`${word}-${idx}`}>
          <motion.span
            initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{
              duration: 0.45,
              delay: delay + idx * 0.045,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="inline-block"
          >
            {word}
          </motion.span>
          {idx < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}

interface EditorialRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

/**
 * Scroll-triggered subtle compositor entrance inspired by Motion.dev examples.
 */
export function EditorialReveal({
  children,
  className = '',
  delay = 0,
}: EditorialRevealProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{
        duration: 0.48,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
}

/**
 * Interactive cursor-tracking spotlight surface inspired by ReactBits SpotlightCard.
 * Updates CSS custom properties directly on pointermove for zero React re-renders.
 */
export function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(15, 76, 92, 0.08)',
}: SpotlightCardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
    el.style.setProperty('--spot-opacity', '1');
  };

  const handlePointerLeave = () => {
    const el = containerRef.current;
    if (!el) return;
    el.style.setProperty('--spot-opacity', '0');
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={
        {
          '--spot-x': '50%',
          '--spot-y': '50%',
          '--spot-opacity': '0',
          '--spot-color': spotlightColor,
        } as React.CSSProperties
      }
      className={`relative overflow-hidden ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: 'var(--spot-opacity)',
          background:
            'radial-gradient(360px circle at var(--spot-x) var(--spot-y), var(--spot-color), transparent 72%)',
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

interface AnimatedSegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
  ariaLabel: string;
  size?: 'sm' | 'md';
  tone?: 'light' | 'dark';
}

/**
 * Shared layoutId spring-animated segmented control inspired by Motion.dev.
 */
export function AnimatedSegmented<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  ariaLabel,
  size = 'sm',
  tone = 'light',
}: AnimatedSegmentedProps<T>) {
  const isDark = tone === 'dark';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-lg p-0.5 border ${
        isDark
          ? 'bg-[#1D1F22] border-white/10'
          : 'bg-[#ECE9E0] border-[#DFDCD2]'
      }`}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            className={`relative whitespace-nowrap font-medium cursor-pointer transition-colors ${
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs sm:text-[13px]'
            } ${
              active
                ? isDark
                  ? 'text-[#141517]'
                  : 'text-[#141517]'
                : isDark
                  ? 'text-white/70 hover:text-white'
                  : 'text-[#5A5C60] hover:text-[#141517]'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                className={`absolute inset-0 rounded-md shadow-xs ${
                  isDark ? 'bg-[#F7F6F2]' : 'bg-white'
                }`}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
