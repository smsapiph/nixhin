/**
 * Where the browser loads an image from.
 *
 * TMDB images are fetched through this site (`/img/tmdb/...`, a Netlify proxy rule in netlify.toml and a
 * Vite proxy in development) instead of image.tmdb.org directly: some internet providers block that host,
 * which left movie and TV posters blank. Stored URLs (queue, Continue watching) keep the TMDB address and are
 * rewritten here, so entries saved earlier work too. Other hosts pass through unchanged.
 */
const TMDB_IMAGES = 'https://image.tmdb.org/t/p/';
export const TMDB_PROXY_PATH = '/img/tmdb/';
/**
 * MangaDex covers and chapter pages load through this site (`/img/md/*`, a Netlify Function that asks MangaDex with
 * the server's own User-Agent; a Vite proxy in development). uploads.mangadex.org directly is the second try.
 */
const MANGADEX_IMAGES = 'https://uploads.mangadex.org/';
export const MANGADEX_PROXY_PATH = '/img/md/';

export function imageSrc(url: string): string;
export function imageSrc(url: string | null): string | null;
export function imageSrc(url: string | null): string | null {
  if (url?.startsWith(TMDB_IMAGES)) return TMDB_PROXY_PATH + url.slice(TMDB_IMAGES.length);
  if (url?.startsWith(MANGADEX_IMAGES)) return MANGADEX_PROXY_PATH + url.slice(MANGADEX_IMAGES.length);
  return url;
}

/** Addresses to try in order for one image: where `imageSrc` points, then a second route for MangaDex. */
export function imageCandidates(url: string): readonly string[] {
  if (url.startsWith(MANGADEX_IMAGES)) return [imageSrc(url), url];
  return [imageSrc(url)];
}
