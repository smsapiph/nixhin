import type {
  CastMember,
  MediaDetail,
  MediaKind,
  MediaSummary,
  Trailer,
  TvEpisode,
  TvSeason,
} from '../../../shared/api.js';
import type { RawListItem, RawMovieDetail, RawTvDetail } from './schemas.js';

/** TMDB's image CDN; the only image host movie/TV data ever points at. */
export const TMDB_IMAGE_ORIGIN = 'https://image.tmdb.org';
const IMAGE_PATH = /^\/[A-Za-z0-9_-]{1,100}\.(?:jpg|jpeg|png)$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const IMDB_ID = /^tt\d{5,10}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Scores from a handful of votes are noise. */
const MIN_VOTES = 20;
const MAX_CAST = 12;
const MAX_RECOMMENDATIONS = 12;

export type GenreNames = ReadonlyMap<number, string>;

/** Image sizes TMDB serves (see /configuration). */
type ImageSize = 'w185' | 'w342' | 'w500' | 'w780' | 'w1280';

export function imageUrl(path: string | null | undefined, size: ImageSize): string | null {
  return path && IMAGE_PATH.test(path) ? `${TMDB_IMAGE_ORIGIN}/t/p/${size}${path}` : null;
}

const cleanText = (text: string | null | undefined): string | null => {
  const value = text?.replace(/\s+/g, ' ').trim();
  return value ? value : null;
};

const isoDate = (value: string | null | undefined): string | null => (value && DATE.test(value) ? value : null);

function score(average: number | null | undefined, votes: number | null | undefined): number | null {
  if (average === null || average === undefined || (votes ?? 0) < MIN_VOTES || average <= 0) return null;
  return Math.round(average * 10) / 10;
}

/** The item's kind: from `media_type` in mixed results, else the list it came from. */
function kindOf(raw: RawListItem, fallback: MediaKind): MediaKind | null {
  if (!raw.media_type) return fallback;
  return raw.media_type === 'movie' || raw.media_type === 'tv' ? raw.media_type : null;
}

/** Card data, or null for adult titles, people and items with no title. */
export function toSummary(raw: RawListItem, fallbackKind: MediaKind, genres: GenreNames): MediaSummary | null {
  const kind = kindOf(raw, fallbackKind);
  if (kind === null || raw.adult === true) return null;
  const title = cleanText(kind === 'movie' ? raw.title : raw.name) ?? cleanText(raw.title ?? raw.name);
  if (!title) return null;
  const original = cleanText(kind === 'movie' ? raw.original_title : raw.original_name);
  const releaseDate = isoDate(kind === 'movie' ? raw.release_date : raw.first_air_date);
  return {
    kind,
    id: raw.id,
    title,
    originalTitle: original && original.toLowerCase() !== title.toLowerCase() ? original : null,
    imageUrl: imageUrl(raw.poster_path, 'w342'),
    imageUrlLarge: imageUrl(raw.poster_path, 'w500'),
    backdropUrl: imageUrl(raw.backdrop_path, 'w1280'),
    releaseDate,
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    score: score(raw.vote_average, raw.vote_count),
    genres: (raw.genre_ids ?? []).map((id) => genres.get(id)).filter((name): name is string => name !== undefined),
    synopsis: cleanText(raw.overview),
  };
}

function trailer(raw: RawMovieDetail | RawTvDetail): Trailer | null {
  const videos = (raw.videos?.results ?? []).filter(
    (video) => video.site === 'YouTube' && video.key && YOUTUBE_ID.test(video.key),
  );
  const pick =
    videos.find((video) => video.type === 'Trailer' && video.official) ??
    videos.find((video) => video.type === 'Trailer') ??
    videos.find((video) => video.type === 'Teaser');
  return pick?.key ? { youtubeId: pick.key } : null;
}

function cast(raw: RawMovieDetail | RawTvDetail): CastMember[] {
  return [...(raw.credits?.cast ?? [])]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, MAX_CAST)
    .map((person) => ({
      name: person.name,
      character: cleanText(person.character),
      imageUrl: imageUrl(person.profile_path, 'w185'),
    }));
}

/** Philippine rating first, then US. */
const RATING_COUNTRIES = ['PH', 'US'];

function movieRating(raw: RawMovieDetail): string | null {
  const results = raw.release_dates?.results ?? [];
  for (const country of RATING_COUNTRIES) {
    const entry = results.find((result) => result.iso_3166_1 === country);
    const certification = entry?.release_dates?.map((date) => cleanText(date.certification)).find(Boolean);
    if (certification) return certification;
  }
  return null;
}

function tvRating(raw: RawTvDetail): string | null {
  const results = raw.content_ratings?.results ?? [];
  for (const country of RATING_COUNTRIES) {
    const rating = cleanText(results.find((result) => result.iso_3166_1 === country)?.rating);
    if (rating) return rating;
  }
  return null;
}

