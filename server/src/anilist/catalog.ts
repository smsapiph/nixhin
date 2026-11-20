import type { z } from 'zod';
import type {
  AnimeDetail,
  AnimeRef,
  AnimeSummary,
  Episode,
  Genre,
  Page,
  TopFilter,
} from '../../../shared/api.js';
import type { AnimeCatalog, SearchParams } from '../catalog.js';
import { UpstreamError } from '../errors.js';
import type { AniListClient, Variables } from './client.js';
import { jstBroadcast, streamingTitles, toAnimeDetail, toAnimeRef, toAnimeSummary } from './mappers.js';
import {
  DETAIL_QUERY,
  EPISODES_QUERY,
  GENRES_QUERY,
  RECOMMENDATIONS_QUERY,
  SCHEDULE_QUERY,
  SEARCH_QUERY,
  SEASON_QUERY,
  TOP_QUERY,
} from './queries.js';
import {
  DetailData,
  EpisodesData,
  GenresData,
  MediaPageData,
  RawAiring,
  RawMedia,
  RawMediaDetail,
  RawRecommendationTarget,
  RecommendationsData,
  ScheduleData,
} from './schemas.js';

const MINUTE = 60_000;
const TTL = {
  lists: 10 * MINUTE,
  detail: 60 * MINUTE,
  episodes: 60 * MINUTE,
  schedule: 30 * MINUTE,
  genres: 24 * 60 * MINUTE,
} as const;

/** Explicit genres are never offered as filters (adult titles are excluded by every query anyway). */
const EXCLUDED_GENRES: ReadonlySet<string> = new Set(['Hentai', 'Ecchi']);
const EPISODES_PER_PAGE = 50;
const RECOMMENDATION_LIMIT = 12;
/** Hard cap on upstream pages fetched to build the weekly schedule. */
const MAX_SCHEDULE_PAGES = 6;
const WEEK_SECONDS = 7 * 24 * 60 * 60;

const TOP_OPTIONS: Readonly<Record<TopFilter, Variables>> = {
  airing: { status: 'RELEASING', sort: ['TRENDING_DESC', 'POPULARITY_DESC'] },
  upcoming: { status: 'NOT_YET_RELEASED', sort: ['POPULARITY_DESC'] },
  bypopularity: { status: null, sort: ['POPULARITY_DESC'] },
  favorite: { status: null, sort: ['FAVOURITES_DESC'] },
};

type Season = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

/** AniList seasons: December belongs to the following year's WINTER. */
export function currentSeason(date: Date): { season: Season; year: number } {
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  if (month === 11) return { season: 'WINTER', year: year + 1 };
  if (month <= 1) return { season: 'WINTER', year };
  if (month <= 4) return { season: 'SPRING', year };
  if (month <= 7) return { season: 'SUMMER', year };
  return { season: 'FALL', year };
}

function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new UpstreamError('bad_response', `Unexpected ${what} shape from upstream`);
  return result.data;
}

export class AniListCatalog implements AnimeCatalog {
  private readonly client: AniListClient;
  private readonly now: () => Date;
  private readonly onInvalidItem: (error: z.ZodError) => void;

  constructor(
    client: AniListClient,
    options: { now?: () => Date; onInvalidItem?: (error: z.ZodError) => void } = {},
  ) {
    this.client = client;
    this.now = options.now ?? (() => new Date());
    this.onInvalidItem = options.onInvalidItem ?? (() => undefined);
  }

  async top(filter: TopFilter, limit: number): Promise<readonly AnimeSummary[]> {
    const data = await this.client.query('top', TOP_QUERY, { perPage: limit, ...TOP_OPTIONS[filter] }, TTL.lists);
    return this.mediaPage(data, 1).items;
  }

  async seasonNow(page: number, limit: number): Promise<Page<AnimeSummary>> {
    const { season, year } = currentSeason(this.now());
    const data = await this.client.query(
      'season',
      SEASON_QUERY,
      { page, perPage: limit, season, seasonYear: year },
      TTL.lists,
    );
    return this.mediaPage(data, page);
  }

  async search({ query, genre, page, limit }: SearchParams): Promise<Page<AnimeSummary>> {
    if (genre !== undefined) {
      const known = await this.genres();
      if (!known.some((g) => g.name === genre)) throw new UpstreamError('bad_request', `Unknown genre: ${genre}`);
    }
    const data = await this.client.query(
      'search',
      SEARCH_QUERY,
      {
        page,
        perPage: limit,
        search: query ?? null,
        genre: genre ?? null,
        sort: query ? ['SEARCH_MATCH', 'POPULARITY_DESC'] : ['POPULARITY_DESC'],
      },
      TTL.lists,
    );
    return this.mediaPage(data, page);
  }

