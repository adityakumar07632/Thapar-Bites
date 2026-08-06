import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/authStore';
import { Panel, Badge } from '@/components/ui/Panel';
import { DataTable, EmptyState, ErrorState, SkeletonCards, type Column } from '@campus-bites/ui';

interface AdminStudent {
  id: string;
  fullName: string;
  rollNumber: string;
  hostel: string;
  email: string;
  reliabilityScore: number;
}

const columns: Column<AdminStudent>[] = [
  { key: 'name', header: 'Name', cell: (s) => <span className="font-medium text-steel-800">{s.fullName}</span>, hideOnMobile: true },
  { key: 'roll', header: 'Roll no.', cell: (s) => <span className="text-steel-600">{s.rollNumber}</span> },
  { key: 'hostel', header: 'Hostel', cell: (s) => <span className="text-steel-600">{s.hostel}</span> },
  { key: 'email', header: 'Email', cell: (s) => <span className="break-all text-steel-500">{s.email}</span> },
  {
    key: 'reliability',
    header: 'Reliability',
    cell: (s) => (
      <Badge tone={s.reliabilityScore >= 85 ? 'cardamom' : s.reliabilityScore >= 60 ? 'turmeric' : 'chili'}>
        {s.reliabilityScore}/100
      </Badge>
    ),
  },
];

export function AdminStudentsScreen() {
  const { token } = useAuthStore();
  const [rows, setRows] = useState<AdminStudent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api
      .get<AdminStudent[]>('/admin/students', token)
      .then((data) => {
        setRows(data);
        setLoaded(true);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load students.'),
      );
  };

  useEffect(load, [token]);

  return (
    <div>
      <h1 className="mb-1 font-display text-xl font-bold text-steel-900">Students</h1>
      <p className="mb-6 text-sm text-steel-500">Sorted by reliability score, lowest first.</p>

      {!loaded && !error && <SkeletonCards count={5} height="h-11" />}
      {error && <ErrorState title="Couldn't load students" description={error} onRetry={load} />}

      {loaded && (
        <Panel className="overflow-hidden p-0">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(s) => s.id}
            mobileTitle={(s) => s.fullName}
            empty={<EmptyState title="No students yet" description="Student accounts appear here after sign-up." />}
          />
        </Panel>
      )}
    </div>
  );
}
