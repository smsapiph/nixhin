import { describe, expect, it, vi } from 'vitest';
import type { AnimeDetail } from '../../shared/api.js';
import { createApp } from './app.js';
import { UpstreamError } from './errors.js';
import type { AnimeCatalog } from './catalog.js';

const detail: AnimeDetail = {
  id: 1,
  title: 'Test',
  titleJapanese: null,
  titleEnglish: null,
  imageUrl: null,
  imageUrlLarge: null,
  bannerUrl: null,
  type: 'TV',
  episodes: 12,
  score: 8,
  members: 100,
  genres: [],
  year: 2026,
  season: 'fall',
  airing: true,
  synopsis: null,
  broadcast: null,
  status: null,
  duration: null,
  rating: null,
  rank: null,
  studios: [],
  trailer: null,
  malId: 1,
  airedEpisodes: 12,
};

function fakeCatalog(overrides: Partial<AnimeCatalog> = {}): AnimeCatalog {
  return {
    top: vi.fn(async () => []),
    seasonNow: vi.fn(async () => ({ items: [], page: 1, hasNextPage: false })),
    search: vi.fn(async () => ({ items: [], page: 1, hasNextPage: false })),
    anime: vi.fn(async () => detail),
    episodes: vi.fn(async () => ({ items: [], page: 1, hasNextPage: false })),
    recommendations: vi.fn(async () => []),
    seasons: vi.fn(async () => []),
    genres: vi.fn(async () => []),
    schedule: vi.fn(async () => []),
    ...overrides,
  };
}

function makeApp(catalog = fakeCatalog(), rateLimit = 100) {
  return createApp({
    config: {
      ALLOWED_ORIGINS: ['http://localhost:5173'],
      TRUST_PROXY: false,
      RATE_LIMIT_PER_MINUTE: rateLimit,
    },
    catalog,
  });
}

describe('API', () => {
  it('serves validated data with security headers', async () => {
    const res = await makeApp().request('/api/anime/1');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 1, title: 'Test' });
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('cache-control')).toMatch(/max-age=/);
  });

  it.each([
    '/api/anime/abc',
    '/api/anime/-1',
    '/api/anime/1e3',
    '/api/anime/0',
    '/api/anime/top?limit=999',
    '/api/anime/top?filter=everything',
    `/api/anime/search?q=${'x'.repeat(101)}`,
    '/api/anime/search?q=%00',
    '/api/anime/search?genre=Action;drop',
    '/api/anime/search?genre=%7B__schema%7D',
    '/api/anime/search?year=1800',
    '/api/anime/search?season=monsoon',
    '/api/anime/search?format=MOVIE',
    '/api/anime/search?status=dropped',
    '/api/anime/search?sort=random',
  ])('rejects invalid input: %s', async (path) => {
    const res = await makeApp().request(path);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } });
  });

  it('passes parsed values to the catalog', async () => {
    const catalog = fakeCatalog();
    await makeApp(catalog).request('/api/anime/search?q=%20frieren%20&genre=Slice%20of%20Life&page=3');
    expect(catalog.search).toHaveBeenCalledWith({ query: 'frieren', genre: 'Slice of Life', page: 3, limit: 24 });
  });

  it('passes browse filters to the catalog', async () => {
    const catalog = fakeCatalog();
    await makeApp(catalog).request('/api/anime/search?year=2023&season=fall&format=movie&status=finished&sort=score');
    expect(catalog.search).toHaveBeenCalledWith({
      year: 2023,
      season: 'fall',
      format: 'movie',
      status: 'finished',
      sort: 'score',
      page: 1,
      limit: 24,
    });
  });

  it('returns JSON 404 for unknown routes and non-GET methods', async () => {
    const app = makeApp();
    expect((await app.request('/api/nope')).status).toBe(404);
    expect((await app.request('/api/anime/1', { method: 'POST' })).status).toBe(404);
  });

  it('allows CORS only for configured origins', async () => {
    const app = makeApp();
    const allowed = await app.request('/api/genres', { headers: { Origin: 'http://localhost:5173' } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

    const blocked = await app.request('/api/genres', { headers: { Origin: 'https://evil.example' } });
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rate limits per client', async () => {
    const app = makeApp(fakeCatalog(), 2);
    expect((await app.request('/api/genres')).status).toBe(200);
    expect((await app.request('/api/genres')).status).toBe(200);
    const limited = await app.request('/api/genres');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).not.toBeNull();
  });

  it('maps upstream failures without leaking details', async () => {
    const catalog = fakeCatalog({
      anime: async () => {
        throw new UpstreamError('unavailable', 'secret internal detail');
      },
      genres: async () => {
        throw new Error('database password is hunter2');
      },
    });
    const app = makeApp(catalog);

    const busy = await app.request('/api/anime/1');
    expect(busy.status).toBe(503);
    expect(await busy.text()).not.toContain('secret');

    const crash = await app.request('/api/genres');
    expect(crash.status).toBe(500);
    expect(await crash.text()).not.toContain('hunter2');
  });
});
