import { useCallback, useEffect, useState } from 'react';
import { ImageOff, Leaf, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel, Badge } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Field';
import { formatINR } from '@/lib/utils';
import { MenuItemModal, type MenuItem } from '@/features/restaurant/MenuItemModal';

interface MenuCategory {
  id: string;
  name: string;
}

export function RestaurantMenuScreen() {
  const { token } = useAuthStore();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuItem | null | 'new'>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ categories: MenuCategory[]; items: MenuItem[] }>('/restaurant/menu', token);
      setCategories(data.categories);
      setItems(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load menu.');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  function categoryName(categoryId: string) {
    return categories.find((c) => c.id === categoryId)?.name ?? '';
  }

  async function toggleAvailable(item: MenuItem) {
    setBusyId(item.id);
    try {
      await api.patch(`/restaurant/menu/items/${item.id}`, { available: !item.available }, token);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(item: MenuItem) {
    if (!confirm(`Delete "${item.name}" from the menu?`)) return;
    setBusyId(item.id);
    try {
      await api.del(`/restaurant/menu/items/${item.id}`, token);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  const categoryNames = categories.map((c) => c.name);
  const grouped = categories.map((c) => ({ category: c, items: items.filter((i) => i.categoryId === c.id) }));
  const uncategorized = items.filter((i) => !categories.some((c) => c.id === i.categoryId));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-steel-900">Menu</h1>
          <p className="text-sm text-steel-500">Manage items, prices, categories, images and stock status.</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus size={15} /> Add menu item
        </Button>
      </div>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {items.length === 0 && !error && (
        <Panel className="flex flex-col items-center gap-2 px-6 py-16 text-center">
          <p className="font-display text-sm font-semibold text-steel-700">No menu items yet</p>
          <p className="text-xs text-steel-400">Add your first item to start taking orders.</p>
        </Panel>
      )}

      <div className="flex flex-col gap-6">
        {[...grouped, ...(uncategorized.length ? [{ category: null, items: uncategorized }] : [])].map(
          (group, gi) =>
            group.items.length > 0 && (
              <div key={group.category?.id ?? `uncat-${gi}`}>
                <p className="mb-2.5 font-display text-[13px] font-semibold uppercase tracking-wide text-steel-400">
                  {group.category?.name ?? 'Uncategorized'}
                </p>
                <div className="flex flex-col gap-2.5">
                  {group.items.map((item) => (
                    <Panel key={item.id} className="flex items-center gap-3.5 p-3.5">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-steel-100">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff size={18} className="text-steel-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-steel-900">{item.name}</p>
                          {item.isVeg && <Leaf size={12} className="shrink-0 text-cardamom-600" />}
                        </div>
                        <p className="truncate text-xs text-steel-500">{item.description}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="font-display text-sm font-semibold text-steel-800">
                            {formatINR(item.price)}
                          </span>
                          <Badge tone={item.available ? 'cardamom' : 'chili'}>
                            {item.available ? 'Available' : 'Out of stock'}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          variant="secondary"
                          disabled={busyId === item.id}
                          onClick={() => toggleAvailable(item)}
                        >
                          {item.available ? 'Mark out of stock' : 'Mark available'}
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busyId === item.id}
                          onClick={() => setEditing({ ...item, categoryName: categoryName(item.categoryId) })}
                          aria-label="Edit item"
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          variant="danger"
                          disabled={busyId === item.id}
                          onClick={() => removeItem(item)}
                          aria-label="Delete item"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </Panel>
                  ))}
                </div>
              </div>
            ),
        )}
      </div>

      {editing && (
        <MenuItemModal
          item={editing === 'new' ? null : editing}
          categoryNames={categoryNames}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
