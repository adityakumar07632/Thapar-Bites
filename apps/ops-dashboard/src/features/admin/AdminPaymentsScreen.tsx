import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel, Badge } from '@/components/ui/Panel';
import { formatINR, timeAgo } from '@/lib/utils';
import { Button, DataTable, EmptyState, ErrorState, SkeletonCards, type Column } from '@campus-bites/ui';

/**
 * Phase 6A — Thapar Bites is the payment intermediary. Every payment has two
 * legs, and Ops needs both in one place: what the student paid us (`status`),
 * and whether we have paid the restaurant (`transferStatus`). A restaurant
 * never receives an order until its transfer is confirmed.
 */
interface AdminPayment {
  id: string;
  orderId: string;
  amount: number;
  status: string;
  transferStatus: string;
  stage: string;
  stageLabel: string;
  studentName: string | null;
  restaurantName: string | null;
  orderStatus: string;
  paidAt: string | null;
  createdAt: string | null;
  transferConfirmedAt: string | null;
}

interface Totals {
  collected: number;
  transferred: number;
  heldForRestaurants: number;
  pendingTransfers: number;
}

function stageTone(stage: string): 'neutral' | 'turmeric' | 'cardamom' | 'chili' {
  if (stage === 'restaurant_payment_confirmed') return 'cardamom';
  if (stage === 'payment_failed' || stage === 'payment_expired') return 'chili';
  if (stage === 'awaiting_payment' || stage === 'waiting_for_restaurant_payment') return 'turmeric';
  return 'neutral';
}

export function AdminPaymentsScreen() {
  const { token } = useAuthStore();
  const [rows, setRows] = useState<AdminPayment[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api
        .get<{ payments: AdminPayment[]; totals: Totals }>('/admin/payments', token)
        .then((data) => {
          setRows(data.payments);
          setTotals(data.totals);
          setLoaded(true);
          setError(null);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'Could not load payments.');
        }),
    [token],
  );

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const confirmTransfer = async (payment: AdminPayment) => {
    setBusyId(payment.id);
    setActionError(null);
    try {
      await api.patch(`/admin/payments/${payment.id}/confirm-transfer`, undefined, token);
      await load();
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : 'Could not confirm the transfer.');
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<AdminPayment>[] = [
    {
      key: 'id',
      header: 'Payment',
      cell: (p) => <span className="font-mono text-xs text-steel-500">#{p.id.slice(-8)}</span>,
      hideOnMobile: true,
    },
    { key: 'student', header: 'Student', cell: (p) => <span className="text-steel-600">{p.studentName ?? '—'}</span> },
    {
      key: 'restaurant',
      header: 'Restaurant',
      cell: (p) => <span className="text-steel-600">{p.restaurantName ?? '—'}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (p) => <span className="font-medium text-steel-800">{formatINR(p.amount)}</span>,
    },
    { key: 'stage', header: 'Status', cell: (p) => <Badge tone={stageTone(p.stage)}>{p.stageLabel}</Badge> },
    {
      key: 'date',
      header: 'Date',
      cell: (p) => <span className="text-xs text-steel-400">{timeAgo(p.paidAt ?? p.createdAt ?? '')}</span>,
    },
    {
      key: 'action',
      header: '',
      cell: (p) =>
        p.status === 'successful' && p.transferStatus !== 'confirmed' ? (
          <Button size="sm" variant="secondary" disabled={busyId === p.id} onClick={() => confirmTransfer(p)}>
            {busyId === p.id ? 'Confirming…' : 'Confirm transfer'}
          </Button>
        ) : (
          <span className="text-xs text-steel-300">—</span>
        ),
    },
  ];

  return (
    <div>
      <h1 className="mb-2 font-display text-xl font-bold text-steel-900">Payments</h1>
      <p className="mb-6 max-w-2xl text-sm text-steel-500">
        Students pay Thapar Bites, and Thapar Bites pays the restaurant. An order only reaches a kitchen once
        its restaurant transfer is confirmed.
      </p>

      {totals && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Panel className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-steel-400">Collected from students</p>
            <p className="mt-1 font-display text-lg font-bold text-steel-900">{formatINR(totals.collected)}</p>
          </Panel>
          <Panel className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-steel-400">Paid to restaurants</p>
            <p className="mt-1 font-display text-lg font-bold text-steel-900">{formatINR(totals.transferred)}</p>
          </Panel>
          <Panel className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-steel-400">Held by Thapar Bites</p>
            <p className="mt-1 font-display text-lg font-bold text-steel-900">
              {formatINR(totals.heldForRestaurants)}
            </p>
          </Panel>
          <Panel className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-steel-400">Transfers in flight</p>
            <p className="mt-1 font-display text-lg font-bold text-steel-900">{totals.pendingTransfers}</p>
          </Panel>
        </div>
      )}

      {actionError && <p className="mb-4 text-sm text-chili-600">{actionError}</p>}

      {!loaded && !error && <SkeletonCards count={5} height="h-11" />}
      {error && !loaded && <ErrorState title="Couldn't load payments" description={error} onRetry={load} />}

      {loaded && (
        <Panel className="overflow-hidden p-0">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(p) => p.id}
            mobileTitle={(p) => <span className="font-mono text-xs">#{p.id.slice(-8)}</span>}
            empty={<EmptyState title="No payments yet" description="Student payments will appear here live." />}
          />
        </Panel>
      )}
    </div>
  );
}
