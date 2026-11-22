import type { AnimeRef, MediaKind } from '../../shared/api';
import { itemKey, kindOf, parseAnimeRef, parseKind, type ItemKind } from './queueStorage';
import { createStore, isPositiveInt } from './store';

/**
 * What the viewer has watched of one title, kept on this device.
 *
 * - Anime: `episode` is the episode number; `watched` holds episode numbers.
 * - TV shows: `season` + `episode` locate the last episode opened; `watched` holds
 *   `episodeKey(season, episode)` values, and `total` is the key of the latest aired episode.
 * - Movies: a single "episode" 1, with `total` 1.
 */
export interface WatchProgress extends AnimeRef {
  /** Absent for anime (entries saved before movies & TV existed). */
  readonly kind?: MediaKind;
  /** TV only. */
  readonly season?: number;
  /** Episode last opened. */
  readonly episode: number;
  readonly language: string | null;
  /** Episodes available when last seen (see above for TV). Null if unknown. */
  readonly total: number | null;
  /** Episodes marked watched, ascending. */
  readonly watched: readonly number[];
  /** ms since epoch; newest first in the store. */
  readonly updatedAt: number;
}

const STORAGE_KEY = 'nixhin-progress-v1';
export const MAX_PROGRESS_ITEMS = 100;
export const MAX_EPISODE = 5000;
export const MAX_SEASON = 500;
const SEASON_FACTOR = 10_000;
const MAX_TV_KEY = MAX_SEASON * SEASON_FACTOR + MAX_EPISODE;

/** One number per TV episode, ordered by season then episode (S2E3 → 20003). */
export const episodeKey = (season: number, episode: number): number => season * SEASON_FACTOR + episode;
export const splitEpisodeKey = (key: number): { season: number; episode: number } => ({
  season: Math.floor(key / SEASON_FACTOR),
  episode: key % SEASON_FACTOR,
});

const isLanguage = (value: unknown): value is string => typeof value === 'string' && /^[a-z]{2,10}$/.test(value);
const isSeason = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_SEASON;

const keyOf = (entry: { readonly kind?: MediaKind | undefined; readonly id: number }) => itemKey(kindOf(entry), entry.id);

function parseEntry(value: unknown): WatchProgress | undefined {
  const ref = parseAnimeRef(value);
  if (!ref) return undefined;
  const v = value as Record<string, unknown>;
  const kind = parseKind(v.kind);
  if (!isPositiveInt(v.episode, MAX_EPISODE) || !isPositiveInt(v.updatedAt)) return undefined;
  if (kind === 'tv' && !isSeason(v.season)) return undefined;
  const maxWatched = kind === 'tv' ? MAX_TV_KEY : MAX_EPISODE;
  const watched = Array.isArray(v.watched)
    ? [...new Set(v.watched.filter((n): n is number => isPositiveInt(n, maxWatched)))].sort((a, b) => a - b)
    : [];
  return {
    ...ref,
    ...(kind && { kind }),
    ...(kind === 'tv' && { season: v.season as number }),
    episode: v.episode,
    language: isLanguage(v.language) ? v.language : null,
    total: isPositiveInt(v.total, maxWatched) ? v.total : null,
    watched,
    updatedAt: v.updatedAt,
  };
}

/** Keeps well-formed entries, one per title, newest first. */
export function parseProgressValue(value: unknown): WatchProgress[] {
  if (!Array.isArray(value)) return [];
  const byKey = new Map<string, WatchProgress>();
  for (const candidate of value) {
    const entry = parseEntry(candidate);
    if (!entry) continue;
    const existing = byKey.get(keyOf(entry));
    if (!existing || existing.updatedAt < entry.updatedAt) byKey.set(keyOf(entry), entry);
  }
  return sortAndCap([...byKey.values()]);
}

function sortAndCap(entries: WatchProgress[]): WatchProgress[] {
  return entries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_PROGRESS_ITEMS);
}

export const progressStore = createStore<readonly WatchProgress[]>(STORAGE_KEY, parseProgressValue);

export function findProgress(list: readonly WatchProgress[], id: number, kind: ItemKind = 'anime'): WatchProgress | undefined {
  const key = itemKey(kind, id);
  return list.find((entry) => keyOf(entry) === key);
}

