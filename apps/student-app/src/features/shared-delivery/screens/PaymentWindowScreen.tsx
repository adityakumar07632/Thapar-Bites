import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ShieldCheck, Wallet } from 'lucide-react';
import { AppShell } from '@/shared/components/layout/AppShell';
import { Compartment } from '@/shared/components/ui/Compartment';
import { Button } from '@/shared/components/ui/Button';
import { api, ApiRequestError } from '@/shared/lib/api';
import { formatCountdown, formatINR } from '@/shared/lib/utils';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useEventStream } from '@/shared/lib/useEventStream';
import type { Order, MatchInfo } from '@/shared/types/domain';

/** Phase 6E — Thapar Bites' platform payment details, shown to the student at checkout.
 * Students always pay Thapar Bites; the restaurant's payout details are never exposed. */
interface PlatformPaymentDetails {
  onlinePaymentsEnabled: boolean;
  upiId: string | null;
  qrCodeUrl: string | null;
  accountHolderName: string | null;
  paymentInstructions: string | null;
  paymentNotes: string | null;
}

type Phase = 'loading' | 'ready' | 'processing' | 'awaiting_partner' | 'expired' | 'requeued' | 'not_found';

export function PaymentWindowScreen() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const [order, setOrder] = useState<Order | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [payTo, setPayTo] = useState<PlatformPaymentDetails | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollNowRef = useRef<() => void>(() => {});
  const deadlineCheckedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const o = await api.get<Order>(`/orders/${orderId}`);
        if (cancelled) return;
        setOrder(o);
        // Payment details are informational: a restaurant without them must
        // still be payable, so a failure here never blocks the screen.
        api
          .get<PlatformPaymentDetails>(`/restaurants/${o.restaurantId}/payment-details`)
          .then((d) => {
            if (!cancelled) setPayTo(d);
          })
          .catch(() => {});
        if (o.deliveryType === 'shared') {
          const match = await api.get<MatchInfo>('/shared-delivery/match');
          if (cancelled) return;
          deadlineCheckedRef.current = false;
          setDeadline(new Date(match.paymentDeadline).getTime());
        }
        setPhase(o.status === 'awaiting_partner_payment' ? 'awaiting_partner' : 'ready');
      } catch {
        if (!cancelled) setPhase('not_found');
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (phase !== 'awaiting_partner') return;
    let cancelled = false;
    async function poll() {
      if (pollRef.current) clearTimeout(pollRef.current);
      try {
        const o = await api.get<Order>(`/orders/${orderId}`);
        if (cancelled) return;
        setOrder(o);
        // Phase 6A: paying Thapar Bites moves the order to
        // 'awaiting_restaurant_payment' first; only the payout to the
        // restaurant produces 'order_received'. Both mean "we're done here".
        if (o.status === 'awaiting_restaurant_payment' || o.status === 'order_received') {
          navigate(`/order/${orderId}`, { replace: true });
          return;
        }
        if (o.status === 'cancelled') {
          setPhase('requeued');
          return;
        }
        if (o.status === 'payment_expired') {
          setPhase('expired');
          return;
        }
      } catch {
        // transient — try again next tick
      }
      pollRef.current = setTimeout(poll, 5000);
    }
    pollNowRef.current = poll;
    poll();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [phase, orderId, navigate]);

  useEventStream(token, (event) => {
    if (event.type === 'order_updated' && event.orderId === orderId) pollNowRef.current();
  });

  useEffect(() => {
    if (phase !== 'ready' || !deadline || now < deadline || deadlineCheckedRef.current) return;
    deadlineCheckedRef.current = true;
    void api
      .get<Order>(`/orders/${orderId}`)
      .then((o) => {
        setOrder(o);
        setPhase(
          o.status === 'payment_expired'
            ? 'expired'
            : o.status === 'awaiting_restaurant_payment' || o.status === 'order_received'
              ? 'ready'
              : 'expired',
        );
      })
      .catch(() => setPhase('expired'));
  }, [now, deadline, phase, orderId]);

  async function handlePay() {
    if (!order) return;
    setPhase('processing');
    setError(null);
    try {
      const payment = await api.post<{ id: string }>('/payments', { orderId: order.id, method: 'upi' });
      const result = await api.post<{ orderStatus: string }>('/payments/verify', { paymentId: payment.id });
      if (result.orderStatus === 'awaiting_restaurant_payment' || result.orderStatus === 'order_received') {
        navigate(`/order/${order.id}`, { replace: true });
      } else {
        setPhase('awaiting_partner');
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Payment failed. Please try again.');
      setPhase('ready');
    }
  }

  if (phase === 'loading' || phase === 'not_found') {
    return (
      <AppShell>
        <div className="px-5 pt-20 text-center text-sm text-steel-500">
          {phase === 'not_found' ? "This order couldn't be found." : 'Loading…'}
        </div>
      </AppShell>
    );
  }

  if (phase === 'requeued') {
    return (
      <AppShell>
        <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-turmeric-500/15 text-turmeric-700">
            <Wallet size={22} />
          </span>
          <p className="mt-5 font-display text-base font-semibold text-steel-900">That match fell through</p>
          <p className="mt-1.5 max-w-[260px] text-sm leading-snug text-steel-500">
            Nothing was charged. You're back at the front of the queue for a new match.
          </p>
          <Button className="mt-6" onClick={() => navigate('/waiting', { replace: true })}>
            Back to the queue
          </Button>
        </div>
      </AppShell>
    );
  }

  if (phase === 'expired') {
    return (
      <AppShell>
        <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-chili-500/10 text-chili-600">
            <AlertTriangle size={26} />
          </span>
          <p className="mt-5 font-display text-lg font-semibold text-steel-900">Payment window expired</p>
          <p className="mt-1.5 max-w-[280px] text-sm leading-snug text-steel-500">
            The 3-minute window closed before payment completed, so this match was released. Nothing was
            charged.
          </p>
          <Button className="mt-6" onClick={() => navigate('/', { replace: true })}>
            Back to restaurants
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!order) return null;
  const amount = order.subtotal + order.convenienceFee;
  const remaining = deadline ? Math.max(0, deadline - now) : 0;
  const urgent = order.deliveryType === 'shared' && remaining < 30_000;
  const awaitingPartner = phase === 'awaiting_partner';

  return (
    <AppShell>
      <div className="flex min-h-dvh flex-col px-5 pt-[calc(env(safe-area-inset-top)+2rem)]">
        {awaitingPartner ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-cardamom-500/15 text-cardamom-600">
              <ShieldCheck size={22} />
            </span>
            <p className="mt-5 font-display text-base font-semibold text-steel-900">You're paid up</p>
            <p className="mt-1.5 max-w-[260px] text-sm leading-snug text-steel-500">
              Waiting for your delivery partner to complete their payment too — this confirms automatically.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <p className="font-display text-lg font-semibold text-steel-900">
                {order.deliveryType === 'shared' ? 'Match found — complete payment' : 'Review and pay'}
              </p>
            </div>

            {order.deliveryType === 'shared' && deadline && (
              <p className={`mt-6 text-center font-mono text-3xl font-semibold tabular-nums ${urgent ? 'text-chili-600' : 'text-steel-800'}`}>
                {formatCountdown(remaining)}
              </p>
            )}

            <Compartment className="mt-6 p-4">
              <p className="font-display text-[13px] font-semibold uppercase tracking-wide text-steel-400">
                Your order — separate from your delivery partner's
              </p>
              <div className="mt-2.5 flex flex-col gap-1.5">
                {order.lines.map((line) => (
                  <div key={line.menuItemId} className="flex justify-between text-sm text-steel-600">
                    <span>
                      {line.quantity}× {line.name}
                    </span>
                    <span>{formatINR(line.price * line.quantity)}</span>
                  </div>
                ))}
                {order.convenienceFee > 0 && (
                  <div className="flex justify-between text-sm text-steel-600">
                    <span>Shared Delivery fee</span>
                    <span>{formatINR(order.convenienceFee)}</span>
                  </div>
                )}
              </div>
              <div className="my-3 h-px bg-steel-100" />
              <div className="flex justify-between">
                <span className="font-display font-semibold text-steel-900">Total</span>
                <span className="font-display font-semibold text-steel-900">{formatINR(amount)}</span>
              </div>
            </Compartment>

            {payTo?.onlinePaymentsEnabled && (payTo.upiId || payTo.qrCodeUrl) && (
              <Compartment className="mt-4 p-4">
                <p className="font-display text-[13px] font-semibold uppercase tracking-wide text-steel-400">
                  Pay Thapar Bites
                </p>
                {payTo.qrCodeUrl && (
                  <img
                    src={payTo.qrCodeUrl}
                    alt={"Thapar Bites UPI QR code"}
                    className="mx-auto mt-3 h-40 w-40 rounded-lg border border-steel-100 bg-white object-contain p-1.5"
                  />
                )}
                {payTo.upiId && (
                  <div className="mt-3 flex items-baseline justify-between gap-3">
                    <span className="text-sm text-steel-500">UPI ID</span>
                    <span className="font-mono text-sm font-semibold text-steel-900">{payTo.upiId}</span>
                  </div>
                )}
                {payTo.accountHolderName && (
                  <div className="mt-1 flex items-baseline justify-between gap-3">
                    <span className="text-sm text-steel-500">Account holder</span>
                    <span className="text-sm text-steel-800">{payTo.accountHolderName}</span>
                  </div>
                )}
                <p className="mt-3 text-xs leading-snug text-steel-500">
                  Scan the QR or pay the UPI ID above for {formatINR(amount)}, then confirm below. Thapar Bites
                  releases your order to the restaurant once payment is confirmed.
                </p>
                {payTo.paymentInstructions && (
                  <p className="mt-2 rounded-lg bg-turmeric-50 p-2.5 text-xs leading-snug text-steel-700">
                    <span className="font-semibold">Instructions: </span>{payTo.paymentInstructions}
                  </p>
                )}
                {payTo.paymentNotes && (
                  <p className="mt-2 rounded-lg bg-steel-50 p-2.5 text-xs leading-snug text-steel-600">
                    {payTo.paymentNotes}
                  </p>
                )}
              </Compartment>
            )}

            {error && (
              <p className="mt-3 text-center text-xs text-chili-600">{error}</p>
            )}

            <div className="mt-auto pb-6 pt-8">
              <Button
                fullWidth
                size="lg"
                disabled={phase === 'processing'}
                onClick={handlePay}
                icon={<Wallet size={18} />}
              >
                {phase === 'processing' ? 'Processing…' : `Pay ${formatINR(amount)} now`}
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
