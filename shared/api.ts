/**
 * Public contract between the Nixhin backend and frontend.
 * The backend maps raw upstream data (AniList) into these shapes; the frontend never
 * talks to the upstream API directly. Safe to import from both sides.
 */

export const SCHEDULE_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export type ScheduleDay = (typeof SCHEDULE_DAYS)[number];

export const TOP_FILTERS = ['airing', 'upcoming', 'bypopularity', 'favorite'] as const;
export type TopFilter = (typeof TOP_FILTERS)[number];

/** Search / browse filters (`/api/anime/search`). */
export const SEARCH_SEASONS = ['winter', 'spring', 'summer', 'fall'] as const;
export type SearchSeason = (typeof SEARCH_SEASONS)[number];
export const SEARCH_FORMATS = ['tv', 'tv_short', 'movie', 'ova', 'ona', 'special'] as const;
export type SearchFormat = (typeof SEARCH_FORMATS)[number];
export const SEARCH_STATUSES = ['airing', 'finished', 'upcoming'] as const;
export type SearchStatus = (typeof SEARCH_STATUSES)[number];
export const SEARCH_SORTS = ['popularity', 'score', 'trending', 'newest', 'title'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];
/** Earliest year offered by the year filter. */
export const SEARCH_MIN_YEAR = 1940;

export interface Broadcast {
  /** Broadcast weekday in `timezone`, e.g. "saturday". */
  readonly day: ScheduleDay;
  /** 24h "HH:mm" in `timezone`. */
  readonly time: string;
  /** IANA zone, normally "Asia/Tokyo". */
  readonly timezone: string;
}

/** Minimal reference to an anime: enough to render a poster card. */
export interface AnimeRef {
  readonly id: number;
  readonly title: string;
  readonly imageUrl: string | null;
}

export interface AnimeSummary extends AnimeRef {
  readonly title: string;
  readonly titleJapanese: string | null;
  /** Large portrait poster (`imageUrl` is the regular size). */
  readonly imageUrlLarge: string | null;
  /** Wide banner image when one exists. */
  readonly bannerUrl: string | null;
  readonly type: string | null;
  readonly episodes: number | null;
  /** Average user score on a 0–10 scale. */
  readonly score: number | null;
  /** Number of users tracking the title (popularity). */
  readonly members: number | null;
  readonly genres: readonly string[];
  readonly year: number | null;
  readonly season: string | null;
  readonly airing: boolean;
  readonly synopsis: string | null;
  readonly broadcast: Broadcast | null;
}

export interface Trailer {
  /** Validated 11-character YouTube video id. */
  readonly youtubeId: string;
}

export interface AnimeDetail extends AnimeSummary {
  readonly titleEnglish: string | null;
  readonly status: string | null;
  readonly duration: string | null;
  readonly rating: string | null;
  readonly rank: number | null;
  readonly studios: readonly string[];
  readonly trailer: Trailer | null;
  /** MyAnimeList id, when AniList knows it (some providers key on it). */
  readonly malId: number | null;
  /**
   * Episodes released so far: `episodes` for finished shows, the count up to the next airing
   * episode for ongoing ones (One Piece has `episodes: null`), 0 before release. Null if unknown.
   */
  readonly airedEpisodes: number | null;
}

/** One entry of a franchise's watch order: seasons, movies and OVAs linked as sequel/prequel. */
export interface SeasonEntry extends AnimeRef {
  /** Format label, e.g. "TV", "Movie". */
  readonly type: string | null;
  readonly year: number | null;
  readonly episodes: number | null;
  readonly airing: boolean;
}

/** Whether episode playback is configured on the server, and in which audio/subtitle variants. */
export interface StreamConfig {
  readonly enabled: boolean;
  /** e.g. ["sub", "dub"]; the first is the default. */
  readonly languages: readonly string[];
}

/** A playable episode on the configured provider. */
export interface StreamSource {
  readonly episode: number;
  readonly language: string;
  /** The https embed URL, encoded with `encodeStreamToken` (shared/streamToken.ts). */
  readonly token: string;
}

export interface Episode {
  readonly number: number;
  readonly title: string | null;
  readonly titleJapanese: string | null;
  /** ISO date string. */
  readonly aired: string | null;
  readonly filler: boolean;
  readonly recap: boolean;
}

export interface Genre {
  /** Genre name; also the value used to filter search results. */
  readonly name: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly hasNextPage: boolean;
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
  };
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL_ERROR';
