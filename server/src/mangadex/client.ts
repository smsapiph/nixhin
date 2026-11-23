import { UpstreamError } from '../errors.js';
import { QueueFullError, type RequestScheduler } from '../lib/requestScheduler.js';
import type { TtlCache } from '../lib/ttlCache.js';

/** Query values; arrays repeat the key (`includes[]=a&includes[]=b`), as MangaDex expects. */
export type Params = Readonly<Record<string, string | number | boolean | readonly string[] | undefined>>;

interface MangaDexClientOptions {
  /** e.g. https://api.mangadex.org */
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly scheduler: RequestScheduler;
  readonly cache: TtlCache<unknown>;
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly maxRetries?: number;
}

/**
 * MangaDex asks API clients to send their own User-Agent and blocks ones that pretend to be a browser.
 * https://api.mangadex.org/docs/2-limitations/
 */
const USER_AGENT = 'nixhin-server/0.1';
const MAX_RETRY_DELAY_MS = 10_000;
/** Paths are built from fixed strings and validated UUIDs only. */
const SAFE_PATH = /^\/[a-z0-9_/-]+$/;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Small REST client for the MangaDex API, with the same guarantees as the TMDB client:
 * fixed paths (user input only travels as encoded query values), a TTL cache shared by identical
 * in-flight requests, the upstream throttle, and retries on 429/5xx. No key is needed to read.
 */
export class MangaDexClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly scheduler: RequestScheduler;
  private readonly cache: TtlCache<unknown>;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(options: MangaDexClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs;
    this.scheduler = options.scheduler;
    this.cache = options.cache;
    this.fetchFn = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxRetries = options.maxRetries ?? 2;
  }

  /** GETs `path` and returns the parsed JSON body (unvalidated — callers must parse it). */
  async get(path: string, params: Params, ttlMs: number): Promise<unknown> {
    if (!SAFE_PATH.test(path)) throw new Error(`Unsafe MangaDex path: ${path}`);
    const url = new URL(`${this.baseUrl}${path}`);
    for (const key of Object.keys(params).sort()) {
      const value = params[key];
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value as readonly string[]) url.searchParams.append(key, item);
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    const key = url.toString();

    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.execute(url)
      .then((data) => {
        this.cache.set(key, data, ttlMs);
        return data;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  private async execute(url: URL): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      const response = await this.send(url);
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await response.body?.cancel();
        await this.sleep(this.retryDelay(response, attempt));
        continue;
      }
      if (response.ok) {
        try {
          return (await response.json()) as unknown;
        } catch (cause) {
          throw new UpstreamError('bad_response', 'MangaDex returned invalid JSON', { cause });
        }
      }
      if (response.status === 400) {
        // MangaDex says which parameter it rejected; keep that for the server log (never shown to readers).
        const detail = await errorDetail(response);
        throw new UpstreamError('bad_request', `MangaDex rejected ${url.pathname}${url.search} (HTTP 400): ${detail}`);
      }
      await response.body?.cancel();
      if (response.status === 404) throw new UpstreamError('not_found', 'MangaDex resource not found');
      // 403: MangaDex (or its CDN) refused this server, e.g. a temporary block. Nothing the reader can fix.
      if (retryable || response.status === 403) {
        throw new UpstreamError('unavailable', `MangaDex unavailable (HTTP ${response.status})`);
      }
      throw new UpstreamError('bad_response', `Unexpected MangaDex response (HTTP ${response.status})`);
    }
  }

  private retryDelay(response: Response, attempt: number): number {
    const retryAfter = Number(response.headers.get('retry-after'));
    const hinted = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
    return Math.min(hinted, MAX_RETRY_DELAY_MS);
  }

  private async send(url: URL): Promise<Response> {
    try {
      return await this.scheduler.schedule(() =>
        this.fetchFn(url, {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(this.timeoutMs),
        }),
      );
    } catch (cause) {
      const message = cause instanceof QueueFullError ? 'Upstream queue full' : 'MangaDex request failed';
      throw new UpstreamError('unavailable', message, { cause });
    }
  }
}

/** The `detail` lines of a MangaDex error body (`{ result: "error", errors: [{ detail }] }`), shortened. */
async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errors?: { detail?: unknown; context?: unknown }[] };
    const details = (body.errors ?? []).map((error) => [error.detail, error.context].filter((part) => typeof part === 'string').join(' '));
    return details.filter(Boolean).join('; ').slice(0, 500) || 'no detail';
  } catch {
    return 'no detail';
  }
}
