import {
  MANGA_LANGUAGES,
  type MangaChapter,
  type MangaChapterPages,
  type MangaDetail,
  type MangaLanguage,
  type MangaList,
  type MangaSummary,
  type Page,
} from '../../../shared/api.js';
import type { MangaCatalog } from '../catalog.js';
import { UpstreamError } from '../errors.js';
import type { MangaDexClient, Params } from './client.js';
import { chapterMangaId, toMangaChapter, toMangaDetail, toMangaSummary, toPages } from './mappers.js';
import { RawAtHome, RawChapter, RawCollection, RawEntity, RawManga } from './schemas.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/**
 * Titles asked for per page. A third more than a page of cards: series whose chapters are all on an official
 * site (no pages here) are dropped afterwards, so about 24 remain.
 */
export const MANGA_PAGE_SIZE = 36;
/** `GET /chapter` returns at most 100 chapters; a few passes cover a page of titles. */
const READABLE_LIMIT = 100;
const READABLE_PASSES = 4;
/** MangaDex refuses `offset + limit` above 10 000. */
const MAX_RESULTS = 10_000;
/** Feed pages are capped at 500; a few requests cover even the longest series. */
const FEED_LIMIT = 500;
const MAX_CHAPTERS = 5_000;

/** Same rule as the anime side: nothing explicit. */
const CONTENT_RATINGS = ['safe', 'suggestive'] as const;
const SAFE_RATINGS: ReadonlySet<string> = new Set(CONTENT_RATINGS);

const LIST_ORDER: Readonly<Record<MangaList, Params>> = {
  popular: { 'order[followedCount]': 'desc' },
  latest: { 'order[latestUploadedChapter]': 'desc' },
  top: { 'order[rating]': 'desc' },
  new: { 'order[createdAt]': 'desc' },
};

/** Only series with chapters someone here can read: English or Filipino. */
const LIST_FILTERS: Params = {
  'contentRating[]': CONTENT_RATINGS,
  'availableTranslatedLanguage[]': MANGA_LANGUAGES,
  hasAvailableChapters: 'true',
  'includes[]': ['cover_art'],
};

interface MangaDexCatalogOptions {
  /** Called for upstream items that fail validation (they are skipped). */
  readonly onInvalidItem?: (issues: unknown) => void;
}

type Schema<T> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown[] } } };

/** Chapter numbers sort numerically ("2" before "10"); oneshots (no number) first. */
function compareChapters(a: MangaChapter, b: MangaChapter): number {
  const na = a.chapter === null ? -1 : Number.parseFloat(a.chapter);
  const nb = b.chapter === null ? -1 : Number.parseFloat(b.chapter);
  const da = Number.isNaN(na) ? -1 : na;
  const db = Number.isNaN(nb) ? -1 : nb;
  if (da !== db) return da - db;
  return a.publishedAt.localeCompare(b.publishedAt);
}

/** Manga from MangaDex, mapped into the shared contract. No account or key is needed. */
export class MangaDexCatalog implements MangaCatalog {
  private readonly client: MangaDexClient;
  private readonly onInvalidItem: (issues: unknown) => void;

  constructor(client: MangaDexClient, options: MangaDexCatalogOptions = {}) {
    this.client = client;
    this.onInvalidItem = options.onInvalidItem ?? (() => undefined);
  }

  private parse<T>(schema: Schema<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new UpstreamError('bad_response', 'Unexpected MangaDex response shape', { cause: result.error });
    return result.data;
  }

  private parseItems<T>(schema: Schema<T>, values: readonly unknown[]): T[] {
    const items: T[] = [];
    for (const value of values) {
      const result = schema.safeParse(value);
      if (result.success) items.push(result.data);
      else this.onInvalidItem(result.error.issues.slice(0, 3));
    }
    return items;
  }

  private async mangaPage(params: Params, page: number, ttl: number): Promise<Page<MangaSummary>> {
    const offset = (page - 1) * MANGA_PAGE_SIZE;
    if (offset + MANGA_PAGE_SIZE > MAX_RESULTS) return { items: [], page, hasNextPage: false };
    const raw = await this.client.get('/manga', { ...LIST_FILTERS, ...params, limit: MANGA_PAGE_SIZE, offset }, ttl);
    const data = this.parse(RawCollection, raw);
    const all = this.parseItems(RawManga, data.data).map(toMangaSummary);
    const end = data.offset + data.limit;
    const readable = await this.readableIds(all.map((item) => item.id), ttl).catch(() => null);
    // On a failed check, show everything rather than nothing.
    const items = readable ? all.filter((item) => readable.has(item.id)) : all;
    return { items, page, hasNextPage: end < Math.min(data.total, MAX_RESULTS) };
  }

