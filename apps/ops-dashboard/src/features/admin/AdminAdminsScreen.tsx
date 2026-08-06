import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel, Badge } from '@/components/ui/Panel';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Alert } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { DataTable, EmptyState, ErrorState, SkeletonCards, type Column } from '@campus-bites/ui';

interface AdminAccount {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: 'super_admin' | 'admin';
  status: 'active' | 'disabled';
  createdAt: string;
}

interface CreatedAdmin {
  admin: AdminAccount;
  temporaryPassword: string;
}

/**
 * Admin Management — visible only to the Super Admin. Regular admins never
 * reach this screen, and the API enforces the same rule independently.
 */
export function AdminAdminsScreen() {
  const { token, adminRole } = useAuthStore();
  const [rows, setRows] = useState<AdminAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [credential, setCredential] = useState<CreatedAdmin | null>(null);

  const isSuperAdmin = adminRole === 'super_admin';

  const load = () => {
    if (!isSuperAdmin) return;
    setError(null);
    api
      .get<AdminAccount[]>('/admin/admins', token)
      .then((data) => {
        setRows(data);
        setLoaded(true);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load administrators.'),
      );
  };

  useEffect(load, [token, isSuperAdmin]);

  async function run(fn: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
      load();
    } catch (cause) {
      setActionError(cause instanceof ApiRequestError ? cause.message : 'That action could not be completed.');
    }
  }

  if (!isSuperAdmin) {
    return (
      <div>
        <h1 className="mb-1 font-display text-xl font-bold text-steel-900">Admins</h1>
        <EmptyState
          title="Super Admin only"
          description="Only the Super Admin can view and manage administrator accounts."
        />
      </div>
    );
  }

  const columns: Column<AdminAccount>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (a) => <span className="font-medium text-steel-800">{a.fullName}</span>,
    },
    { key: 'email', header: 'Email', cell: (a) => <span className="break-all text-steel-500">{a.email}</span> },
    { key: 'phone', header: 'Phone', cell: (a) => <span className="text-steel-600">{a.phone || '—'}</span>, hideOnMobile: true },
    {
      key: 'role',
      header: 'Role',
      cell: (a) => (
        <Badge tone={a.role === 'super_admin' ? 'turmeric' : 'neutral'}>
          {a.role === 'super_admin' ? 'Super Admin' : 'Admin'}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (a) => (
        <Badge tone={a.status === 'active' ? 'cardamom' : 'chili'}>
          {a.status === 'active' ? 'Active' : 'Disabled'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (a) =>
        a.role === 'super_admin' ? (
          <span className="text-xs text-steel-400">—</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="secondary"
              onClick={() =>
                run(async () => {
                  const data = await api.post<CreatedAdmin>(`/admin/admins/${a.id}/reset-password`, {}, token);
                  setCredential(data);
                })
              }
            >
              Reset password
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                run(() =>
                  api.patch(`/admin/admins/${a.id}/${a.status === 'active' ? 'disable' : 'enable'}`, {}, token),
                )
              }
            >
              {a.status === 'active' ? 'Disable' : 'Enable'}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!window.confirm(`Delete the admin account for ${a.fullName}? This cannot be undone.`)) return;
                run(() => api.del(`/admin/admins/${a.id}`, token));
              }}
            >
              Delete
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 font-display text-xl font-bold text-steel-900">Admins</h1>
          <p className="text-sm text-steel-500">
            Create, disable, and remove administrator accounts. Only the Super Admin can manage this list.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>Create admin</Button>
      </div>

      {actionError && (
        <div className="mb-4">
          <Alert tone="error">{actionError}</Alert>
        </div>
      )}

      {!loaded && !error && <SkeletonCards count={3} height="h-11" />}
      {error && <ErrorState title="Couldn't load administrators" description={error} onRetry={load} />}

      {loaded && (
        <Panel className="overflow-hidden p-0">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(a) => a.id}
            mobileTitle={(a) => a.fullName}
            empty={<EmptyState title="No administrators yet" description="Create the first admin account." />}
          />
        </Panel>
      )}

      {showCreate && (
        <CreateAdminModal
          onClose={() => setShowCreate(false)}
          onCreated={(result) => {
            setShowCreate(false);
            setCredential(result);
            load();
          }}
        />
      )}

      {credential && (
        <Modal title="Temporary password" onClose={() => setCredential(null)}>
          <Alert tone="success">
            <span className="font-semibold">{credential.admin.fullName}</span> can now sign in with this one-time
            password.
          </Alert>
          <div className="mt-4 rounded-lg bg-steel-100 px-3.5 py-3 text-sm">
            <p className="text-steel-500">Email</p>
            <p className="mt-1 font-medium text-steel-800">{credential.admin.email}</p>
            <p className="mt-2 text-steel-500">Temporary password</p>
            <p className="mt-1 font-mono font-semibold text-steel-900">{credential.temporaryPassword}</p>
            <p className="mt-2 text-xs text-steel-400">
              Share it securely — it is shown once and should be changed after the first sign-in.
            </p>
          </div>
          <Button className="mt-5 w-full justify-center" onClick={() => setCredential(null)}>
            Done
          </Button>
        </Modal>
      )}
    </div>
  );
}

function CreateAdminModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: CreatedAdmin) => void;
}) {
  const { token } = useAuthStore();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', role: 'admin', temporaryPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload: Record<string, string> = {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        role: form.role,
      };
      if (form.temporaryPassword.trim()) payload.temporaryPassword = form.temporaryPassword.trim();
      const data = await api.post<CreatedAdmin>('/admin/admins', payload, token);
      onCreated(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create the admin account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Create admin" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Full name">
          <Input required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>
        <Field label="Email">
          <Input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone number">
          <Input required value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Role">
          <Select value={form.role} onChange={(e) => set('role', e.target.value)}>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </Select>
        </Field>
        <Field label="Temporary password (leave blank to generate one)">
          <Input
            value={form.temporaryPassword}
            onChange={(e) => set('temporaryPassword', e.target.value)}
            placeholder="Auto-generated"
          />
        </Field>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create admin'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
