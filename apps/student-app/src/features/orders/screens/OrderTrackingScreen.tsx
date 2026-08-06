import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, KeyRound, RotateCcw, ShieldCheck, Users } from 'lucide-react';
import { AppShell } from '@/shared/components/layout/AppShell';
import { TopBar } from '@/shared/components/layout/TopBar';
import { BottomNav } from '@/shared/components/layout/BottomNav';
import { Compartment } from '@/shared/components/ui/Compartment';
import { Chip } from '@/shared/components/ui/Chip';
import { Button } from '@/shared/components/ui/Button';
import { PairCodeTicket } from '@/shared/components/ui/PairCodeTicket';
import { OrderStepper } from '@/shared/components/ui/OrderStepper';
import { ErrorState, PageTransition, Skeleton } from '@campus-bites/ui';
import { useRestaurant } from '@/features/restaurants/useRestaurant';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useEventStream } from '@/shared/lib/useEventStream';
import { api } from '@/shared/lib/api';
import { ORDER_STATUS_LABEL, ORDER_TRACKING_SEQUENCE } from '@/shared/types/enums';
import { formatINR } from '@/shared/lib/utils';
import type { Order } from '@/shared/types/domain';

function formatRefundDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const POLL_MS = 8000;

/** Structured skeleton that matches the real order tracking layout. */
function OrderTrackingSkeleton() {
  return (
    <AppShell bottomNav={<BottomNav />}>
      <TopBar title="Order tracking" />
      <div className="flex flex-col gap-4 px-5 pt-4" aria-hidden role="status" aria-label="Loading order">
        {/* Status card */}
        <div className="rounded-card border border-steel-150 bg-white p-4 shadow-tray">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
        {/* Stepper */}
        <div className="rounded-card border border-steel-150 bg-white p-4 shadow-tray">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-3 flex-1" />
              </div>
            ))}
          </div>
        </div>
        {/* Items */}
        <div className="rounded-card border border-steel-150 bg-white p-4 shadow-tray">
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
        <span className="sr-only">Loading order…</span>
      </div>
    </AppShell>
  );
}

