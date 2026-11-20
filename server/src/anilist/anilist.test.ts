import { describe, expect, it, vi } from 'vitest';
import { RequestScheduler } from '../lib/requestScheduler.js';
import { TtlCache } from '../lib/ttlCache.js';
import { AniListCatalog, currentSeason } from './catalog.js';
import { AniListClient } from './client.js';
import {
  cleanDescription,
  jstBroadcast,
  safeImageUrl,
  streamingTitles,
  toAnimeDetail,
  youtubeTrailerId,
} from './mappers.js';
import { RawMediaDetail } from './schemas.js';

const rawMedia = {
  id: 154587,
  isAdult: false,
  title: { romaji: 'Sousou no Frieren', english: 'Frieren: Beyond Journey’s End', native: '葬送のフリーレン' },
  coverImage: {
    large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx154587.jpg',
    extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587.jpg',
  },
  bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587.jpg',
  format: 'TV',
  episodes: 28,
  status: 'FINISHED',
  averageScore: 91,
  popularity: 400_000,
  genres: ['Adventure', 'Drama', 'Fantasy'],
  season: 'FALL',
  seasonYear: 2023,
  description: 'An elf mage<br><br>outlives her party &amp; <i>moves on</i>.<br>\n(Source: Crunchyroll)',
  nextAiringEpisode: null,
  duration: 24,
  trailer: { id: 'qgQGf9FzwTU', site: 'youtube' },
  rankings: [
    { rank: 3, type: 'POPULAR', allTime: true },
    { rank: 1, type: 'RATED', allTime: true },
  ],
  studios: { nodes: [{ name: 'Madhouse' }] },
  someNewField: 'ignored',
};

describe('mappers', () => {
  it('maps AniList media into the public detail shape', () => {
    const detail = toAnimeDetail(RawMediaDetail.parse(rawMedia));
    expect(detail).toMatchObject({
      id: 154587,
      title: 'Sousou no Frieren',
      titleEnglish: 'Frieren: Beyond Journey’s End',
      titleJapanese: '葬送のフリーレン',
      imageUrl: rawMedia.coverImage.large,
      imageUrlLarge: rawMedia.coverImage.extraLarge,
      score: 9.1,
      members: 400_000,
      type: 'TV',
      status: 'Finished airing',
      duration: '24 min per episode',
      season: 'fall',
      rank: 1,
      studios: ['Madhouse'],
      trailer: { youtubeId: 'qgQGf9FzwTU' },
      sourceUrl: 'https://anilist.co/anime/154587',
      synopsis: 'An elf mage\n\noutlives her party & moves on.',
    });
    expect(detail).not.toHaveProperty('someNewField');
  });

  it('only allows https images from known hosts', () => {
    expect(safeImageUrl('https://s4.anilist.co/a.jpg')).toBe('https://s4.anilist.co/a.jpg');
    expect(safeImageUrl('http://s4.anilist.co/a.jpg')).toBeNull();
    expect(safeImageUrl('https://evil.example/a.jpg')).toBeNull();
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
  });

  it('only accepts well-formed YouTube trailers', () => {
    expect(youtubeTrailerId({ id: 'qgQGf9FzwTU', site: 'youtube' })).toBe('qgQGf9FzwTU');
    expect(youtubeTrailerId({ id: 'x2abcde', site: 'dailymotion' })).toBeNull();
    expect(youtubeTrailerId({ id: '"><script>', site: 'youtube' })).toBeNull();
    expect(youtubeTrailerId(null)).toBeNull();
  });

  it('strips markup and decodes entities in descriptions', () => {
    expect(cleanDescription('A &#8220;quote&#8221; &lt;b&gt; <b>bold</b>')).toBe('A “quote” <b> bold');
    expect(cleanDescription('<br><br>')).toBeNull();
    expect(cleanDescription(null)).toBeNull();
  });

  it('converts airing timestamps to JST weekday and time', () => {
    // 2026-11-20T14:30:00Z = Friday 23:30 JST
    expect(jstBroadcast(Date.UTC(2026, 10, 20, 14, 30) / 1000)).toEqual({
      day: 'friday',
      time: '23:30',
      timezone: 'Asia/Tokyo',
    });
    // 2026-11-20T16:00:00Z = Saturday 01:00 JST
    expect(jstBroadcast(Date.UTC(2026, 10, 20, 16, 0) / 1000).day).toBe('saturday');
  });

  it('parses streaming episode titles', () => {
    const titles = streamingTitles([{ title: 'Episode 2 - The Hero Returns' }, { title: 'Bonus clip' }, {}]);
    expect([...titles]).toEqual([[2, 'The Hero Returns']]);
  });
});

