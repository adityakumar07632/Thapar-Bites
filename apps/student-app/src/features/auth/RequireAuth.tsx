import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store/useAuthStore';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { token, hydrated } = useAuthStore();
  const location = useLocation();

  // Session hydration is a tick, not a network round-trip — a full-screen
  // spinner would flash. Render nothing for that tick instead.
  if (!hydrated) return null;

  // First-time visitors land on the pitch, not a bare login form; anyone
  // deep-linking into an app screen still goes straight to /login.
  if (!token) {
    return <Navigate to={location.pathname === '/' ? '/welcome' : '/login'} replace />;
  }

  return <>{children}</>;
}
