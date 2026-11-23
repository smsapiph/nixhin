import { describe, expect, it } from 'vitest';
import type { MangaChapter, MangaChapterPages, MangaDetail, Page, MangaSummary } from '../../../shared/api.js';
import { createApp } from '../app.js';
import type { AnimeCatalog } from '../catalog.js';
import { RequestScheduler } from '../lib/requestScheduler.js';
import { TtlCache } from '../lib/ttlCache.js';
import { MangaDexCatalog } from './catalog.js';
import { MangaDexClient } from './client.js';
import { cleanDescription } from './mappers.js';

const MANGA_ID = 'a1c7c817-4e59-43b7-9365-09675a149a6f';
const CHAPTER_ID = '0b4ddc4e-3e5d-4b2e-9a54-4f0e1a3b9d11';
const OTHER_CHAPTER = '1c5eed5f-4f6e-4c3f-8b65-5a1f2b4cae22';
const HASH = '3303dd03ac8d27452cce3f2a882e94b2';

const rawManga = (overrides: Record<string, unknown> = {}) => ({
  id: MANGA_ID,
  type: 'manga',
  attributes: {
    title: { en: 'One Piece' },
    altTitles: [{ ja: 'ワンピース' }, { 'ja-ro': 'One Piece' }, { fil: 'Isang Piraso' }],
    description: { en: 'Gol D. Roger was known as the **Pirate King**.\n\n---\n[Official](https://example.com)' },
    links: { engtl: 'https://mangaplus.shueisha.co.jp/titles/100020', raw: 'http://insecure.example', bw: 'series/1234' },
    status: 'ongoing',
    year: 1997,
    contentRating: 'safe',
    publicationDemographic: 'shounen',
    lastChapter: '',
    tags: [
      { attributes: { name: { en: 'Action' }, group: 'genre' } },
      { attributes: { name: { en: 'Pirates' }, group: 'theme' } },
      { attributes: { name: { en: 'Long Strip' }, group: 'format' } },
    ],
    availableTranslatedLanguages: ['en', 'es-la', null, 'fil'],
    ...overrides,
  },
  relationships: [
    { id: 'c1', type: 'cover_art', attributes: { fileName: 'cover.jpg' } },
    { id: 'p1', type: 'author', attributes: { name: 'Oda Eiichiro' } },
    { id: 'p1', type: 'artist', attributes: { name: 'Oda Eiichiro' } },
  ],
});

const rawChapter = (id: string, chapter: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'chapter',
  attributes: {
    volume: '1',
    chapter,
    title: chapter === '1' ? 'Romance Dawn' : null,
    translatedLanguage: 'en',
    externalUrl: null,
    publishAt: '2020-01-01T00:00:00+00:00',
    readableAt: '2020-01-01T00:00:00+00:00',
    pages: 20,
    ...extra,
  },
  relationships: [
    { id: 'g1', type: 'scanlation_group', attributes: { name: 'Team A' } },
    { id: MANGA_ID, type: 'manga', attributes: { contentRating: 'safe' } },
  ],
});

interface Recorded {
  readonly urls: URL[];
  readonly headers: Headers[];
}

function fakeMangaDex(routes: (url: URL) => unknown): { fetch: typeof fetch; recorded: Recorded } {
  const recorded: Recorded = { urls: [], headers: [] };
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    recorded.urls.push(url);
    recorded.headers.push(new Headers(init?.headers));
    const body = routes(url);
    if (body === undefined) return new Response('{"result":"error"}', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetch: fn, recorded };
}

function buildCatalog(fetchFn: typeof fetch) {
  const client = new MangaDexClient({
    baseUrl: 'https://api.mangadex.org',
    timeoutMs: 1000,
    scheduler: new RequestScheduler({ rules: [{ limit: 1000, windowMs: 1000 }], maxQueue: 100 }),
    cache: new TtlCache<unknown>(100),
    fetch: fetchFn,
    sleep: async () => undefined,
  });
  return new MangaDexCatalog(client);
}

const collection = (data: unknown[], offset = 0, limit = 24, total = data.length) => ({
  result: 'ok',
  response: 'collection',
  data,
  offset,
  limit,
  total,
});

