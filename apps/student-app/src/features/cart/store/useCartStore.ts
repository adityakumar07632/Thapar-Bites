import { create } from 'zustand';
import { api, ApiRequestError } from '@/shared/lib/api';
import type { MenuItem } from '@/shared/types/domain';

export interface CartLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  available: boolean;
}

interface CartConflict {
  otherRestaurantId: string;
  pendingItem: MenuItem;
}

interface CartState {
  restaurantId: string | null;
  lines: CartLine[];
  loading: boolean;
  conflict: CartConflict | null;

  refresh: () => Promise<void>;
  addItem: (item: MenuItem, replaceCart?: boolean) => Promise<void>;
  setQuantity: (menuItemId: string, quantity: number) => Promise<void>;
  removeItem: (menuItemId: string) => Promise<void>;
  clear: () => Promise<void>;
  resolveConflict: (accept: boolean) => Promise<void>;
}

interface CartResponse {
  restaurantId: string | null;
  subtotal: number;
  lines: CartLine[];
}

export const useCartStore = create<CartState>((set, get) => ({
  restaurantId: null,
  lines: [],
  loading: false,
  conflict: null,

  refresh: async () => {
    const cart = await api.get<CartResponse>('/cart');
    set({ restaurantId: cart.restaurantId, lines: cart.lines });
  },

  addItem: async (item, replaceCart = false) => {
    try {
      const cart = await api.post<CartResponse>('/cart/items', {
        menuItemId: item.id,
        quantity: 1,
        replaceCart,
      });
      set({ restaurantId: cart.restaurantId, lines: cart.lines, conflict: null });
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'CART_002' && !replaceCart) {
        const current = get().restaurantId;
        if (current) {
          set({ conflict: { otherRestaurantId: current, pendingItem: item } });
          return;
        }
      }
      throw err;
    }
  },

  resolveConflict: async (accept) => {
    const conflict = get().conflict;
    set({ conflict: null });
    if (accept && conflict) {
      await get().addItem(conflict.pendingItem, true);
    }
  },

  setQuantity: async (menuItemId, quantity) => {
    const cart = await api.patch<CartResponse>(`/cart/items/${menuItemId}`, { quantity });
    set({ restaurantId: cart.restaurantId, lines: cart.lines });
  },

  removeItem: async (menuItemId) => {
    const cart = await api.del<CartResponse>(`/cart/items/${menuItemId}`);
    set({ restaurantId: cart.restaurantId, lines: cart.lines });
  },

  clear: async () => {
    await api.del('/cart');
    set({ restaurantId: null, lines: [] });
  },
}));

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.price * line.quantity, 0);
}

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((count, line) => count + line.quantity, 0);
}
