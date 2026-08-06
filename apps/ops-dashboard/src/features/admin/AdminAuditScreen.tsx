import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel, Badge } from '@/components/ui/Panel';
import { timeAgo } from '@/lib/utils';
import { SkeletonRows, ErrorState } from '@campus-bites/ui';

interface AuditEntry {
  id: string;
  actor_type: 'student' | 'restaurant' | 'admin' | 'system';
  actor_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

export function AdminAuditScreen() {
  const { token } = useAuthStore();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bug fix: this fetch had no .catch() and no loading state. A failed
  // request left `rows` at its initial empty array, and the screen rendered
  // "No activity yet." — a false empty state indistinguishable from there
  // genuinely being no audit entries.
  const load = useCallback(async () => {
    try {
      const data = await api.get<AuditEntry[]>('/admin/audit', token);
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the audit log.');
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <h1 className="mb-1 font-display text-xl font-bold text-steel-900">Audit log</h1>
      <p className="mb-6 text-sm text-steel-500">System and manual actions that affect orders and matches.</p>

      {!loaded && !error && <SkeletonRows count={6} />}

      {error && rows.length === 0 && (
        <ErrorState title="Couldn't load the audit log" description={error} onRetry={load} />
      )}

      {error && rows.length > 0 && (
        <p className="mb-3 rounded-lg bg-chili-500/10 px-3.5 py-2.5 text-sm text-chili-600">
          {error} — showing the last successful load.
        </p>
      )}

      {loaded && (rows.length > 0 || !error) && (
        <Panel className="divide-y divide-steel-100">
          {rows.length === 0 && <p className="p-4 text-sm text-steel-400">No activity yet.</p>}
          {rows.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{entry.actor_type}</Badge>
                  <span className="font-medium text-steel-800">{entry.action}</span>
                </div>
                {entry.details && <p className="mt-1 truncate text-xs text-steel-400">{entry.details}</p>}
              </div>
              <span className="shrink-0 text-xs text-steel-400">{timeAgo(entry.created_at)}</span>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}
