import { UpstreamError } from '../errors.js';
import { QueueFullError, type RequestScheduler } from '../lib/requestScheduler.js';
import type { TtlCache } from '../lib/ttlCache.js';

export type Variables = Readonly<Record<string, string | number | boolean | null | readonly string[] | undefined>>;

interface AniListClientOptions {
  readonly endpoint: string;
  readonly timeoutMs: number;
  readonly scheduler: RequestScheduler;
  readonly cache: TtlCache<unknown>;
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly maxRetries?: number;
}

const USER_AGENT = 'nixhin-server/0.1';
/** Never wait longer than this for a Retry-After hint. */
const MAX_RETRY_DELAY_MS = 10_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface GraphQLEnvelope {
  readonly data?: unknown;
  readonly errors?: readonly { readonly message?: string; readonly status?: number }[];
}

function isEnvelope(value: unknown): value is GraphQLEnvelope {
  return typeof value === 'object' && value !== null && ('data' in value || 'errors' in value);
}

/**
 * Defensive GraphQL client for AniList:
 * - queries are fixed strings; user input only ever travels as GraphQL variables
 *   (so there is no query injection),
 * - results are cached (TTL) and identical in-flight requests are shared,
 * - every call goes through the rate-limit scheduler,
 * - 429 / 5xx are retried (honouring Retry-After), everything else maps to an UpstreamError.
 */
export class AniListClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly scheduler: RequestScheduler;
  private readonly cache: TtlCache<unknown>;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(options: AniListClientOptions) {
    this.endpoint = options.endpoint;
    this.timeoutMs = options.timeoutMs;
    this.scheduler = options.scheduler;
    this.cache = options.cache;
    this.fetchFn = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxRetries = options.maxRetries ?? 2;
  }

  /**
   * Runs a query and returns its `data` object (unvalidated — callers must parse it).
   * `operation` is a short stable name used, with the variables, as the cache key.
   */
  async query(operation: string, query: string, variables: Variables, ttlMs: number): Promise<unknown> {
    const key = `${operation}:${JSON.stringify(variables, Object.keys(variables).sort())}`;

    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.execute(query, variables)
      .then((data) => {
        this.cache.set(key, data, ttlMs);
        return data;
      })
      .finally(() => this.inFlight.delete(key));

    this.inFlight.set(key, request);
    return request;
  }

  private async execute(query: string, variables: Variables): Promise<unknown> {
    const body = JSON.stringify({ query, variables });

    for (let attempt = 0; ; attempt += 1) {
      const response = await this.send(body);
      const retryable = response.status === 429 || response.status >= 500;

      if (retryable && attempt < this.maxRetries) {
        await response.body?.cancel();
        await this.sleep(this.retryDelay(response, attempt));
        continue;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (cause) {
        if (retryable) throw new UpstreamError('unavailable', `Upstream unavailable (HTTP ${response.status})`);
        throw new UpstreamError('bad_response', 'Upstream returned invalid JSON', { cause });
      }

      if (!isEnvelope(payload)) throw new UpstreamError('bad_response', 'Unexpected GraphQL envelope');

      const errorStatus = payload.errors?.[0]?.status ?? response.status;
      if (response.ok && payload.data !== undefined && payload.data !== null) return payload.data;

      if (errorStatus === 404) throw new UpstreamError('not_found', 'Upstream resource not found');
      if (errorStatus === 400) {
        throw new UpstreamError('bad_request', `Upstream rejected the query: ${payload.errors?.[0]?.message ?? ''}`);
      }
      if (errorStatus === 429 || errorStatus >= 500) {
        throw new UpstreamError('unavailable', `Upstream unavailable (HTTP ${errorStatus})`);
      }
      throw new UpstreamError('bad_response', `Unexpected upstream response (HTTP ${response.status})`);
    }
  }

  private retryDelay(response: Response, attempt: number): number {
    const retryAfter = Number(response.headers.get('retry-after'));
    const hinted = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
    return Math.min(hinted, MAX_RETRY_DELAY_MS);
  }

  private async send(body: string): Promise<Response> {
    try {
      return await this.scheduler.schedule(() =>
        this.fetchFn(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
          },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        }),
      );
    } catch (cause) {
      const message = cause instanceof QueueFullError ? 'Upstream queue full' : 'Upstream request failed';
      throw new UpstreamError('unavailable', message, { cause });
    }
  }
}
