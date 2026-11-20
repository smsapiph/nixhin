import type { z } from 'zod';
import type {
  AnimeDetail,
  AnimeRef,
  AnimeSummary,
  Episode,
  Genre,
  Page,
  SeasonEntry,
  TopFilter,
} from '../../../shared/api.js';
import type { AnimeCatalog, SearchParams } from '../catalog.js';
import { UpstreamError } from '../errors.js';
import type { AniListClient, Variables } from './client.js';
import {
  airedEpisodeCount,
  jstBroadcast,
  streamingTitles,
  toAnimeDetail,
  toAnimeRef,
  toAnimeSummary,
  toSeasonEntry,
} from './mappers.js';
import {
  DETAIL_QUERY,
  EPISODES_QUERY,
  FRANCHISE_QUERY,
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
  FranchiseData,
  GenresData,
  MediaPageData,
  RawAiring,
  RawFranchiseNode,
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
  franchise: 24 * 60 * MINUTE,
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
/**
 * Upstream requests one franchise walk may make; each walks two hops. Every fetched node is
 * cached for a day, so opening another season of the same franchise mostly hits the cache.
 */
const MAX_FRANCHISE_REQUESTS = 8;
/** Relation levels per FRANCHISE_QUERY response that AniList actually fills in. */
const FRANCHISE_DEPTH = 2;
const MAX_SEASONS = 40;
const CHAIN_RELATIONS: ReadonlySet<string> = new Set(['SEQUEL', 'PREQUEL']);
/** Formats shown in the watch order; music videos and the like are skipped. */
const SEASON_FORMATS: ReadonlySet<string> = new Set(['TV', 'TV_SHORT', 'ONA', 'OVA', 'MOVIE', 'SPECIAL']);

/** Sort key from a start date; undated (unannounced) entries go last. */
function startKey(node: RawFranchiseNode): number {
  const date = node.startDate;
  if (!date?.year) return Number.MAX_SAFE_INTEGER;
  return date.year * 10_000 + (date.month ?? 12) * 100 + (date.day ?? 31);
}

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
    const first = (page - 1) * EPISODES_PER_PAGE + 1;
    const raw = await this.client.query(
      'episodes',
      EPISODES_QUERY,
      { id, after: first - 1, before: first + EPISODES_PER_PAGE, perPage: EPISODES_PER_PAGE },
      TTL.episodes,
    );
    const { Media: media, Page: schedule } = parseOrThrow(EpisodesData, raw, 'episodes');
    if (media.isAdult) throw new UpstreamError('not_found', `Anime ${id} is not available`);

    // Only list episodes that have actually aired.
    const aired = airedEpisodeCount(media) ?? 0;

    const airDates = new Map<number, number>();
    for (const node of schedule?.airingSchedules ?? []) {
      if (node) airDates.set(node.episode, node.airingAt);
    }
    const titles = streamingTitles(media.streamingEpisodes ?? []);

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

  /**
   * Walks SEQUEL/PREQUEL links (each request returns two levels of relations) to collect a
   * franchise's watch order. Bounded by MAX_FRANCHISE_REQUESTS and MAX_SEASONS so a sprawling
   * franchise can't eat the upstream rate limit; a failure after the first request returns what
   * was found so far.
   */
  async seasons(id: number): Promise<readonly SeasonEntry[]> {
    const found = new Map<number, RawFranchiseNode>();
    const expanded = new Set<number>();
    const pending: number[] = [];

    // depth 0 is the fetched node; only depths below FRANCHISE_DEPTH carry trustworthy relations.
    const visit = (node: RawFranchiseNode, depth: number) => {
      if (node.type !== 'ANIME' || node.isAdult) return;
      if (!found.has(node.id)) {
        if (found.size >= MAX_SEASONS) return;
        found.set(node.id, node);
      }
      if (expanded.has(node.id)) return;
      if (depth >= FRANCHISE_DEPTH || !node.relations) {
        // Deepest fetched level: its own links need another request.
        if (!pending.includes(node.id)) pending.push(node.id);
        return;
      }
      expanded.add(node.id);
      for (const edge of node.relations.edges ?? []) {
        if (edge?.node && edge.relationType && CHAIN_RELATIONS.has(edge.relationType)) visit(edge.node, depth + 1);
      }
    };

    const fetchNode = async (nodeId: number) => {
      const raw = await this.client.query('franchise', FRANCHISE_QUERY, { id: nodeId }, TTL.franchise);
      const media = RawFranchiseNode.safeParse(parseOrThrow(FranchiseData, raw, 'franchise').Media);
      if (!media.success) throw new UpstreamError('bad_response', `Unexpected franchise shape for anime ${nodeId}`);
      return media.data;
    };

    const root = await fetchNode(id);
    if (root.isAdult) throw new UpstreamError('not_found', `Anime ${id} is not available`);
    visit(root, 0);

    let requests = 1;
    while (requests < MAX_FRANCHISE_REQUESTS && found.size < MAX_SEASONS) {
      const next = pending.shift();
      if (next === undefined) break;
      if (expanded.has(next)) continue;
      requests += 1;
      try {
        visit(await fetchNode(next), 0);
      } catch (error) {
        if (error instanceof UpstreamError) break;
        throw error;
      }
    }

    return [...found.values()]
      .filter((node) => node.format && SEASON_FORMATS.has(node.format))
      .toSorted((a, b) => startKey(a) - startKey(b) || a.id - b.id)
      .map(toSeasonEntry);
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
