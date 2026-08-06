import { useState } from 'react';
import { Star, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { api } from '@/shared/lib/api';
import type { Order } from '@/shared/types/domain';

interface RatingModalProps {
  order: Order;
  restaurantName: string;
  existing: { restaurantStars: number | null; itemRatings: { menuItemId: string; stars: number }[] } | null;
  onClose: () => void;
  onSaved: () => void;
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className="focus:outline-none"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          aria-label={`${n} star${n !== 1 ? 's' : ''}`}
        >
          <Star
            size={22}
            className={
              n <= (hover || value)
                ? 'fill-turmeric-500 text-turmeric-500'
                : 'fill-steel-100 text-steel-200'
            }
          />
        </button>
      ))}
    </div>
  );
}

export function RatingModal({ order, restaurantName, existing, onClose, onSaved }: RatingModalProps) {
  const [restaurantStars, setRestaurantStars] = useState(existing?.restaurantStars ?? 0);
  const [itemStars, setItemStars] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const ir of existing?.itemRatings ?? []) {
      map[ir.menuItemId] = ir.stars;
    }
    return map;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (restaurantStars === 0) {
      setError('Please rate the restaurant before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/ratings', {
        orderId: order.id,
        restaurantId: order.restaurantId,
        restaurantStars,
        itemRatings: Object.entries(itemStars)
          .filter(([, s]) => s > 0)
          .map(([menuItemId, stars]) => ({ menuItemId, stars })),
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save your rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Unique ordered items (deduplicated by menuItemId)
  const seen = new Set<string>();
  const uniqueLines = order.lines.filter((l) => {
    if (seen.has(l.menuItemId)) return false;
    seen.add(l.menuItemId);
    return true;
  });

  const isUpdate = (existing?.restaurantStars ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-steel-900/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-steel-900">
            {isUpdate ? 'Update your rating' : 'Rate your order'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-steel-500 hover:bg-steel-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Restaurant rating */}
        <div className="mb-4 rounded-xl bg-steel-50 p-4">
          <p className="mb-2 text-sm font-semibold text-steel-800">{restaurantName}</p>
          <div className="flex items-center gap-3">
            <StarPicker value={restaurantStars} onChange={setRestaurantStars} />
            {restaurantStars > 0 && (
              <span className="text-xs text-steel-500">
                {['', 'Terrible', 'Poor', 'Okay', 'Good', 'Excellent'][restaurantStars]}
              </span>
            )}
          </div>
        </div>

        {/* Per-item ratings */}
        {uniqueLines.length > 0 && (
          <div className="mb-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-steel-400">Food items</p>
            {uniqueLines.map((line) => (
              <div key={line.menuItemId} className="rounded-xl bg-steel-50 p-3.5">
                <p className="mb-2 text-sm font-medium text-steel-800">{line.name}</p>
                <div className="flex items-center gap-3">
                  <StarPicker
                    value={itemStars[line.menuItemId] ?? 0}
                    onChange={(v) => setItemStars((prev) => ({ ...prev, [line.menuItemId]: v }))}
                  />
                  {(itemStars[line.menuItemId] ?? 0) > 0 && (
                    <span className="text-xs text-steel-500">
                      {['', 'Terrible', 'Poor', 'Okay', 'Good', 'Excellent'][itemStars[line.menuItemId] ?? 0]}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mb-3 rounded-lg bg-chili-500/10 px-3 py-2 text-sm text-chili-600">{error}</p>}

        <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Saving…' : isUpdate ? 'Update rating' : 'Submit rating'}
        </Button>
      </div>
    </div>
  );
}