describe('currentSeason', () => {
  it.each([
    ['2026-01-15', 'WINTER', 2026],
    ['2026-04-01', 'SPRING', 2026],
    ['2026-07-31', 'SUMMER', 2026],
    ['2026-11-20', 'FALL', 2026],
    ['2026-12-05', 'WINTER', 2027],
  ])('%s → %s %i', (date, season, year) => {
    expect(currentSeason(new Date(`${date}T12:00:00Z`))).toEqual({ season, year });
  });
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function makeClient(fetchImpl: typeof fetch) {
  return new AniListClient({
    endpoint: 'https://graphql.anilist.test',
    timeoutMs: 1000,
    scheduler: new RequestScheduler({ rules: [{ limit: 100, windowMs: 1000 }], maxQueue: 10 }),
    cache: new TtlCache<unknown>(100),
    fetch: fetchImpl,
    sleep: async () => undefined,
  });
}

describe('AniListClient', () => {
  it('sends input only as GraphQL variables', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ data: { ok: true } }));
    await makeClient(fetchMock).query('search', 'query Q($search: String) { x }', { search: '"} evil {' }, 1000);

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      query: 'query Q($search: String) { x }',
      variables: { search: '"} evil {' },
    });
  });

  it('caches results and shares in-flight requests', async () => {
    const fetchMock = vi.fn(async () => json({ data: { ok: true } }));
    const client = makeClient(fetchMock);
    await Promise.all([client.query('a', 'q', { id: 1 }, 1000), client.query('a', 'q', { id: 1 }, 1000)]);
    await client.query('a', 'q', { id: 1 }, 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 429 then succeeds', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ errors: [{ status: 429 }] }, 429, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(json({ data: { ok: true } }));
    await expect(makeClient(fetchMock).query('a', 'q', {}, 1)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps GraphQL errors to UpstreamError kinds', async () => {
    const notFound = makeClient(async () => json({ data: { Media: null }, errors: [{ status: 404 }] }, 404));
    await expect(notFound.query('a', 'q', {}, 1)).rejects.toMatchObject({ kind: 'not_found' });

    const down = makeClient(async () => json({ errors: [{ status: 500 }] }, 500));
    await expect(down.query('a', 'q', {}, 1)).rejects.toMatchObject({ kind: 'unavailable' });

    const offline = makeClient(async () => {
      throw new TypeError('network down');
    });
    await expect(offline.query('a', 'q', {}, 1)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

describe('AniListCatalog', () => {
  const now = () => new Date('2026-11-20T12:00:00Z');

  it('skips invalid and adult items instead of failing the page', async () => {
    const onInvalidItem = vi.fn();
    const client = makeClient(async () =>
      json({
        data: {
          Page: {
            pageInfo: { currentPage: 1, hasNextPage: true },
            media: [rawMedia, { ...rawMedia, id: 2, isAdult: true }, { id: 'nope' }],
          },
        },
      }),
    );
    const page = await new AniListCatalog(client, { now, onInvalidItem }).seasonNow(1, 24);
    expect(page.items.map((a) => a.id)).toEqual([154587]);
    expect(page.hasNextPage).toBe(true);
    expect(onInvalidItem).toHaveBeenCalledTimes(1);
  });

  it('lists only aired episodes with dates and titles', async () => {
    const client = makeClient(async () =>
      json({
        data: {
          Media: {
            isAdult: false,
            episodes: 12,
            status: 'RELEASING',
            nextAiringEpisode: { episode: 4 },
            streamingEpisodes: [{ title: 'Episode 1 - Departure' }],
          },
          Page: { airingSchedules: [{ episode: 1, airingAt: 1_790_000_000 }, null] },
        },
      }),
    );
    const page = await new AniListCatalog(client, { now }).episodes(1, 1);
    expect(page.items.map((e) => e.number)).toEqual([1, 2, 3]);
    expect(page.items[0]).toMatchObject({ title: 'Departure', aired: new Date(1_790_000_000_000).toISOString() });
    expect(page.hasNextPage).toBe(false);
  });

  it('pages long-running shows by episode number and asks for that range of air dates', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        data: {
          Media: { isAdult: false, episodes: null, status: 'RELEASING', nextAiringEpisode: { episode: 1181 } },
          Page: { airingSchedules: [{ episode: 1151, airingAt: 1_764_512_160 }] },
        },
      }),
    );
    const page = await new AniListCatalog(makeClient(fetchImpl), { now }).episodes(21, 24);
    expect(page.items.map((e) => e.number)).toEqual(Array.from({ length: 30 }, (_, i) => 1151 + i));
    expect(page.items[0]?.aired).toBe(new Date(1_764_512_160_000).toISOString());
    expect(page.hasNextPage).toBe(false);
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.variables).toMatchObject({ id: 21, after: 1150, before: 1201 });
  });

  it('walks sequel/prequel links into a dated watch order', async () => {
    const node = (id: number, year: number, extra: object = {}) => ({
      id,
      type: 'ANIME',
      isAdult: false,
      format: 'TV',
      status: 'FINISHED',
      episodes: 12,
      title: { romaji: `Show ${id}` },
      startDate: { year, month: 4, day: 1 },
      ...extra,
    });
    const edge = (relationType: string, n: object | null) => ({ relationType, node: n });
    // Relations two levels down are untrusted (AniList empties them), so 4 and then 5 are refetched.
    const movie = (id: number, year: number, extra: object = {}) => node(id, year, { format: 'MOVIE', ...extra });
    const responses: Record<number, object> = {
      2: node(2, 2014, {
        relations: {
          edges: [
            edge('PREQUEL', node(1, 2013, { relations: { edges: [] } })),
            edge('ADAPTATION', { ...node(90, 2010), type: 'MANGA', format: 'MANGA' }),
            edge('SIDE_STORY', node(80, 2015, { relations: { edges: [] } })),
            edge(
              'SEQUEL',
              node(3, 2016, {
                relations: {
                  edges: [
                    edge('SEQUEL', node(4, 2018, { relations: { edges: [] } })),
                    edge('SEQUEL', null),
                  ],
                },
              }),
            ),
          ],
        },
      }),
      4: node(4, 2018, { relations: { edges: [edge('PREQUEL', node(3, 2016)), edge('SEQUEL', movie(5, 2020))] } }),
      5: movie(5, 2020, { relations: { edges: [edge('PREQUEL', node(4, 2018))] } }),
    };
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const { variables } = JSON.parse(String(init.body)) as { variables: { id: number } };
      return json({ data: { Media: responses[variables.id] } });
    });
    const seasons = await new AniListCatalog(makeClient(fetchImpl as unknown as typeof fetch), { now }).seasons(2);
    expect(seasons.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
    expect(seasons[4]).toMatchObject({ type: 'Movie', year: 2020 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('rejects unknown genres and filters explicit ones', async () => {
    const client = makeClient(async () => json({ data: { GenreCollection: ['Action', 'Hentai', 'Comedy'] } }));
    const catalog = new AniListCatalog(client, { now });
    expect(await catalog.genres()).toEqual([{ name: 'Action' }, { name: 'Comedy' }]);
    await expect(catalog.search({ genre: 'Hentai', page: 1, limit: 24 })).rejects.toMatchObject({
      kind: 'bad_request',
    });
  });

  it('hides adult titles on the detail endpoint', async () => {
    const client = makeClient(async () => json({ data: { Media: { ...rawMedia, isAdult: true } } }));
    await expect(new AniListCatalog(client, { now }).anime(1)).rejects.toMatchObject({ kind: 'not_found' });
  });
});
