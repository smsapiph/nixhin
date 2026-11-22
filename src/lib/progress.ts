import type { AnimeRef } from '../../shared/api';
import { parseAnimeRef } from './queueStorage';
import { createStore, isPositiveInt } from './store';

/** What the viewer has watched of one show, kept on this device. */
export interface WatchProgress extends AnimeRef {
  /** Episode last opened. */
  readonly episode: number;
  readonly language: string | null;
  /** Episodes available when last seen (aired so far, or the total). Null if unknown. */
  readonly total: number | null;
  /** Episode numbers marked watched, ascending. */
  readonly watched: readonly number[];
  /** ms since epoch; newest first in the store. */
  readonly updatedAt: number;
}

const STORAGE_KEY = 'nixhin-progress-v1';
export const MAX_PROGRESS_ITEMS = 100;
export const MAX_EPISODE = 5000;

const isLanguage = (value: unknown): value is string => typeof value === 'string' && /^[a-z]{2,10}$/.test(value);

function parseEntry(value: unknown): WatchProgress | undefined {
  const ref = parseAnimeRef(value);
  if (!ref) return undefined;
  const v = value as Record<string, unknown>;
  if (!isPositiveInt(v.episode, MAX_EPISODE) || !isPositiveInt(v.updatedAt)) return undefined;
  const watched = Array.isArray(v.watched)
    ? [...new Set(v.watched.filter((n): n is number => isPositiveInt(n, MAX_EPISODE)))].sort((a, b) => a - b)
    : [];
  return {
    ...ref,
    episode: v.episode,
    language: isLanguage(v.language) ? v.language : null,
    total: isPositiveInt(v.total, MAX_EPISODE) ? v.total : null,
    watched,
    updatedAt: v.updatedAt,
  };
}

/** Keeps well-formed entries, one per show, newest first. */
export function parseProgressValue(value: unknown): WatchProgress[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<number, WatchProgress>();
  for (const candidate of value) {
    const entry = parseEntry(candidate);
    if (!entry) continue;
    const existing = byId.get(entry.id);
    if (!existing || existing.updatedAt < entry.updatedAt) byId.set(entry.id, entry);
  }
  return sortAndCap([...byId.values()]);
}

function sortAndCap(entries: WatchProgress[]): WatchProgress[] {
  return entries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_PROGRESS_ITEMS);
}

export const progressStore = createStore<readonly WatchProgress[]>(STORAGE_KEY, parseProgressValue);

export function findProgress(list: readonly WatchProgress[], id: number): WatchProgress | undefined {
  return list.find((entry) => entry.id === id);
}

/** Where "Continue watching" should resume: the next episode once the last one opened is watched. */
export function resumeEpisode(entry: WatchProgress): number {
  const done = entry.watched.includes(entry.episode);
  return done && (entry.total === null || entry.episode < entry.total) ? entry.episode + 1 : entry.episode;
}

/** True once every available episode is watched. */
export function isFinished(entry: WatchProgress): boolean {
  return entry.total !== null && entry.watched.length >= entry.total && entry.watched.includes(entry.total);
}

interface ShowInfo extends AnimeRef {
  readonly total: number | null;
}

function upsert(
  list: readonly WatchProgress[],
  show: ShowInfo,
  change: (current: WatchProgress | undefined) => Partial<WatchProgress> & { episode: number },
  now: number,
): WatchProgress[] {
  const current = findProgress(list, show.id);
  const next: WatchProgress = {
    language: null,
    watched: [],
    ...current,
    id: show.id,
    title: show.title,
    imageUrl: show.imageUrl,
    total: show.total ?? current?.total ?? null,
    ...change(current),
    updatedAt: now,
  };
  return sortAndCap([next, ...list.filter((entry) => entry.id !== show.id)]);
}

/** Records that an episode was opened (moves the show to the front of "Continue watching"). */
export function recordEpisode(
  list: readonly WatchProgress[],
  show: ShowInfo,
  episode: number,
  language: string | null,
  now = Date.now(),
): WatchProgress[] {
  return upsert(list, show, (current) => ({ episode, language: language ?? current?.language ?? null }), now);
}

/** Marks or unmarks one episode as watched. */
export function setWatched(
  list: readonly WatchProgress[],
  show: ShowInfo,
  episode: number,
  watched: boolean,
  now = Date.now(),
): WatchProgress[] {
  const current = findProgress(list, show.id);
  const has = current?.watched.includes(episode) ?? false;
  if (has === watched) return list as WatchProgress[];
  return upsert(
    list,
    show,
    (entry) => ({
      episode: entry?.episode ?? episode,
      watched: watched
        ? [...(entry?.watched ?? []), episode].sort((a, b) => a - b)
        : (entry?.watched ?? []).filter((n) => n !== episode),
    }),
    now,
  );
}

export function removeProgress(list: readonly WatchProgress[], id: number): WatchProgress[] {
  return list.filter((entry) => entry.id !== id);
}

/** Combines two lists (e.g. an imported backup): newest position wins, watched episodes are united. */
export function mergeProgress(a: readonly WatchProgress[], b: readonly WatchProgress[]): WatchProgress[] {
  const byId = new Map<number, WatchProgress>();
  for (const entry of [...a, ...b]) {
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, entry);
      continue;
    }
    const [older, newer] = existing.updatedAt <= entry.updatedAt ? [existing, entry] : [entry, existing];
    byId.set(entry.id, {
      ...newer,
      total: newer.total ?? older.total,
      watched: [...new Set([...older.watched, ...newer.watched])].sort((x, y) => x - y),
    });
  }
  return sortAndCap([...byId.values()]);
}
