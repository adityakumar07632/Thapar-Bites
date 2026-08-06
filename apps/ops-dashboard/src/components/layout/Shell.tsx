import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Store,
  Users,
  ScrollText,
  LogOut,
  Users2,
  UtensilsCrossed,
  BookOpen,
  Menu,
  X,
  Wallet,
  BadgeIndianRupee,
  RotateCcw,
  Settings,
  Star,
  Monitor,
  Moon,
  Sun,
  ShieldCheck,
} from 'lucide-react';
import { useTheme, ErrorBoundary } from '@campus-bites/ui';
import type { ThemeMode } from '@campus-bites/ui';
import { useAuthStore } from '@/lib/authStore';
import { cn } from '@/lib/utils';

const RESTAURANT_NAV = [
  { to: '/restaurant/orders', label: 'Orders', icon: ClipboardList },
  { to: '/restaurant/menu', label: 'Menu', icon: BookOpen },
  { to: '/restaurant/payment-settings', label: 'Payment settings', icon: Wallet },
];

const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { to: '/admin/payments', label: 'Payments', icon: Wallet },
  { to: '/admin/payouts', label: 'Restaurant Payouts', icon: BadgeIndianRupee },
  { to: '/admin/refunds', label: 'Refunds', icon: RotateCcw },
  { to: '/admin/shared-delivery', label: 'Shared Delivery', icon: Users2 },
  { to: '/admin/restaurants', label: 'Restaurants', icon: Store },
  { to: '/admin/students', label: 'Students', icon: Users },
  { to: '/admin/platform-payment-settings', label: 'Platform Payment', icon: Settings },
  { to: '/admin/ratings', label: 'Ratings', icon: Star },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

/** Admin Management is a Super-Admin-only destination. */
const SUPER_ADMIN_NAV = [{ to: '/admin/admins', label: 'Admins', icon: ShieldCheck }];

const THEME_CYCLE: { mode: ThemeMode; Icon: typeof Sun; label: string }[] = [
  { mode: 'light',  Icon: Sun,     label: 'Light mode'   },
  { mode: 'dark',   Icon: Moon,    label: 'Dark mode'    },
  { mode: 'system', Icon: Monitor, label: 'System theme' },
];

function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const current = THEME_CYCLE.find((t) => t.mode === mode) ?? THEME_CYCLE[0];
  const { Icon, label } = current;

  function cycle() {
    const idx = THEME_CYCLE.findIndex((t) => t.mode === mode);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setMode(next.mode);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-steel-500 hover:bg-steel-100 transition-colors"
      title={label}
      aria-label={`Current: ${label}. Click to change appearance`}
    >
      <Icon size={16} aria-hidden />
      {label}
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { role, name, adminRole, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const nav =
    role === 'admin'
      ? adminRole === 'super_admin'
        ? [...ADMIN_NAV, ...SUPER_ADMIN_NAV]
        : ADMIN_NAV
      : RESTAURANT_NAV;

  // The dashboard is used on phones during service — the sidebar collapses
  // into a drawer there, and closes itself whenever navigation happens.
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const sidebar = (
    <>
      <div className="flex items-center gap-2 px-2 pb-6 pt-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-steel-900 text-turmeric-400">
          <UtensilsCrossed size={16} />
        </span>
        <span className="font-display text-base font-bold text-steel-900">Thapar Bites Ops</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1" aria-label="Main navigation">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-turmeric-500/15 text-turmeric-700' : 'text-steel-600 hover:bg-steel-100',
              )
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-steel-150 pt-3 flex flex-col gap-1">
        <p className="truncate px-3 text-xs text-steel-400">Signed in as</p>
        <p className="truncate px-3 pb-1 text-sm font-medium text-steel-800">{name}</p>

        {/* Theme toggle */}
        <ThemeToggle />

        <button
          onClick={() => {
            void logout().finally(() => navigate('/login'));
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-steel-500 hover:bg-steel-100 transition-colors"
        >
          <LogOut size={16} /> Log out
        </button>

        <p className="px-3 pt-2 text-[11px] leading-relaxed text-steel-400">
          Thapar Bites
          <br />
          Version 1.0.1
        </p>
      </div>
    </>
  );

  return (
    <div className="flex min-h-dvh bg-steel-100">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-steel-150 bg-white p-4 lg:flex">
        {sidebar}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-steel-900/40 dark:bg-black/60"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="animate-slide-in-left absolute inset-y-0 left-0 flex w-64 flex-col border-r border-steel-150 bg-white p-4">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-steel-150 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setDrawerOpen((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-steel-600 hover:bg-steel-100"
            aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className="font-display text-sm font-bold text-steel-900">Thapar Bites Ops</span>
        </header>

        <main className="flex-1 overflow-y-auto scroll-quiet">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <ErrorBoundary label="Ops dashboard page">{children}</ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
