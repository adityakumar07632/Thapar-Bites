import type { DishSearchResult, Restaurant } from '@/shared/types/domain';

/** The filter state shared by the search bar, the filter sheet and the list. */
export interface DiscoveryFilters {
  diet: 'all' | 'veg' | 'non_veg';
  maxPrice: number | null; // rupees — matched against a restaurant's cheapest dish
  openNow: boolean;
  maxEta: number | null; // minutes
  minRating: number | null;
}

export const DEFAULT_FILTERS: DiscoveryFilters = {
  diet: 'all',
  maxPrice: null,
  openNow: false,
  maxEta: null,
  minRating: null,
};

export const PRICE_OPTIONS = [100, 150, 250, 400] as const;
export const ETA_OPTIONS = [15, 25, 40] as const;
export const RATING_OPTIONS = [3, 4, 4.5] as const;

export function activeFilterCount(filters: DiscoveryFilters): number {
  let count = 0;
  if (filters.diet !== 'all') count += 1;
  if (filters.maxPrice != null) count += 1;
  if (filters.openNow) count += 1;
  if (filters.maxEta != null) count += 1;
  if (filters.minRating != null) count += 1;
  return count;
}

export function isOpenNow(restaurant: Restaurant): boolean {
  return restaurant.isActive !== false && restaurant.status !== 'closed';
}

/** Dishes grouped by restaurant, so a restaurant can be filtered on what it
 * actually serves (Veg / Non-Veg, cheapest dish) without another request. */
export function indexDishes(dishes: DishSearchResult[]): Map<string, DishSearchResult[]> {
  const byRestaurant = new Map<string, DishSearchResult[]>();
  for (const dish of dishes) {
    const list = byRestaurant.get(dish.restaurantId);
    if (list) list.push(dish);
    else byRestaurant.set(dish.restaurantId, [dish]);
  }
  return byRestaurant;
}

function dietMatches(dish: DishSearchResult, diet: DiscoveryFilters['diet']): boolean {
  if (diet === 'all') return true;
  // `isVeg` defaults to true server-side, so an unset value counts as veg.
  const veg = dish.isVeg !== false;
  return diet === 'veg' ? veg : !veg;
}

export function filterRestaurants(
  restaurants: Restaurant[],
  query: string,
  filters: DiscoveryFilters,
  dishIndex: Map<string, DishSearchResult[]>,
): Restaurant[] {
  const needle = query.trim().toLowerCase();

  return restaurants.filter((restaurant) => {
    if (needle) {
      const haystack = `${restaurant.name} ${restaurant.cuisine ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filters.openNow && !isOpenNow(restaurant)) return false;
    if (filters.maxEta != null && restaurant.etaMinutes > filters.maxEta) return false;
    if (filters.minRating != null && (restaurant.rating ?? 0) < filters.minRating) return false;

    const dishes = dishIndex.get(restaurant.id) ?? [];
    if (filters.diet !== 'all') {
      // No menu loaded yet: don't hide the restaurant on a filter we can't
      // evaluate — an empty result set is worse than a slightly loose one.
      if (dishes.length > 0 && !dishes.some((dish) => dietMatches(dish, filters.diet))) return false;
    }
    if (filters.maxPrice != null && dishes.length > 0) {
      const eligible = dishes.filter((dish) => dietMatches(dish, filters.diet));
      const cheapest = Math.min(...(eligible.length ? eligible : dishes).map((dish) => dish.price));
      if (cheapest > filters.maxPrice) return false;
    }
    return true;
  });
}

export function filterDishes(
  dishes: DishSearchResult[],
  query: string,
  filters: DiscoveryFilters,
): DishSearchResult[] {
  const needle = query.trim().toLowerCase();

  return dishes.filter((dish) => {
    if (needle) {
      const haystack = `${dish.name} ${dish.description ?? ''} ${dish.restaurantName}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (!dietMatches(dish, filters.diet)) return false;
    if (filters.maxPrice != null && dish.price > filters.maxPrice) return false;
    if (filters.openNow && (dish.restaurantStatus === 'closed' || !dish.restaurantIsActive)) return false;
    if (filters.maxEta != null && dish.restaurantEtaMinutes > filters.maxEta) return false;
    if (filters.minRating != null && (dish.restaurantRating ?? 0) < filters.minRating) return false;
    return true;
  });
}

/**
 * Restaurants in this build have no photography of their own, and a stock
 * placeholder for every outlet reads as a broken image grid. Instead each
 * card gets a deterministic two-tone tile derived from its name, so the same
 * outlet always looks the same and the list stays scannable.
 */
const COVERS = [
  'from-turmeric-400 to-chili-500',
  'from-cardamom-400 to-steel-700',
  'from-chili-400 to-turmeric-500',
  'from-steel-600 to-cardamom-500',
  'from-turmeric-500 to-steel-800',
] as const;

export function coverFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return COVERS[hash % COVERS.length];
}

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}
