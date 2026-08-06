import { useState, type FormEvent } from 'react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea, Alert } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName?: string;
  price: number;
  available: boolean;
  isVeg: boolean;
  imageUrl: string | null;
  prepTimeMinutes: number | null;
}

export function MenuItemModal({
  item,
  categoryNames,
  onClose,
  onSaved,
}: {
  item: MenuItem | null;
  categoryNames: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useAuthStore();
  const [form, setForm] = useState({
    name: item?.name ?? '',
    description: item?.description ?? '',
    categoryName: item?.categoryName ?? categoryNames[0] ?? '',
    price: item ? String(item.price) : '',
    imageUrl: item?.imageUrl ?? '',
    prepTimeMinutes: item?.prepTimeMinutes ? String(item.prepTimeMinutes) : '',
    isVeg: item?.isVeg ?? true,
    available: item?.available ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description,
      categoryName: form.categoryName,
      price: Number(form.price),
      imageUrl: form.imageUrl,
      prepTimeMinutes: form.prepTimeMinutes ? Number(form.prepTimeMinutes) : null,
      isVeg: form.isVeg,
      available: form.available,
    };
    try {
      if (item) {
        await api.patch(`/restaurant/menu/items/${item.id}`, payload, token);
      } else {
        await api.post('/restaurant/menu/items', payload, token);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save menu item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={item ? 'Edit menu item' : 'Add menu item'} onClose={onClose} width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <Field label="Item name">
          <Input required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Input
              required
              list="category-suggestions"
              value={form.categoryName}
              onChange={(e) => set('categoryName', e.target.value)}
              placeholder="e.g. Starters"
            />
          </Field>
          <Field label="Price (₹)">
            <Input required type="number" min={1} value={form.price} onChange={(e) => set('price', e.target.value)} />
          </Field>
        </div>
        <datalist id="category-suggestions">
          {categoryNames.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Field label="Image URL">
          <Input
            type="url"
            placeholder="https://…"
            value={form.imageUrl}
            onChange={(e) => set('imageUrl', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prep time (minutes)">
            <Input
              type="number"
              min={1}
              max={180}
              value={form.prepTimeMinutes}
              onChange={(e) => set('prepTimeMinutes', e.target.value)}
            />
          </Field>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm text-steel-700">
              <input type="checkbox" checked={form.isVeg} onChange={(e) => set('isVeg', e.target.checked)} />
              Vegetarian
            </label>
            <label className="flex items-center gap-2 text-sm text-steel-700">
              <input type="checkbox" checked={form.available} onChange={(e) => set('available', e.target.checked)} />
              Available (uncheck for Out of Stock)
            </label>
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : item ? 'Save changes' : 'Add item'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
