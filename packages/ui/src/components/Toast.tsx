import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '../lib/cn';

export type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  toast: (message: string, options?: { tone?: ToastTone; action?: Toast['action'] }) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLES: Record<ToastTone, { className: string; icon: ReactNode }> = {
  success: {
    className: 'border-cardamom-500/30 bg-white text-steel-800',
    icon: <CircleCheck size={16} className="text-cardamom-500" />,
  },
  error: {
    className: 'border-chili-500/30 bg-white text-steel-800',
    icon: <TriangleAlert size={16} className="text-chili-600" />,
  },
  info: {
    className: 'border-steel-200 bg-white text-steel-800',
    icon: <Info size={16} className="text-turmeric-600" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback<ToastApi['toast']>(
    (message, options) => {
      const id = nextId.current++;
      setToasts((current) => [
        ...current.slice(-2),
        { id, message, tone: options?.tone ?? 'info', action: options?.action },
      ]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), 5000),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (message: string) => toast(message, { tone: 'success' }),
      error: (message: string) => toast(message, { tone: 'error' }),
      dismiss,
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
        aria-live="polite"
        role="status"
      >
        {toasts.map((item) => {
          const tone = TONE_STYLES[item.tone];
          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-lift',
                tone.className,
              )}
            >
              <span className="mt-0.5 shrink-0">{tone.icon}</span>
              <p className="flex-1 text-[13px] leading-snug">{item.message}</p>
              {item.action && (
                <button
                  type="button"
                  onClick={() => {
                    item.action?.onClick();
                    dismiss(item.id);
                  }}
                  className="shrink-0 text-[13px] font-semibold text-turmeric-700 hover:underline dark:text-turmeric-400"
                >
                  {item.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="shrink-0 rounded-full p-0.5 text-steel-400 hover:bg-steel-100"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a <ToastProvider>');
  return context;
}
