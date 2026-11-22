import type {
  MediaCollection,
  MediaDetail,
  MediaGenre,
  MediaKind,
  MediaSummary,
  MovieList,
  Page,
  PersonDetail,
  TvEpisode,
  TvList,
} from '../../../shared/api.js';
import type { MediaCatalog } from '../catalog.js';
import { UpstreamError } from '../errors.js';
import type { TmdbClient } from './client.js';
import { toEpisode, toMovieDetail, toPerson, toSummary, toTvDetail, type GenreNames } from './mappers.js';
import {
  RawCollection,
  RawGenres,
  RawListItem,
  RawMovieDetail,
  RawPage,
  RawPerson,
  RawPersonCredit,
  RawSeason,
  RawTvDetail,
} from './schemas.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** TMDB serves at most 500 pages of any list. */
const MAX_PAGE = 500;

const MOVIE_LIST_PATHS: Readonly<Record<MovieList, string>> = {
  trending: '/trending/movie/week',
  popular: '/movie/popular',
  now_playing: '/movie/now_playing',
  upcoming: '/movie/upcoming',
};

const TV_LIST_PATHS: Readonly<Record<TvList, string>> = {
  trending: '/trending/tv/week',
  popular: '/tv/popular',
  on_the_air: '/tv/on_the_air',
  airing_today: '/tv/airing_today',
};

interface TmdbCatalogOptions {
  /** Called for upstream items that fail validation (they are skipped). */
  readonly onInvalidItem?: (issues: unknown) => void;
}

/** Movies and TV shows from TMDB, mapped into the shared contract. */
export class TmdbCatalog implements MediaCatalog {
  private readonly client: TmdbClient;
  private readonly onInvalidItem: (issues: unknown) => void;

  constructor(client: TmdbClient, options: TmdbCatalogOptions = {}) {
    this.client = client;
    this.onInvalidItem = options.onInvalidItem ?? (() => undefined);
  }

  private parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: unknown } }, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new UpstreamError('bad_response', 'Unexpected TMDB response shape', { cause: result.error });
    return result.data;
  }

  private readonly parseItem = (value: unknown): RawListItem | null => {
    const result = RawListItem.safeParse(value);
    if (result.success) return result.data;
    this.onInvalidItem(result.error.issues.slice(0, 3));
    return null;
  };

  private async genreNames(kind: MediaKind): Promise<GenreNames> {
    try {
      return new Map((await this.genres(kind)).map((genre) => [genre.id, genre.name]));
    } catch {
      // Cards still render without genre names.
      return new Map();
    }
  }

  private async page(kind: MediaKind, path: string, params: Record<string, string | number | boolean | undefined>, page: number, ttl: number) {
    const [raw, names] = await Promise.all([
      this.client.get(path, { ...params, page, include_adult: false }, ttl),
      this.genreNames(kind),
    ]);
    const data = this.parse(RawPage, raw);
    const items = data.results
      .map(this.parseItem)
      .filter((item): item is RawListItem => item !== null)
      .map((item) => toSummary(item, kind, names))
      .filter((item): item is MediaSummary => item !== null);
    return { items, page: data.page, hasNextPage: data.page < Math.min(data.total_pages, MAX_PAGE) } satisfies Page<MediaSummary>;
  }

  movieList(list: MovieList, page: number): Promise<Page<MediaSummary>> {
    return this.page('movie', MOVIE_LIST_PATHS[list], {}, page, 30 * MINUTE);
  }

  tvList(list: TvList, page: number): Promise<Page<MediaSummary>> {
    return this.page('tv', TV_LIST_PATHS[list], {}, page, 30 * MINUTE);
  }

  discover(kind: MediaKind, genreId: number | undefined, page: number): Promise<Page<MediaSummary>> {
    return this.page(
      kind,
      `/discover/${kind}`,
      // Enough votes keeps obscure, unrated titles out of a "browse" row.
      { with_genres: genreId, sort_by: 'popularity.desc', 'vote_count.gte': 50 },
      page,
      HOUR,
    );
  }

  async genres(kind: MediaKind): Promise<readonly MediaGenre[]> {
    const data = this.parse(RawGenres, await this.client.get(`/genre/${kind}/list`, {}, 24 * HOUR));
    return data.genres;
  }

  search(kind: MediaKind, query: string, page: number): Promise<Page<MediaSummary>> {
    return this.page(kind, `/search/${kind}`, { query }, page, 10 * MINUTE);
  }

  async movie(id: number): Promise<MediaDetail> {
    const [raw, names] = await Promise.all([
      this.client.get(`/movie/${id}`, { append_to_response: 'credits,videos,release_dates,recommendations,external_ids' }, HOUR),
      this.genreNames('movie'),
    ]);
    const data = this.parse(RawMovieDetail, raw);
    if (data.adult) throw new UpstreamError('not_found', 'Adult title');
    return toMovieDetail(data, names, this.parseItem);
  }

  async tv(id: number): Promise<MediaDetail> {
    const [raw, names] = await Promise.all([
      this.client.get(`/tv/${id}`, { append_to_response: 'credits,videos,content_ratings,recommendations,external_ids' }, HOUR),
      this.genreNames('tv'),
    ]);
    const data = this.parse(RawTvDetail, raw);
    if (data.adult) throw new UpstreamError('not_found', 'Adult title');
    return toTvDetail(data, names, this.parseItem);
  }

  async tvSeason(id: number, season: number): Promise<readonly TvEpisode[]> {
    const data = this.parse(RawSeason, await this.client.get(`/tv/${id}/season/${season}`, {}, HOUR));
    return (data.episodes ?? []).filter((episode) => episode.episode_number >= 1).map(toEpisode);
  }

  private readonly parseCredit = (value: unknown): RawPersonCredit | null => {
    const result = RawPersonCredit.safeParse(value);
    if (result.success) return result.data;
    this.onInvalidItem(result.error.issues.slice(0, 3));
    return null;
  };

  async person(id: number): Promise<PersonDetail> {
    const [raw, movie, tv] = await Promise.all([
      this.client.get(`/person/${id}`, { append_to_response: 'combined_credits' }, 6 * HOUR),
      this.genreNames('movie'),
      this.genreNames('tv'),
    ]);
    const data = this.parse(RawPerson, raw);
    if (data.adult) throw new UpstreamError('not_found', 'Adult performer');
    return toPerson(data, { movie, tv }, this.parseCredit);
  }

  async collection(id: number): Promise<MediaCollection> {
    const [raw, names] = await Promise.all([this.client.get(`/collection/${id}`, {}, 6 * HOUR), this.genreNames('movie')]);
    const data = this.parse(RawCollection, raw);
    const parts = (data.parts ?? [])
      .map(this.parseItem)
      .filter((item): item is RawListItem => item !== null)
      .map((item) => toSummary(item, 'movie', names))
      .filter((item): item is MediaSummary => item !== null)
      // Release order; unreleased parts (no date) last.
      .sort((a, b) => (a.releaseDate ?? '9999').localeCompare(b.releaseDate ?? '9999'));
    return { id: data.id, name: data.name, parts };
  }
}
