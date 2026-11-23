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

/* ------------------------------------------------------------------ Movies & TV shows (TMDB) */

export type MediaKind = 'movie' | 'tv';

/** Movie lists shown on the Movies home (`/api/movie/list/:list`). */
export const MOVIE_LISTS = ['trending', 'popular', 'now_playing', 'upcoming'] as const;
export type MovieList = (typeof MOVIE_LISTS)[number];
/** TV lists shown on the TV home (`/api/tv/list/:list`). */
export const TV_LISTS = ['trending', 'popular', 'on_the_air', 'airing_today'] as const;
export type TvList = (typeof TV_LISTS)[number];

/** Whether movies & TV are available, and which can play episodes/films on the server's provider. */
export interface MediaConfig {
  /** True when the server has a TMDB token. Without it the site is anime-only. */
  readonly enabled: boolean;
  readonly moviePlayback: boolean;
  readonly tvPlayback: boolean;
}

/** A movie or TV show card. `id` is the TMDB id (its own id space, separate from anime). */
export interface MediaSummary extends AnimeRef {
  readonly kind: MediaKind;
  /** Title in its original language when it differs (e.g. 将軍), else null. */
  readonly originalTitle: string | null;
  readonly imageUrlLarge: string | null;
  /** Wide still for heroes and share cards. */
  readonly backdropUrl: string | null;
  /** First release (movie) or first air date (TV), ISO date. */
  readonly releaseDate: string | null;
  readonly year: number | null;
  /** Average user score on a 0–10 scale; null with too few votes. */
  readonly score: number | null;
  readonly genres: readonly string[];
  readonly synopsis: string | null;
}

export interface CastMember {
  /** TMDB person id, for the person's page (`/person/:id`). */
  readonly id: number;
  readonly name: string;
  readonly character: string | null;
  readonly imageUrl: string | null;
}

export interface TvSeason {
  readonly number: number;
  readonly name: string;
  readonly episodeCount: number;
  readonly year: number | null;
}

export interface MediaDetail extends MediaSummary {
  readonly tagline: string | null;
  /** e.g. "Released", "Returning series". */
  readonly status: string | null;
  /** Minutes: the film's length, or a typical episode. */
  readonly runtime: number | null;
  /** Age rating, Philippine first then US, e.g. "PG-13". */
  readonly rating: string | null;
  /** Studios (movie) or networks (TV). */
  readonly companies: readonly string[];
  /** Director(s) of a movie, creator(s) of a show. */
  readonly makers: readonly string[];
  readonly cast: readonly CastMember[];
  readonly trailer: Trailer | null;
  readonly imdbId: string | null;
  readonly recommendations: readonly MediaSummary[];
  /** Movie only: the series it belongs to ("Dune Collection"). */
  readonly collection: { readonly id: number; readonly name: string } | null;
  /** TV only: regular seasons, oldest first (specials last). Empty for movies. */
  readonly seasons: readonly TvSeason[];
  /** TV only: the latest aired episode, which bounds playback. */
  readonly lastAired: { readonly season: number; readonly episode: number } | null;
}

export interface TvEpisode {
  readonly number: number;
  readonly title: string | null;
  /** ISO date string. */
  readonly aired: string | null;
  readonly runtime: number | null;
  readonly overview: string | null;
}

/** A movie collection, in release order. */
export interface MediaCollection {
  readonly id: number;
  readonly name: string;
  readonly parts: readonly MediaSummary[];
}

/** A playable movie or TV episode on the configured provider (token as in `StreamSource`). */
export interface MediaStreamSource {
  readonly season: number | null;
  readonly episode: number | null;
  readonly token: string;
}

/** An actor or filmmaker, with the movies and shows they are known for. */
export interface PersonDetail {
  readonly id: number;
  readonly name: string;
  readonly imageUrl: string | null;
  /** e.g. "Acting", "Directing". */
  readonly knownFor: string | null;
  readonly biography: string | null;
  /** ISO dates. */
  readonly birthday: string | null;
  readonly deathday: string | null;
  readonly birthplace: string | null;
  /** Their movies, most popular first, with their role in `role`. */
  readonly movies: readonly PersonCredit[];
  readonly shows: readonly PersonCredit[];
}

export interface PersonCredit extends MediaSummary {
  /** Character played, or the job ("Director") for crew credits. */
  readonly role: string | null;
}

/** A genre with its TMDB id (the value used to filter). */
export interface MediaGenre {
  readonly id: number;
  readonly name: string;
}

/* ------------------------------------------------------------------ Manga (MangaDex) */

/** Chapter languages the site offers, in MangaDex codes: English and Filipino. */
export const MANGA_LANGUAGES = ['en', 'fil'] as const;
export type MangaLanguage = (typeof MANGA_LANGUAGES)[number];

/** Lists shown on the Manga home (`/api/manga/list/:list`). */
export const MANGA_LISTS = ['popular', 'latest', 'top', 'new'] as const;
export type MangaList = (typeof MANGA_LISTS)[number];

export type MangaStatus = 'ongoing' | 'completed' | 'hiatus' | 'cancelled';

/** Enough to render a manga card. Ids are MangaDex UUIDs. */
export interface MangaSummary {
  readonly id: string;
  readonly title: string;
  /** Cover image (https://uploads.mangadex.org/…), or null. */
  readonly coverUrl: string | null;
  readonly status: MangaStatus | null;
  readonly year: number | null;
  readonly tags: readonly string[];
  /** Which of the site's languages have chapters. */
  readonly languages: readonly MangaLanguage[];
}

export interface MangaLink {
  readonly label: string;
  readonly url: string;
}

export interface MangaDetail extends MangaSummary {
  readonly altTitles: readonly string[];
  readonly description: string | null;
  readonly authors: readonly string[];
  readonly artists: readonly string[];
  /** shounen, seinen, … */
  readonly demographic: string | null;
  /** Last chapter number when the series is finished, if known. */
  readonly lastChapter: string | null;
  /** Official places to read or buy it. */
  readonly links: readonly MangaLink[];
}

export interface MangaChapter {
  readonly id: string;
  /** Chapter number as text ("12", "12.5"), or null for oneshots. */
  readonly chapter: string | null;
  readonly volume: string | null;
  readonly title: string | null;
  readonly language: MangaLanguage;
  readonly pages: number;
  /** ISO date the chapter became readable. */
  readonly publishedAt: string;
  /** Scanlation groups (credited in the reader). */
  readonly groups: readonly string[];
  /** Set when the chapter is only readable on an official site (e.g. MANGA Plus). */
  readonly externalUrl: string | null;
}

export interface MangaPage {
  /** Through this site's image proxy (uploads.mangadex.org). */
  readonly url: string;
  /** The MangaDex@Home node, tried when `url` fails. */
  readonly fallbackUrl: string;
}

/** One chapter, ready to read. */
export interface MangaChapterPages {
  readonly id: string;
  readonly mangaId: string;
  readonly chapter: string | null;
  readonly volume: string | null;
  readonly title: string | null;
  readonly language: MangaLanguage;
  readonly groups: readonly string[];
  readonly externalUrl: string | null;
  readonly pages: readonly MangaPage[];
  /** Smaller, compressed images (for slow connections). */
  readonly pagesDataSaver: readonly MangaPage[];
}
