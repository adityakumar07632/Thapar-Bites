import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, ImageOff, Star, Store } from 'lucide-react';
import { AppShell } from '@/shared/components/layout/AppShell';
import { TopBar } from '@/shared/components/layout/TopBar';
import { Compartment } from '@/shared/components/ui/Compartment';
import { Chip } from '@/shared/components/ui/Chip';
import { QuantityStepper } from '@/shared/components/ui/QuantityStepper';
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog';
import { CartBar } from '@/features/cart/components/CartBar';
import { useCartStore } from '@/features/cart/store/useCartStore';
import { useRestaurantsStore } from '@/features/restaurants/store/useRestaurantsStore';
import { useRestaurant } from '@/features/restaurants/useRestaurant';
import { FavoriteButton } from '@/features/restaurants/components/FavoriteButton';
import { useFavoritesStore } from '@/features/favorites/store/useFavoritesStore';
import { ErrorState, Skeleton, PageTransition } from '@campus-bites/ui';
import type { MenuCategory, MenuItem } from '@/shared/types/domain';
import { formatINR } from '@/shared/lib/utils';

/** Skeleton placeholder for the restaurant detail screen while data loads. */
function RestaurantDetailSkeleton() {
  return (
    <AppShell>
      <TopBar title="Loading…" />
      <div className="px-5 pt-4" aria-hidden role="status" aria-label="Loading restaurant">
        {/* Info card skeleton */}
        <div className="rounded-card border border-steel-150 bg-white p-4 shadow-tray">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-7 w-7 rounded-full" />
          </div>
          <div className="mt-3 flex gap-1.5">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-5/6" />
        </div>

        {/* Category skeleton */}
        <div className="mt-6">
          <Skeleton className="h-4 w-24" />
          <div className="mt-3 flex flex-col gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-card border border-steel-150 bg-white p-3 shadow-tray">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-14 w-14 rounded-xl" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-8 w-20 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <span className="sr-only">Loading menu…</span>
      </div>
    </AppShell>
  );
}

