import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds the press affordance used on tappable cards in the student app. */
  interactive?: boolean;
  /** The inset ring detail ("tiffin compartment"). Off by default in ops. */
  tray?: boolean;
}

/**
 * The recurring surface of the platform: a steel tray. Restaurant cards, menu
 * items, order summaries and every ops panel sit on one of these.
 */
export function Card({ interactive, tray, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'relative rounded-card border border-steel-200 bg-white',
        tray ? 'shadow-tray' : 'shadow-sm',
        interactive && 'transition-transform duration-150 active:scale-[0.98]',
        className,
      )}
      {...props}
    >
      {tray && (
        <div className="pointer-events-none absolute inset-[5px] rounded-[16px] ring-1 ring-steel-100" />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="font-display text-base font-bold tracking-tight text-steel-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-steel-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
