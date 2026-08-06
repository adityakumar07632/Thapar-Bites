import { useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { useCartStore, cartItemCount, cartTotal } from '@/features/cart/store/useCartStore';
import { formatINR } from '@/shared/lib/utils';
import { useRestaurant } from '@/features/restaurants/useRestaurant';

export function CartBar() {
  const { restaurantId, lines } = useCartStore();
  const navigate = useNavigate();
  const location = useLocation();
  const restaurant = useRestaurant(restaurantId);

  if (!restaurantId || lines.length === 0 || location.pathname === '/cart') return null;

  const count = cartItemCount(lines);
  const total = cartTotal(lines);

  return (
    <button
      type="button"
      onClick={() => navigate('/cart')}
      className="sticky bottom-0 z-10 mx-3 mb-3 flex items-center justify-between rounded-2xl bg-steel-900 px-4 py-3.5 text-steel-50 shadow-lg shadow-steel-900/25 active:bg-steel-800"
    >
      <span className="flex items-center gap-2.5 text-sm">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
          <ShoppingBag size={16} />
        </span>
        <span className="text-left">
          <span className="block font-display font-semibold leading-tight">
            {count} {count === 1 ? 'item' : 'items'} · {formatINR(total)}
          </span>
          <span className="block text-[11px] text-steel-300 leading-tight">{restaurant?.name}</span>
        </span>
      </span>
      <span className="font-display text-sm font-semibold text-turmeric-400">View cart</span>
    </button>
  );
}
