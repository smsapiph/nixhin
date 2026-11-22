import type { AnimeRef } from '../../shared/api';
import { createStore, isPositiveInt, parseImageUrl, parseShortText } from './store';

/**
 * Stores small anime references so the queue renders without extra API calls.
 * v3: ids are the catalog's current id space (earlier versions used other ids).
 */
const STORAGE_KEY = 'nixhin-queue-v3';
export const MAX_QUEUE_ITEMS = 200;

/** One stored anime reference, or undefined when malformed. */
export function parseAnimeRef(value: unknown): AnimeRef | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const title = parseShortText(v.title, 300);
  const imageUrl = parseImageUrl(v.imageUrl);
  if (!isPositiveInt(v.id) || title === undefined || imageUrl === undefined) return undefined;
  return { id: v.id, title, imageUrl };
}

/** Keeps only well-formed, unique entries. */
export function parseQueueValue(value: unknown): AnimeRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const items: AnimeRef[] = [];
  for (const entry of value) {
    const ref = parseAnimeRef(entry);
    if (!ref || seen.has(ref.id)) continue;
    seen.add(ref.id);
    items.push(ref);
    if (items.length >= MAX_QUEUE_ITEMS) break;
  }
  return items;
}

/** Parses a stored queue string. Returns null if unusable. */
export function parseQueue(raw: string | null): AnimeRef[] | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? parseQueueValue(value) : null;
  } catch {
    return null;
  }
}

export const queueStore = createStore<readonly AnimeRef[]>(STORAGE_KEY, parseQueueValue);
