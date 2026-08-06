import { Link } from 'react-router-dom';
import { Clock, Star, Users } from 'lucide-react';
import { Compartment } from '@/shared/components/ui/Compartment';
import { Chip } from '@/shared/components/ui/Chip';
import { formatINR } from '@/shared/lib/utils';
import type { Restaurant } from '@/shared/types/domain';
import { coverFor, initialsFor, isOpenNow } from '@/features/restaurants/discovery';
import { FavoriteButton } from './FavoriteButton';

const STATUS_LABEL: Record<string, string> = {
  open: 'Open now',
  busy: 'Busy · longer wait',
  closed: 'Closed',
};

/**
 * Phase 5 card: a fixed-ratio cover tile on the left carries the visual
 * weight, and the three facts a hungry student actually decides on — ETA,
 * rating, and whether Shared Delivery is worth it here — sit on one line
 * under the name. Open/Closed is a badge on the cover so it survives even
 * when the text column is truncated on a narrow phone.
 */
export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const disabled = restaurant.isActive === false;
  const open = isOpenNow(restaurant);

  const card = (
    <Compartment interactive={!disabled} className={disabled ? 'p-3 opacity-60' : 'p-3'}>
      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
        <div className="relative aspect-square overflow-hidden rounded-2xl">
          {restaurant.imageUrl ? (
            <img
              src={restaurant.imageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              aria-hidden
              className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${coverFor(
                restaurant.name,
              )} font-display text-xl font-bold text-white/90`}
            >
              {initialsFor(restaurant.name)}
            </div>
          )}
          <span
            className={`absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
              open ? 'bg-cardamom-500 text-white' : 'bg-steel-900/85 text-steel-100'
            }`}
          >
            {disabled ? 'Unavailable' : open ? 'Open' : 'Closed'}
          </span>
        </div>

        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[15px] font-semibold text-steel-900">
                {restaurant.name}
              </p>
              <p className="mt-0.5 truncate text-xs text-steel-500">{restaurant.cuisine}</p>
            </div>
            <FavoriteButton type="restaurant" id={restaurant.id} label={restaurant.name} />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel-600">
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden /> {restaurant.etaMinutes} min
            </span>
            {restaurant.rating != null && (
              <span
                className="inline-flex items-center gap-1"
                aria-label={`Rated ${restaurant.rating.toFixed(1)} out of 5`}
              >
                <Star size={12} className="fill-turmeric-500 text-turmeric-500" aria-hidden />
                {restaurant.rating.toFixed(1)}
              </span>
            )}
            <span className="text-steel-400">{STATUS_LABEL[restaurant.status]}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip tone="turmeric">
              <Users size={11} aria-hidden /> Shared {formatINR(restaurant.sharedDeliveryMinimum)}
            </Chip>
            <Chip>Min {formatINR(restaurant.minimumOrder)}</Chip>
          </div>
        </div>
      </div>
    </Compartment>
  );

  if (disabled) return <div>{card}</div>;
  return <Link to={`/restaurant/${restaurant.id}`}>{card}</Link>;
}
