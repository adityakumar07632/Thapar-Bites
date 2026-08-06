import { useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel, Badge } from '@/components/ui/Panel';
import { Alert } from '@/components/ui/Field';
import { DataTable, EmptyState } from '@campus-bites/ui';

interface RestaurantRatingRow {
  restaurantId: string;
  restaurantName: string;
  avgRating: number | null;
  ratingCount: number;
}

interface ItemRatingRow {
  menuItemId: string;
  menuItemName: string;
  restaurantId: string;
  restaurantName: string;
  avgRating: number | null;
  ratingCount: number;
}

function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-steel-400">—</span>;
  return (
    <span className="flex items-center gap-1 font-semibold text-steel-800">
      <Star size={13} className="fill-turmeric-500 text-turmeric-500" />
      {value.toFixed(1)}
    </span>
  );
}

export function AdminRatingsScreen() {
  const { token } = useAuthStore();
  const [restaurants, setRestaurants] = useState<RestaurantRatingRow[]>([]);
  const [items, setItems] = useState<ItemRatingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'restaurants' | 'items'>('restaurants');

  const load = useCallback(async () => {
    try {
      const [r, i] = await Promise.all([
        api.get<RestaurantRatingRow[]>('/admin/ratings/restaurants', token),
        api.get<ItemRatingRow[]>('/admin/ratings/items', token),
      ]);
      setRestaurants(r);
      setItems(i);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load ratings.');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-steel-900">Ratings</h1>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Tab switcher */}
      <div className="mb-5 flex gap-2">
        {(['restaurants', 'items'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-turmeric-500/15 text-turmeric-700'
                : 'text-steel-600 hover:bg-steel-100'
            }`}
          >
            {t === 'restaurants' ? 'Restaurants' : 'Food Items'}
          </button>
        ))}
      </div>

      {tab === 'restaurants' && (
        <Panel className="overflow-hidden p-0">
          <DataTable
            rows={restaurants}
            rowKey={(r) => r.restaurantId}
            mobileTitle={(r) => r.restaurantName}
            empty={
              error ? null : (
                <EmptyState
                  title="No restaurant ratings yet"
                  description="Ratings appear here once students rate their delivered orders."
                />
              )
            }
            columns={[
              {
                key: 'name',
                header: 'Restaurant',
                cell: (r) => <span className="font-medium text-steel-800">{r.restaurantName}</span>,
              },
              {
                key: 'avg',
                header: 'Avg. Rating',
                cell: (r) => <Stars value={r.avgRating} />,
              },
              {
                key: 'count',
                header: 'Total Ratings',
                cell: (r) => (
                  <Badge tone={r.ratingCount > 0 ? 'cardamom' : 'neutral'}>{r.ratingCount}</Badge>
                ),
              },
            ]}
          />
        </Panel>
      )}

      {tab === 'items' && (
        <Panel className="overflow-hidden p-0">
          <DataTable
            rows={items}
            rowKey={(r) => r.menuItemId}
            mobileTitle={(r) => r.menuItemName}
            empty={
              error ? null : (
                <EmptyState
                  title="No food item ratings yet"
                  description="Item ratings appear once students rate specific dishes on their orders."
                />
              )
            }
            columns={[
              {
                key: 'item',
                header: 'Food Item',
                cell: (r) => (
                  <>
                    <p className="font-medium text-steel-800">{r.menuItemName}</p>
                    <p className="text-xs text-steel-400">{r.restaurantName}</p>
                  </>
                ),
              },
              {
                key: 'avg',
                header: 'Avg. Rating',
                cell: (r) => <Stars value={r.avgRating} />,
              },
              {
                key: 'count',
                header: 'Total Ratings',
                cell: (r) => (
                  <Badge tone={r.ratingCount > 0 ? 'cardamom' : 'neutral'}>{r.ratingCount}</Badge>
                ),
              },
            ]}
          />
        </Panel>
      )}
    </div>
  );
}
