import { useNavigate } from 'react-router-dom';
import { NotFoundState, PageTransition } from '@campus-bites/ui';
import { AppShell } from '@/shared/components/layout/AppShell';

/**
 * Catch-all 404 screen. Mounted on a wildcard route in App.tsx.
 * Renders inside AppShell so the layout chrome stays consistent for
 * authenticated users, but the shell has no bottom nav or cart bar.
 */
export function NotFoundScreen() {
  const navigate = useNavigate();

  return (
    <AppShell>
      <PageTransition className="flex min-h-[80dvh] items-center justify-center">
        <NotFoundState
          onHome={() => navigate('/', { replace: true })}
          className="w-full max-w-sm"
        />
      </PageTransition>
    </AppShell>
  );
}
