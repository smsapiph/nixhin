import type { AnimeRef } from '../../shared/api';

/**
 * Stores small anime references so the queue renders without extra API calls.
 * v3: ids are AniList ids (earlier versions used other id spaces).
 */
const STORAGE_KEY = 'nixhin-queue-v3';
const MAX_ITEMS = 200;

function isAnimeRef(value: unknown): value is AnimeRef {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'number' &&
    Number.isInteger(v.id) &&
    v.id > 0 &&
    typeof v.title === 'string' &&
    (v.imageUrl === null || typeof v.imageUrl === 'string')
  );
}

/** Parses a stored queue, keeping only well-formed entries. Returns null if unusable. */
export function parseQueue(raw: string | null): AnimeRef[] | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    return value
      .filter(isAnimeRef)
      .slice(0, MAX_ITEMS)
      .map(({ id, title, imageUrl }) => ({ id, title, imageUrl }));
  } catch {
    return null;
  }
}

export function loadQueue(): AnimeRef[] {
  try {
    return parseQueue(window.localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    // Storage can be unavailable (private mode, blocked cookies).
    return [];
  }
}

export function saveQueue(queue: readonly AnimeRef[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(0, MAX_ITEMS)));
  } catch {
    // Non-critical: the queue simply won't persist this session.
  }
}
