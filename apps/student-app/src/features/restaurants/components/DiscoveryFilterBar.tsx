import { SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  DEFAULT_FILTERS,
  ETA_OPTIONS,
  PRICE_OPTIONS,
  RATING_OPTIONS,
  activeFilterCount,
  type DiscoveryFilters,
} from '@/features/restaurants/discovery';

function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition',
        active
          ? 'border-steel-900 bg-steel-900 text-steel-50'
          : 'border-steel-200 bg-white text-steel-600 active:bg-steel-100',
      )}
    >
      {children}
    </button>
  );
}

/**
 * All six filters live in one horizontally scrollable rail rather than behind
 * a modal: on a phone, a student refining "veg, under ₹150, open now" wants
 * to see the list change under their thumb, not commit to a sheet.
 */
export function DiscoveryFilterBar({
  filters,
  onChange,
  expanded,
  onToggleExpanded,
}: {
  filters: DiscoveryFilters;
  onChange: (next: DiscoveryFilters) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const count = activeFilterCount(filters);
  const set = (patch: Partial<DiscoveryFilters>) => onChange({ ...filters, ...patch });

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
            count > 0
              ? 'border-turmeric-500 bg-turmeric-500/15 text-turmeric-700'
              : 'border-steel-200 bg-white text-steel-600',
          )}
        >
          <SlidersHorizontal size={13} />
          Filters{count > 0 ? ` · ${count}` : ''}
        </button>

        <div className="scroll-quiet flex flex-1 gap-2 overflow-x-auto">
          <Pill
            active={filters.diet === 'veg'}
            onClick={() => set({ diet: filters.diet === 'veg' ? 'all' : 'veg' })}
          >
            <span className="h-2 w-2 rounded-full bg-cardamom-500" aria-hidden /> Veg
          </Pill>
          <Pill
            active={filters.diet === 'non_veg'}
            onClick={() => set({ diet: filters.diet === 'non_veg' ? 'all' : 'non_veg' })}
          >
            <span className="h-2 w-2 rounded-full bg-chili-500" aria-hidden /> Non-Veg
          </Pill>
          <Pill active={filters.openNow} onClick={() => set({ openNow: !filters.openNow })}>
            Open now
          </Pill>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 rounded-2xl border border-steel-200 bg-white p-3.5">
          <FilterRow label="Max price per dish">
            {PRICE_OPTIONS.map((price) => (
              <Pill
                key={price}
                active={filters.maxPrice === price}
                onClick={() => set({ maxPrice: filters.maxPrice === price ? null : price })}
              >
                Under ₹{price}
              </Pill>
            ))}
          </FilterRow>

          <FilterRow label="Delivery time">
            {ETA_OPTIONS.map((eta) => (
              <Pill
                key={eta}
                active={filters.maxEta === eta}
                onClick={() => set({ maxEta: filters.maxEta === eta ? null : eta })}
              >
                Under {eta} min
              </Pill>
            ))}
          </FilterRow>

          <FilterRow label="Rating">
            {RATING_OPTIONS.map((rating) => (
              <Pill
                key={rating}
                active={filters.minRating === rating}
                onClick={() => set({ minRating: filters.minRating === rating ? null : rating })}
              >
                {rating}+ ★
              </Pill>
            ))}
          </FilterRow>

          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange(DEFAULT_FILTERS)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-steel-500 underline-offset-2 hover:underline"
            >
              <X size={12} /> Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-steel-400">
        {label}
      </p>
      <div className="scroll-quiet flex gap-2 overflow-x-auto pb-0.5">{children}</div>
    </div>
  );
}
