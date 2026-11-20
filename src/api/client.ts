import type { ApiErrorBody, ApiErrorCode } from '../../shared/api';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '');

export type ClientErrorCode = ApiErrorCode | 'NETWORK_ERROR' | 'UNKNOWN';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;

  constructor(status: number, code: ClientErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** Network blips and server-side outages may succeed on retry; client errors (incl. 429) won't. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value;
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    'code' in error &&
    typeof error.code === 'string'
  );
}

export type QueryParams = Readonly<Record<string, string | number | undefined>>;

/**
 * GET a JSON resource from the Nixhin API. Responses are typed by the shared
 * contract in `shared/api.ts`; the backend is responsible for validating them.
 */
export async function apiGet<T>(path: string, params: QueryParams = {}, signal?: AbortSignal): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection.');
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    if (isApiErrorBody(body)) {
      throw new ApiError(response.status, body.error.code, body.error.message);
    }
    throw new ApiError(response.status, 'UNKNOWN', `Request failed (HTTP ${response.status}).`);
  }

  return (await response.json()) as T;
}
