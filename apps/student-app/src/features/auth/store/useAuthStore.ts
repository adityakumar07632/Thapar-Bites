import { create } from 'zustand';
import {
  setAuthToken,
  setRefreshHandler,
  setAuthLostHandler,
  postWithoutAuth,
  api,
} from '@/shared/lib/api';

export interface StudentProfile {
  id: string;
  fullName: string;
  rollNumber: string;
  email: string;
  phone: string | null;
  hostel: string;
  roomNumber: string | null;
  reliabilityScore: number;
  avatarUrl?: string | null;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  student: StudentProfile | null;
  hydrated: boolean;
  login: (tokens: SessionTokens, student: StudentProfile) => void;
  logout: (options?: { allDevices?: boolean }) => Promise<void>;
  setHydrated: () => void;
  updateStudent: (student: StudentProfile) => void;
}

const STORAGE_KEY = 'campus-bites-student-auth';

interface PersistedSession {
  token: string | null;
  refreshToken: string | null;
  student: StudentProfile | null;
}

function persist(session: PersistedSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // storage full or blocked (private mode) — the in-memory session still works
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  student: null,
  hydrated: false,

  login: ({ accessToken, refreshToken }, student) => {
    persist({ token: accessToken, refreshToken, student });
    setAuthToken(accessToken);
    set({ token: accessToken, refreshToken, student });
  },

  /**
   * Phase 2: logout now tells the server to revoke the refresh token. Before,
   * it only cleared localStorage, so a token copied off the device stayed
   * valid for its full 30-day life even after the student "signed out".
   *
   * The local session is cleared regardless of whether the network call
   * succeeds — a user who taps "log out" must always end up logged out.
   */
  logout: async ({ allDevices = false } = {}) => {
    const { refreshToken } = get();
    try {
      await api.post('/auth/logout', { refreshToken: refreshToken ?? undefined, allDevices });
    } catch {
      // offline or already-expired token — nothing more we can do client-side
    } finally {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setAuthToken(null);
      set({ token: null, refreshToken: null, student: null });
    }
  },

  setHydrated: () => set({ hydrated: true }),

  updateStudent: (student) => {
    set((state) => {
      if (state.token) {
        persist({ token: state.token, refreshToken: state.refreshToken, student });
      }
      return { student };
    });
  },
}));

/**
 * Silent access-token renewal. The server rotates the refresh token on every
 * call, so the NEW one must be stored — reusing the old one is treated as
 * token theft and kills the session family.
 */
setRefreshHandler(async () => {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    const data = await postWithoutAuth<SessionTokens>('/auth/refresh', { refreshToken });
    const student = useAuthStore.getState().student;
    persist({ token: data.accessToken, refreshToken: data.refreshToken, student });
    setAuthToken(data.accessToken);
    useAuthStore.setState({ token: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken;
  } catch {
    return null;
  }
});

// Refresh failed or was revoked server-side: drop the dead session so route
// guards send the student to /login instead of looping on 401s.
setAuthLostHandler(() => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  setAuthToken(null);
  useAuthStore.setState({ token: null, refreshToken: null, student: null });
});

// Restore a saved session on load, once, outside the React tree.
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const saved = JSON.parse(raw) as Partial<PersistedSession>;
    // Sessions saved before Phase 2 have no refreshToken. They stay usable
    // until the access token expires, then refresh returns null and the
    // student is asked to sign in once.
    if (saved.token && saved.student) {
      setAuthToken(saved.token);
      useAuthStore.setState({
        token: saved.token,
        refreshToken: saved.refreshToken ?? null,
        student: saved.student,
      });
    }
  }
} catch {
  // corrupt/missing storage — just start logged out
}
useAuthStore.getState().setHydrated();