  async anime(id: number): Promise<AnimeDetail> {
    const data = parseOrThrow(DetailData, await this.client.query('detail', DETAIL_QUERY, { id }, TTL.detail), 'detail');
    const media = RawMediaDetail.safeParse(data.Media);
    if (!media.success) throw new UpstreamError('bad_response', `Unexpected shape for anime ${id}`);
    // Adult titles are treated as non-existent.
    if (media.data.isAdult) throw new UpstreamError('not_found', `Anime ${id} is not available`);
    return toAnimeDetail(media.data);
  }

  async episodes(id: number, page: number): Promise<Page<Episode>> {
    const raw = await this.client.query(
      'episodes',
      EPISODES_QUERY,
      { id, page, perPage: EPISODES_PER_PAGE },
      TTL.episodes,
    );
    const { Media: media } = parseOrThrow(EpisodesData, raw, 'episodes');
    if (media.isAdult) throw new UpstreamError('not_found', `Anime ${id} is not available`);

    // Only list episodes that have actually aired.
    const aired =
      media.status === 'RELEASING' && media.nextAiringEpisode
        ? media.nextAiringEpisode.episode - 1
        : media.status === 'NOT_YET_RELEASED'
          ? 0
          : (media.episodes ?? 0);

    const airDates = new Map<number, number>();
    for (const node of media.airingSchedule?.nodes ?? []) {
      if (node) airDates.set(node.episode, node.airingAt);
    }
    const titles = streamingTitles(media.streamingEpisodes ?? []);

    const first = (page - 1) * EPISODES_PER_PAGE + 1;
    const last = Math.min(page * EPISODES_PER_PAGE, aired);
    const items: Episode[] = [];
    for (let number = first; number <= last; number += 1) {
      const airingAt = airDates.get(number);
      items.push({
        number,
        title: titles.get(number) ?? null,
        titleJapanese: null,
        aired: airingAt === undefined ? null : new Date(airingAt * 1000).toISOString(),
        filler: false,
        recap: false,
      });
    }
    return { items, page, hasNextPage: last < aired };
  }

  async recommendations(id: number): Promise<readonly AnimeRef[]> {
    const raw = await this.client.query(
      'recommendations',
      RECOMMENDATIONS_QUERY,
      { id, perPage: RECOMMENDATION_LIMIT },
      TTL.detail,
    );
    const { Media: media } = parseOrThrow(RecommendationsData, raw, 'recommendations');
    const refs: AnimeRef[] = [];
    for (const node of media.recommendations?.nodes ?? []) {
      const target = RawRecommendationTarget.safeParse(node?.mediaRecommendation);
      if (target.success && !target.data.isAdult && target.data.type === 'ANIME') refs.push(toAnimeRef(target.data));
    }
    return refs;
  }

  async genres(): Promise<readonly Genre[]> {
    const raw = await this.client.query('genres', GENRES_QUERY, {}, TTL.genres);
    return parseOrThrow(GenresData, raw, 'genres')
      .GenreCollection.filter((name) => !EXCLUDED_GENRES.has(name))
      .toSorted((a, b) => a.localeCompare(b))
      .map((name) => ({ name }));
  }

  /** Every show airing in the next seven days, each once, with its slot taken from the actual airing time. */
  async schedule(): Promise<readonly AnimeSummary[]> {
    // Hour-aligned window so the cache key is stable for a while.
    const from = Math.floor(this.now().getTime() / 3_600_000) * 3600;
    const to = from + WEEK_SECONDS;
    const seen = new Map<number, AnimeSummary>();

    for (let page = 1; page <= MAX_SCHEDULE_PAGES; page += 1) {
      const raw = await this.client.query('schedule', SCHEDULE_QUERY, { page, from, to }, TTL.schedule);
      const { Page: result } = parseOrThrow(ScheduleData, raw, 'schedule');

      for (const candidate of result.airingSchedules) {
        const airing = RawAiring.safeParse(candidate);
        if (!airing.success) {
          this.onInvalidItem(airing.error);
          continue;
        }
        const { media, airingAt } = airing.data;
        if (!media || media.isAdult || seen.has(media.id)) continue;
        seen.set(media.id, { ...toAnimeSummary(media), broadcast: jstBroadcast(airingAt) });
      }
      if (!result.pageInfo?.hasNextPage) break;
    }
    return [...seen.values()];
  }

  /** Validates a Page of media, mapping valid items and skipping (but reporting) invalid or adult ones. */
  private mediaPage(raw: unknown, page: number): Page<AnimeSummary> {
    const { Page: result } = parseOrThrow(MediaPageData, raw, 'media page');
    const items: AnimeSummary[] = [];
    for (const candidate of result.media) {
      const media = RawMedia.safeParse(candidate);
      if (!media.success) this.onInvalidItem(media.error);
      else if (!media.data.isAdult) items.push(toAnimeSummary(media.data));
    }
    return {
      items,
      page: result.pageInfo?.currentPage ?? page,
      hasNextPage: result.pageInfo?.hasNextPage ?? false,
    };
  }
}
