import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, ShoppingCart, Users, Zap } from 'lucide-react';
import { AppShell } from '@/shared/components/layout/AppShell';
import { TopBar } from '@/shared/components/layout/TopBar';
import { Compartment } from '@/shared/components/ui/Compartment';
import { QuantityStepper } from '@/shared/components/ui/QuantityStepper';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState, PageTransition } from '@campus-bites/ui';
import { useCartStore, cartTotal } from '@/features/cart/store/useCartStore';
import { useRestaurant } from '@/features/restaurants/useRestaurant';
import { api, ApiRequestError } from '@/shared/lib/api';
import { formatINR, cn } from '@/shared/lib/utils';
import type { DeliveryType } from '@/shared/types/enums';
import type { Order } from '@/shared/types/domain';

export function CartScreen() {
  const navigate = useNavigate();
  const { restaurantId, lines, setQuantity, refresh } = useCartStore();
  const restaurant = useRestaurant(restaurantId);
  const subtotal = cartTotal(lines);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eligibility = useMemo(() => {
    if (!restaurant) return { individual: false, shared: false };
    return {
      individual: subtotal >= restaurant.minimumOrder,
      shared: subtotal >= restaurant.sharedDeliveryMinimum && subtotal < restaurant.minimumOrder,
    };
  }, [restaurant, subtotal]);

  const defaultMethod: DeliveryType = eligibility.individual ? 'individual' : 'shared';
  const [method, setMethod] = useState<DeliveryType>(defaultMethod);
  const activeMethod: DeliveryType = eligibility.individual ? 'individual' : method;

  if (!restaurant || lines.length === 0) {
    return (
      <AppShell>
        <TopBar title="Your cart" />
        <PageTransition className="flex min-h-[70dvh] items-center justify-center px-5">
          <EmptyState
            icon={<ShoppingCart size={22} />}
            title="Your cart is empty"
            description="Add something from a canteen to get started. You can browse all open outlets from the home screen."
            action={
              <Button className="mt-1" onClick={() => navigate('/')}>
                Browse restaurants
              </Button>
            }
          />
        </PageTransition>
      </AppShell>
    );
  }

  const canCheckout = eligibility.individual || eligibility.shared;
  const amountToSharedMin = restaurant.sharedDeliveryMinimum - subtotal;

  async function handleCheckout() {
    setSubmitting(true);
    setError(null);
    try {
      if (activeMethod === 'shared') {
        await api.post('/shared-delivery/queue');
        navigate('/waiting');
      } else {
        const order = await api.post<Order>('/checkout', { deliveryType: 'individual' });
        navigate(`/order/${order.id}/payment`);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <TopBar title="Your cart" subtitle={restaurant.name} />

      <PageTransition className="flex flex-col gap-2.5 px-5 pt-4">
        {lines.map((line) => (
          <Compartment key={line.menuItemId} className="flex items-center justify-between gap-3 p-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-steel-900">{line.name}</p>
              <p className="mt-0.5 font-display text-sm font-semibold text-steel-700">
                {formatINR(line.price * line.quantity)}
              </p>
            </div>
            <QuantityStepper
              quantity={line.quantity}
              onIncrement={() => setQuantity(line.menuItemId, line.quantity + 1)}
              onDecrement={() => setQuantity(line.menuItemId, line.quantity - 1)}
            />
          </Compartment>
        ))}
      </PageTransition>

      <div className="mt-4 border-t border-steel-150 px-5 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-steel-600">Subtotal</span>
          <span className="font-display text-sm font-semibold text-steel-900">{formatINR(subtotal)}</span>
        </div>
      </div>

      {!eligibility.individual && amountToSharedMin > 0 && (
        <div className="mx-5 mt-3 rounded-xl bg-turmeric-500/10 px-3.5 py-2.5 text-xs text-turmeric-700">
          Add {formatINR(amountToSharedMin)} more to unlock Shared Delivery.
        </div>
      )}

      {!canCheckout && (
        <div className="mx-5 mt-3 flex items-start gap-2 rounded-xl bg-chili-500/10 px-3.5 py-2.5 text-xs text-chili-600">
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
          Your cart is below the minimum for both Individual and Shared Delivery. Add more items to check out.
        </div>
      )}

      <div className="mt-4 px-5 pb-6">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-steel-400">
          Delivery method
        </p>
        <div className="flex flex-col gap-2">
          <DeliveryOption
            active={activeMethod === 'shared'}
            disabled={!eligibility.shared && !eligibility.individual}
            icon={<Users size={16} />}
            title="Shared Delivery"
            description="Split the delivery fee with another student in your hostel ordering from the same place."
            priceNote={formatINR(restaurant.sharedDeliveryMinimum) + ' min'}
            onSelect={() => setMethod('shared')}
          />
          <DeliveryOption
            active={activeMethod === 'individual'}
            disabled={!eligibility.individual}
            icon={<Zap size={16} />}
            title="Individual Delivery"
            description="Order for yourself with the full delivery fee."
            priceNote={formatINR(restaurant.minimumOrder) + ' min'}
            onSelect={() => setMethod('individual')}
          />
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-chili-500/10 px-3.5 py-2.5 text-xs text-chili-600">
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
            {error}
          </div>
        )}

        <Button
          size="lg"
          fullWidth
          className="mt-4"
          disabled={!canCheckout || submitting}
          loading={submitting}
          onClick={() => void handleCheckout()}
        >
          {submitting
            ? 'Placing order…'
            : activeMethod === 'shared'
              ? 'Join Shared Delivery queue'
              : `Pay · ${formatINR(subtotal)}`}
        </Button>
      </div>
    </AppShell>
  );
}

function DeliveryOption({
  active,
  disabled,
  icon,
  title,
  description,
  priceNote,
  onSelect,
}: {
  active: boolean;
  disabled: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  priceNote?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all duration-150',
        active ? 'border-turmeric-500 bg-turmeric-500/8' : 'border-steel-200 bg-white hover:border-steel-300',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150',
          active ? 'bg-turmeric-500 text-steel-900' : 'bg-steel-100 text-steel-500',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="font-display text-sm font-semibold text-steel-900">{title}</span>
          {priceNote && <span className="shrink-0 text-xs font-medium text-steel-500">{priceNote}</span>}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-steel-500">{description}</span>
      </span>
      {active && (
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-turmeric-500 text-steel-900">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
