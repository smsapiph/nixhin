import { UPLOADS_ORIGIN } from './mappers.js';

/**
 * `/img/md/*`: MangaDex covers and chapter pages, fetched by this site's server.
 *
 * A plain Netlify proxy rule passes on the reader's browser User-Agent, and MangaDex refuses browser User-Agents
 * that arrive from Netlify's servers (HTTP 302/403), so covers stayed blank. This sends the server's own
 * User-Agent instead, which MangaDex accepts. Only cover and page image paths are allowed through.
 */

export const IMAGE_PROXY_PREFIX = '/img/md/';
const USER_AGENT = 'nixhin-server/0.1';
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FILE = '[A-Za-z0-9._-]{1,200}';
/** covers/{mangaId}/{file}, data/{hash}/{file} or data-saver/{hash}/{file}. */
const ALLOWED = new RegExp(`^(?:covers/${UUID}/${FILE}|data(?:-saver)?/[0-9a-f]{16,64}/${FILE})$`);

/** The uploads.mangadex.org URL for a `/img/md/…` path, or null if it is not a cover or page image. */
export function upstreamImageUrl(pathname: string): string | null {
  if (!pathname.startsWith(IMAGE_PROXY_PREFIX)) return null;
  const rest = pathname.slice(IMAGE_PROXY_PREFIX.length);
  if (rest.includes('..') || !ALLOWED.test(rest)) return null;
  return `${UPLOADS_ORIGIN}/${rest}`;
}

function plain(status: number, message: string, maxAge = 60): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge}` },
  });
}

/** Handles one image request. `fetchFn` is injectable for tests. */
export async function proxyMangaImage(request: Request, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return plain(405, 'Method not allowed');
  const upstream = upstreamImageUrl(new URL(request.url).pathname);
  if (!upstream) return plain(404, 'Not found', 3600);

  let response: Response;
  try {
    response = await fetchFn(upstream, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return plain(502, 'Image unavailable', 10);
  }

  const type = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
  const length = Number(response.headers.get('content-length') ?? '0');
  if (!response.ok || !IMAGE_TYPES.has(type) || length > MAX_BYTES) {
    await response.body?.cancel();
    return plain(response.status === 404 ? 404 : 502, 'Image unavailable', response.status === 404 ? 3600 : 10);
  }

  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: 200,
    headers: {
      'Content-Type': type,
      ...(length > 0 && { 'Content-Length': String(length) }),
      // Covers and pages never change at a given address: let browsers and Netlify's CDN keep them.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Netlify-CDN-Cache-Control': 'public, durable, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
