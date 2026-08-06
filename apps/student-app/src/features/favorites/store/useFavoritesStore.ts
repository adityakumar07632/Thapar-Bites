import { create } from 'zustand';
import { api } from '@/shared/lib/api';
import type { FavoritesPayload, MenuItem, Restaurant } from '@/shared/types/domain';

export type FavoriteTarget = 'restaurant' | 'menu_item';

interface FavoritesState {
  restaurantIds: Set<string>;
  dishIds: Set<string>;
  restaurants: Restaurant[];
  dishes: (MenuItem & { restaurantName: string })[];
  loaded: boolean;
  loading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  isFavorite: (type: FavoriteTarget, id: string) => boolean;
  toggle: (type: FavoriteTarget, id: string) => Promise<void>;
}

/**
 * Favourites are server-owned (they follow the student across devices), but
 * the heart button must feel instant. Every toggle updates the local set
 * first, fires the request, and re-syncs from the server afterwards — a
 * failed call rolls the optimistic change back.
 */
export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  restaurantIds: new Set(),
  dishIds: new Set(),
  restaurants: [],
  dishes: [],
  loaded: false,
  loading: false,
  error: null,

  fetchAll: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const data = await api.get<FavoritesPayload>('/students/favorites');
      set({
        restaurantIds: new Set(data.restaurantIds),
        dishIds: new Set(data.dishIds),
        restaurants: data.restaurants,
        dishes: data.dishes,
        loaded: true,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not load your favourites.' });
    } finally {
      set({ loading: false });
    }
  },

  isFavorite: (type, id) =>
    type === 'restaurant' ? get().restaurantIds.has(id) : get().dishIds.has(id),

  toggle: async (type, id) => {
    const key = type === 'restaurant' ? 'restaurantIds' : 'dishIds';
    const current = new Set(get()[key]);
    const wasFavorite = current.has(id);
    if (wasFavorite) current.delete(id);
    else current.add(id);
    set({ [key]: current } as Pick<FavoritesState, 'restaurantIds' | 'dishIds'>);

    try {
      if (wasFavorite) {
        await api.del(`/students/favorites/${type}/${id}`);
      } else {
        await api.post('/students/favorites', { targetType: type, targetId: id });
      }
      // Re-sync so the hydrated lists on the Favourites screen stay correct.
      set({ loading: false });
      await get().fetchAll();
    } catch (error) {
      const rolledBack = new Set(get()[key]);
      if (wasFavorite) rolledBack.add(id);
      else rolledBack.delete(id);
      set({
        [key]: rolledBack,
        error: error instanceof Error ? error.message : 'Could not update that favourite.',
      } as Pick<FavoritesState, 'restaurantIds' | 'dishIds' | 'error'>);
    }
  },
}));
