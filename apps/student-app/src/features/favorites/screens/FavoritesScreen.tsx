import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ImageOff, Store, UtensilsCrossed } from 'lucide-react';
import { EmptyState, ErrorState, PageTransition, SkeletonCards } from '@campus-bites/ui';
import { AppShell } from '@/shared/components/layout/AppShell';
import { TopBar } from '@/shared/components/layout/TopBar';
import { BottomNav } from '@/shared/components/layout/BottomNav';
import { Compartment } from '@/shared/components/ui/Compartment';
import { Button } from '@/shared/components/ui/Button';
import { CartBar } from '@/features/cart/components/CartBar';
import { RestaurantCard } from '@/features/restaurants/components/RestaurantCard';
import { FavoriteButton } from '@/features/restaurants/components/FavoriteButton';
import { VegMark } from '@/features/restaurants/components/DishCard';
import { useFavoritesStore } from '@/features/favorites/store/useFavoritesStore';
import { cn, formatINR } from '@/shared/lib/utils';

type Tab = 'restaurants' | 'dishes';

export function FavoritesScreen() {
  const navigate = useNavigate();
  const { restaurants, dishes, loaded, error, fetchAll } = useFavoritesStore();
  const [tab, setTab] = useState<Tab>('restaurants');

  useEffect(() => {
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = tab === 'restaurants' ? restaurants : dishes;

  return (
    <AppShell bottomNav={<BottomNav />} stickyBottom={<CartBar />}>
      <TopBar title="Favourites" showBack={false} />

      <div className="px-5 pt-4">
        <div className="flex rounded-full bg-steel-100 p-0.5">
          {(['restaurants', 'dishes'] as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={cn(
                'flex-1 rounded-full py-1.5 text-xs font-semibold transition',
                tab === value ? 'bg-white text-steel-900 shadow-tray' : 'text-steel-500',
              )}
            >
              {value === 'restaurants'
                ? `Canteens${restaurants.length ? ` · ${restaurants.length}` : ''}`
                : `Dishes${dishes.length ? ` · ${dishes.length}` : ''}`}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-4">
        {!loaded && !error && <SkeletonCards count={3} height="h-[92px]" />}

        {error && (
          <ErrorState
            title="Couldn't load your favourites"
            description="Nothing was lost — this is just the list failing to load."
            onRetry={() => void fetchAll()}
          />
        )}

        {loaded && list.length === 0 && (
          <EmptyState
            className="mt-6"
            icon={tab === 'restaurants' ? <Store size={22} /> : <UtensilsCrossed size={22} />}
            title={tab === 'restaurants' ? 'No favourite canteens yet' : 'No favourite dishes yet'}
            description={
              tab === 'restaurants'
                ? 'Tap the heart on any canteen and it will wait for you here — handy for the two places you actually order from.'
                : 'Tap the heart on a dish while browsing a menu to keep it one tap away.'
            }
            action={
              <Button className="mt-1" icon={<Heart size={15} />} onClick={() => navigate('/')}>
                Find something to save
              </Button>
            }
          />
        )}
      </div>

      <PageTransition className="flex flex-col gap-3 px-5 pt-1">
        {tab === 'restaurants'
          ? restaurants.map((restaurant) => (
              <RestaurantCard key={restaurant.id} restaurant={restaurant} />
            ))
          : dishes.map((dish) => (
              <Link key={dish.id} to={`/restaurant/${dish.restaurantId}`}>
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
                    <p className="mt-1 font-display text-sm font-semibold text-steel-800">
                      {formatINR(dish.price)}
                    </p>
                  </div>
                  <FavoriteButton type="menu_item" id={dish.id} label={dish.name} />
                </Compartment>
              </Link>
            ))}
      </PageTransition>
    </AppShell>
  );
}
