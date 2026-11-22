import { describe, expect, it, vi } from 'vitest';
import type { MediaDetail } from '../../../shared/api.js';
import { decodeStreamToken } from '../../../shared/streamToken.js';
import { createApp } from '../app.js';
import type { AnimeCatalog, MediaCatalog } from '../catalog.js';
import { RequestScheduler } from '../lib/requestScheduler.js';
import { TtlCache } from '../lib/ttlCache.js';
import { MediaEmbedStreams, mediaTemplateProblem } from '../stream/mediaEmbed.js';
import { TmdbCatalog } from './catalog.js';
import { TmdbClient } from './client.js';
import { imageUrl } from './mappers.js';

const genres = { genres: [{ id: 878, name: 'Science Fiction' }, { id: 12, name: 'Adventure' }, { id: 18, name: 'Drama' }] };

const dune = {
  id: 693134,
  title: 'Dune: Part Two',
  original_title: 'Dune: Part Two',
  poster_path: '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
  backdrop_path: '/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
  release_date: '2024-02-27',
  vote_average: 8.153,
  vote_count: 6200,
  genre_ids: [878, 12],
  overview: 'Follow the mythic journey of Paul Atreides.',
  adult: false,
};

const movieDetail = {
  ...dune,
  genres: [{ id: 878, name: 'Science Fiction' }, { id: 12, name: 'Adventure' }],
  tagline: 'Long live the fighters.',
  status: 'Released',
  runtime: 167,
  imdb_id: 'tt15239678',
  production_companies: [{ name: 'Legendary Pictures' }],
  belongs_to_collection: { id: 726871, name: 'Dune Collection' },
  credits: {
    cast: [
      { id: 505710, name: 'Zendaya', character: 'Chani', profile_path: '/z.jpg', order: 1 },
      { id: 1190668, name: 'Timothée Chalamet', character: 'Paul Atreides', profile_path: '/t.jpg', order: 0 },
      { name: 'No id', character: 'Extra', order: 2 },
    ],
    crew: [{ name: 'Denis Villeneuve', job: 'Director' }, { name: 'Hans Zimmer', job: 'Original Music Composer' }],
  },
  videos: {
    results: [
      { site: 'YouTube', type: 'Teaser', key: 'aaaaaaaaaaa', official: true },
      { site: 'YouTube', type: 'Trailer', key: 'Way9Dexny3w', official: true },
    ],
  },
  release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ certification: '' }, { certification: 'PG-13' }] }] },
  recommendations: { results: [{ ...dune, id: 438631, title: 'Dune', adult: false }, { id: 5, title: 'Adult', adult: true }] },
};

const shogun = {
  id: 126308,
  name: 'Shōgun',
  original_name: '将軍',
  poster_path: '/7O4iVfOMQmdCSxhOg1WnzG1AgYT.jpg',
  backdrop_path: '/b.jpg',
  first_air_date: '2024-02-27',
  vote_average: 8.6,
  vote_count: 1200,
  genre_ids: [18],
  overview: 'In Japan in the year 1600…',
};

const tvDetail = {
  ...shogun,
  genres: [{ id: 18, name: 'Drama' }],
  status: 'Returning Series',
  episode_run_time: [0, 58],
  networks: [{ name: 'FX' }],
  created_by: [{ name: 'Rachel Kondo' }, { name: 'Justin Marks' }],
  seasons: [
    { season_number: 0, name: 'Specials', episode_count: 2, air_date: '2024-01-01' },
    { season_number: 2, name: 'Season 2', episode_count: 0, air_date: null },
    { season_number: 1, name: 'Season 1', episode_count: 10, air_date: '2024-02-27' },
  ],
  last_episode_to_air: { season_number: 1, episode_number: 10 },
  content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] },
  external_ids: { imdb_id: 'tt2788316' },
  credits: { cast: [], crew: [] },
  videos: { results: [] },
  recommendations: { results: [] },
};

const routes: Record<string, unknown> = {
  '/genre/movie/list': genres,
  '/genre/tv/list': genres,
  '/trending/movie/week': { page: 1, total_pages: 3, results: [dune, { id: 9, title: 'Hidden', adult: true }, { bad: true }] },
  '/movie/693134': movieDetail,
  '/tv/126308': tvDetail,
  '/tv/126308/season/1': { episodes: [{ episode_number: 1, name: 'Anjin', air_date: '2024-02-27', runtime: 70, overview: ' Ship.  ' }] },
  '/person/1190668': {
    id: 1190668,
    name: 'Timothée Chalamet',
    profile_path: '/t.jpg',
    known_for_department: 'Acting',
    biography: 'Born in New York.\n\nActor.',
    birthday: '1995-12-27',
    place_of_birth: 'New York City, New York, USA',
    combined_credits: {
      cast: [
        { ...dune, media_type: 'movie', character: 'Paul Atreides', popularity: 50 },
        { ...dune, media_type: 'movie', character: 'Paul (young)', popularity: 50 },
        { id: 438631, media_type: 'movie', title: 'Dune', character: 'Paul', popularity: 80, genre_ids: [878] },
        { id: 1, media_type: 'tv', name: 'Late Show', character: 'Self', popularity: 99, genre_ids: [10767] },
        { id: 2, media_type: 'tv', name: 'Homeland', character: 'Finn Walden', popularity: 20, genre_ids: [18], episode_count: 8 },
      ],
      crew: [],
    },
  },
  '/collection/726871': { id: 726871, name: 'Dune Collection', parts: [dune, { ...dune, id: 438631, title: 'Dune', release_date: '2021-09-15' }] },
};

