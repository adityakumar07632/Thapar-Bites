import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel, Badge } from '@/components/ui/Panel';
import { formatINR, timeAgo } from '@/lib/utils';
import { Button, DataTable, EmptyState, ErrorState, SkeletonCards, type Column } from '@campus-bites/ui';

/**
 * Phase 6B — Admin Payout Management.
 *
 * Students pay Thapar Bites; Thapar Bites pays the restaurant. A restaurant
 * does not see an order until an admin confirms that second transfer here, so
 * this screen is the release gate: every row is money we are holding, and
 * every action is written to the payment log.
 */

interface PendingPayout {
  id: string;
  orderId: string;
  amount: number;
  status: string;
  transferStatus: string;
  stageLabel: string;
  studentName: string | null;
  studentRoll: string | null;
  restaurantName: string | null;
  restaurantUpi: string | null;
  orderStatus: string;
  paymentTime: string | null;
  transferAttempts: number;
  transferFailureReason: string | null;
}

interface Analytics {
  pendingTransfers: number;
  pendingAmount: number;
  completedTransfers: number;
  completedAmount: number;
  failedTransfers: number;
  failedAmount: number;
  refundedPayments: number;
  todayRevenue: number;
  todayPayments: number;
}

interface PaymentLog {
  id: string;
  paymentId: string;
  orderId: string;
  action: string;
  transferStatus: string;
  amount: number;
  actorName: string | null;
  actorType: string;
  restaurantName: string | null;
  note: string | null;
  createdAt: string;
}

const ACTION_LABEL: Record<string, string> = {
  transfer_confirmed: 'Restaurant payment confirmed',
  transfer_retried: 'Transfer retried',
  transfer_failed: 'Transfer failed',
  student_refunded: 'Student refunded',
  order_cancelled: 'Order cancelled',
};

function transferTone(status: string): 'neutral' | 'turmeric' | 'cardamom' | 'chili' {
  if (status === 'confirmed') return 'cardamom';
  if (status === 'failed') return 'chili';
  if (status === 'pending') return 'turmeric';
  return 'neutral';
}

