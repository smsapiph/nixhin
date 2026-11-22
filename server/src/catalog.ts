import type {
  AnimeDetail,
  AnimeRef,
  AnimeSummary,
  Episode,
  Genre,
  MediaCollection,
  MediaDetail,
  MediaGenre,
  MediaKind,
  MediaSummary,
  MovieList,
  Page,
  PersonDetail,
  SearchFormat,
  SearchSeason,
  SearchSort,
  SearchStatus,
  SeasonEntry,
  TopFilter,
  TvEpisode,
  TvList,
} from '../../shared/api.js';

export interface SearchParams {
  readonly query?: string;
  readonly genre?: string;
  readonly year?: number;
  readonly season?: SearchSeason;
  readonly format?: SearchFormat;
  readonly status?: SearchStatus;
  /** Defaults to best match for text searches, else popularity. */
  readonly sort?: SearchSort;
  readonly page: number;
  readonly limit: number;
}

/**
 * Everything the HTTP layer needs from a data source. Routes depend only on this
 * interface, so the upstream provider can change without touching them, and tests
 * can use a fake.
 */
export interface AnimeCatalog {
  top(filter: TopFilter, limit: number): Promise<readonly AnimeSummary[]>;
  seasonNow(page: number, limit: number): Promise<Page<AnimeSummary>>;
  search(params: SearchParams): Promise<Page<AnimeSummary>>;
  anime(id: number): Promise<AnimeDetail>;
  episodes(id: number, page: number): Promise<Page<Episode>>;
  recommendations(id: number): Promise<readonly AnimeRef[]>;
  /** The franchise watch order this anime belongs to (itself included), oldest first. */
  seasons(id: number): Promise<readonly SeasonEntry[]>;
  genres(): Promise<readonly Genre[]>;
  schedule(): Promise<readonly AnimeSummary[]>;
}

/** Movies and TV shows (TMDB). Optional: without a token the site stays anime-only. */
export interface MediaCatalog {
  movieList(list: MovieList, page: number): Promise<Page<MediaSummary>>;
  tvList(list: TvList, page: number): Promise<Page<MediaSummary>>;
  discover(kind: MediaKind, genreId: number | undefined, page: number): Promise<Page<MediaSummary>>;
  genres(kind: MediaKind): Promise<readonly MediaGenre[]>;
  search(kind: MediaKind, query: string, page: number): Promise<Page<MediaSummary>>;
  movie(id: number): Promise<MediaDetail>;
  tv(id: number): Promise<MediaDetail>;
  tvSeason(id: number, season: number): Promise<readonly TvEpisode[]>;
  collection(id: number): Promise<MediaCollection>;
  person(id: number): Promise<PersonDetail>;
}
