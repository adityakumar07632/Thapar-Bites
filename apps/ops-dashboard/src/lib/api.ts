const BASE_URL =
  import.meta.env.VITE_API_URL ??
  "https://campus-bitesapi-production.up.railway.app/api/v1";

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
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

/**
 * Phase 2: access tokens are short-lived and refresh tokens rotate, so the API
 * layer has to renew silently. The auth store registers these accessors so
 * this module never imports the store (which would be circular).
 *
 * Callers may still pass a token explicitly — every existing call site does —
 * but it is no longer required: when omitted we read the live token from the
 * store, which is always the freshest one after a refresh.
 */
interface TokenAccessors {
  getToken: () => string | null;
  refresh: () => Promise<string | null>;
  onAuthLost: () => void;
}

let accessors: TokenAccessors | null = null;

export function setAccessTokenAccessors(next: TokenAccessors) {
  accessors = next;
}

/**
 * Concurrent 401s must produce exactly ONE refresh — two parallel rotations
 * would make the second look like a replayed token.
 */
let inflightRefresh: Promise<string | null> | null = null;

function refreshOnce(): Promise<string | null> {
  if (!accessors) return Promise.resolve(null);

  if (!inflightRefresh) {
    inflightRefresh = accessors.refresh().finally(() => {
      inflightRefresh = null;
    });
  }

  return inflightRefresh;
}

async function rawRequest<T>(
  method: string,
  path: string,
  {
    token,
    body,
  }: {
    token?: string | null;
    body?: unknown;
  } = {},
): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiRequestError(
      "SYSTEM_002",
      "Cannot reach the server. Check your connection and try again.",
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const json = (await res.json().catch(() => ({}))) as
    | ApiSuccess<T>
    | ApiFailure;

  if (!res.ok || !json.success) {
    const failure = json as ApiFailure;

    throw new ApiRequestError(
      failure.error?.code ?? "SYSTEM_001",
      failure.error?.message ?? "Request failed.",
      res.status,
    );
  }

  return (json as ApiSuccess<T>).data;
}

async function request<T>(
  method: string,
  path: string,
  options: {
    token?: string | null;
    body?: unknown;
  } = {},
): Promise<T> {
  const token = options.token ?? accessors?.getToken() ?? null;

  try {
    return await rawRequest<T>(method, path, {
      ...options,
      token,
    });
  } catch (error) {
    const isExpiredAuth =
      error instanceof ApiRequestError &&
      error.status === 401 &&
      !path.startsWith("/auth/");

    if (!isExpiredAuth) throw error;

    const fresh = await refreshOnce();

    if (!fresh) {
      accessors?.onAuthLost();
      throw error;
    }

    return rawRequest<T>(method, path, {
      ...options,
      token: fresh,
    });
  }
}

export const api = {
  get: (path: string, token?: string | null) =>
    request("GET", path, { token }),

  post: (path: string, body?: unknown, token?: string | null) =>
    request("POST", path, { token, body }),

  put: (path: string, body?: unknown, token?: string | null) =>
    request("PUT", path, { token, body }),

  patch: (path: string, body?: unknown, token?: string | null) =>
    request("PATCH", path, { token, body }),

  del: (path: string, token?: string | null) =>
    request("DELETE", path, { token }),
};

/**
 * Bypasses the interceptor so a failing refresh can't recurse into another.
 */
export function postWithoutAuth<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  return rawRequest<T>("POST", path, { body });
}