import type { ReactNode } from 'react';
import { ErrorBoundary } from '@campus-bites/ui';

interface AppShellProps {
  children: ReactNode;
  bottomNav?: ReactNode;
  stickyBottom?: ReactNode;
}

/**
 * A phone-width column, centered on wider viewports. Thapar Bites is built for the
 * moment between classes when someone is standing in a hostel corridor with
 * one hand on their phone — everything here assumes that context first.
 */
export function AppShell({ children, bottomNav, stickyBottom }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-steel-150 flex justify-center">
      <div className="relative flex w-full max-w-[440px] min-h-dvh flex-col bg-steel-50">
        <main className="flex-1 overflow-y-auto scroll-quiet pb-4">
          <ErrorBoundary label="Student app screen">{children}</ErrorBoundary>
        </main>
        {stickyBottom}
        {bottomNav}
      </div>
    </div>
  );
}
