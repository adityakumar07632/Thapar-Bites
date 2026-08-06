import { useCallback, useEffect, useState } from 'react';
import { Users, Store, ShoppingBag, IndianRupee, Clock, Activity, RefreshCw } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel } from '@/components/ui/Panel';
import { formatINR, timeAgo } from '@/lib/utils';
import { SkeletonStatCard, EmptyState, ErrorState } from '@campus-bites/ui';

interface DashboardData {
  totals: {
    students: number;
    restaurants: number;
    orders: number;
    sharedOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    gmv: number;
  };
  activeQueueSize: number;
  recentAudit: { id: string; actor_type: string; action: string; details: string | null; created_at: string }[];
}

export function AdminDashboardScreen() {
  const { token } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bug fix: this request had no .catch(). A failed request (network blip,
  // expired token, CORS misconfig, anything) left `data` null forever, so
  // the skeleton below rendered indefinitely instead of resolving to
  // content or a visible error — the exact "stuck loading" symptom.
  const load = useCallback(async () => {
    try {
      const next = await api.get<DashboardData>('/admin/dashboard', token);
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the dashboard.');
    }
  }, [token]);

  useEffect(() => {
    let mounted = true;
    const tick = () => {
      if (mounted) void load();
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [load]);

  const stats = data
    ? [
        { label: 'Students', value: String(data.totals.students), icon: Users },
        { label: 'Restaurants', value: String(data.totals.restaurants), icon: Store },
        { label: 'Total orders', value: String(data.totals.orders), icon: ShoppingBag },
        { label: 'GMV', value: formatINR(data.totals.gmv), icon: IndianRupee },
      ]
    : null;

  return (
    <div className="animate-rise">
      <h1 className="mb-1 font-display text-xl font-bold text-steel-900">Platform overview</h1>
      <p className="mb-6 text-sm text-steel-500">Refreshes every 5 seconds.</p>

      {/* First-load failure — nothing to show yet, so surface a real error instead of an endless skeleton */}
      {!data && error && (
        <ErrorState title="Couldn't load the dashboard" description={error} onRetry={load} className="mb-4" />
      )}

      {/* A later refresh failed but we still have data on screen — don't blank it, just flag it */}
      {data && error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-chili-500/10 px-3.5 py-2.5 text-sm text-chili-600">
          <RefreshCw size={14} /> {error}
        </div>
      )}

      {/* Primary stat grid — 2 cols on mobile, 4 on sm+ */}
      {!data && error ? null : !data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats!.map(({ label, value, icon: Icon }) => (
            <Panel key={label} className="p-4">
              <Icon size={16} className="text-steel-400" aria-hidden />
              <p className="mt-2 font-display text-xl font-bold text-steel-900">{value}</p>
              <p className="text-xs text-steel-500">{label}</p>
            </Panel>
          ))}
        </div>
      )}

      {/* Secondary metrics */}
      {!data && error ? null : !data ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonStatCard key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Panel className="p-4">
            <p className="text-xs text-steel-500">Shared Delivery share</p>
            <p className="mt-1 font-display text-lg font-semibold text-turmeric-700">
              {data.totals.orders > 0
                ? Math.round((data.totals.sharedOrders / data.totals.orders) * 100)
                : 0}%
            </p>
          </Panel>
          <Panel className="p-4">
            <p className="text-xs text-steel-500">Completed</p>
            <p className="mt-1 font-display text-lg font-semibold text-cardamom-600">
              {data.totals.completedOrders}
            </p>
          </Panel>
          <Panel className="p-4">
            <p className="text-xs text-steel-500">Cancelled</p>
            <p className="mt-1 font-display text-lg font-semibold text-chili-600">
              {data.totals.cancelledOrders}
            </p>
          </Panel>
        </div>
      )}

      {/* Queue status badge */}
      {data && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-steel-600 border border-steel-150">
          <Clock size={15} className="text-steel-400" aria-hidden />
          <span>
            <span className="font-semibold text-steel-800">{data.activeQueueSize}</span>{' '}
            student{data.activeQueueSize === 1 ? '' : 's'} currently waiting in a Shared Delivery queue.
          </span>
        </div>
      )}

      {/* Recent activity — hidden on a first-load failure; the ErrorState above already covers it */}
      {!(!data && error) && (
        <>
          <h2 className="mb-2 mt-6 font-display text-sm font-semibold uppercase tracking-wide text-steel-400">
            Recent activity
          </h2>

          {!data ? (
            <Panel className="divide-y divide-steel-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="h-3 w-1/2 animate-shimmer rounded bg-steel-150" />
                    <div className="h-3 w-1/3 animate-shimmer rounded bg-steel-150" />
                  </div>
                  <div className="h-3 w-16 animate-shimmer rounded bg-steel-150" />
                </div>
              ))}
            </Panel>
          ) : data.recentAudit.length === 0 ? (
            <EmptyState
              icon={<Activity size={20} />}
              title="No activity yet"
              description="Platform events will appear here as students and restaurants use Thapar Bites."
            />
          ) : (
            <Panel className="divide-y divide-steel-100">
              {data.recentAudit.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-steel-800">{entry.action.replace(/_/g, ' ')}</span>
                    {entry.details && (
                      <span className="ml-2 text-steel-400 break-all">{entry.details}</span>
                    )}
                  </div>
                  <span className="ml-3 shrink-0 text-xs text-steel-400">{timeAgo(entry.created_at)}</span>
                </div>
              ))}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
