import { useEffect } from 'react';
import { useRestaurantsStore } from '@/features/restaurants/store/useRestaurantsStore';

/** Ensures the restaurant list is loaded (and kept fresh), then returns one by id. */
export function useRestaurant(restaurantId: string | null | undefined) {
  const { restaurants, fetchAll } = useRestaurantsStore();

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return restaurantId ? restaurants.find((r) => r.id === restaurantId) : undefined;
}
