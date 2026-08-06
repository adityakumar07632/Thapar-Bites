import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel, Badge } from '@/components/ui/Panel';
import { formatINR, timeAgo } from '@/lib/utils';
import { Button, DataTable, EmptyState, ErrorState, SkeletonCards, type Column } from '@campus-bites/ui';

/**
 * Phase 6D — Admin Refund Dashboard.
 *
 * Every rupee Thapar Bites has sent back to a student, split by where it got
 * to: Pending (on its way), Successful (student has it) and Failed (a human
 * needs to retry). Refunds are created automatically by the refund engine —
 * the only action here is retrying one that failed.
 */

interface Refund {
  id: string;
  orderId: string;
  amount: number;
  studentName: string | null;
  studentRoll: string | null;
  restaurantName: string | null;
  orderStatus: string;
  refundStatus: 'none' | 'pending' | 'completed' | 'failed';
  refundReason: string | null;
  refundAmount: number;
  refundTrigger: string | null;
  refundTime: string | null;
  refundInitiatedAt: string | null;
  refundCompletedAt: string | null;
  refundFailureReason: string | null;
}

interface RefundSummary {
  pendingCount: number;
  pendingAmount: number;
  successfulCount: number;
  successfulAmount: number;
  failedCount: number;
  failedAmount: number;
}

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'successful', label: 'Successful' },
  { key: 'failed', label: 'Failed' },
  { key: 'all', label: 'All refunds' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const TRIGGER_LABEL: Record<string, string> = {
  restaurant_closed: 'Restaurant was closed',
  restaurant_rejected: 'Restaurant rejected the order',
  transfer_failed: 'Restaurant payment failed',
  admin_cancelled: 'Cancelled by admin',
  student_cancelled: 'Cancelled by student',
  manual: 'Manual refund',
};

function refundTone(status: string): 'neutral' | 'turmeric' | 'cardamom' | 'chili' {
  if (status === 'completed') return 'cardamom';
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

export function AdminRefundsScreen() {
  const { token } = useAuthStore();
  const [tab, setTab] = useState<TabKey>('pending');
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [summary, setSummary] = useState<RefundSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api
        .get<{ refunds: Refund[]; summary: RefundSummary }>(`/admin/refunds?status=${tab}`, token)
        .then((data) => {
          setRefunds(data.refunds);
          setSummary(data.summary);
          setLoaded(true);
          setError(null);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'Could not load refunds.');
        }),
    [tab, token],
  );

  useEffect(() => {
    setLoaded(false);
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  const retry = async (refund: Refund) => {
    setBusyId(refund.id);
    setActionError(null);
    setNotice(null);
    try {
      await api.patch(`/admin/refunds/${refund.id}/retry`, undefined, token);
      setNotice(`Refund of ${formatINR(refund.refundAmount)} retried for ${refund.studentName ?? 'the student'}.`);
      await load();
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : 'That refund could not be retried.');
    } finally {
      setBusyId(null);
    }
  };

  const columns = useMemo<Column<Refund>[]>(
    () => [
      {
        key: 'order',
        header: 'Order ID',
        cell: (r) => <span className="font-mono text-xs text-steel-500">#{r.orderId.slice(-8)}</span>,
      },
      {
        key: 'student',
        header: 'Student',
        cell: (r) => (
          <div>
            <p className="text-steel-700">{r.studentName ?? '—'}</p>
            <p className="text-xs text-steel-400">{r.studentRoll ?? ''}</p>
          </div>
        ),
      },
      {
        key: 'restaurant',
        header: 'Restaurant',
        cell: (r) => <span className="text-steel-600">{r.restaurantName ?? '—'}</span>,
      },
      {
        key: 'amount',
        header: 'Refund amount',
        cell: (r) => <span className="font-medium text-steel-800">{formatINR(r.refundAmount)}</span>,
      },
      {
        key: 'reason',
        header: 'Reason',
        cell: (r) => (
          <div>
            <p className="text-steel-700">{TRIGGER_LABEL[r.refundTrigger ?? ''] ?? 'Refund'}</p>
            <p className="text-xs text-steel-400">{r.refundReason ?? ''}</p>
          </div>
        ),
      },
      {
        key: 'when',
        header: 'Refund date',
        cell: (r) => (
          <div>
            <p className="text-xs text-steel-600">{formatDateTime(r.refundTime)}</p>
            <p className="text-xs text-steel-400">{r.refundTime ? timeAgo(r.refundTime) : ''}</p>
          </div>
        ),
        hideOnMobile: true,
      },
      {
        key: 'status',
        header: 'Status',
        cell: (r) => (
          <div className="space-y-1">
            <Badge tone={refundTone(r.refundStatus)}>{r.refundStatus}</Badge>
            {r.refundFailureReason && <p className="text-xs text-chili-600">{r.refundFailureReason}</p>}
          </div>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        cell: (r) =>
          r.refundStatus === 'failed' ? (
            <Button size="sm" disabled={busyId === r.id} onClick={() => void retry(r)}>
              {busyId === r.id ? 'Working…' : 'Retry refund'}
            </Button>
          ) : (
            <span className="text-xs text-steel-400">No action needed</span>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId, token, tab],
  );

  return (
    <div>
      <h1 className="mb-2 font-display text-xl font-bold text-steel-900">Refunds</h1>
      <p className="mb-6 max-w-2xl text-sm text-steel-500">
        Thapar Bites refunds a student automatically when a restaurant is closed or rejects an order, when the
        restaurant payment fails, or when an order is cancelled before confirmation. A refunded order never reaches
        the kitchen.
      </p>

      {summary && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <Panel className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-steel-400">Pending refunds</p>
            <p className="mt-1 font-display text-lg font-bold text-steel-900">{summary.pendingCount}</p>
            <p className="text-xs text-steel-400">{formatINR(summary.pendingAmount)} on its way back</p>
          </Panel>
          <Panel className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-steel-400">Successful refunds</p>
            <p className="mt-1 font-display text-lg font-bold text-steel-900">{summary.successfulCount}</p>
            <p className="text-xs text-steel-400">{formatINR(summary.successfulAmount)} returned</p>
          </Panel>
          <Panel className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-steel-400">Failed refunds</p>
            <p className="mt-1 font-display text-lg font-bold text-steel-900">{summary.failedCount}</p>
            <p className="text-xs text-steel-400">{formatINR(summary.failedAmount)} needs a retry</p>
          </Panel>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'rounded-full bg-steel-900 px-3 py-1.5 text-xs font-medium text-white'
                : 'rounded-full border border-steel-200 px-3 py-1.5 text-xs font-medium text-steel-600 hover:bg-steel-50'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && <p className="mb-4 text-sm text-cardamom-700">{notice}</p>}
      {actionError && <p className="mb-4 text-sm text-chili-600">{actionError}</p>}

      {!loaded && !error && <SkeletonCards count={5} height="h-11" />}
      {error && !loaded && <ErrorState title="Couldn't load refunds" description={error} onRetry={load} />}

      {loaded && (
        <Panel className="overflow-hidden p-0">
          <DataTable
            columns={columns}
            rows={refunds}
            rowKey={(r) => r.id}
            mobileTitle={(r) => <span className="font-mono text-xs">#{r.orderId.slice(-8)}</span>}
            empty={
              <EmptyState
                title="No refunds here"
                description="Refunds appear the moment an order is rejected, cancelled or a restaurant payment fails."
              />
            }
          />
        </Panel>
      )}
    </div>
  );
}