/** "Returning Series" → "Returning series"; "Canceled" → "Cancelled". */
function statusLabel(status: string | null | undefined): string | null {
  const text = cleanText(status);
  if (!text) return null;
  if (text === 'Canceled') return 'Cancelled';
  return text.charAt(0) + text.slice(1).toLowerCase();
}

function recommendations(raw: RawMovieDetail | RawTvDetail, kind: MediaKind, genres: GenreNames, parse: (value: unknown) => RawListItem | null) {
  return (raw.recommendations?.results ?? [])
    .map(parse)
    .filter((item): item is RawListItem => item !== null)
    .map((item) => toSummary(item, kind, genres))
    .filter((item): item is MediaSummary => item !== null)
    .slice(0, MAX_RECOMMENDATIONS);
}

function detailGenres(raw: RawMovieDetail | RawTvDetail): Map<number, string> {
  return new Map((raw.genres ?? []).map((genre) => [genre.id, genre.name]));
}

export function toMovieDetail(
  raw: RawMovieDetail,
  genres: GenreNames,
  parse: (value: unknown) => RawListItem | null,
): MediaDetail {
  const own = detailGenres(raw);
  const base = toSummary({ ...raw, media_type: 'movie', genre_ids: [...own.keys()] }, 'movie', own);
  if (!base) throw new Error('movie without a title');
  const imdb = raw.imdb_id ?? raw.external_ids?.imdb_id;
  return {
    ...base,
    tagline: cleanText(raw.tagline),
    status: statusLabel(raw.status),
    runtime: raw.runtime && raw.runtime > 0 ? raw.runtime : null,
    rating: movieRating(raw),
    companies: (raw.production_companies ?? []).map((company) => company.name).slice(0, 3),
    makers: (raw.credits?.crew ?? []).filter((person) => person.job === 'Director').map((person) => person.name).slice(0, 3),
    cast: cast(raw),
    trailer: trailer(raw),
    imdbId: imdb && IMDB_ID.test(imdb) ? imdb : null,
    recommendations: recommendations(raw, 'movie', genres, parse),
    collection: raw.belongs_to_collection ? { id: raw.belongs_to_collection.id, name: raw.belongs_to_collection.name } : null,
    seasons: [],
    lastAired: null,
  };
}

function seasons(raw: RawTvDetail): TvSeason[] {
  const list = (raw.seasons ?? [])
    .filter((season) => season.season_number >= 0 && (season.episode_count ?? 0) > 0)
    .map((season) => {
      const aired = isoDate(season.air_date);
      return {
        number: season.season_number,
        name: cleanText(season.name) ?? (season.season_number === 0 ? 'Specials' : `Season ${season.season_number}`),
        episodeCount: season.episode_count ?? 0,
        year: aired ? Number(aired.slice(0, 4)) : null,
      };
    });
  // Regular seasons in order, specials last.
  return list.sort((a, b) => (a.number === 0 ? 1 : b.number === 0 ? -1 : a.number - b.number));
}

export function toTvDetail(raw: RawTvDetail, genres: GenreNames, parse: (value: unknown) => RawListItem | null): MediaDetail {
  const own = detailGenres(raw);
  const base = toSummary({ ...raw, media_type: 'tv', genre_ids: [...own.keys()] }, 'tv', own);
  if (!base) throw new Error('show without a title');
  const imdb = raw.external_ids?.imdb_id;
  const runtime = raw.episode_run_time?.find((minutes) => minutes > 0) ?? null;
  const last = raw.last_episode_to_air;
  return {
    ...base,
    tagline: cleanText(raw.tagline),
    status: statusLabel(raw.status),
    runtime,
    rating: tvRating(raw),
    companies: (raw.networks ?? []).map((network) => network.name).slice(0, 3),
    makers: (raw.created_by ?? []).map((person) => person.name).slice(0, 3),
    cast: cast(raw),
    trailer: trailer(raw),
    imdbId: imdb && IMDB_ID.test(imdb) ? imdb : null,
    recommendations: recommendations(raw, 'tv', genres, parse),
    collection: null,
    seasons: seasons(raw),
    lastAired: last && last.season_number >= 1 && last.episode_number >= 1 ? { season: last.season_number, episode: last.episode_number } : null,
  };
}

export function toEpisode(raw: {
  episode_number: number;
  name?: string | null | undefined;
  air_date?: string | null | undefined;
  runtime?: number | null | undefined;
  overview?: string | null | undefined;
}): TvEpisode {
  return {
    number: raw.episode_number,
    title: cleanText(raw.name),
    aired: isoDate(raw.air_date),
    runtime: raw.runtime && raw.runtime > 0 ? raw.runtime : null,
    overview: cleanText(raw.overview),
  };
}
