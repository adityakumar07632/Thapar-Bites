import { cn } from '../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-shimmer rounded-lg bg-steel-150', className)}
      aria-hidden
    />
  );
}

/** A few shimmering lines — use inside a card while text loads. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Card-shaped placeholder list, sized to match the real cards it replaces. */
export function SkeletonCards({ count = 4, height = 'h-32' }: { count?: number; height?: string }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className={cn('rounded-card', height)} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Placeholder rows for ops tables. */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-10" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/**
 * Matches the two-column layout of RestaurantCard:
 * an 88 × 88 cover tile on the left, three lines of text on the right, chips at the bottom.
 */
export function SkeletonRestaurantCard() {
  return (
    <div
      className="rounded-card border border-steel-150 bg-white p-3 shadow-tray"
      role="status"
      aria-label="Loading restaurant"
    >
      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
        {/* Cover tile */}
        <Skeleton className="aspect-square w-full rounded-2xl" />
        {/* Text column */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
          <div className="mt-1 flex gap-1.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Skeleton card for admin stat tiles (icon + number + label). */
export function SkeletonStatCard({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-card border border-steel-150 bg-white p-4 shadow-tray', className)}
      role="status"
      aria-hidden
    >
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="mt-2 h-6 w-20" />
      <Skeleton className="mt-1 h-3 w-16" />
    </div>
  );
}

/** Skeleton that matches a compact order / payment list item. */
export function SkeletonOrderCard({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2.5" role="status" aria-label="Loading orders">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-card border border-steel-150 bg-white p-3.5 shadow-tray">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="mt-2.5 flex gap-1.5">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Skeleton for a 2-column grid of stat cards in the profile screen. */
export function SkeletonProfileStats() {
  return (
    <div className="grid grid-cols-2 gap-2.5" role="status" aria-label="Loading stats" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-card border border-steel-150 bg-white p-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="mt-1.5 h-5 w-24" />
          <Skeleton className="mt-1 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