describe('MangaDexCatalog', () => {
  it('lists popular manga with the site filters and maps cards', async () => {
    const { fetch, recorded } = fakeMangaDex(() => collection([rawManga(), { id: 'broken' }], 0, 24, 100));
    const page = await buildCatalog(fetch).list('popular', 1);

    const url = recorded.urls[0];
    expect(url?.pathname).toBe('/manga');
    expect(url?.searchParams.getAll('contentRating[]')).toEqual(['safe', 'suggestive']);
    expect(url?.searchParams.getAll('availableTranslatedLanguage[]')).toEqual(['en', 'fil']);
    expect(url?.searchParams.get('order[followedCount]')).toBe('desc');
    expect(url?.searchParams.get('hasAvailableChapters')).toBe('true');
    expect(url?.searchParams.getAll('includes[]')).toEqual(['cover_art']);
    expect(recorded.headers[0]?.get('user-agent')).toBe('nixhin-server/0.1');

    expect(page.hasNextPage).toBe(true);
    expect(page.items).toEqual([
      {
        id: MANGA_ID,
        title: 'One Piece',
        coverUrl: `https://uploads.mangadex.org/covers/${MANGA_ID}/cover.jpg.512.jpg`,
        status: 'ongoing',
        year: 1997,
        tags: ['Action', 'Pirates'],
        languages: ['en', 'fil'],
      },
    ]);
  });

  it('sends search text as a query value and stops paging at the end', async () => {
    const { fetch, recorded } = fakeMangaDex(() => collection([rawManga()], 24, 24, 30));
    const page = await buildCatalog(fetch).search('one piece & co', 2);
    expect(recorded.urls[0]?.searchParams.get('title')).toBe('one piece & co');
    expect(recorded.urls[0]?.searchParams.get('offset')).toBe('24');
    expect(page.hasNextPage).toBe(false);
  });

  it('maps details: English title, cleaned description, credits and https-only official links', async () => {
    const { fetch } = fakeMangaDex(() => ({ result: 'ok', data: rawManga() }));
    const detail = await buildCatalog(fetch).manga(MANGA_ID);
    expect(detail.title).toBe('One Piece');
    expect(detail.altTitles).toEqual(['ワンピース', 'Isang Piraso']);
    expect(detail.description).toBe('Gol D. Roger was known as the Pirate King.');
    expect(detail.authors).toEqual(['Oda Eiichiro']);
    expect(detail.artists).toEqual(['Oda Eiichiro']);
    expect(detail.lastChapter).toBeNull();
    expect(detail.links).toEqual([
      { label: 'Official English', url: 'https://mangaplus.shueisha.co.jp/titles/100020' },
      { label: 'BookWalker', url: 'https://bookwalker.jp/series/1234' },
    ]);
  });

  it('accepts the empty-array form MangaDex uses for empty maps', async () => {
    const { fetch } = fakeMangaDex(() => ({ result: 'ok', data: rawManga({ description: [], links: null }) }));
    const detail = await buildCatalog(fetch).manga(MANGA_ID);
    expect(detail.description).toBeNull();
    expect(detail.links).toEqual([]);
  });

  it('hides explicit titles', async () => {
    const { fetch } = fakeMangaDex(() => ({ result: 'ok', data: rawManga({ contentRating: 'erotica' }) }));
    await expect(buildCatalog(fetch).manga(MANGA_ID)).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('reads every feed page and sorts chapters numerically', async () => {
    const { fetch, recorded } = fakeMangaDex((url) => {
      if (url.pathname === `/manga/${MANGA_ID}`) return { result: 'ok', data: rawManga() };
      const offset = Number(url.searchParams.get('offset'));
      if (offset === 0) return collection([rawChapter(CHAPTER_ID, '10'), rawChapter('x', '2', { translatedLanguage: 'es' })], 0, 500, 501);
      return collection([rawChapter(OTHER_CHAPTER, '2')], 500, 500, 501);
    });
    const chapters = await buildCatalog(fetch).chapters(MANGA_ID, 'en');
    const feeds = recorded.urls.filter((url) => url.pathname.endsWith('/feed'));
    expect(feeds.map((url) => url.searchParams.get('offset'))).toEqual(['0', '500']);
    expect(feeds[0]?.searchParams.getAll('translatedLanguage[]')).toEqual(['en']);
    expect(chapters.map((chapter) => chapter.chapter)).toEqual(['2', '10']);
    expect(chapters[0]?.groups).toEqual(['Team A']);
  });

  it('returns chapter pages on the proxied host with the node as fallback', async () => {
    const { fetch } = fakeMangaDex((url) => {
      if (url.pathname === `/chapter/${CHAPTER_ID}`) return { result: 'ok', data: rawChapter(CHAPTER_ID, '1') };
      if (url.pathname === `/at-home/server/${CHAPTER_ID}`) {
        return {
          result: 'ok',
          baseUrl: 'https://abc.xyz.mangadex.network:443/token',
          chapter: { hash: HASH, data: ['1-a.png', '../evil.png', '2-b.png'], dataSaver: ['1-a.jpg'] },
        };
      }
      return undefined;
    });
    const chapter = await buildCatalog(fetch).chapter(CHAPTER_ID);
    expect(chapter.mangaId).toBe(MANGA_ID);
    expect(chapter.title).toBe('Romance Dawn');
    expect(chapter.pages).toEqual([
      {
        url: `https://uploads.mangadex.org/data/${HASH}/1-a.png`,
        fallbackUrl: `https://abc.xyz.mangadex.network/token/data/${HASH}/1-a.png`,
      },
      {
        url: `https://uploads.mangadex.org/data/${HASH}/2-b.png`,
        fallbackUrl: `https://abc.xyz.mangadex.network/token/data/${HASH}/2-b.png`,
      },
    ]);
    expect(chapter.pagesDataSaver[0]?.url).toBe(`https://uploads.mangadex.org/data-saver/${HASH}/1-a.jpg`);
  });

  it('does not ask for pages of chapters hosted on an official site', async () => {
    const { fetch, recorded } = fakeMangaDex(() => ({
      result: 'ok',
      data: rawChapter(CHAPTER_ID, '1', { pages: 0, externalUrl: 'https://mangaplus.shueisha.co.jp/viewer/1' }),
    }));
    const chapter = await buildCatalog(fetch).chapter(CHAPTER_ID);
    expect(chapter.pages).toEqual([]);
    expect(chapter.externalUrl).toBe('https://mangaplus.shueisha.co.jp/viewer/1');
    expect(recorded.urls).toHaveLength(1);
  });
});

describe('cleanDescription', () => {
  it('drops the link section and Markdown markers', () => {
    expect(cleanDescription('# Story\nA [hero](https://x.y) rises.\r\n\n\n\n__Bold__\n___\nLinks')).toBe('Story\nA hero rises.\n\nBold');
    expect(cleanDescription('---')).toBeNull();
  });
});

describe('manga routes', () => {
  const summary: MangaSummary = { id: MANGA_ID, title: 'One Piece', coverUrl: null, status: null, year: null, tags: [], languages: ['en'] };
  const calls: string[] = [];
  const manga = {
    list: async (list: string, page: number): Promise<Page<MangaSummary>> => {
      calls.push(`list:${list}:${page}`);
      return { items: [summary], page, hasNextPage: false };
    },
    search: async (q: string): Promise<Page<MangaSummary>> => {
      calls.push(`search:${q}`);
      return { items: [], page: 1, hasNextPage: false };
    },
    manga: async (): Promise<MangaDetail> => ({ ...summary, altTitles: [], description: null, authors: [], artists: [], demographic: null, lastChapter: null, links: [] }),
    chapters: async (id: string, lang: string): Promise<readonly MangaChapter[]> => {
      calls.push(`chapters:${id}:${lang}`);
      return [];
    },
    chapter: async (id: string): Promise<MangaChapterPages> => {
      calls.push(`chapter:${id}`);
      return { id, mangaId: MANGA_ID, chapter: '1', volume: null, title: null, language: 'en', groups: [], externalUrl: null, pages: [], pagesDataSaver: [] };
    },
  };
  const app = createApp({
    config: { ALLOWED_ORIGINS: [], TRUST_PROXY: false, RATE_LIMIT_PER_MINUTE: 1000 },
    catalog: {} as AnimeCatalog,
    manga,
  });

  it('routes valid requests to the catalog', async () => {
    expect((await app.request('/api/manga/list/latest?page=2')).status).toBe(200);
    expect((await app.request(`/api/manga/${MANGA_ID}/chapters?lang=fil`)).status).toBe(200);
    expect((await app.request(`/api/manga/chapter/${CHAPTER_ID}`)).status).toBe(200);
    expect((await app.request(`/api/manga/${MANGA_ID}`)).status).toBe(200);
    expect((await app.request('/api/manga/search?q=naruto')).status).toBe(200);
    expect(calls).toEqual([`list:latest:2`, `chapters:${MANGA_ID}:fil`, `chapter:${CHAPTER_ID}`, 'search:naruto']);
  });

  it('rejects bad ids, lists and languages', async () => {
    expect((await app.request('/api/manga/123')).status).toBe(400);
    expect((await app.request('/api/manga/list/hot')).status).toBe(400);
    expect((await app.request(`/api/manga/${MANGA_ID}/chapters?lang=es`)).status).toBe(400);
    expect((await app.request('/api/manga/search')).status).toBe(400);
  });

  it('answers 404 when manga is off', async () => {
    const off = createApp({ config: { ALLOWED_ORIGINS: [], TRUST_PROXY: false, RATE_LIMIT_PER_MINUTE: 1000 }, catalog: {} as AnimeCatalog });
    expect((await off.request(`/api/manga/${MANGA_ID}`)).status).toBe(404);
  });
});