export function OrderTrackingScreen() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const [order, setOrder] = useState<Order | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const restaurant = useRestaurant(order?.restaurantId);
  const pollNowRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function poll() {
      if (timer) clearTimeout(timer);
      try {
        const o = await api.get<Order>(`/orders/${orderId}`);
        if (!cancelled) {
          setOrder(o);
          setLoadError(null);
        }
      } catch {
        if (!cancelled) setLoadError('We could not load this order.');
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }
    pollNowRef.current = poll;
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  useEventStream(token, (event) => {
    if (event.type === 'order_updated' && event.orderId === orderId) pollNowRef.current();
  });

  async function handleReveal() {
    setRevealing(true);
    setRevealError(null);
    try {
      await api.post(`/delivery/${order?.id}/reveal`);
    } catch {
      setRevealError('Could not open your PairCode — try again in a moment.');
    } finally {
      setRevealing(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    setVerifyError(null);
    try {
      await api.post(`/delivery/${order?.id}/verify`, { pairCode: order?.pairCode ?? '' });
    } catch {
      setVerifyError('Verification failed — make sure the delivery partner has entered your code first.');
    } finally {
      setVerifying(false);
    }
  }

  // Show skeleton while loading
  if (!order && !loadError) {
    return <OrderTrackingSkeleton />;
  }

  // Show error if order failed to load
  if (loadError && !order) {
    return (
      <AppShell bottomNav={<BottomNav />}>
        <TopBar title="Order tracking" />
        <div className="px-5 pt-4">
          <ErrorState
            title="Couldn't load this order"
            description={loadError}
            onRetry={() => pollNowRef.current()}
          />
          <Button
            variant="ghost"
            className="mt-4 w-full justify-center"
            onClick={() => navigate('/orders')}
          >
            Back to orders
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!order) return null;

  const isShared = order.deliveryType === 'shared';
  const statusLabel = ORDER_STATUS_LABEL[order.status] ?? order.status.replace(/_/g, ' ');
  const trackingSteps = ORDER_TRACKING_SEQUENCE.map((step) => ({
    key: step,
    label: ORDER_STATUS_LABEL[step] ?? step,
    status: step,
  }));
  const stepIndex = Math.max(
    0,
    trackingSteps.findIndex((s) => s.status === order.status),
  );
  const DONE_STATUSES = new Set(['delivered', 'completed', 'collected']);
  const isDone = DONE_STATUSES.has(order.status);
  const CANCELLED_STATUSES = new Set(['cancelled', 'payment_expired', 'rejected']);
  const isCancelled = CANCELLED_STATUSES.has(order.status);
  const canReveal = order.status === 'driver_arrived' && !order.pairCode;
  const canVerify = order.status === 'paircode_verification' && order.pairCode;

  return (
    <AppShell bottomNav={<BottomNav />}>
      <TopBar title="Order tracking" subtitle={order.restaurantName ?? undefined} />

      <PageTransition className="flex flex-col gap-4 px-5 pt-4 pb-6">
        {/* Status header */}
        <Compartment className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-steel-900">{statusLabel}</p>
              {isShared && (
                <Chip tone="turmeric" className="mt-1">
                  <Users size={12} aria-hidden /> Shared Delivery
                </Chip>
              )}
            </div>
            {isCancelled && (
              <span className="shrink-0 rounded-full bg-chili-500/10 px-2.5 py-1 text-xs font-medium text-chili-600">
                Cancelled
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-steel-500">
            {isDone
              ? 'Enjoy your meal!'
              : restaurant
                ? `Estimated arrival in ~${restaurant.etaMinutes} min`
                : ''}
          </p>
          {isShared && !isDone && !isCancelled && (
            <p className="mt-2 rounded-lg bg-turmeric-500/10 px-3 py-2 text-[11px] leading-snug text-steel-600">
              One rider is bringing both orders to your hostel. Your PairCode is what separates them at
              handover — your delivery partner stays anonymous throughout.
            </p>
          )}

          {/* Transient error banners */}
          {revealError && (
            <p role="alert" className="mt-2 rounded-lg bg-chili-500/10 px-3 py-2 text-xs text-chili-600">
              {revealError}
            </p>
          )}
          {verifyError && (
            <p role="alert" className="mt-2 rounded-lg bg-chili-500/10 px-3 py-2 text-xs text-chili-600">
              {verifyError}
            </p>
          )}
        </Compartment>

        {/* Progress stepper */}
        {!isCancelled && (
          <Compartment className="p-4">
            <OrderStepper steps={trackingSteps} currentIndex={stepIndex} />
          </Compartment>
        )}

        {/* PairCode — only shown when relevant */}
        {order.pairCode && (
          <PairCodeTicket
            code={order.pairCode}
            restaurantName={order.restaurantName ?? 'Restaurant'}
            itemCount={order.lines.length}
          />
        )}

        {/* Reveal button — shown when driver has arrived but code not yet revealed */}
        {canReveal && (
          <Button
            icon={<KeyRound size={18} />}
            fullWidth
            size="lg"
            loading={revealing}
            onClick={() => void handleReveal()}
          >
            Open my PairCode
          </Button>
        )}

        {/* Verify button */}
        {canVerify && (
          <Button
            icon={<ShieldCheck size={18} />}
            fullWidth
            size="lg"
            loading={verifying}
            onClick={() => void handleVerify()}
          >
            Confirm delivery
          </Button>
        )}

        {/* Refund info */}
        {order.payment?.refundCompletedAt && (
          <Compartment className="flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cardamom-500/10 text-cardamom-600">
              <RotateCcw size={16} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-steel-900">Refund processed</p>
              <p className="text-xs text-steel-500">{formatRefundDate(order.payment.refundCompletedAt)}</p>
            </div>
          </Compartment>
        )}

        {/* Order items */}
        <div>
          <p className="mb-2 font-display text-[13px] font-semibold uppercase tracking-wide text-steel-400">
            Your items
          </p>
          <Compartment className="p-4">
            <div className="flex flex-col gap-1.5">
              {order.lines.map((line) => (
                <div key={line.menuItemId} className="flex justify-between text-sm text-steel-600">
                  <span>
                    {line.quantity}× {line.name}
                  </span>
                  <span>{formatINR(line.price * line.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="my-3 h-px bg-steel-100" />
            <div className="flex justify-between font-display font-semibold text-steel-900">
              <span>Total paid</span>
              <span>{formatINR(order.totalAmount)}</span>
            </div>
          </Compartment>
        </div>

        {/* Navigation links */}
        <div className="flex flex-col gap-2">
          <Link to="/orders">
            <Button variant="secondary" fullWidth icon={<ArrowRight size={16} />}>
              All orders
            </Button>
          </Link>
        </div>
      </PageTransition>
    </AppShell>
  );
}
