import { session } from './session';
import type { RefreshResponse } from './types';

export const API_BASE_URL: string =
  import.meta.env?.VITE_API_BASE_URL ?? 'https://swasth-be.onrender.com/api/v1';
export const GYM_CODE: string = import.meta.env?.VITE_GYM_CODE ?? 'swasth-koramangala';

interface ErrorEnvelope {
  success: false;
  statusCode?: number;
  message?: string;
  errors?: string[];
  path?: string;
  timestamp?: string;
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

/**
 * An error response from the API. `message` is written by the backend to be
 * shown to staff verbatim — never replace it with a generic string.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly errors?: string[];
  readonly path?: string;

  constructor(message: string, statusCode: number, errors?: string[], path?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.path = path;
  }

  /** True when the browser never got a response (offline, DNS, cold-start abort). */
  get isNetwork(): boolean {
    return this.statusCode === 0;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Attach the bearer token, refreshing on 401. Default true. */
  auth?: boolean;
  /** Send X-Gym-Code. Default true — required on essentially everything. */
  gym?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      // Omit empty values entirely — the API is strict about what it receives.
      if (value === undefined || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseEnvelope<T>(response: Response, path: string): Promise<T> {
  const text = await response.text();

  let payload: SuccessEnvelope<T> | ErrorEnvelope | null = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const err = (payload ?? {}) as ErrorEnvelope;
    throw new ApiError(
      err.message ?? `Request failed with status ${response.status}`,
      err.statusCode ?? response.status,
      err.errors,
      err.path ?? path,
    );
  }

  // 204 No Content (e.g. logout) has no envelope to unwrap.
  if (response.status === 204 || payload === null) return undefined as T;

  return (payload as SuccessEnvelope<T>).data;
}

// ------------------------------------------------------- single-flight refresh

/**
 * Refresh tokens rotate on every use and reuse kills the whole session, so all
 * concurrent 401s must queue behind one refresh call.
 */
let refreshInFlight: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = session.get()?.refreshToken;
  if (!refreshToken) return Promise.reject(new ApiError('Your session has expired.', 401));

  refreshInFlight = (async () => {
    // No gym header and no auth on this endpoint.
    const response = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await parseEnvelope<RefreshResponse>(response, '/auth/refresh');
    session.setTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  })();

  refreshInFlight
    .catch(() => {
      // A failed refresh means the session is unrecoverable.
      session.clear();
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

// --------------------------------------------------------------------- request

async function send<T>(path: string, options: RequestOptions, accessToken?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.gym !== false) headers['X-Gym-Code'] = GYM_CODE;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    // Deliberately no timeout: a cold Render dyno can take 30–60s to answer.
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      0,
      undefined,
      path,
    );
  }

  return parseEnvelope<T>(response, path);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const useAuth = options.auth !== false;
  const accessToken = useAuth ? session.get()?.accessToken : undefined;

  try {
    return await send<T>(path, options, accessToken);
  } catch (error) {
    const canRetry =
      useAuth &&
      error instanceof ApiError &&
      error.statusCode === 401 &&
      Boolean(session.get()?.refreshToken);

    if (!canRetry) throw error;

    // Refresh once, then replay the original request with the new token.
    const fresh = await refreshAccessToken();
    return send<T>(path, options, fresh);
  }
}
