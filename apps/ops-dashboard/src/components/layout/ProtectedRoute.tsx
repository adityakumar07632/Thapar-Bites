import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore, type OpsRole } from '@/lib/authStore';
import { Shell } from '@/components/layout/Shell';

export function ProtectedRoute({ role, children }: { role: OpsRole; children: ReactNode }) {
  const { token, role: currentRole } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (currentRole !== role) {
    return <Navigate to={currentRole === 'admin' ? '/admin/dashboard' : '/restaurant/orders'} replace />;
  }
  return <Shell>{children}</Shell>;
}
