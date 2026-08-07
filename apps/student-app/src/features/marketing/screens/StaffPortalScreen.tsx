import { Link } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, ShieldCheck, UtensilsCrossed } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store/useAuthStore';

/** URL of the Ops Dashboard (restaurant & admin login). Configurable via env so
 * it works in both local dev and any hosted deployment without code changes. */
const OPS_URL =
  import.meta.env.VITE_OPS_URL ??
  "https://campus-bitesops-dashboard-production.up.railway.app";

const CARDS = [
  {
    role: 'restaurant',
    icon: BookOpen,
    title: 'Restaurant Manager',
    description:
      'Manage your menu, track incoming orders in real time, update kitchen status, and configure payment settings.',
    accent: 'border-turmeric-200 hover:border-turmeric-400',
    iconBg: 'bg-turmeric-500/15 text-turmeric-700',
    badge: 'bg-turmeric-500/10 text-turmeric-700',
    badgeLabel: 'Restaurant',
  },
  {
    role: 'admin',
    icon: ShieldCheck,
    title: 'Administrator',
    description:
      'Oversee the entire platform — restaurants, students, orders, payments, payouts, refunds, and shared-delivery queues.',
    accent: 'border-steel-200 hover:border-steel-400',
    iconBg: 'bg-steel-800/10 text-steel-700',
    badge: 'bg-steel-100 text-steel-600',
    badgeLabel: 'Admin',
  },
] as const;

export function StaffPortalScreen() {
  const { token, hydrated } = useAuthStore();

  // Logged-in students are sent to the student dashboard; restaurant/admin
  // users are in the ops-dashboard app, not here, so no conflict.
  if (hydrated && token) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-dvh flex-col bg-steel-50">
      {/* Header */}
      <header className="border-b border-steel-150 bg-steel-50/90 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-5 py-3.5">
          <Link
            to="/welcome"
            className="flex items-center gap-1.5 text-sm font-medium text-steel-500 hover:text-steel-800 transition-colors"
          >
            <ArrowLeft size={15} />
            Back
          </Link>
          <div className="flex items-center gap-2 ml-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-steel-900 text-turmeric-400">
              <UtensilsCrossed size={13} />
            </span>
            <span className="font-display text-sm font-bold text-steel-900">Thapar Bites</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-14">
        <div className="w-full max-w-xl">
          {/* Title */}
          <div className="mb-8 text-center">
            <p className="font-display text-2xl font-bold text-steel-900 sm:text-3xl">
              Staff Portal
            </p>
            <p className="mt-2 text-sm text-steel-500">
              Choose your role to continue to the Ops Dashboard.
            </p>
          </div>

          {/* Role cards */}
          <div className="flex flex-col gap-4 sm:flex-row">
            {CARDS.map(({ role, icon: Icon, title, description, accent, iconBg, badge, badgeLabel }) => (
              <a
                key={role}
                href={OPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex flex-1 flex-col rounded-2xl border-2 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${accent}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                    <Icon size={20} />
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${badge}`}>
                    {badgeLabel}
                  </span>
                </div>
                <p className="mt-4 font-display text-base font-bold text-steel-900">{title}</p>
                <p className="mt-1.5 flex-1 text-[13px] leading-snug text-steel-500">{description}</p>
                <p className="mt-4 text-xs font-semibold text-turmeric-700 group-hover:text-turmeric-800 transition-colors">
                  Sign in to Ops Dashboard →
                </p>
              </a>
            ))}
          </div>

          {/* Student account link */}
          <p className="mt-8 text-center text-sm text-steel-400">
            Student?{' '}
            <Link to="/login" className="font-medium text-turmeric-700 hover:text-turmeric-800">
              Sign in to the student app
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
