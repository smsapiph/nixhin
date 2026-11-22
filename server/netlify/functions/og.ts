import { buildCatalog } from '../../src/bootstrap.js';
import { loadConfig } from '../../src/config.js';
import { createLogger } from '../../src/logger.js';
import { cardContent, renderCard, type CardFonts } from '../../src/seo/ogCard.js';
import { parseCardLink } from '../../src/seo/pageMeta.js';

/**
 * Branded share card for an anime link: GET /og/anime/:id.png?ep=&lang=  →  1200×630 PNG.
 * Only crawlers request it (it is referenced from og:image), and Netlify's CDN keeps the result,
 * so each card is normally rendered once.
 */

const appConfig = loadConfig({ ...process.env, NODE_ENV: 'production' });
const logger = createLogger('info');
const catalog = buildCatalog(appConfig, logger);

const LOOKUP_TIMEOUT_MS = 4_000;
const IMAGE_TIMEOUT_MS = 4_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

let fonts: Promise<CardFonts> | null = null;

/** Fonts are static files of this site (public/og-fonts), fetched once per instance. */
function loadFonts(origin: string): Promise<CardFonts> {
  const get = async (path: string) => {
    const response = await fetch(new URL(path, origin));
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.arrayBuffer();
  };
  fonts ??= Promise.all([get('/og-fonts/shippori-mincho-700.ttf'), get('/og-fonts/zen-kaku-gothic-new-500.ttf')])
    .then(([serif, sans]) => ({ serif, sans }))
    .catch((error: unknown) => {
      fonts = null;
      throw error;
    });
  return fonts;
}

/** Downloads an AniList image (hosts already validated by the catalog) as a data URI; null on any problem. */
async function imageData(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!response.ok || !IMAGE_TYPES.has(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms).unref?.()),
  ]);
}

/** The site-wide image, for unknown ids or failures. Short cache so a transient failure heals. */
function fallback(origin: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: new URL('/og-image.png', origin).toString(), 'Cache-Control': 'public, max-age=300' },
  });
}

export default async (request: Request) => {
  const url = new URL(request.url);
  const link = parseCardLink(url);
  if (!link) return fallback(url.origin);

  try {
    const [anime, cardFonts] = await Promise.all([
      withTimeout(catalog.anime(link.id), LOOKUP_TIMEOUT_MS),
      loadFonts(url.origin),
    ]);
    const [banner, poster] = await Promise.all([
      imageData(anime.bannerUrl),
      imageData(anime.imageUrlLarge ?? anime.imageUrl),
    ]);
    const png = await renderCard(cardContent(anime, link), { banner, poster }, cardFonts);
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        // Netlify's CDN keeps the render for a week (shared across edges), refreshing in the background after that.
        'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=604800, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logger.info('og card fallback', { id: link.id, error: error instanceof Error ? error.message : String(error) });
    return fallback(url.origin);
  }
};

export const config = { path: '/og/anime/*' };
