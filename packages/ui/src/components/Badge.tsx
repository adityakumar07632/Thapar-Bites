import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export type Tone = 'neutral' | 'turmeric' | 'cardamom' | 'chili' | 'steel';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-steel-100 text-steel-700',
  turmeric: 'bg-turmeric-500/15 text-turmeric-700',
  cardamom: 'bg-cardamom-500/15 text-cardamom-600',
  chili: 'bg-chili-500/10 text-chili-600',
  steel: 'bg-steel-900 text-steel-50',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium leading-none',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