function makeCatalog() {
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-token-0123456789abcdef');
    const body = routes[url.pathname.replace('/3', '')];
    return body === undefined ? new Response('{}', { status: 404 }) : Response.json(body);
  });
  const client = new TmdbClient({
    baseUrl: 'https://api.themoviedb.org/3',
    token: 'test-token-0123456789abcdef',
    timeoutMs: 1000,
    scheduler: new RequestScheduler({ rules: [{ limit: 100, windowMs: 1000 }], maxQueue: 100 }),
    cache: new TtlCache<unknown>(100),
    fetch: fetchFn as unknown as typeof fetch,
    sleep: async () => undefined,
  });
  return { catalog: new TmdbCatalog(client), fetchFn };
}

describe('TmdbCatalog', () => {
  it('maps a list, dropping adult and malformed items, with genre names', async () => {
    const { catalog } = makeCatalog();
    const page = await catalog.movieList('trending', 1);
    expect(page.hasNextPage).toBe(true);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      kind: 'movie',
      id: 693134,
      title: 'Dune: Part Two',
      originalTitle: null,
      year: 2024,
      score: 8.2,
      genres: ['Science Fiction', 'Adventure'],
      imageUrl: 'https://image.tmdb.org/t/p/w342/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    });
  });

  it('maps movie details: director, cast order, trailer, rating, collection', async () => {
    const { catalog } = makeCatalog();
    const movie = await catalog.movie(693134);
    expect(movie.makers).toEqual(['Denis Villeneuve']);
    expect(movie.cast.map((person) => [person.id, person.name])).toEqual([
      [1190668, 'Timothée Chalamet'],
      [505710, 'Zendaya'],
    ]);
    expect(movie.trailer).toEqual({ youtubeId: 'Way9Dexny3w' });
    expect(movie.rating).toBe('PG-13');
    expect(movie.runtime).toBe(167);
    expect(movie.collection).toEqual({ id: 726871, name: 'Dune Collection' });
    expect(movie.recommendations.map((item) => item.id)).toEqual([438631]);
    expect(movie.imdbId).toBe('tt15239678');
  });

  it('maps TV details: seasons in order with specials last, original title, status', async () => {
    const { catalog } = makeCatalog();
    const show = await catalog.tv(126308);
    expect(show.originalTitle).toBe('将軍');
    expect(show.status).toBe('Returning series');
    expect(show.runtime).toBe(58);
    expect(show.seasons.map((season) => season.number)).toEqual([1, 0]);
    expect(show.lastAired).toEqual({ season: 1, episode: 10 });
    expect(show.makers).toEqual(['Rachel Kondo', 'Justin Marks']);
  });

  it('lists a season’s episodes and a collection in release order', async () => {
    const { catalog } = makeCatalog();
    expect(await catalog.tvSeason(126308, 1)).toEqual([
      { number: 1, title: 'Anjin', aired: '2024-02-27', runtime: 70, overview: 'Ship.' },
    ]);
    const collection = await catalog.collection(726871);
    expect(collection.parts.map((part) => part.title)).toEqual(['Dune', 'Dune: Part Two']);
  });

  it('lists a person’s movies and shows once each, most popular first, without talk-show appearances', async () => {
    const { catalog } = makeCatalog();
    const person = await catalog.person(1190668);
    expect(person).toMatchObject({ name: 'Timothée Chalamet', knownFor: 'Acting', birthday: '1995-12-27', biography: 'Born in New York.\n\nActor.' });
    expect(person.movies.map((credit) => [credit.title, credit.role])).toEqual([
      ['Dune', 'Paul'],
      ['Dune: Part Two', 'Paul Atreides'],
    ]);
    expect(person.shows.map((credit) => [credit.title, credit.role])).toEqual([['Homeland', 'Finn Walden']]);
  });

  it('caches identical requests', async () => {
    const { catalog, fetchFn } = makeCatalog();
    await catalog.movie(693134);
    await catalog.movie(693134);
    expect(fetchFn.mock.calls.filter(([url]) => String(url).includes('/movie/693134'))).toHaveLength(1);
  });

  it('turns a missing title into not_found', async () => {
    const { catalog } = makeCatalog();
    await expect(catalog.movie(1)).rejects.toMatchObject({ kind: 'not_found' });
  });
});

