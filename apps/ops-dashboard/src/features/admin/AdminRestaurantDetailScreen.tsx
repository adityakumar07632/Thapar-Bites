import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, Power, PowerOff, Save, Trash2 } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel, Badge } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, Select, Alert } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PaymentSettingsPanel } from '@/features/payments/PaymentSettingsPanel';

interface RestaurantDetail {
  id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  minimumOrder: number;
  sharedDeliveryMinimum: number;
  status: 'open' | 'busy' | 'closed';
  contactNumber: string | null;
  email: string | null;
  location: string | null;
  openingTime: string | null;
  closingTime: string | null;
  deliveryFee: number;
  isActive: boolean;
  deletedAt: string | null;
  manager: { fullName: string; email: string } | null;
}

export function AdminRestaurantDetailScreen() {
  const { id = '' } = useParams();
  const { token } = useAuthStore();

  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetResult, setResetResult] = useState<{ managerEmail: string; tempPassword: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<RestaurantDetail>(`/admin/restaurants/${id}`, token);
      setRestaurant(data);
      setForm({
        name: data.name,
        description: data.description ?? '',
        contactNumber: data.contactNumber ?? '',
        email: data.email ?? '',
        location: data.location ?? '',
        openingTime: data.openingTime ?? '',
        closingTime: data.closingTime ?? '',
        deliveryFee: String(data.deliveryFee),
        minimumOrder: String(data.minimumOrder),
        sharedDeliveryMinimum: String(data.sharedDeliveryMinimum),
        status: data.status,
      });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load restaurant.');
    }
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const data = await api.patch<RestaurantDetail>(
        `/admin/restaurants/${id}`,
        {
          name: form.name,
          description: form.description,
          contactNumber: form.contactNumber,
          email: form.email,
          openingTime: form.openingTime,
          closingTime: form.closingTime,
          deliveryFee: Number(form.deliveryFee),
          minimumOrder: Number(form.minimumOrder),
          sharedDeliveryMinimum: Number(form.sharedDeliveryMinimum),
          status: form.status,
        },
        token,
      );
      setRestaurant((r) => (r ? { ...r, ...data } : data));
      setSuccess('Changes saved.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!restaurant) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/restaurants/${id}/${restaurant.isActive ? 'disable' : 'enable'}`, undefined, token);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function softDelete() {
    if (!restaurant) return;
    if (!confirm(`Soft delete "${restaurant.name}"? This can't be undone from this screen.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/admin/restaurants/${id}`, token);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{ managerEmail: string; tempPassword: string }>(
        `/admin/restaurants/${id}/reset-password`,
        undefined,
        token,
      );
      setResetResult(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reset password.');
    } finally {
      setBusy(false);
    }
  }

  if (!restaurant) {
    return (
      <div>
        <Link to="/admin/restaurants" className="mb-4 inline-flex items-center gap-1.5 text-sm text-steel-500">
          <ArrowLeft size={14} /> Back to restaurants
        </Link>
        {error ? <Alert>{error}</Alert> : <p className="text-sm text-steel-400">Loading…</p>}
      </div>
    );
  }

  return (
    <div>
      <Link to="/admin/restaurants" className="mb-4 inline-flex items-center gap-1.5 text-sm text-steel-500 hover:text-steel-700">
        <ArrowLeft size={14} /> Back to restaurants
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-bold text-steel-900">{restaurant.name}</h1>
            {restaurant.deletedAt ? (
              <Badge tone="chili">Deleted</Badge>
            ) : (
              <Badge tone={restaurant.isActive ? 'cardamom' : 'chili'}>
                {restaurant.isActive ? 'Active' : 'Disabled'}
              </Badge>
            )}
          </div>
          {restaurant.manager && (
            <p className="mt-1 text-sm text-steel-500">
              Manager: {restaurant.manager.fullName} ({restaurant.manager.email})
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={busy || !!restaurant.deletedAt} onClick={toggleActive}>
            {restaurant.isActive ? <PowerOff size={15} /> : <Power size={15} />}
            {restaurant.isActive ? 'Disable' : 'Enable'}
          </Button>
          <Button variant="secondary" disabled={busy || !restaurant.manager} onClick={resetPassword}>
            <KeyRound size={15} /> Reset manager password
          </Button>
          <Button variant="danger" disabled={busy || !!restaurant.deletedAt} onClick={softDelete}>
            <Trash2 size={15} /> Delete
          </Button>
        </div>
      </div>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {success && <div className="mb-4"><Alert tone="success">{success}</Alert></div>}

      <Panel className="p-6">
        <form onSubmit={handleSave} className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Restaurant name">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="open">Open</option>
                <option value="busy">Busy</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact number">
              <Input value={form.contactNumber} onChange={(e) => set('contactNumber', e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
          </div>
          <Field label="Location">
            <Input value={form.location} disabled />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opening time">
              <Input type="time" value={form.openingTime} onChange={(e) => set('openingTime', e.target.value)} />
            </Field>
            <Field label="Closing time">
              <Input type="time" value={form.closingTime} onChange={(e) => set('closingTime', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Individual min. (₹)">
              <Input type="number" min={1} value={form.minimumOrder} onChange={(e) => set('minimumOrder', e.target.value)} />
            </Field>
            <Field label="Shared min. (₹)">
              <Input
                type="number"
                min={1}
                value={form.sharedDeliveryMinimum}
                onChange={(e) => set('sharedDeliveryMinimum', e.target.value)}
              />
            </Field>
            <Field label="Delivery fee (₹)">
              <Input type="number" min={0} value={form.deliveryFee} onChange={(e) => set('deliveryFee', e.target.value)} />
            </Field>
          </div>

          <div className="mt-1 flex justify-end">
            <Button type="submit" disabled={saving}>
              <Save size={15} /> {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Panel>

      {/* Phase 6C — admin view/edit of this restaurant's payout details. */}
      <div className="mt-6">
        <PaymentSettingsPanel
          basePath={`/admin/restaurants/${id}/payment-settings`}
          canToggle
          heading="Payment settings"
          subheading="This restaurant's payout account — used by Thapar Bites to transfer order amounts. Not shown to students."
        />
      </div>


      {resetResult && (
        <Modal title="Password reset" onClose={() => setResetResult(null)}>
          <Alert tone="success">A new temporary password was generated for {resetResult.managerEmail}.</Alert>
          <div className="mt-4 rounded-lg bg-steel-100 px-3.5 py-3 text-sm">
            <p className="text-steel-500">Temporary password</p>
            <p className="mt-1 font-mono font-semibold text-steel-900">{resetResult.tempPassword}</p>
            <p className="mt-2 text-xs text-steel-400">Share this with the restaurant manager securely.</p>
          </div>
          <Button className="mt-5 w-full justify-center" onClick={() => setResetResult(null)}>
            Done
          </Button>
        </Modal>
      )}
    </div>
  );
}
