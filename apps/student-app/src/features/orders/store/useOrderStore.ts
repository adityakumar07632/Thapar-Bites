import { create } from 'zustand';
import { api } from '@/shared/lib/api';
import type { Order } from '@/shared/types/domain';

interface OrderState {
  current: Order | null;
  history: Order[];

  fetchCurrent: () => Promise<Order | null>;
  fetchById: (orderId: string) => Promise<Order>;
  fetchHistory: () => Promise<Order[]>;
  verifyPairCode: (orderId: string, pairCode: string) => Promise<void>;
  cancel: (orderId: string) => Promise<void>;
}

export const useOrderStore = create<OrderState>((set) => ({
  current: null,
  history: [],

  fetchCurrent: async () => {
    const order = await api.get<Order | null>('/orders/current');
    set({ current: order });
    return order;
  },

  fetchById: async (orderId) => {
    const order = await api.get<Order>(`/orders/${orderId}`);
    set({ current: order });
    return order;
  },

  fetchHistory: async () => {
    const orders = await api.get<Order[]>('/students/orders');
    set({ history: orders });
    return orders;
  },

  verifyPairCode: async (orderId, pairCode) => {
    await api.post(`/delivery/${orderId}/verify`, { pairCode });
  },

  cancel: async (orderId) => {
    await api.patch(`/orders/${orderId}/cancel`);
  },
}));
