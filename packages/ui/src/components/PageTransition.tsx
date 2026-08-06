import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/**
 * Wraps a page or list in a subtle entry animation.
 * Uses CSS-only `animate-rise` — no JS dependency, respects
 * `prefers-reduced-motion` via the global token override.
 *
 * The `key` prop on the parent route element is what actually triggers
 * re-animation on navigation; this component just applies the class.
 */
export function PageTransition({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('animate-rise', className)} {...props}>
      {children}
    </div>
  );
}
