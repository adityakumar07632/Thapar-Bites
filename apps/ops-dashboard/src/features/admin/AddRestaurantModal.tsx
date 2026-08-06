import { useState, type FormEvent } from 'react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea, Alert } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

interface CreatedResult {
  restaurant: { id: string; name: string };
  manager: { fullName: string; email: string; tempPassword: string };
}

export function AddRestaurantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { token } = useAuthStore();
  const [form, setForm] = useState({
    name: '',
    category: '',
    description: '',
    contactNumber: '',
    email: '',
    location: '',
    openingTime: '09:00',
    closingTime: '22:00',
    minimumOrder: '100',
    sharedDeliveryMinimum: '60',
    deliveryFee: '20',
    managerName: '',
    managerEmail: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreatedResult | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.post<CreatedResult>(
        '/admin/restaurants',
        {
          ...form,
          minimumOrder: Number(form.minimumOrder),
          sharedDeliveryMinimum: Number(form.sharedDeliveryMinimum),
          deliveryFee: Number(form.deliveryFee),
        },
        token,
      );
      setResult(data);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create restaurant.');
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <Modal title="Restaurant created" onClose={onClose}>
        <Alert tone="success">
          <span className="font-semibold">{result.restaurant.name}</span> was created successfully.
        </Alert>
        <div className="mt-4 rounded-lg bg-steel-100 px-3.5 py-3 text-sm">
          <p className="text-steel-500">Manager login</p>
          <p className="mt-1 font-medium text-steel-800">{result.manager.email}</p>
          <p className="text-steel-500">Temporary password</p>
          <p className="mt-1 font-mono font-semibold text-steel-900">{result.manager.tempPassword}</p>
          <p className="mt-2 text-xs text-steel-400">Share this with the restaurant manager securely.</p>
        </div>
        <Button className="mt-5 w-full justify-center" onClick={onClose}>
          Done
        </Button>
      </Modal>
    );
  }

  return (
    <Modal title="Add restaurant" onClose={onClose} width="max-w-lg">
      <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Restaurant name">
            <Input required value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Category / cuisine">
            <Input required value={form.category} onChange={(e) => set('category', e.target.value)} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea required rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact number">
            <Input required value={form.contactNumber} onChange={(e) => set('contactNumber', e.target.value)} />
          </Field>
          <Field label="Restaurant email">
            <Input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>
        <Field label="Location">
          <Input required value={form.location} onChange={(e) => set('location', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opening time">
            <Input required type="time" value={form.openingTime} onChange={(e) => set('openingTime', e.target.value)} />
          </Field>
          <Field label="Closing time">
            <Input required type="time" value={form.closingTime} onChange={(e) => set('closingTime', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Individual min. (₹)">
            <Input required type="number" min={1} value={form.minimumOrder} onChange={(e) => set('minimumOrder', e.target.value)} />
          </Field>
          <Field label="Shared min. (₹)">
            <Input
              required
              type="number"
              min={1}
              value={form.sharedDeliveryMinimum}
              onChange={(e) => set('sharedDeliveryMinimum', e.target.value)}
            />
          </Field>
          <Field label="Delivery fee (₹)">
            <Input required type="number" min={0} value={form.deliveryFee} onChange={(e) => set('deliveryFee', e.target.value)} />
          </Field>
        </div>
        <div className="mt-1 border-t border-steel-100 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-400">Restaurant manager account</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Manager name">
              <Input required value={form.managerName} onChange={(e) => set('managerName', e.target.value)} />
            </Field>
            <Field label="Manager email">
              <Input required type="email" value={form.managerEmail} onChange={(e) => set('managerEmail', e.target.value)} />
            </Field>
          </div>
          <p className="mt-1.5 text-xs text-steel-400">A temporary password will be generated automatically.</p>
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create restaurant'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
