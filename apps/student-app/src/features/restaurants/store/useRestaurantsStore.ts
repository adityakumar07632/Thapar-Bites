import { create } from 'zustand';
import { api } from '@/shared/lib/api';
import type { Restaurant, MenuCategory, MenuItem } from '@/shared/types/domain';

interface MenuResponse {
  categories: MenuCategory[];
  items: MenuItem[];
}

interface RestaurantsState {
  restaurants: Restaurant[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  menus: Record<string, MenuResponse>;

  fetchAll: () => Promise<void>;
  fetchMenu: (restaurantId: string) => Promise<MenuResponse>;
}

export const useRestaurantsStore = create<RestaurantsState>((set, get) => ({
  restaurants: [],
  loaded: false,
  loading: false,
  error: null,
  menus: {},

  // Always hits the API (rather than short-circuiting once `loaded`) so
  // Admin changes — enabling/disabling a restaurant — show up next time the
  // student revisits the list, not just on first load of the session.
  //
  // Phase 2 bug fix: the request was not wrapped, so a network failure or a
  // 401 left `loading: true` forever and every later call short-circuited —
  // the list stayed permanently empty until a full page reload.
  //
  // Phase 3: the failure is now surfaced as `error` so the screen can render
  // a retry affordance instead of an indefinitely empty list.
  fetchAll: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const restaurants = await api.get<Restaurant[]>('/restaurants');
      set({ restaurants, loaded: true });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not load restaurants.' });
    } finally {
      set({ loading: false });
    }
  },


  // Menus are fetched fresh every time (no cache) so price changes, new
  // items, updated images and Available/Out of Stock toggles from the
  // Restaurant Dashboard reach the student immediately.
  fetchMenu: async (restaurantId) => {
    const menu = await api.get<MenuResponse>(`/restaurants/${restaurantId}/menu`);
    set((state) => ({ menus: { ...state.menus, [restaurantId]: menu } }));
    return menu;
  },
}));
