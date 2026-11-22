import { Hono, type Context } from 'hono';
import type { MediaConfig } from '../../../shared/api.js';
import type { MediaCatalog } from '../catalog.js';
import { HttpError } from '../errors.js';
import type { MediaEmbedStreams } from '../stream/mediaEmbed.js';
import {
  DiscoverQuery,
  IdParams,
  MediaPageQuery,
  MediaSearchQuery,
  MovieListParams,
  SeasonParams,
  TvListParams,
  TvStreamQuery,
  parseInput,
} from './validation.js';

const MINUTE = 60;

function cachedJson<T>(c: Context, data: T, maxAgeSeconds: number) {
  c.header('Cache-Control', `public, max-age=${maxAgeSeconds}`);
  return c.json(data);
}

/** Movie and TV routes. Without a catalog (no TMDB token) only `/media/config` answers. */
export function mediaRoutes(catalog: MediaCatalog | null, streams: MediaEmbedStreams): Hono {
  const api = new Hono();

  api.get('/media/config', (c) => {
    const config: MediaConfig = {
      enabled: catalog !== null,
      moviePlayback: catalog !== null && streams.moviePlayback,
      tvPlayback: catalog !== null && streams.tvPlayback,
    };
    return cachedJson(c, config, 5 * MINUTE);
  });

  if (catalog === null) {
    const off = () => {
      throw new HttpError(404, 'NOT_FOUND', 'Movies and TV shows are not configured.');
    };
    api.get('/movie/*', off);
    api.get('/tv/*', off);
    return api;
  }

  for (const kind of ['movie', 'tv'] as const) {
    api.get(`/${kind}/genres`, async (c) => cachedJson(c, await catalog.genres(kind), 60 * MINUTE));

    api.get(`/${kind}/discover`, async (c) => {
      const { genre, page } = parseInput(DiscoverQuery, c.req.query());
      return cachedJson(c, await catalog.discover(kind, genre, page), 30 * MINUTE);
    });

    api.get(`/${kind}/search`, async (c) => {
      const { q, page } = parseInput(MediaSearchQuery, c.req.query());
      return cachedJson(c, await catalog.search(kind, q, page), 5 * MINUTE);
    });
  }

  api.get('/movie/list/:list', async (c) => {
    const { list } = parseInput(MovieListParams, c.req.param());
    const { page } = parseInput(MediaPageQuery, c.req.query());
    return cachedJson(c, await catalog.movieList(list, page), 15 * MINUTE);
  });

  api.get('/tv/list/:list', async (c) => {
    const { list } = parseInput(TvListParams, c.req.param());
    const { page } = parseInput(MediaPageQuery, c.req.query());
    return cachedJson(c, await catalog.tvList(list, page), 15 * MINUTE);
  });

  api.get('/movie/collection/:id', async (c) => {
    const { id } = parseInput(IdParams, c.req.param());
    return cachedJson(c, await catalog.collection(id), 60 * MINUTE);
  });

  api.get('/movie/:id', async (c) => {
    const { id } = parseInput(IdParams, c.req.param());
    return cachedJson(c, await catalog.movie(id), 30 * MINUTE);
  });

  api.get('/movie/:id/stream', async (c) => {
    const { id } = parseInput(IdParams, c.req.param());
    streams.assertEnabled('movie');
    const source = streams.movie(await catalog.movie(id));
    c.header('Cache-Control', 'private, max-age=300');
    return c.json(source);
  });

  api.get('/tv/:id', async (c) => {
    const { id } = parseInput(IdParams, c.req.param());
    return cachedJson(c, await catalog.tv(id), 30 * MINUTE);
  });

  api.get('/tv/:id/season/:season', async (c) => {
    const { id, season } = parseInput(SeasonParams, c.req.param());
    return cachedJson(c, await catalog.tvSeason(id, season), 30 * MINUTE);
  });

  api.get('/tv/:id/stream', async (c) => {
    const { id } = parseInput(IdParams, c.req.param());
    const { season, episode } = parseInput(TvStreamQuery, c.req.query());
    streams.assertEnabled('tv');
    const source = streams.tv(await catalog.tv(id), season, episode);
    c.header('Cache-Control', 'private, max-age=300');
    return c.json(source);
  });

  return api;
}
