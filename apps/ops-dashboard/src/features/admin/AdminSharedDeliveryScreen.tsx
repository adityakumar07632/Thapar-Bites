import { useCallback, useEffect, useState } from 'react';
import { Activity, Clock, Hourglass, PercentCircle, RefreshCw, Users } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel, Badge } from '@/components/ui/Panel';
import { Skeleton } from '@campus-bites/ui';
import { formatINR, timeAgo } from '@/lib/utils';

interface QueueEntry {
  id: string;
  studentName: string;
  rollNumber: string;
  restaurantName: string;
  hostel: string;
  subtotal: number;
  joinedAt: string;
  expiresAt: string;
  waitingMs: number;
  position: number;
}

interface ActiveMatch {
  id: string;
  restaurantName: string;
  hostel: string;
  status: string;
  pairCode: string;
  paymentDeadline: string;
  createdAt: string;
  students: string[];
  orders: { id: string; status: string; subtotal: number; convenience_fee: number }[];
  combinedValue: number;
}

interface QueueMonitor {
  stats: {
    waitingNow: number;
    activeMatches: number;
    matchedTotal: number;
    cancelledTotal: number;
    expiredTotal: number;
    joinedTotal: number;
    matchSuccessRate: number;
    averageWaitMs: number | null;
    longestCurrentWaitMs: number;
  };
  activeQueue: QueueEntry[];
  activeMatches: ActiveMatch[];
}

function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function AdminSharedDeliveryScreen() {
  const { token } = useAuthStore();
  const [data, setData] = useState<QueueMonitor | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api.get<QueueMonitor>('/admin/shared-delivery', token);
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the queue monitor.');
    }
  }, [token]);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  if (!data && !error) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const stats = data?.stats;
  const tiles = [
    { label: 'Waiting now', value: String(stats?.waitingNow ?? 0), icon: Users },
    { label: 'Active matches', value: String(stats?.activeMatches ?? 0), icon: Activity },
    { label: 'Match success rate', value: `${stats?.matchSuccessRate ?? 0}%`, icon: PercentCircle },
    {
      label: 'Average wait',
      value: stats?.averageWaitMs ? duration(stats.averageWaitMs) : '—',
      icon: Clock,
    },
  ];

  return (
    <div>
      <h1 className="mb-1 font-display text-xl font-bold text-steel-900">Shared Delivery monitor</h1>
      <p className="mb-6 text-sm text-steel-500">
        Live queue, active matches and pairing performance. Refreshes every 5 seconds.
      </p>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-chili-500/10 px-3.5 py-2.5 text-sm text-chili-600">
          <RefreshCw size={14} /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon }) => (
          <Panel key={label} className="p-4">
            <Icon size={16} className="text-steel-400" />
            <p className="mt-2 font-display text-xl font-bold text-steel-900">{value}</p>
            <p className="text-xs text-steel-500">{label}</p>
          </Panel>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Panel className="p-3.5">
          <p className="text-xs text-steel-500">Matched all-time</p>
          <p className="mt-1 font-display text-base font-semibold text-cardamom-600">
            {stats?.matchedTotal ?? 0}
          </p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-xs text-steel-500">Left queue</p>
          <p className="mt-1 font-display text-base font-semibold text-steel-700">{stats?.cancelledTotal ?? 0}</p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-xs text-steel-500">Expired unmatched</p>
          <p className="mt-1 font-display text-base font-semibold text-chili-600">{stats?.expiredTotal ?? 0}</p>
        </Panel>
        <Panel className="p-3.5">
          <p className="text-xs text-steel-500">Longest current wait</p>
          <p className="mt-1 font-display text-base font-semibold text-steel-900">
            {stats?.longestCurrentWaitMs ? duration(stats.longestCurrentWaitMs) : '—'}
          </p>
        </Panel>
      </div>

      <h2 className="mb-2 mt-6 font-display text-sm font-semibold uppercase tracking-wide text-steel-400">
        Queue right now
      </h2>
      <Panel className="divide-y divide-steel-100">
        {(data?.activeQueue.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Hourglass size={20} className="text-steel-300" />
            <p className="font-display text-sm font-semibold text-steel-700">Queue is empty</p>
            <p className="text-xs text-steel-400">Students waiting for a Shared Delivery match appear here.</p>
          </div>
        )}
        {data?.activeQueue.map((entry) => (
          <div
            key={entry.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:flex sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-full bg-steel-100 px-2 py-0.5 font-mono text-[11px] text-steel-600">
                  #{entry.position}
                </span>
                <p className="truncate text-sm font-medium text-steel-800">{entry.studentName}</p>
                <Badge tone="neutral">{entry.hostel}</Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-steel-400">
                {entry.restaurantName} · {formatINR(entry.subtotal)} · joined {timeAgo(entry.joinedAt)}
              </p>
            </div>
            <span className="shrink-0 font-mono text-xs tabular-nums text-steel-600">
              {duration(entry.waitingMs)}
            </span>
          </div>
        ))}
      </Panel>

      <h2 className="mb-2 mt-6 font-display text-sm font-semibold uppercase tracking-wide text-steel-400">
        Active matches
      </h2>
      <Panel className="divide-y divide-steel-100">
        {(data?.activeMatches.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Users size={20} className="text-steel-300" />
            <p className="font-display text-sm font-semibold text-steel-700">No live matches</p>
            <p className="text-xs text-steel-400">Pairs awaiting payment or in delivery show up here.</p>
          </div>
        )}
        {data?.activeMatches.map((match) => (
          <div key={match.id} className="px-4 py-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-steel-500">{match.pairCode}</span>
                  <Badge tone={match.status === 'confirmed' ? 'cardamom' : 'turmeric'}>{match.status}</Badge>
                  <Badge tone="neutral">{match.hostel}</Badge>
                </div>
                <p className="mt-1 truncate text-sm text-steel-700">
                  {match.students.join(' + ')} · {match.restaurantName}
                </p>
                <p className="mt-0.5 text-xs text-steel-400">
                  matched {timeAgo(match.createdAt)} ·{' '}
                  {match.orders.map((o) => o.status).join(' / ') || 'no orders yet'}
                </p>
              </div>
              <span className="shrink-0 font-display text-sm font-semibold text-steel-900">
                {formatINR(match.combinedValue)}
              </span>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}