/** The key under which an entry's last-opened episode is (or would be) marked watched. */
export function currentKey(entry: WatchProgress): number {
  return entry.kind === 'tv' ? episodeKey(entry.season ?? 1, entry.episode) : entry.episode;
}

/**
 * Where "Continue watching" should resume an anime: the next episode once the last one opened is
 * watched. (TV shows resume at their last episode; the show page moves on using its season list.)
 */
export function resumeEpisode(entry: WatchProgress): number {
  if (entry.kind) return entry.episode;
  const done = entry.watched.includes(entry.episode);
  return done && (entry.total === null || entry.episode < entry.total) ? entry.episode + 1 : entry.episode;
}

/** True once everything available is watched. */
export function isFinished(entry: WatchProgress): boolean {
  if (entry.total === null) return false;
  if (entry.kind === 'tv') return entry.watched.includes(entry.total);
  return entry.watched.length >= entry.total && entry.watched.includes(entry.total);
}

/** The title being recorded. `season` is required for TV. */
export interface ShowInfo extends AnimeRef {
  readonly kind?: MediaKind;
  readonly total: number | null;
}

function upsert(
  list: readonly WatchProgress[],
  show: ShowInfo,
  change: (current: WatchProgress | undefined) => Partial<WatchProgress> & { episode: number },
  now: number,
): WatchProgress[] {
  const kind = show.kind;
  const current = findProgress(list, show.id, kind ?? 'anime');
  const next: WatchProgress = {
    language: null,
    watched: [],
    ...current,
    ...(kind && { kind }),
    id: show.id,
    title: show.title,
    imageUrl: show.imageUrl,
    total: show.total ?? current?.total ?? null,
    ...change(current),
    updatedAt: now,
  };
  const key = keyOf(next);
  return sortAndCap([next, ...list.filter((entry) => keyOf(entry) !== key)]);
}

/** Records that an episode was opened (moves the title to the front of "Continue watching"). */
export function recordEpisode(
  list: readonly WatchProgress[],
  show: ShowInfo,
  episode: number,
  language: string | null,
  now = Date.now(),
  season?: number,
): WatchProgress[] {
  return upsert(
    list,
    show,
    (current) => ({
      episode,
      ...(season !== undefined && { season }),
      language: language ?? current?.language ?? null,
    }),
    now,
  );
}

/**
 * Marks or unmarks one episode as watched. For TV pass `episodeKey(season, episode)` as `key`;
 * a show seen for the first time this way starts at that episode.
 */
export function setWatched(
  list: readonly WatchProgress[],
  show: ShowInfo,
  key: number,
  watched: boolean,
  now = Date.now(),
): WatchProgress[] {
  const current = findProgress(list, show.id, show.kind ?? 'anime');
  const has = current?.watched.includes(key) ?? false;
  if (has === watched) return list as WatchProgress[];
  const start = show.kind === 'tv' ? splitEpisodeKey(key) : { season: undefined, episode: key };
  return upsert(
    list,
    show,
    (entry) => ({
      episode: entry?.episode ?? start.episode,
      ...(show.kind === 'tv' && { season: entry?.season ?? start.season }),
      watched: watched
        ? [...(entry?.watched ?? []), key].sort((a, b) => a - b)
        : (entry?.watched ?? []).filter((n) => n !== key),
    }),
    now,
  );
}

export function removeProgress(list: readonly WatchProgress[], id: number, kind: ItemKind = 'anime'): WatchProgress[] {
  const key = itemKey(kind, id);
  return list.filter((entry) => keyOf(entry) !== key);
}

/** Combines two lists (e.g. an imported backup): newest position wins, watched episodes are united. */
export function mergeProgress(a: readonly WatchProgress[], b: readonly WatchProgress[]): WatchProgress[] {
  const byKey = new Map<string, WatchProgress>();
  for (const entry of [...a, ...b]) {
    const key = keyOf(entry);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      continue;
    }
    const [older, newer] = existing.updatedAt <= entry.updatedAt ? [existing, entry] : [entry, existing];
    byKey.set(key, {
      ...newer,
      total: newer.total ?? older.total,
      watched: [...new Set([...older.watched, ...newer.watched])].sort((x, y) => x - y),
    });
  }
  return sortAndCap([...byKey.values()]);
}