export function RestaurantDetailScreen() {
  const { restaurantId = '' } = useParams();
  const restaurant = useRestaurant(restaurantId);
  const { fetchMenu } = useRestaurantsStore();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const { lines, addItem, setQuantity, conflict, resolveConflict } = useCartStore();

  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    setMenuLoaded(false);
    setMenuError(null);
    void fetchMenu(restaurantId)
      .then((menu) => {
        if (!active) return;
        setCategories(menu.categories);
        setItems(menu.items);
        setMenuLoaded(true);
      })
      .catch(() => {
        if (active) setMenuError('Could not load this menu. Please try again.');
      });
    return () => {
      active = false;
    };
  }, [restaurantId, fetchMenu]);

  useEffect(() => {
    useCartStore.getState().refresh();
    void useFavoritesStore.getState().fetchAll();
  }, []);

  if (!restaurant) {
    return <RestaurantDetailSkeleton />;
  }

  const quantityFor = (itemId: string) => lines.find((l) => l.menuItemId === itemId)?.quantity ?? 0;
  const orderable = restaurant.isActive !== false;

  return (
    <AppShell stickyBottom={<CartBar />}>
      <TopBar title={restaurant.name} subtitle={restaurant.cuisine ?? undefined} />

      {restaurant.isActive === false && (
        <div className="px-5 pt-4">
          <div className="flex items-center gap-2.5 rounded-2xl bg-chili-500/10 p-3.5 text-sm text-chili-600">
            <Store size={16} className="shrink-0" aria-hidden />
            This restaurant is currently unavailable and isn't accepting orders right now.
          </div>
        </div>
      )}

      <div className="px-5 pt-4">
        <Compartment className="p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-snug text-steel-600">{restaurant.description}</p>
            <FavoriteButton type="restaurant" id={restaurant.id} label={restaurant.name} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Chip>
              <Clock size={11} aria-hidden /> {restaurant.etaMinutes} min
            </Chip>
            {restaurant.rating != null && (
              <Chip aria-label={`Rated ${restaurant.rating.toFixed(1)} stars`}>
                <Star size={11} className="fill-turmeric-500 text-turmeric-500" aria-hidden />
                {restaurant.rating.toFixed(1)}
                {(restaurant.ratingCount ?? 0) > 0 && (
                  <span className="text-steel-400">({restaurant.ratingCount})</span>
                )}
              </Chip>
            )}
            <Chip tone="turmeric">Shared min {formatINR(restaurant.sharedDeliveryMinimum)}</Chip>
            <Chip>Individual min {formatINR(restaurant.minimumOrder)}</Chip>
          </div>
        </Compartment>
      </div>

      {/* Menu loading skeleton */}
      {!menuLoaded && !menuError && (
        <div className="mt-4 px-5" aria-hidden role="status" aria-label="Loading menu">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="mb-4">
              <Skeleton className="mb-3 h-4 w-28" />
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="rounded-card border border-steel-150 bg-white p-3 shadow-tray">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-14 w-14 rounded-xl" />
                      <div className="flex flex-1 flex-col gap-2">
                        <Skeleton className="h-3.5 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                      <Skeleton className="h-8 w-20 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <span className="sr-only">Loading menu…</span>
        </div>
      )}

      {menuError && (
        <div className="mt-4 px-5">
          <ErrorState
            title="Couldn't load the menu"
            description={menuError}
            onRetry={() => {
              setMenuError(null);
              setMenuLoaded(false);
              void fetchMenu(restaurantId)
                .then((menu) => {
                  setCategories(menu.categories);
                  setItems(menu.items);
                  setMenuLoaded(true);
                })
                .catch(() => setMenuError('Could not load this menu. Please try again.'));
            }}
          />
        </div>
      )}

      {/* Menu items — grouped by category */}
      {menuLoaded && !menuError && (
        <PageTransition>
          {categories.map((cat) => {
            const catItems = items.filter((i) => i.categoryId === cat.id);
            if (catItems.length === 0) return null;
            return (
              <div key={cat.id} className="mt-4 px-5">
                <p className="mb-2 font-display text-sm font-semibold text-steel-700">{cat.name}</p>
                <div className="flex flex-col gap-2.5">
                  {catItems.map((item) => {
                    return (
                      <Compartment key={item.id} className="flex items-center gap-3 p-3">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt=""
                            loading="lazy"
                            className="h-14 w-14 shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-steel-100">
                            <ImageOff size={16} className="text-steel-300" aria-hidden />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-steel-900">{item.name}</p>
                          {item.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-steel-400">{item.description}</p>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            <p className="font-display text-sm font-semibold text-steel-800">
                              {formatINR(item.price)}
                            </p>
                            {item.rating != null && (
                              <span className="flex items-center gap-0.5 text-[11px] text-turmeric-600">
                                <Star size={9} className="fill-turmeric-500 text-turmeric-500" aria-hidden />
                                {item.rating.toFixed(1)}
                                {(item.ratingCount ?? 0) > 0 && (
                                  <span className="text-steel-400">({item.ratingCount})</span>
                                )}
                              </span>
                            )}
                            {!item.available && (
                              <span className="rounded-full bg-chili-500/10 px-2 py-0.5 text-[11px] font-medium text-chili-600">
                                Out of stock
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <FavoriteButton type="menu_item" id={item.id} label={item.name} />
                          {orderable && item.available ? (
                            <QuantityStepper
                              quantity={quantityFor(item.id)}
                              onIncrement={() => addItem(item)}
                              onDecrement={() => setQuantity(item.id, Math.max(0, quantityFor(item.id) - 1))}
                            />
                          ) : null}
                        </div>
                      </Compartment>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="h-6" />
        </PageTransition>
      )}

      {conflict && (
        <ConfirmDialog
          title="Start a new cart?"
          description="Your cart has items from another restaurant. Adding this item will clear it — Thapar Bites keeps one restaurant per cart."
          confirmLabel="Start new cart"
          onCancel={() => resolveConflict(false)}
          onConfirm={() => resolveConflict(true)}
        />
      )}
    </AppShell>
  );
}
