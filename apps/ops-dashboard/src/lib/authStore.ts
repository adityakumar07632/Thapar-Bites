import { create } from 'zustand';
import { api, postWithoutAuth, setAccessTokenAccessors } from './api';

export type OpsRole = 'restaurant' | 'admin';
export type AdminRole = 'super_admin' | 'admin';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  role: OpsRole | null;
  name: string | null;
  restaurantId: string | null;
  /** Only set for role === 'admin'; gates the Super-Admin-only screens. */
  adminRole: AdminRole | null;
  login: (input: {
    token: string;
    refreshToken: string;
    role: OpsRole;
    name: string;
    restaurantId?: string | null;
    adminRole?: AdminRole | null;
  }) => void;
  logout: (options?: { allDevices?: boolean }) => Promise<void>;
}

const STORAGE_KEY = 'campus-bites-ops-auth';

type PersistedSession = Omit<AuthState, 'login' | 'logout'>;

function loadPersisted(): Partial<PersistedSession> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistedSession>) : null;
  } catch {
    return null;
  }
}

function persist(session: Partial<PersistedSession>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage blocked — in-memory session still works */
  }
}

function clearPersisted() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const persisted = loadPersisted();

export const useAuthStore = create<AuthState>((set, get) => ({
  token: persisted?.token ?? null,
  refreshToken: persisted?.refreshToken ?? null,
  role: persisted?.role ?? null,
  name: persisted?.name ?? null,
  restaurantId: persisted?.restaurantId ?? null,
  adminRole: persisted?.adminRole ?? null,

  login: ({ token, refreshToken, role, name, restaurantId, adminRole }) => {
    const next = {
      token,
      refreshToken,
      role,
      name,
      restaurantId: restaurantId ?? null,
      adminRole: adminRole ?? null,
    };
    persist(next);
    set(next);
  },

  /**
   * Phase 2: revokes the refresh token server-side. A manager or admin
   * signing out on a shared kitchen tablet previously left a 30-day token
   * behind in that browser's storage history.
   */
  logout: async ({ allDevices = false } = {}) => {
    const { refreshToken } = get();
    try {
      await api.post('/auth/logout', { refreshToken: refreshToken ?? undefined, allDevices });
    } catch {
      /* offline or expired — local clear below is what matters */
    } finally {
      clearPersisted();
      set({ token: null, refreshToken: null, role: null, name: null, restaurantId: null, adminRole: null });
    }
  },
}));

/**
 * Wires the store into the API layer so every request can transparently renew
 * an expired access token. Registered here (rather than api.ts importing the
 * store) to keep the dependency one-directional.
 */
setAccessTokenAccessors({
  getToken: () => useAuthStore.getState().token,

  refresh: async () => {
    const { refreshToken } = useAuthStore.getState();
    if (!refreshToken) return null;
    try {
      // The server rotates on every refresh, so the new refresh token must be
      // stored — replaying the old one is treated as theft and ends the session.
      const data = await postWithoutAuth<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
        refreshToken,
      });
      const state = useAuthStore.getState();
      persist({
        token: data.accessToken,
        refreshToken: data.refreshToken,
        role: state.role,
        name: state.name,
        restaurantId: state.restaurantId,
        adminRole: state.adminRole,
      });
      useAuthStore.setState({ token: data.accessToken, refreshToken: data.refreshToken });
      return data.accessToken;
    } catch {
      return null;
    }
  },

  onAuthLost: () => {
    clearPersisted();
    useAuthStore.setState({
      token: null,
      refreshToken: null,
      role: null,
      name: null,
      restaurantId: null,
      adminRole: null,
    });
  },
});
