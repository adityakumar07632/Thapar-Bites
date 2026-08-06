import { NavLink } from 'react-router-dom';
import { Heart, Home, Package, User, Wallet } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/favorites', label: 'Favourites', icon: Heart, end: false },
  { to: '/orders', label: 'Orders', icon: Package, end: false },
  { to: '/payments', label: 'Payments', icon: Wallet, end: false },
  { to: '/profile', label: 'Profile', icon: User, end: false },
];

export function BottomNav() {
  return (
    <nav
      className="sticky bottom-0 z-20 flex border-t border-steel-200 bg-steel-50/95 backdrop-blur px-2 pb-[env(safe-area-inset-bottom)]"
      aria-label="Main navigation"
    >
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors duration-150',
              isActive ? 'text-turmeric-600' : 'text-steel-400 hover:text-steel-600',
            )
          }
          aria-label={label}
        >
          {({ isActive }) => (
            <>
              {/* Active pip */}
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-turmeric-500"
                  aria-hidden
                />
              )}
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} aria-hidden />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
