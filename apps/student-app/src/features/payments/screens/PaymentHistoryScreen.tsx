import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Wallet } from 'lucide-react';
import { EmptyState, ErrorState, PageTransition, SkeletonCards } from '@campus-bites/ui';
import { AppShell } from '@/shared/components/layout/AppShell';
import { TopBar } from '@/shared/components/layout/TopBar';
import { BottomNav } from '@/shared/components/layout/BottomNav';
import { Compartment } from '@/shared/components/ui/Compartment';
import { Chip } from '@/shared/components/ui/Chip';
import { Button } from '@/shared/components/ui/Button';
import { api } from '@/shared/lib/api';
import { formatINR } from '@/shared/lib/utils';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useEventStream } from '@/shared/lib/useEventStream';
import type { PaymentHistoryEntry } from '@/shared/types/domain';
import type { PaymentStage } from '@/shared/types/enums';

/** Phase 6A — how each of the payment stages reads in the interface. */
const STAGE_TONE: Record<PaymentStage, 'neutral' | 'turmeric' | 'cardamom' | 'chili'> = {
  awaiting_payment: 'turmeric',
  payment_successful: 'cardamom',
  waiting_for_restaurant_payment: 'turmeric',
  restaurant_payment_confirmed: 'cardamom',
  payment_failed: 'chili',
  payment_expired: 'chili',
  // Phase 6D — a refund in flight or a failed refund is its own state.
  refund_initiated: 'turmeric',
  refund_failed: 'chili',
  refunded: 'neutral',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function PaymentHistoryScreen() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const [payments, setPayments] = useState<PaymentHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .get<PaymentHistoryEntry[]>('/payments/history')
      .then((data) => {
        setPayments(data);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not load your payments.');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // An order moving forward usually means a payment leg changed too.
  useEventStream(token, (event) => {
    if (event.type === 'order_updated') load();
  });

  const totalPaid = payments
    .filter((p) => p.status === 'successful')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <AppShell bottomNav={<BottomNav />}>
      <TopBar title="Payments" showBack={false} />

      <div className="px-5 pt-4">
        <Compartment className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-[13px] font-semibold uppercase tracking-wide text-steel-400">
                Paid through Thapar Bites
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-steel-900">{formatINR(totalPaid)}</p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cardamom-500/15 text-cardamom-600">
              <ShieldCheck size={18} />
            </span>
          </div>
          <p className="mt-2 rounded-lg bg-steel-100 px-3 py-2 text-[11px] leading-snug text-steel-600">
            You always pay Thapar Bites, never the restaurant directly. We only release your order to the
            kitchen once we have paid the restaurant.
          </p>
        </Compartment>
      </div>

      <div className="px-5 pt-4">
        {!loaded && !error && <SkeletonCards count={3} height="h-[76px]" />}

        {error && (
          <ErrorState
            title="Couldn't load your payments"
            description="Your payments are safe — this is just the list failing to load."
            onRetry={load}
          />
        )}

        {loaded && payments.length === 0 && (
          <EmptyState
            className="mt-4"
            icon={<Wallet size={22} />}
            title="No payments yet"
            description="Every payment you make through Thapar Bites will be listed here with its amount, date and status."
            action={
              <Button className="mt-1" onClick={() => navigate('/')}>
                Browse restaurants
              </Button>
            }
          />
        )}
      </div>

      <PageTransition>
        {payments.length > 0 && (
          <div className="flex flex-col gap-2.5 px-5 pt-4">
            {payments.map((payment) => (
              <Link key={payment.id} to={`/order/${payment.orderId}`}>
                <Compartment interactive className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-steel-900">
                        {payment.restaurantName ?? 'Restaurant'}
                      </p>
                      <p className="mt-0.5 text-xs text-steel-500">
                        {formatDate(payment.paidAt ?? payment.createdAt)}
                      </p>
                    </div>
                    <span className="shrink-0 font-display text-sm font-semibold text-steel-800">
                      {formatINR(payment.amount)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Chip tone={STAGE_TONE[payment.stage]}>{payment.stageLabel}</Chip>
                    {payment.deliveryType === 'shared' && <Chip tone="neutral">Shared</Chip>}
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-steel-400">
                      View order <ArrowRight size={12} />
                    </span>
                  </div>
                </Compartment>
              </Link>
            ))}
          </div>
        )}
      </PageTransition>
    </AppShell>
  );
}
