import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { HttpError } from '../errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  readonly limit: number;
  readonly windowMs: number;
  readonly keyFor: (c: Context) => string;
  /** Upper bound on tracked clients, so the limiter itself can't exhaust memory. */
  readonly maxKeys?: number;
  readonly now?: () => number;
}

/**
 * Fixed-window, in-memory rate limiter. Fine for a single instance; use a shared
 * store (e.g. Redis) once the API runs on more than one process.
 * Emits the IETF draft `RateLimit-*` headers plus `Retry-After` on rejection.
 */
export function rateLimit({
  limit,
  windowMs,
  keyFor,
  maxKeys = 10_000,
  now = Date.now,
}: RateLimitOptions): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();

  const prune = (time: number) => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= time) buckets.delete(key);
    }
    // Still too many live keys: drop the oldest (Map keeps insertion order).
    for (const key of buckets.keys()) {
      if (buckets.size <= maxKeys) break;
      buckets.delete(key);
    }
  };

  return async (c, next) => {
    const time = now();
    const key = keyFor(c);

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= time) {
      if (buckets.size >= maxKeys) prune(time);
      bucket = { count: 0, resetAt: time + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const resetSeconds = Math.max(0, Math.ceil((bucket.resetAt - time) / 1000));
    c.header('RateLimit-Limit', String(limit));
    c.header('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    c.header('RateLimit-Reset', String(resetSeconds));

    if (bucket.count > limit) {
      c.header('Retry-After', String(resetSeconds));
      throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.');
    }

    await next();
  };
}

/**
 * Resolves the client IP. A platform-provided IP (the Netlify function passes `clientIp` as a
 * binding, out of reach of request input) wins. X-Forwarded-For is only honoured when explicitly
 * trusted, and then only its last hop (the address our single trusted proxy observed).
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  const platformIp: unknown = (c.env as { clientIp?: unknown } | undefined)?.clientIp;
  if (typeof platformIp === 'string' && platformIp) return platformIp;
  if (trustProxy) {
    const forwarded = c.req
      .header('x-forwarded-for')
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1);
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    // No socket info (e.g. in-process tests).
    return 'unknown';
  }
}
