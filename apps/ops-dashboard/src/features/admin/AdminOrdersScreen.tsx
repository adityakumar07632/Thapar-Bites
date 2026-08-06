import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel, Badge } from '@/components/ui/Panel';
import { formatINR, timeAgo } from '@/lib/utils';
import { DataTable, EmptyState, ErrorState, SkeletonCards, type Column } from '@campus-bites/ui';

interface AdminOrder {
  id: string;
  restaurantId: string;
  deliveryType: 'individual' | 'shared';
  status: string;
  totalAmount: number;
  createdAt: string;
}

function toneFor(status: string): 'neutral' | 'turmeric' | 'cardamom' | 'chili' {
  if (status === 'completed' || status === 'delivered') return 'cardamom';
  if (status === 'cancelled' || status === 'payment_expired') return 'chili';
  if (status.includes('payment') || status === 'waiting_for_match') return 'turmeric';
  return 'neutral';
}

const columns: Column<AdminOrder>[] = [
  {
    key: 'id',
    header: 'Order',
    cell: (o) => <span className="font-mono text-xs text-steel-500">#{o.id.slice(-8)}</span>,
    hideOnMobile: true,
  },
  { key: 'restaurant', header: 'Restaurant', cell: (o) => <span className="text-steel-600">{o.restaurantId}</span> },
  { key: 'type', header: 'Type', cell: (o) => <span className="capitalize text-steel-600">{o.deliveryType}</span> },
  { key: 'status', header: 'Status', cell: (o) => <Badge tone={toneFor(o.status)}>{o.status.replace(/_/g, ' ')}</Badge> },
  { key: 'amount', header: 'Amount', cell: (o) => <span className="font-medium text-steel-800">{formatINR(o.totalAmount)}</span> },
  { key: 'placed', header: 'Placed', cell: (o) => <span className="text-xs text-steel-400">{timeAgo(o.createdAt)}</span> },
];

export function AdminOrdersScreen() {
  const { token } = useAuthStore();
  const [rows, setRows] = useState<AdminOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .get<AdminOrder[]>('/admin/orders', token)
        .then((data) => {
          if (cancelled) return;
          setRows(data);
          setLoaded(true);
          setError(null);
        })
        .catch((cause: unknown) => {
          // A failed poll must not wipe rows that are already on screen.
          if (!cancelled && !loaded) {
            setError(cause instanceof Error ? cause.message : 'Could not load orders.');
          }
        });
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div>
      <h1 className="mb-6 font-display text-xl font-bold text-steel-900">All orders</h1>

      {!loaded && !error && <SkeletonCards count={5} height="h-11" />}
      {error && !loaded && (
        <ErrorState
          title="Couldn't load orders"
          description={error}
          onRetry={() => window.location.reload()}
        />
      )}

      {loaded && (
        <Panel className="overflow-hidden p-0">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(o) => o.id}
            mobileTitle={(o) => <span className="font-mono text-xs">#{o.id.slice(-8)}</span>}
            empty={<EmptyState title="No orders yet" description="Orders across every canteen will appear here live." />}
          />
        </Panel>
      )}
    </div>
  );
}
