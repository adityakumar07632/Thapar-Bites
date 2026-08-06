import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeApi {
  /** The user's stored preference. */
  mode: ThemeMode;
  /** The actually-applied appearance (never 'system'). */
  resolvedTheme: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

const STORAGE_KEY = 'cb-theme';
const TRANSITION_CLASS = 'theme-transitioning';
const DARK_CLASS = 'dark';

/**
 * Apply the resolved theme to <html> with a short CSS-transition window so
 * the switch feels smooth without flicker.  Called both from React and from
 * the inline anti-flash script that runs before hydration.
 */
function applyDark(dark: boolean) {
  const root = document.documentElement;
  root.classList.add(TRANSITION_CLASS);
  if (dark) {
    root.classList.add(DARK_CLASS);
  } else {
    root.classList.remove(DARK_CLASS);
  }
  // Remove the transition class after the CSS transitions finish (≈ 250 ms).
  const tid = window.setTimeout(() => root.classList.remove(TRANSITION_CLASS), 300);
  return tid;
}

/** Read OS preference at call-time. */
function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? 'system';
  });

  const [osDark, setOsDark] = useState(systemPrefersDark);

  // Listen for OS preference changes.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setOsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    mode === 'system' ? (osDark ? 'dark' : 'light') : mode;

  // Apply dark class whenever the resolved theme changes.
  useEffect(() => {
    const tid = applyDark(resolvedTheme === 'dark');
    return () => window.clearTimeout(tid);
  }, [resolvedTheme]);

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
  }, []);

  const api = useMemo<ThemeApi>(
    () => ({ mode, resolvedTheme, setMode }),
    [mode, resolvedTheme, setMode],
  );

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
