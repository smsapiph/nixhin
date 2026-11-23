import { Hono, type Context } from 'hono';
import type { MangaCatalog } from '../catalog.js';
import { HttpError } from '../errors.js';
import { MangaChaptersQuery, MangaIdParams, MangaListParams, MediaPageQuery, MediaSearchQuery, parseInput } from './validation.js';

const MINUTE = 60;

function cachedJson<T>(c: Context, data: T, maxAgeSeconds: number) {
  c.header('Cache-Control', `public, max-age=${maxAgeSeconds}`);
  return c.json(data);
}

/** Manga routes (MangaDex). Without a catalog every manga route answers 404. */
export function mangaRoutes(catalog: MangaCatalog | null): Hono {
  const api = new Hono();

  if (catalog === null) {
    api.get('/manga/*', () => {
      throw new HttpError(404, 'NOT_FOUND', 'Manga is not configured.');
    });
    return api;
  }

  api.get('/manga/list/:list', async (c) => {
    const { list } = parseInput(MangaListParams, c.req.param());
    const { page } = parseInput(MediaPageQuery, c.req.query());
    return cachedJson(c, await catalog.list(list, page), (list === 'latest' ? 5 : 15) * MINUTE);
  });

  api.get('/manga/search', async (c) => {
    const { q, page } = parseInput(MediaSearchQuery, c.req.query());
    return cachedJson(c, await catalog.search(q, page), 5 * MINUTE);
  });

  api.get('/manga/chapter/:id', async (c) => {
    const { id } = parseInput(MangaIdParams, c.req.param());
    // Short: the MangaDex@Home fallback address in it expires after about 15 minutes.
    return cachedJson(c, await catalog.chapter(id), 5 * MINUTE);
  });

  api.get('/manga/:id', async (c) => {
    const { id } = parseInput(MangaIdParams, c.req.param());
    return cachedJson(c, await catalog.manga(id), 30 * MINUTE);
  });

  api.get('/manga/:id/chapters', async (c) => {
    const { id } = parseInput(MangaIdParams, c.req.param());
    const { lang } = parseInput(MangaChaptersQuery, c.req.query());
    return cachedJson(c, await catalog.chapters(id, lang), 10 * MINUTE);
  });

  return api;
}
