import { proxyMangaImage } from '../../src/mangadex/imageProxy.js';

/**
 * MangaDex covers and chapter pages: GET /img/md/covers/… and /img/md/data/… (see src/mangadex/imageProxy.ts).
 * Netlify's CDN keeps each image after the first request, so most never reach this function.
 */
export default (request: Request) => proxyMangaImage(request);

export const config = { path: '/img/md/*' };