  /**
   * Which of these titles have at least one chapter with pages on MangaDex in English or Filipino.
   * Licensed series often keep only links to the publisher (MANGA Plus, Webnovel, …), which MangaDex still counts
   * as "available chapters". Asks `GET /chapter` for readable chapters of all of them at once; titles found are
   * readable, and the rest are asked again until none are left or nothing more comes back. Titles not settled
   * after a few passes are kept.
   */
  private async readableIds(ids: readonly string[], ttl: number): Promise<Set<string>> {
    const readable = new Set<string>();
    let remaining = [...ids];
    for (let pass = 0; pass < READABLE_PASSES && remaining.length > 0; pass += 1) {
      const raw = await this.client.get(
        '/chapter',
        {
          'manga[]': remaining,
          'translatedLanguage[]': MANGA_LANGUAGES,
          includeExternalUrl: '0',
          includeEmptyPages: '0',
          includeFutureUpdates: '0',
          'contentRating[]': CONTENT_RATINGS,
          limit: READABLE_LIMIT,
        },
        ttl,
      );
      const data = this.parse(RawCollection, raw);
      const found = new Set(
        this.parseItems(RawChapter, data.data)
          .map(chapterMangaId)
          .filter((id): id is string => id !== null),
      );
      for (const id of found) readable.add(id);
      remaining = remaining.filter((id) => !found.has(id));
      // Every readable chapter of the remaining titles came back, or none of them has any.
      if (data.total <= data.data.length || found.size === 0) {
        if (found.size === 0 && data.total > 0) break;
        return readable;
      }
    }
    // Unsettled titles stay listed.
    for (const id of remaining) readable.add(id);
    return readable;
  }

  list(list: MangaList, page: number): Promise<Page<MangaSummary>> {
    return this.mangaPage(LIST_ORDER[list], page, list === 'latest' ? 5 * MINUTE : 30 * MINUTE);
  }

  search(query: string, page: number): Promise<Page<MangaSummary>> {
    return this.mangaPage({ title: query, 'order[relevance]': 'desc' }, page, 10 * MINUTE);
  }

  async manga(id: string): Promise<MangaDetail> {
    const raw = await this.client.get(`/manga/${id}`, { 'includes[]': ['cover_art', 'author', 'artist'] }, HOUR);
    const manga = this.parse(RawManga, this.parse(RawEntity, raw).data);
    if (!SAFE_RATINGS.has(manga.attributes.contentRating ?? '')) throw new UpstreamError('not_found', 'Explicit title');
    return toMangaDetail(manga);
  }

  async chapters(id: string, language: MangaLanguage): Promise<readonly MangaChapter[]> {
    // Also checks that the series exists and is not explicit.
    await this.manga(id);
    const chapters: MangaChapter[] = [];
    for (let offset = 0; offset < MAX_CHAPTERS; offset += FEED_LIMIT) {
      const raw = await this.client.get(
        `/manga/${id}/feed`,
        {
          'translatedLanguage[]': [language],
          'includes[]': ['scanlation_group'],
          'order[chapter]': 'asc',
          includeFutureUpdates: '0',
          limit: FEED_LIMIT,
          offset,
        },
        15 * MINUTE,
      );
      const data = this.parse(RawCollection, raw);
      for (const chapter of this.parseItems(RawChapter, data.data)) {
        const mapped = toMangaChapter(chapter);
        if (mapped) chapters.push(mapped);
      }
      if (data.offset + data.limit >= data.total || data.data.length === 0) break;
    }
    return chapters.sort(compareChapters);
  }

  async chapter(id: string): Promise<MangaChapterPages> {
    const raw = await this.client.get(`/chapter/${id}`, { 'includes[]': ['scanlation_group', 'manga'] }, HOUR);
    const chapter = this.parse(RawChapter, this.parse(RawEntity, raw).data);
    const mangaId = chapterMangaId(chapter);
    const mapped = toMangaChapter(chapter);
    if (!mapped || !mangaId) throw new UpstreamError('not_found', 'Chapter not in a supported language');

    const mangaRating = chapter.relationships?.find((relation) => relation.type === 'manga')?.attributes?.contentRating;
    if (typeof mangaRating !== 'string' || !SAFE_RATINGS.has(mangaRating)) throw new UpstreamError('not_found', 'Explicit title');

    const base = {
      id: mapped.id,
      mangaId,
      chapter: mapped.chapter,
      volume: mapped.volume,
      title: mapped.title,
      language: mapped.language,
      groups: mapped.groups,
      externalUrl: mapped.externalUrl,
    };
    // Chapters hosted on an official site (e.g. MANGA Plus) have no pages on MangaDex.
    if (mapped.externalUrl && mapped.pages === 0) return { ...base, pages: [], pagesDataSaver: [] };

    // The node address is short-lived (about 15 minutes); the page names and hash are not.
    const atHome = this.parse(RawAtHome, await this.client.get(`/at-home/server/${id}`, {}, 10 * MINUTE));
    return { ...base, pages: toPages(atHome, 'data'), pagesDataSaver: toPages(atHome, 'data-saver') };
  }
}