describe('imageUrl', () => {
  it('only builds URLs from plain TMDB image paths', () => {
    expect(imageUrl('/abc.jpg', 'w185')).toBe('https://image.tmdb.org/t/p/w185/abc.jpg');
    expect(imageUrl('//evil.com/x.jpg', 'w185')).toBeNull();
    expect(imageUrl('/../x.jpg', 'w185')).toBeNull();
    expect(imageUrl(null, 'w185')).toBeNull();
  });
});

describe('MediaEmbedStreams', () => {
  it('validates templates', () => {
    expect(mediaTemplateProblem('https://p.example/movie/{tmdbId}', 'movie')).toBeNull();
    expect(mediaTemplateProblem('https://p.example/tv/{tmdbId}/{season}/{episode}', 'tv')).toBeNull();
    expect(mediaTemplateProblem('https://p.example/tv/{tmdbId}', 'tv')).toMatch(/season/);
    expect(mediaTemplateProblem('http://p.example/movie/{tmdbId}', 'movie')).toMatch(/https/);
    expect(mediaTemplateProblem('https://{tmdbId}.example/', 'movie')).toMatch(/host/);
    expect(mediaTemplateProblem('https://p.example/{anilistId}', 'movie')).toMatch(/unknown/);
  });

  it('builds movie links by IMDb id and TV links by TMDB id, season and episode', async () => {
    const { catalog } = makeCatalog();
    const streams = new MediaEmbedStreams({
      movieTemplate: 'https://mydomain.com/embed/movie/{imdbId}',
      tvTemplate: 'https://mydomain.com/embed/tv/{tmdbId}/{season}/{episode}',
    });
    expect(decodeStreamToken(streams.movie(await catalog.movie(693134)).token)).toBe('https://mydomain.com/embed/movie/tt15239678');
    expect(decodeStreamToken(streams.tv(await catalog.tv(126308), 1, 1).token)).toBe('https://mydomain.com/embed/tv/126308/1/1');
  });

  it('builds episode URLs only for episodes that exist', async () => {
    const { catalog } = makeCatalog();
    const show = await catalog.tv(126308);
    const streams = new MediaEmbedStreams({ movieTemplate: undefined, tvTemplate: 'https://p.example/tv/{imdbId}/{season}/{episode}' });
    expect(decodeStreamToken(streams.tv(show, 1, 3).token)).toBe('https://p.example/tv/tt2788316/1/3');
    expect(() => streams.tv(show, 1, 11)).toThrow(/does not exist/);
    expect(() => streams.tv(show, 2, 1)).toThrow(/does not exist/);
    expect(() => streams.movie(show)).toThrow(/not configured/);
  });
});

describe('media routes', () => {
  const anime = {} as AnimeCatalog;
  const config = { ALLOWED_ORIGINS: [], TRUST_PROXY: false, RATE_LIMIT_PER_MINUTE: 100 };

  it('reports movies & TV as off without a catalog', async () => {
    const app = createApp({ config, catalog: anime });
    expect(await (await app.request('/api/media/config')).json()).toEqual({ enabled: false, moviePlayback: false, tvPlayback: false });
    expect((await app.request('/api/movie/list/trending')).status).toBe(404);
  });

  it('serves lists, details and streams, and validates input', async () => {
    const { catalog } = makeCatalog();
    const media: MediaCatalog = catalog;
    const mediaStreams = new MediaEmbedStreams({ movieTemplate: 'https://p.example/m/{tmdbId}', tvTemplate: undefined });
    const app = createApp({ config, catalog: anime, media, mediaStreams });

    expect(await (await app.request('/api/media/config')).json()).toEqual({ enabled: true, moviePlayback: true, tvPlayback: false });
    expect((await app.request('/api/movie/list/trending')).status).toBe(200);
    expect((await app.request('/api/movie/list/everything')).status).toBe(400);
    const movie = (await (await app.request('/api/movie/693134')).json()) as MediaDetail;
    expect(movie.title).toBe('Dune: Part Two');
    const stream = (await (await app.request('/api/movie/693134/stream')).json()) as { token: string };
    expect(decodeStreamToken(stream.token)).toBe('https://p.example/m/693134');
    expect((await app.request('/api/tv/126308/stream?season=1&episode=1')).status).toBe(404);
    expect((await app.request('/api/tv/126308/season/1')).status).toBe(200);
    expect((await app.request('/api/movie/search?q=')).status).toBe(400);
    expect((await app.request('/api/movie/999')).status).toBe(404);
  });
});
