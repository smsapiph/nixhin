import { buildCatalog, buildMangaCatalog, buildMediaCatalog } from '../../src/bootstrap.js';
import { loadConfig } from '../../src/config.js';
import { createLogger } from '../../src/logger.js';
import {
  animeMeta,
  injectMeta,
  isCrawler,
  mangaMeta,
  mediaMeta,
  parseAnimeLink,
  parseMangaLink,
  parseMediaLink,
  renderMetaTags,
  type PageMeta,
} from '../../src/seo/pageMeta.js';

/**
 * Serves the SPA shell for `/anime/*`, `/movie/*`, `/tv/*` and `/manga/*`, with per-title link-preview tags for crawlers
 * (e.g. "Watch Black Clover Episode 5" + its banner). Browsers get the page unchanged.
 */

const appConfig = loadConfig({ ...process.env, NODE_ENV: 'production' });
const logger = createLogger('info');
const catalog = buildCatalog(appConfig, logger);
const media = buildMediaCatalog(appConfig, logger);
const manga = buildMangaCatalog(appConfig, logger);

/** Crawlers give up after a few seconds; better default tags than no preview. */
const LOOKUP_TIMEOUT_MS = 4_000;
/** Static-site headers (CSP, nosniff, …) from netlify.toml, carried over to our response. */
const COPIED_HEADERS = [
  'content-security-policy',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
];

interface Shell {
  readonly html: string;
  readonly headers: Headers;
}

/**
 * How long a fetched index.html (and the CSP and other headers copied from it) is reused. A warm instance
 * can outlive a deploy when this function's code is unchanged, so the copy must expire: otherwise a
 * netlify.toml header change (e.g. a new player origin in frame-src) never reaches /anime, /movie and /tv.
 */
const SHELL_TTL_MS = 60_000;

let shell: { readonly value: Promise<Shell>; readonly fetchedAt: number } | null = null;

async function fetchShell(origin: string): Promise<Shell> {
  // A unique query skips cached copies, whose headers can predate the latest deploy.
  const url = new URL('/index.html', origin);
  url.searchParams.set('shell', String(Date.now()));
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`index.html: HTTP ${response.status}`);
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
  for (const name of COPIED_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return { html: await response.text(), headers };
}

/** The built index.html with its static-site headers, refreshed every minute; a failed refresh keeps the last copy. */
function loadShell(origin: string): Promise<Shell> {
  const now = Date.now();
  if (shell && now - shell.fetchedAt < SHELL_TTL_MS) return shell.value;
  const previous = shell?.value;
  const value = fetchShell(origin).catch((error: unknown) => {
    if (previous) return previous;
    shell = null;
    throw error;
  });
  shell = { value, fetchedAt: now };
  return value;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms).unref?.()),
  ]);
}

export default async (request: Request) => {
  const url = new URL(request.url);
  const { html, headers } = await loadShell(url.origin);
  const out = new Headers(headers);
  out.set('Cache-Control', 'public, max-age=0, must-revalidate');
  out.set('Vary', 'User-Agent');

  if (!isCrawler(request.headers.get('user-agent'))) return new Response(html, { headers: out });

  try {
    const meta = await pageMeta(url);
    if (!meta) return new Response(html, { headers: out });
    return new Response(injectMeta(html, renderMetaTags(meta)), { headers: out });
  } catch (error) {
    // Unknown id, upstream down or slow: fall back to the site-wide preview.
    logger.info('page meta fallback', { path: url.pathname, error: error instanceof Error ? error.message : String(error) });
    return new Response(html, { headers: out });
  }
};

/** Link-preview tags for an anime, movie or TV page; null for other paths. */
async function pageMeta(url: URL): Promise<PageMeta | null> {
  const siteUrl = (process.env.URL ?? url.origin).replace(/\/+$/, '');
  const animeLink = parseAnimeLink(url);
  if (animeLink) return animeMeta(await withTimeout(catalog.anime(animeLink.id), LOOKUP_TIMEOUT_MS), animeLink, siteUrl);
  const mediaLink = parseMediaLink(url);
  if (mediaLink && media) {
    const detail = await withTimeout(
      mediaLink.kind === 'movie' ? media.movie(mediaLink.id) : media.tv(mediaLink.id),
      LOOKUP_TIMEOUT_MS,
    );
    return mediaMeta(detail, mediaLink, siteUrl);
  }
  const mangaLink = parseMangaLink(url);
  if (mangaLink && manga) {
    // The chapter number is a nice-to-have: without it the preview is for the series.
    const [detail, chapter] = await Promise.all([
      withTimeout(manga.manga(mangaLink.id), LOOKUP_TIMEOUT_MS),
      mangaLink.chapterId
        ? withTimeout(manga.chapter(mangaLink.chapterId), LOOKUP_TIMEOUT_MS).catch(() => null)
        : Promise.resolve(null),
    ]);
    const number = chapter && chapter.mangaId === detail.id ? chapter.chapter : null;
    return mangaMeta(detail, mangaLink, number, siteUrl);
  }
  return null;
}

export const config = { path: ['/anime/*', '/movie/*', '/tv/*', '/manga/*'] };
