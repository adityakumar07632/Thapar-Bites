import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Receipt, Star } from 'lucide-react';
import { RatingModal } from '@/features/ratings/RatingModal';
import { EmptyState, ErrorState, PageTransition, SkeletonCards } from '@campus-bites/ui';
import { AppShell } from '@/shared/components/layout/AppShell';
import { TopBar } from '@/shared/components/layout/TopBar';
import { BottomNav } from '@/shared/components/layout/BottomNav';
import { Compartment } from '@/shared/components/ui/Compartment';
import { Chip } from '@/shared/components/ui/Chip';
import { Button } from '@/shared/components/ui/Button';
import { api } from '@/shared/lib/api';
import { ORDER_STATUS_LABEL, PAYMENT_OUTCOME_LABEL, type PaymentOutcome } from '@/shared/types/enums';
import { formatINR } from '@/shared/lib/utils';
import type { Order } from '@/shared/types/domain';

const ACTIVE_STATUSES = new Set([
  'payment_pending',
  'awaiting_partner_payment',
  'awaiting_restaurant_payment',
  'order_received',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'collected',
  'out_for_delivery',
  'driver_arrived',
]);

export function OrderHistoryScreen() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingOrder, setRatingOrder] = useState<import('@/shared/types/domain').Order | null>(null);
  const [existingRatings, setExistingRatings] = useState<{ restaurantStars: number | null; itemRatings: { menuItemId: string; stars: number }[] } | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .get<Order[]>('/students/orders')
      .then((data) => {
        setOrders(data);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not load your orders.');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = orders.filter((o) => ACTIVE_STATUSES.has(o.status));
  const past = orders.filter((o) => !ACTIVE_STATUSES.has(o.status));

  async function openRating(order: import('@/shared/types/domain').Order) {
    try {
      const existing = await api.get<{ restaurantStars: number | null; itemRatings: { menuItemId: string; stars: number }[] }>(`/ratings/order/${order.id}`);
      setExistingRatings(existing);
    } catch {
      setExistingRatings(null);
    }
    setRatingOrder(order);
  }

  return (
    <>
    {ratingOrder && (
      <RatingModal
        order={ratingOrder}
        restaurantName={ratingOrder.restaurantName ?? ratingOrder.restaurantId}
        existing={existingRatings}
        onClose={() => { setRatingOrder(null); setExistingRatings(null); }}
        onSaved={() => { setRatingOrder(null); setExistingRatings(null); }}
      />
    )}
    <AppShell bottomNav={<BottomNav />}>
      <TopBar title="Orders" showBack={false} />

      <div className="px-5 pt-4">
        {!loaded && !error && <SkeletonCards count={3} height="h-[72px]" />}

        {error && (
          <ErrorState
            title="Couldn't load your orders"
            description="Your orders are safe — this is just the list failing to load."
            onRetry={load}
          />
        )}

        {loaded && orders.length === 0 && (
          <EmptyState
            className="mt-8"
            icon={<Receipt size={22} />}
            title="No orders yet"
            description="Your active and past orders will show up here once you place your first one."
            action={
              <Button className="mt-1" onClick={() => navigate('/')}>
                Browse restaurants
              </Button>
            }
          />
        )}
      </div>

      <PageTransition>
        {active.length > 0 && (
          <div className="px-5 pt-4">
            <p className="mb-2.5 font-display text-[13px] font-semibold uppercase tracking-wide text-steel-400">
              Active
            </p>
            <div className="flex flex-col gap-2.5">
              {active.map((order) => (
                <OrderRow key={order.id} order={order} live />
              ))}
            </div>
          </div>
        )}

        {past.length > 0 && (
          <div className="px-5 pt-5">
            <p className="mb-2.5 font-display text-[13px] font-semibold uppercase tracking-wide text-steel-400">
              Past
            </p>
            <div className="flex flex-col gap-2.5">
              {past.map((order) => (
                <OrderRow key={order.id} order={order} onRate={() => openRating(order)} />
              ))}
            </div>
          </div>
        )}
      </PageTransition>

    </AppShell>
    </>
  );
}

/**
 * Phase 6D — the payment badge tone. Refunded and failed payments are the two
 * a student needs to spot instantly in a long history list.
 */
function paymentTone(outcome: PaymentOutcome): 'neutral' | 'turmeric' | 'cardamom' | 'chili' {
  if (outcome === 'paid') return 'cardamom';
  if (outcome === 'refunded') return 'turmeric';
  if (outcome === 'payment_failed') return 'chili';
  return 'neutral';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function OrderRow({ order, live, onRate }: { order: Order; live?: boolean; onRate?: () => void }) {
  const outcome = order.paymentOutcome;
  const refund = order.payment;
  const refunded = refund?.refundStatus === 'completed' || refund?.refundStatus === 'pending';
  return (
    <Link to={`/order/${order.id}`}>
      <Compartment interactive className="flex items-center justify-between gap-3 p-3.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-steel-900">
            {order.lines[0]?.name}
            {order.lines.length > 1 ? ` +${order.lines.length - 1} more` : ''}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <Chip tone={live ? 'turmeric' : 'neutral'}>{ORDER_STATUS_LABEL[order.status]}</Chip>
            {order.deliveryType === 'shared' && <Chip tone="cardamom">Shared</Chip>}
            {/* Phase 6D — where the money ended up, not just where the food did. */}
            {outcome && (
              <Chip tone={paymentTone(outcome)}>
                {order.paymentOutcomeLabel ?? PAYMENT_OUTCOME_LABEL[outcome]}
              </Chip>
            )}
          </div>
          {refunded && refund && (
            <p className="mt-1.5 text-[11px] leading-snug text-steel-500">
              {refund.refundStatus === 'pending' ? 'Refund of ' : 'Refunded '}
              {formatINR(refund.refundAmount ?? refund.amount)}
              {refund.refundStatus === 'pending' ? ' on its way back' : ''}
              {formatDate(refund.refundCompletedAt ?? refund.refundInitiatedAt)
                ? ` · ${formatDate(refund.refundCompletedAt ?? refund.refundInitiatedAt)}`
                : ''}
              {refund.refundReason ? ` · ${refund.refundReason}` : ''}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="font-display text-sm font-semibold text-steel-700">
            {formatINR(order.totalAmount)}
          </span>
          {!live && ['delivered', 'completed'].includes(order.status) && onRate && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onRate(); }}
              className="flex items-center gap-1 rounded-full bg-turmeric-500/10 px-2 py-0.5 text-[11px] font-medium text-turmeric-700 hover:bg-turmeric-500/20 transition-colors"
            >
              <Star size={9} className="fill-turmeric-500 text-turmeric-500" /> Rate
            </button>
          )}
        </div>
      </Compartment>
    </Link>
  );
}
