import { Heart } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useFavoritesStore, type FavoriteTarget } from '@/features/favorites/store/useFavoritesStore';

/**
 * The heart. Deliberately stops propagation: cards are wrapped in a <Link>,
 * and favouriting must never navigate.
 */
export function FavoriteButton({
  type,
  id,
  label,
  className,
}: {
  type: FavoriteTarget;
  id: string;
  label: string;
  className?: string;
}) {
  const favorited = useFavoritesStore((state) =>
    type === 'restaurant' ? state.restaurantIds.has(id) : state.dishIds.has(id),
  );
  const toggle = useFavoritesStore((state) => state.toggle);

  return (
    <button
      type="button"
      aria-pressed={favorited}
      aria-label={favorited ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggle(type, id);
      }}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition active:scale-90',
        favorited ? 'bg-chili-500/10 text-chili-500' : 'bg-steel-100/90 text-steel-400',
        className,
      )}
    >
      <Heart size={15} className={favorited ? 'fill-chili-500' : undefined} />
    </button>
  );
}
