import { buildCatalog, buildMediaCatalog } from '../../src/bootstrap.js';
import { loadConfig } from '../../src/config.js';
import { createLogger } from '../../src/logger.js';
import { CARD_FONT_FILES, cardContent, mediaCardContent, renderCard, type CardContent, type CardFonts } from '../../src/seo/ogCard.js';
import { parseCardLink, parseMediaCardLink } from '../../src/seo/pageMeta.js';

/**
 * Branded share card: GET /og/anime/:id.jpg?ep=&lang=, /og/movie/:id.jpg or /og/tv/:id.jpg?s=&ep=
 *  →  1200×630 JPEG.
 * Only crawlers request it (it is referenced from og:image), and Netlify's CDN keeps the result,
 * so each card is normally rendered once.
 */

const appConfig = loadConfig({ ...process.env, NODE_ENV: 'production' });
const logger = createLogger('info');
const catalog = buildCatalog(appConfig, logger);
const media = buildMediaCatalog(appConfig, logger);

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
  const file = (key: keyof CardFonts) => get(`/og-fonts/${CARD_FONT_FILES[key]}`);
  fonts ??= Promise.all([file('serif'), file('sans'), file('serifLatin'), file('sansLatin')])
    .then(([serif, sans, serifLatin, sansLatin]) => ({ serif, sans, serifLatin, sansLatin }))
    .catch((error: unknown) => {
      fonts = null;
      throw error;
    });
  return fonts;
}

/** Downloads an AniList or TMDB image (hosts already validated by the catalogs) as a data URI; null on any problem. */
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

interface CardSource {
  readonly content: CardContent;
  readonly banner: string | null;
  readonly poster: string | null;
}

/** What to draw for this URL, or null when it is not a card URL we serve. */
async function cardSource(url: URL): Promise<CardSource | null> {
  const animeLink = parseCardLink(url);
  if (animeLink) {
    const anime = await withTimeout(catalog.anime(animeLink.id), LOOKUP_TIMEOUT_MS);
    return { content: cardContent(anime, animeLink), banner: anime.bannerUrl, poster: anime.imageUrlLarge ?? anime.imageUrl };
  }
  const mediaLink = parseMediaCardLink(url);
  if (mediaLink && media) {
    const detail = await withTimeout(
      mediaLink.kind === 'movie' ? media.movie(mediaLink.id) : media.tv(mediaLink.id),
      LOOKUP_TIMEOUT_MS,
    );
    return { content: mediaCardContent(detail, mediaLink), banner: detail.backdropUrl, poster: detail.imageUrlLarge ?? detail.imageUrl };
  }
  return null;
}

export default async (request: Request) => {
  const url = new URL(request.url);
  try {
    const [source, cardFonts] = await Promise.all([cardSource(url), loadFonts(url.origin)]);
    if (!source) return fallback(url.origin);
    const [banner, poster] = await Promise.all([imageData(source.banner), imageData(source.poster)]);
    const card = await renderCard(source.content, { banner, poster }, cardFonts);
    return new Response(card, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        // Netlify's CDN keeps the render for a week (shared across edges), refreshing in the background after that.
        'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=604800, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logger.info('og card fallback', { path: url.pathname, error: error instanceof Error ? error.message : String(error) });
    return fallback(url.origin);
  }
};

export const config = { path: ['/og/anime/*', '/og/movie/*', '/og/tv/*'] };
