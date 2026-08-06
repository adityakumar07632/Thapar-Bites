import { Link } from 'react-router-dom';
import { Clock, ImageOff, Star } from 'lucide-react';
import { Compartment } from '@/shared/components/ui/Compartment';
import { formatINR } from '@/shared/lib/utils';
import type { DishSearchResult } from '@/shared/types/domain';
import { FavoriteButton } from './FavoriteButton';

/** The green/red square every Indian menu uses — clearer than the word. */
export function VegMark({ veg }: { veg: boolean }) {
  return (
    <span
      aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'}
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border ${
        veg ? 'border-cardamom-500' : 'border-chili-500'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${veg ? 'bg-cardamom-500' : 'bg-chili-500'}`}
        aria-hidden
      />
    </span>
  );
}

/** A dish found through cross-restaurant search — tapping it opens the
 * restaurant it belongs to, where it can actually be added to a cart. */
export function DishCard({ dish }: { dish: DishSearchResult }) {
  return (
    <Link to={`/restaurant/${dish.restaurantId}`}>
      <Compartment interactive className="flex items-center gap-3 p-3">
        {dish.imageUrl ? (
          <img
            src={dish.imageUrl}
            alt=""
            loading="lazy"
            className="h-14 w-14 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-steel-100">
            <ImageOff size={16} className="text-steel-300" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <VegMark veg={dish.isVeg !== false} />
            <p className="truncate text-sm font-medium text-steel-900">{dish.name}</p>
          </div>
          <p className="mt-0.5 truncate text-xs text-steel-500">{dish.restaurantName}</p>
          <div className="mt-1 flex items-center gap-3 text-xs text-steel-600">
            <span className="font-display font-semibold text-steel-800">{formatINR(dish.price)}</span>
            <span className="inline-flex items-center gap-1">
              <Clock size={11} aria-hidden /> {dish.restaurantEtaMinutes} min
            </span>
            {dish.restaurantRating != null && (
              <span className="inline-flex items-center gap-1">
                <Star size={11} className="fill-turmeric-500 text-turmeric-500" aria-hidden />
                {dish.restaurantRating.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        <FavoriteButton type="menu_item" id={dish.id} label={dish.name} />
      </Compartment>
    </Link>
  );
}
