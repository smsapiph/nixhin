import { Hono, type Context } from 'hono';
import type { AnimeCatalog } from '../catalog.js';
import type { EmbedStreams } from '../stream/embed.js';
import { EpisodesQuery, IdParams, PageQuery, SearchQuery, StreamQuery, TopQuery, parseInput } from './validation.js';

const MINUTE = 60;

/** JSON response that browsers and CDNs may cache briefly; data changes slowly. */
function cachedJson<T>(c: Context, data: T, maxAgeSeconds: number) {
  c.header('Cache-Control', `public, max-age=${maxAgeSeconds}`);
  return c.json(data);
}

/** Read-only API routes. Every input is validated before it reaches the catalog. */
export function apiRoutes(catalog: AnimeCatalog, streams: EmbedStreams): Hono {
  const api = new Hono();

  api.get('/anime/top', async (c) => {
    const { filter, limit } = parseInput(TopQuery, c.req.query());
    return cachedJson(c, await catalog.top(filter, limit), 5 * MINUTE);
  });

  api.get('/anime/season-now', async (c) => {
    const { page, limit } = parseInput(PageQuery, c.req.query());
    return cachedJson(c, await catalog.seasonNow(page, limit), 5 * MINUTE);
  });

  api.get('/anime/search', async (c) => {
    const { q, genre, page, limit } = parseInput(SearchQuery, c.req.query());
    const result = await catalog.search({
      page,
      limit,
      ...(q !== undefined && { query: q }),
      ...(genre !== undefined && { genre }),
    });
    return cachedJson(c, result, 5 * MINUTE);
  });

  api.get('/anime/:id', async (c) => {
    const { id } = parseInput(IdParams, c.req.param());
    return cachedJson(c, await catalog.anime(id), 30 * MINUTE);
  });

  api.get('/anime/:id/episodes', async (c) => {
    const { id } = parseInput(IdParams, c.req.param());
    const { page } = parseInput(EpisodesQuery, c.req.query());
    return cachedJson(c, await catalog.episodes(id, page), 30 * MINUTE);
  });

  api.get('/anime/:id/recommendations', async (c) => {
    const { id } = parseInput(IdParams, c.req.param());
    return cachedJson(c, await catalog.recommendations(id), 30 * MINUTE);
  });

  api.get('/anime/:id/seasons', async (c) => {
    const { id } = parseInput(IdParams, c.req.param());
    return cachedJson(c, await catalog.seasons(id), 60 * MINUTE);
  });

  api.get('/stream/config', (c) => cachedJson(c, streams.config(), 5 * MINUTE));

  api.get('/anime/:id/stream', async (c) => {
    const { id } = parseInput(IdParams, c.req.param());
    const { episode, language } = parseInput(StreamQuery, c.req.query());
    // Fail fast (404) before hitting AniList when playback is not configured.
    streams.assertEnabled();
    const source = streams.source(await catalog.anime(id), episode, language);
    c.header('Cache-Control', 'private, max-age=300');
    return c.json(source);
  });

  api.get('/genres', async (c) => cachedJson(c, await catalog.genres(), 60 * MINUTE));

  api.get('/schedule', async (c) => cachedJson(c, await catalog.schedule(), 15 * MINUTE));

  return api;
}
