import { cn } from '@/shared/lib/utils';

interface PairCodeTicketProps {
  code: string;
  restaurantName: string;
  /** Omitted when the ticket is shown before there are line items to count
   * (e.g. on the Match Found screen). */
  itemCount?: number;
  className?: string;
}

/**
 * The one deliberately bold element in the interface. A PairCode is what a
 * student reads aloud to their delivery partner at handover (Ch. 10) — so it
 * is rendered like a physical die-cut ticket stub, not a floating string of
 * characters. The dashed seam with bitten notches is the visual promise this
 * whole product makes: two separate halves, joined at exactly one edge.
 */
export function PairCodeTicket({ code, restaurantName, itemCount, className }: PairCodeTicketProps) {
  return (
    <div
      className={cn(
        'flex overflow-hidden rounded-2xl bg-steel-900 text-steel-50 shadow-lg shadow-steel-900/20',
        className,
      )}
    >
      <div className="flex-1 min-w-0 p-5">
        <p className="text-[11px] uppercase tracking-[0.14em] text-turmeric-400 font-display font-semibold">
          Handover code
        </p>
        <p className="mt-1.5 font-display text-base font-semibold truncate">{restaurantName}</p>
        <p className="mt-0.5 text-sm text-steel-300">
          {itemCount !== undefined && `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · `}read this code to
          your delivery partner
        </p>
      </div>
      <div className="ticket-notch perforation relative shrink-0" />
      <div className="flex w-32 shrink-0 flex-col items-center justify-center px-3 py-5">
        <span className="font-mono text-[26px] font-semibold tracking-[0.12em]">{code}</span>
        <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-steel-400">PairCode</span>
      </div>
    </div>
  );
}
