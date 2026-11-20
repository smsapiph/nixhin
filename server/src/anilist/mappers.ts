import {
  SCHEDULE_DAYS,
  type AnimeDetail,
  type AnimeRef,
  type AnimeSummary,
  type Broadcast,
  type SeasonEntry,
} from '../../../shared/api.js';
import type { RawFranchiseNode, RawMedia, RawMediaDetail } from './schemas.js';

/** Hosts we allow image URLs from; anything else is dropped before reaching the browser. */
const IMAGE_HOSTS: ReadonlySet<string> = new Set(['s4.anilist.co', 'img.anili.st', 'i.ytimg.com', 'img.youtube.com']);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
/** Japan has no DST, so JST is always UTC+9. */
const JST_OFFSET_SECONDS = 9 * 60 * 60;

const FORMAT_LABELS: Readonly<Record<string, string>> = {
  TV: 'TV',
  TV_SHORT: 'TV Short',
  MOVIE: 'Movie',
  SPECIAL: 'Special',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Music',
};

const STATUS_LABELS: Readonly<Record<string, string>> = {
  RELEASING: 'Currently airing',
  FINISHED: 'Finished airing',
  NOT_YET_RELEASED: 'Not yet aired',
  CANCELLED: 'Cancelled',
  HIATUS: 'On hiatus',
};

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

/** Returns the URL only if it is https on an allow-listed image host. */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && IMAGE_HOSTS.has(parsed.hostname) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** A validated YouTube id, or null for other sites / malformed ids. */
export function youtubeTrailerId(trailer: RawMediaDetail['trailer']): string | null {
  if (trailer?.site !== 'youtube' || !trailer.id) return null;
  return YOUTUBE_ID.test(trailer.id) ? trailer.id : null;
}

/**
 * Converts AniList's lightly-formatted description to plain text: line breaks kept,
 * tags removed, entities decoded, trailing "(Source: …)" credit dropped.
 * The frontend renders it as text, so this is about readability, not XSS.
 */
export function cleanDescription(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) return safeCodePoint(parseInt(entity.slice(2), 16), match);
      if (entity.startsWith('#')) return safeCodePoint(parseInt(entity.slice(1), 10), match);
      return HTML_ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/\s*\(Source:[^)]*\)\s*$/i, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || null;
}

function safeCodePoint(code: number, fallback: string): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : fallback;
}

/** Converts an absolute airing time (unix seconds) to its JST weekday and time. */
export function jstBroadcast(airingAt: number): Broadcast {
  const jst = new Date((airingAt + JST_OFFSET_SECONDS) * 1000);
  const day = SCHEDULE_DAYS[(jst.getUTCDay() + 6) % 7] ?? 'monday';
  const time = `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;
  return { day, time, timezone: 'Asia/Tokyo' };
}

export function pickTitle(title: RawMedia['title']): string {
  return title?.romaji || title?.english || title?.native || 'Untitled';
}

/** AniList scores are 0–100; the contract uses 0–10 with one decimal. */
function toScore(media: RawMedia): number | null {
  const score = media.averageScore ?? media.meanScore;
  return score === null || score === undefined ? null : Math.round(score) / 10;
}

export function toAnimeRef(media: Pick<RawMedia, 'id' | 'title' | 'coverImage'>): AnimeRef {
  return {
    id: media.id,
    title: pickTitle(media.title),
    imageUrl: safeImageUrl(media.coverImage?.large ?? media.coverImage?.extraLarge),
  };
}

export function toAnimeSummary(media: RawMedia): AnimeSummary {
  return {
    ...toAnimeRef(media),
    titleJapanese: media.title?.native ?? null,
    imageUrlLarge: safeImageUrl(media.coverImage?.extraLarge ?? media.coverImage?.large),
    bannerUrl: safeImageUrl(media.bannerImage),
    type: media.format ? (FORMAT_LABELS[media.format] ?? media.format) : null,
    episodes: media.episodes ?? null,
    score: toScore(media),
    members: media.popularity ?? null,
    genres: media.genres ?? [],
    year: media.seasonYear ?? null,
    season: media.season ? media.season.toLowerCase() : null,
    airing: media.status === 'RELEASING',
    synopsis: cleanDescription(media.description),
    broadcast: media.nextAiringEpisode ? jstBroadcast(media.nextAiringEpisode.airingAt) : null,
  };
}

/**
 * Episodes released so far. Ongoing shows count up to the next airing episode, because
 * their `episodes` total is usually null (One Piece) or the planned, not aired, count.
 */
export function airedEpisodeCount(media: {
  readonly status?: string | null | undefined;
  readonly episodes?: number | null | undefined;
  readonly nextAiringEpisode?: { readonly episode: number } | null | undefined;
}): number | null {
  if (media.status === 'NOT_YET_RELEASED') return 0;
  if (media.status === 'RELEASING' && media.nextAiringEpisode) return Math.max(0, media.nextAiringEpisode.episode - 1);
  return media.episodes ?? null;
}

export function toSeasonEntry(media: RawFranchiseNode): SeasonEntry {
  return {
    ...toAnimeRef(media),
    type: media.format ? (FORMAT_LABELS[media.format] ?? media.format) : null,
    year: media.startDate?.year ?? media.seasonYear ?? null,
    episodes: media.episodes ?? null,
    airing: media.status === 'RELEASING',
  };
}

export function toAnimeDetail(media: RawMediaDetail): AnimeDetail {
  const youtubeId = youtubeTrailerId(media.trailer);
  const rank = media.rankings?.find((r) => r.type === 'RATED' && r.allTime)?.rank ?? null;
  return {
    ...toAnimeSummary(media),
    titleEnglish: media.title?.english ?? null,
    status: media.status ? (STATUS_LABELS[media.status] ?? media.status) : null,
    duration: media.duration ? `${media.duration} min per episode` : null,
    rating: null, // AniList does not publish age ratings.
    rank,
    studios: (media.studios?.nodes ?? []).map((studio) => studio.name),
    trailer: youtubeId ? { youtubeId } : null,
    // Built from the id rather than trusting an upstream URL.
    sourceUrl: `https://anilist.co/anime/${media.id}`,
    malId: media.idMal ?? null,
    airedEpisodes: airedEpisodeCount(media),
  };
}

/** Parses streaming titles like "Episode 3 - The Journey Begins" into a number → title map. */
export function streamingTitles(entries: readonly { readonly title?: string | null | undefined }[]): Map<number, string> {
  const titles = new Map<number, string>();
  for (const { title } of entries) {
    const match = title?.match(/^Episode\s+(\d+)\s*[-–:]\s*(.+)$/i);
    if (match?.[1] && match[2]) titles.set(Number(match[1]), match[2].trim());
  }
  return titles;
}
