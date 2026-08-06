const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

export interface ApiSuccess<T> {
  success: true;
  data: T;
}
export interface ApiFailure {
  success: false;
  error: { code: string; message: string };
}

export class ApiRequestError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken(): string | null {
  return authToken;
}

/**
 * Phase 2: the API now rotates refresh tokens, so the access token is
 * short-lived and MUST be refreshed transparently — before, a 2-hour-old tab
 * just started failing every request with AUTH_002 and the student had to
 * guess that a manual re-login was needed.
 *
 * The auth store registers the handlers below rather than this module
 * importing the store, which would be a circular import.
 */
type RefreshHandler = () => Promise<string | null>;
let refreshHandler: RefreshHandler | null = null;
let onAuthLost: (() => void) | null = null;

export function setRefreshHandler(handler: RefreshHandler | null) {
  refreshHandler = handler;
}
export function setAuthLostHandler(handler: (() => void) | null) {
  onAuthLost = handler;
}

/**
 * Concurrent 401s must trigger exactly ONE refresh. Because refresh tokens
 * now rotate, two parallel refreshes would make the second one look like a
 * replay of an already-used token — which the server treats as theft and
 * responds to by killing the whole session. This promise dedupes them.
 */
let inflightRefresh: Promise<string | null> | null = null;

function refreshOnce(): Promise<string | null> {
  if (!refreshHandler) return Promise.resolve(null);
  if (!inflightRefresh) {
    inflightRefresh = refreshHandler().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

async function rawRequest<T>(method: string, path: string, body: unknown, token: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Phase 2 bug fix: a network failure used to reject with a raw TypeError
    // ("Failed to fetch"), which every screen surfaced verbatim.
    throw new ApiRequestError('SYSTEM_002', 'Cannot reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;

  const json = (await res.json().catch(() => ({}))) as ApiSuccess<T> | ApiFailure;

  if (!res.ok || !json.success) {
    const failure = json as ApiFailure;
    throw new ApiRequestError(
      failure.error?.code ?? 'SYSTEM_001',
      failure.error?.message ?? 'Request failed.',
      res.status,
    );
  }
  return json.data;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await rawRequest<T>(method, path, body, authToken);
  } catch (error) {
    const isExpiredAuth =
      error instanceof ApiRequestError && error.status === 401 && !path.startsWith('/auth/');

    if (!isExpiredAuth) throw error;

    const fresh = await refreshOnce();
    if (!fresh) {
      onAuthLost?.();
      throw error;
    }
    return rawRequest<T>(method, path, body, fresh);
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/** Bypasses the interceptor — used by the refresh handler itself so a failing
 * refresh can never recurse into another refresh. */
export function postWithoutAuth<T>(path: string, body?: unknown): Promise<T> {
  return rawRequest<T>('POST', path, body, null);
}
