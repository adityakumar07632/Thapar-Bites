import type { ReactNode } from 'react';
import { Inbox, TriangleAlert, RefreshCw, MapPinOff, WifiOff, CreditCard, ShieldAlert } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../lib/cn';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-steel-200 bg-white/60 px-6 py-10 text-center animate-rise',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-steel-100 text-steel-400">
        {icon ?? <Inbox size={22} />}
      </span>
      <div>
        <p className="font-display text-[15px] font-semibold text-steel-800">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-xs text-[13px] leading-snug text-steel-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-chili-500/25 bg-chili-500/5 px-6 py-8 text-center animate-rise',
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-chili-500/10 text-chili-600">
        <TriangleAlert size={20} />
      </span>
      <div>
        <p className="font-display text-[15px] font-semibold text-steel-800">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-xs text-[13px] leading-snug text-steel-500">{description}</p>
        )}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Full-page 404 state — use in a catch-all route. */
export function NotFoundState({
  title = 'Page not found',
  description = "We couldn't find what you were looking for. It may have moved or never existed.",
  onHome,
  className,
}: {
  title?: string;
  description?: string;
  onHome?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 px-6 py-14 text-center animate-rise',
        className,
      )}
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-steel-100 text-steel-400">
        <MapPinOff size={28} />
      </span>
      <div>
        <p className="font-display text-3xl font-bold text-steel-800">404</p>
        <p className="mt-1 font-display text-[17px] font-semibold text-steel-800">{title}</p>
        <p className="mx-auto mt-2 max-w-xs text-[13px] leading-snug text-steel-500">{description}</p>
      </div>
      {onHome && (
        <Button size="md" onClick={onHome}>
          Back to home
        </Button>
      )}
    </div>
  );
}

/** Shown when a fetch fails due to a network connectivity issue. */
export function NetworkErrorState({
  onRetry,
  className,
}: {
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-steel-200 bg-steel-50 px-6 py-8 text-center animate-rise',
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-steel-100 text-steel-500">
        <WifiOff size={20} />
      </span>
      <div>
        <p className="font-display text-[15px] font-semibold text-steel-800">Can't connect</p>
        <p className="mx-auto mt-1 max-w-xs text-[13px] leading-snug text-steel-500">
          Check your internet connection and try again.
        </p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** Shown when a payment action fails. */
export function PaymentErrorState({
  title = 'Payment failed',
  description = 'Your payment could not be processed. No money has been charged. Please try again.',
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-chili-500/25 bg-chili-500/5 px-6 py-8 text-center animate-rise',
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-chili-500/10 text-chili-600">
        <CreditCard size={20} />
      </span>
      <div>
        <p className="font-display text-[15px] font-semibold text-steel-800">{title}</p>
        <p className="mx-auto mt-1 max-w-xs text-[13px] leading-snug text-steel-500">{description}</p>
      </div>
      {onRetry && (
        <Button variant="danger" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Shown when the user's session is invalid or expired. */
export function AuthErrorState({
  onSignIn,
  className,
}: {
  onSignIn?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-steel-200 bg-steel-50 px-6 py-8 text-center animate-rise',
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-steel-100 text-steel-500">
        <ShieldAlert size={20} />
      </span>
      <div>
        <p className="font-display text-[15px] font-semibold text-steel-800">Session expired</p>
        <p className="mx-auto mt-1 max-w-xs text-[13px] leading-snug text-steel-500">
          Your session has expired. Please sign in again to continue.
        </p>
      </div>
      {onSignIn && (
        <Button size="sm" onClick={onSignIn}>
          Sign in
        </Button>
      )}
    </div>
  );
}
