import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Power, PowerOff, Store, Trash2 } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel, Badge } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { formatINR } from '@/lib/utils';
import { AddRestaurantModal } from '@/features/admin/AddRestaurantModal';
import { DataTable, EmptyState, ErrorState, SkeletonRows } from '@campus-bites/ui';

interface AdminRestaurant {
  id: string;
  name: string;
  cuisine: string | null;
  status: 'open' | 'busy' | 'closed';
  minimumOrder: number;
  sharedDeliveryMinimum: number;
  rating: number | null;
  orderCount: number;
  isActive: boolean;
  deletedAt: string | null;
  manager: { fullName: string; email: string } | null;
}

export function AdminRestaurantsScreen() {
  const { token } = useAuthStore();
  const [rows, setRows] = useState<AdminRestaurant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<AdminRestaurant[]>('/admin/restaurants?includeDeleted=true', token);
      setRows(data);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load restaurants.');
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(r: AdminRestaurant) {
    setBusyId(r.id);
    try {
      await api.patch(`/admin/restaurants/${r.id}/${r.isActive ? 'disable' : 'enable'}`, undefined, token);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function softDelete(r: AdminRestaurant) {
    if (!confirm(`Soft delete "${r.name}"? This can't be undone from this screen.`)) return;
    setBusyId(r.id);
    try {
      await api.del(`/admin/restaurants/${r.id}`, token);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="animate-rise">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-steel-900">Restaurants</h1>
          <p className="text-sm text-steel-500">All campus outlets, including disabled and soft-deleted.</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus size={15} aria-hidden /> Add restaurant
        </Button>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorState title="Couldn't load restaurants" description={error} onRetry={() => void load()} />
        </div>
      )}

      {!loaded && !error && <SkeletonRows count={6} />}

      {loaded && !error && (
        <Panel className="overflow-hidden p-0">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            mobileTitle={(r) => (
              <Link to={`/admin/restaurants/${r.id}`} className="hover:text-turmeric-700 transition-colors">
                {r.name}
              </Link>
            )}
            empty={
              <EmptyState
                icon={<Store size={20} />}
                title="No restaurants yet"
                description="Add the first campus outlet to start taking orders."
                action={
                  <Button onClick={() => setShowAdd(true)}>
                    <Plus size={14} aria-hidden /> Add restaurant
                  </Button>
                }
              />
            }
            columns={[
              {
                key: 'name',
                header: 'Name',
                hideOnMobile: true,
                cell: (r) => (
                  <>
                    <Link
                      to={`/admin/restaurants/${r.id}`}
                      className="font-medium text-steel-800 hover:text-turmeric-700 transition-colors"
                    >
                      {r.name}
                    </Link>
                    <p className="text-xs text-steel-400">{r.cuisine}</p>
                  </>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                cell: (r) => (
                  <div className="flex flex-wrap justify-end gap-1.5 md:justify-start">
                    <Badge tone={r.status === 'open' ? 'cardamom' : r.status === 'busy' ? 'turmeric' : 'neutral'}>
                      {r.status}
                    </Badge>
                    {r.deletedAt ? (
                      <Badge tone="chili">Deleted</Badge>
                    ) : !r.isActive ? (
                      <Badge tone="chili">Disabled</Badge>
                    ) : null}
                  </div>
                ),
              },
              {
                key: 'manager',
                header: 'Manager',
                cell: (r) =>
                  r.manager ? (
                    <>
                      <p className="text-steel-700">{r.manager.fullName}</p>
                      <p className="break-all text-xs text-steel-400">{r.manager.email}</p>
                    </>
                  ) : (
                    <span className="text-steel-400">—</span>
                  ),
              },
              {
                key: 'minimum',
                header: 'Individual min.',
                cell: (r) => <span className="text-steel-600">{formatINR(r.minimumOrder)}</span>,
              },
              {
                key: 'orders',
                header: 'Orders',
                cell: (r) => <span className="text-steel-600">{r.orderCount}</span>,
              },
              {
                key: 'actions',
                header: 'Actions',
                cell: (r) => (
                  <div className="flex items-center justify-end gap-1.5 md:justify-start">
                    <Button
                      variant="ghost"
                      className="px-2 py-1.5"
                      disabled={busyId === r.id || !!r.deletedAt}
                      onClick={() => void toggleActive(r)}
                      title={r.isActive ? 'Disable restaurant' : 'Enable restaurant'}
                      aria-label={r.isActive ? `Disable ${r.name}` : `Enable ${r.name}`}
                    >
                      {r.isActive ? <PowerOff size={15} aria-hidden /> : <Power size={15} aria-hidden />}
                    </Button>
                    <Button
                      variant="danger"
                      className="px-2 py-1.5"
                      disabled={busyId === r.id || !!r.deletedAt}
                      onClick={() => void softDelete(r)}
                      title={`Delete ${r.name}`}
                      aria-label={`Delete ${r.name}`}
                    >
                      <Trash2 size={15} aria-hidden />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </Panel>
      )}

      {showAdd && (
        <AddRestaurantModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            void load();
          }}
        />
      )}
    </div>
  );
}
