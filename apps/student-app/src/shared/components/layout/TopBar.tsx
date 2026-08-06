import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface TopBarProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  right?: ReactNode;
}

export function TopBar({ title, subtitle, onBack, showBack = true, right }: TopBarProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 bg-steel-50/95 backdrop-blur px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] border-b border-steel-150">
      {showBack ? (
        <button
          type="button"
          onClick={() => (onBack ? onBack() : navigate(-1))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-steel-100 text-steel-700 active:bg-steel-200"
          aria-label="Go back"
        >
          <ChevronLeft size={20} />
        </button>
      ) : (
        <div className="w-9 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[17px] font-semibold text-steel-900">{title}</h1>
        {subtitle && <p className="truncate text-xs text-steel-500">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
