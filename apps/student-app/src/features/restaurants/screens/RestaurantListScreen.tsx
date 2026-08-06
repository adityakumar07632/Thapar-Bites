import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, MapPin, Search, Store, UtensilsCrossed, X } from 'lucide-react';
import {
  EmptyState,
  ErrorState,
  PageTransition,
  SkeletonRestaurantCard,
} from '@campus-bites/ui';
import { AppShell } from '@/shared/components/layout/AppShell';
import { BottomNav } from '@/shared/components/layout/BottomNav';
import { CartBar } from '@/features/cart/components/CartBar';
import { useRestaurantsStore } from '@/features/restaurants/store/useRestaurantsStore';
import { useFavoritesStore } from '@/features/favorites/store/useFavoritesStore';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { api } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';
import type { DishSearchResult } from '@/shared/types/domain';
import {
  DEFAULT_FILTERS,
  filterDishes,
  filterRestaurants,
  indexDishes,
  type DiscoveryFilters,
} from '@/features/restaurants/discovery';
import { RestaurantCard } from '@/features/restaurants/components/RestaurantCard';
import { DishCard } from '@/features/restaurants/components/DishCard';
import { DiscoveryFilterBar } from '@/features/restaurants/components/DiscoveryFilterBar';

type Mode = 'restaurants' | 'dishes';

export function RestaurantListScreen() {
  const { restaurants, loaded, loading, error, fetchAll } = useRestaurantsStore();
  const { student, logout } = useAuthStore();
  const fetchFavorites = useFavoritesStore((state) => state.fetchAll);

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('restaurants');
  const [filters, setFilters] = useState<DiscoveryFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The dish index powers cross-restaurant dish search AND the Veg/Non-Veg
  // and price filters on the restaurant list, so it's fetched once up front
  // and then filtered in memory — searching never round-trips or reloads.
  const [dishes, setDishes] = useState<DishSearchResult[]>([]);

  const doFetch = useCallback(() => {
    void fetchAll();
    void fetchFavorites();
    api
      .get<DishSearchResult[]>('/restaurants/dishes')
      .then((data) => setDishes(data))
      .catch(() => {
        // Dish search degrades to restaurant-only search; the list still works.
      });
  }, [fetchAll, fetchFavorites]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  const dishIndex = useMemo(() => indexDishes(dishes), [dishes]);
  const visibleRestaurants = useMemo(
    () => filterRestaurants(restaurants, query, filters, dishIndex),
    [restaurants, query, filters, dishIndex],
  );
  const visibleDishes = useMemo(
    () => filterDishes(dishes, query, filters).slice(0, 60),
    [dishes, query, filters],
  );

  const searching = query.trim().length > 0;
  const resultCount = mode === 'restaurants' ? visibleRestaurants.length : visibleDishes.length;

  return (
    <AppShell bottomNav={<BottomNav />} stickyBottom={<CartBar />}>
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-2">
        <div className="flex items-start justify-between">
          <p className="font-display text-2xl font-bold tracking-tight text-steel-900">Thapar Bites</p>
          <button
            onClick={() => void logout()}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-steel-100 text-steel-500 transition-colors hover:bg-steel-200 active:bg-steel-300"
            aria-label="Log out"
          >
            <LogOut size={15} />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-sm text-steel-500">
          <MapPin size={15} aria-hidden />
          <span>
            Ordering for <span className="font-medium text-steel-700">{student?.hostel} Hostel</span>
          </span>
        </div>
      </div>

      {/* Search — filters as you type, no submit, no reload. */}
      <div className="sticky top-0 z-10 bg-steel-50/95 backdrop-blur px-5 pb-3 pt-2">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel-400"
            aria-hidden
          />
          <input
            type="search"
            placeholder={mode === 'dishes' ? 'Search dishes…' : 'Search canteens…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 w-full rounded-xl border border-steel-200 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-steel-400 focus:border-turmeric-500 transition-colors"
            aria-label={mode === 'dishes' ? 'Search dishes' : 'Search canteens'}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-steel-400 hover:bg-steel-100"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Mode toggle + filters */}
        <div className="mt-2 flex items-center gap-2">
          {(['restaurants', 'dishes'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-150',
                mode === m
                  ? 'bg-steel-900 text-steel-50'
                  : 'bg-steel-100 text-steel-500 hover:bg-steel-200',
              )}
            >
              {m === 'restaurants' ? <Store size={12} aria-hidden /> : <UtensilsCrossed size={12} aria-hidden />}
              {m === 'restaurants' ? 'Canteens' : 'Dishes'}
            </button>
          ))}
          <div className="ml-auto">
            <DiscoveryFilterBar
              filters={filters}
              onChange={setFilters}
              expanded={filtersOpen}
              onToggleExpanded={() => setFiltersOpen((open) => !open)}
            />
          </div>
        </div>
      </div>

      {/* Loading state — skeleton cards that match the real RestaurantCard layout */}
      {loading && !loaded && (
        <div className="flex flex-col gap-3 px-5 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRestaurantCard key={i} />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="px-5 pt-4">
          <ErrorState
            title="Couldn't load restaurants"
            description="Check your connection and try again."
            onRetry={doFetch}
          />
        </div>
      )}

      {/* Empty state — no results for the current search / filter combo */}
      {loaded && !loading && !error && resultCount === 0 && (
        <div className="px-5 pt-4">
          <EmptyState
            className="mt-2"
            icon={mode === 'dishes' ? <UtensilsCrossed size={22} /> : <Search size={22} />}
            title={searching ? `Nothing matches "${query.trim()}"` : 'No results for these filters'}
            description={
              searching
                ? mode === 'dishes'
                  ? 'Try a shorter word — "biryani" rather than "chicken biryani full plate".'
                  : 'Check the spelling, or switch to Dishes to search menus instead of canteen names.'
                : 'Loosen a filter — price and delivery time are usually the strictest.'
            }
            action={
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setFilters(DEFAULT_FILTERS);
                }}
                className="rounded-full bg-steel-900 px-4 py-2 text-xs font-semibold text-steel-50 transition-opacity hover:opacity-80"
              >
                Reset search &amp; filters
              </button>
            }
          />
        </div>
      )}

      {loaded && !loading && !error && resultCount > 0 && (
        <p className="px-5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-steel-400">
          {resultCount}{' '}
          {mode === 'restaurants'
            ? resultCount === 1
              ? 'canteen'
              : 'canteens'
            : resultCount === 1
              ? 'dish'
              : 'dishes'}
        </p>
      )}

      <PageTransition className="flex flex-col gap-3 px-5 pt-2 pb-4">
        {loaded && !loading && !error && (
          mode === 'restaurants'
            ? visibleRestaurants.map((restaurant) => (
                <RestaurantCard key={restaurant.id} restaurant={restaurant} />
              ))
            : visibleDishes.map((dish) => <DishCard key={dish.id} dish={dish} />)
        )}
      </PageTransition>
    </AppShell>
  );
}