function formatDateTime(value: string | null): string {
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

export function AdminPayoutsScreen() {
  const { token } = useAuthStore();
  const [rows, setRows] = useState<PendingPayout[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [logs, setLogs] = useState<PaymentLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        api.get<PendingPayout[]>('/admin/payouts/pending', token),
        api.get<Analytics>('/admin/payouts/analytics', token),
        api.get<PaymentLog[]>('/admin/payouts/logs?limit=25', token),
      ])
        .then(([pending, stats, log]) => {
          setRows(pending);
          setAnalytics(stats);
          setLogs(log);
          setLoaded(true);
          setError(null);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'Could not load restaurant payments.');
        }),
    [token],
  );

  useEffect(() => {
    load();
    const interval = setInterval(load, 6000);
    return () => clearInterval(interval);
  }, [load]);

  const run = async (payout: PendingPayout, path: string, body: unknown, success: string) => {
    setBusyId(payout.id);
    setActionError(null);
    setNotice(null);
    try {
      await api.patch(`/admin/payments/${payout.id}/${path}`, body, token);
      setNotice(success);
      await load();
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : 'That action could not be completed.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmPayment = (p: PendingPayout) =>
    run(
      p,
      'confirm-transfer',
      undefined,
      `Restaurant paid — order #${p.orderId.slice(-6)} released to ${p.restaurantName ?? 'the kitchen'}.`,
    );

  const retryTransfer = (p: PendingPayout) =>
    run(p, 'retry-transfer', undefined, 'Transfer queued for another attempt.');

  const refundStudent = (p: PendingPayout) => {
    const reason = window.prompt('Why is this student being refunded?', 'Restaurant payout could not be completed.');
    if (!reason) return;
    void run(p, 'refund', { reason }, `Refunded ${formatINR(p.amount)} to ${p.studentName ?? 'the student'}.`);
  };

  const cancelOrder = (p: PendingPayout) => {
    const reason = window.prompt('Why is this order being cancelled?', 'Cancelled by Thapar Bites admin.');
    if (!reason) return;
    void run(p, 'cancel-order', { reason }, `Order #${p.orderId.slice(-6)} cancelled.`);
  };

  const columns: Column<PendingPayout>[] = [
    {
      key: 'order',
      header: 'Order ID',
      cell: (p) => <span className="font-mono text-xs text-steel-500">#{p.orderId.slice(-8)}</span>,
    },
    {
      key: 'student',
      header: 'Student',
      cell: (p) => (
        <div>
          <p className="text-steel-700">{p.studentName ?? '—'}</p>
          <p className="text-xs text-steel-400">{p.studentRoll ?? ''}</p>
        </div>
      ),
    },
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
    {
      key: 'paidAt',
      header: 'Payment Time',
      cell: (p) => (
        <div>
          <p className="text-xs text-steel-600">{formatDateTime(p.paymentTime)}</p>
          <p className="text-xs text-steel-400">{p.paymentTime ? timeAgo(p.paymentTime) : ''}</p>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: 'upi',
      header: 'Restaurant UPI',
      cell: (p) => <span className="font-mono text-xs text-steel-500">{p.restaurantUpi ?? 'Not set'}</span>,
      hideOnMobile: true,
    },
    {
      key: 'transfer',
      header: 'Transfer Status',
      cell: (p) => (
        <div className="space-y-1">
          <Badge tone={transferTone(p.transferStatus)}>{p.transferStatus.replace(/_/g, ' ')}</Badge>
          {p.transferFailureReason && <p className="text-xs text-chili-600">{p.transferFailureReason}</p>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (p) => (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" disabled={busyId === p.id} onClick={() => void confirmPayment(p)}>
            {busyId === p.id ? 'Working…' : 'Confirm Restaurant Payment'}
          </Button>
          <Button size="sm" variant="secondary" disabled={busyId === p.id} onClick={() => void retryTransfer(p)}>
            Retry Transfer
          </Button>
          <Button size="sm" variant="secondary" disabled={busyId === p.id} onClick={() => refundStudent(p)}>
            Refund Student
          </Button>
          <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => cancelOrder(p)}>
            Cancel Order
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <h1 className="mb-2 font-display text-xl font-bold text-steel-900">Pending Restaurant Payments</h1>
      <p className="mb-6 max-w-2xl text-sm text-steel-500">
        Thapar Bites is holding this money. The restaurant cannot see an order until you confirm its payment —
        confirming releases the order to the kitchen and moves the student to “Order Confirmed”.
      </p>

      {analytics && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Panel className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-steel-400">Pending transfers</p>
            <p className="mt-1 font-display text-lg font-bold text-steel-900">{analytics.pendingTransfers}</p>
            <p className="text-xs text-steel-400">{formatINR(analytics.pendingAmount)} held</p>
          </Panel>
          <Panel className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-steel-400">Completed transfers</p>
            <p className="mt-1 font-display text-lg font-bold text-steel-900">{analytics.completedTransfers}</p>
            <p className="text-xs text-steel-400">{formatINR(analytics.completedAmount)} paid out</p>
          </Panel>
          <Panel className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-steel-400">Failed transfers</p>
            <p className="mt-1 font-display text-lg font-bold text-steel-900">{analytics.failedTransfers}</p>
            <p className="text-xs text-steel-400">{formatINR(analytics.failedAmount)} needs retry</p>
          </Panel>
          <Panel className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-steel-400">Today&rsquo;s revenue</p>
            <p className="mt-1 font-display text-lg font-bold text-steel-900">{formatINR(analytics.todayRevenue)}</p>
            <p className="text-xs text-steel-400">{analytics.todayPayments} payments today</p>
          </Panel>
        </div>
      )}

      {notice && <p className="mb-4 text-sm text-cardamom-700">{notice}</p>}
      {actionError && <p className="mb-4 text-sm text-chili-600">{actionError}</p>}

      {!loaded && !error && <SkeletonCards count={5} height="h-11" />}
      {error && !loaded && <ErrorState title="Couldn't load payouts" description={error} onRetry={load} />}

      {loaded && (
        <>
          <Panel className="mb-8 overflow-hidden p-0">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(p) => p.id}
              mobileTitle={(p) => <span className="font-mono text-xs">#{p.orderId.slice(-8)}</span>}
              empty={
                <EmptyState
                  title="No restaurant payments pending"
                  description="Every settled order has been paid out. New student payments appear here instantly."
                />
              }
            />
          </Panel>

          <h2 className="mb-2 font-display text-base font-bold text-steel-900">Payment log</h2>
          <p className="mb-3 text-sm text-steel-500">Who confirmed a payment, when, and what it did.</p>
          <Panel className="overflow-hidden p-0">
            <DataTable
              columns={[
                {
                  key: 'when',
                  header: 'Time',
                  cell: (l: PaymentLog) => (
                    <span className="text-xs text-steel-500">{formatDateTime(l.createdAt)}</span>
                  ),
                },
                {
                  key: 'order',
                  header: 'Order ID',
                  cell: (l: PaymentLog) => (
                    <span className="font-mono text-xs text-steel-500">#{l.orderId.slice(-8)}</span>
                  ),
                },
                {
                  key: 'action',
                  header: 'Action',
                  cell: (l: PaymentLog) => (
                    <span className="text-steel-700">{ACTION_LABEL[l.action] ?? l.action}</span>
                  ),
                },
                {
                  key: 'by',
                  header: 'Confirmed by',
                  cell: (l: PaymentLog) => (
                    <span className="text-steel-600">{l.actorName ?? l.actorType}</span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Transfer Status',
                  cell: (l: PaymentLog) => (
                    <Badge tone={transferTone(l.transferStatus)}>{l.transferStatus.replace(/_/g, ' ')}</Badge>
                  ),
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  cell: (l: PaymentLog) => <span className="text-steel-700">{formatINR(l.amount)}</span>,
                  hideOnMobile: true,
                },
              ]}
              rows={logs}
              rowKey={(l) => l.id}
              mobileTitle={(l) => <span className="font-mono text-xs">#{l.orderId.slice(-8)}</span>}
              empty={<EmptyState title="No payment actions yet" description="Confirmations will be recorded here." />}
            />
          </Panel>
        </>
      )}
    </div>
  );
}
