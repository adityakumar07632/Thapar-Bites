import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

export function Modal({
  title,
  description,
  onClose,
  children,
  width = 'max-w-md',
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-steel-900/40 dark:bg-black/60 px-0 backdrop-blur-[2px] sm:items-center sm:px-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'w-full animate-rise rounded-t-card border border-steel-150 bg-white p-6 shadow-lift sm:rounded-card',
          width,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-steel-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-steel-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-steel-400 hover:bg-steel-100"
            aria-label="Close dialog"
          >
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
