import type { AnimeRef, MediaKind } from '../../shared/api';
import { createStore, isPositiveInt, parseImageUrl, parseShortText } from './store';

/**
 * A saved title. Anime have no `kind` (entries saved before movies & TV existed stay valid);
 * movies and TV shows carry it, since their TMDB ids are a separate id space.
 */
export interface QueueItem extends AnimeRef {
  readonly kind?: MediaKind;
}

/** What kind of title a stored item is. */
export type ItemKind = 'anime' | MediaKind;

export const kindOf = (item: { readonly kind?: MediaKind | undefined }): ItemKind => item.kind ?? 'anime';

/** Identity across kinds: anime 5 and movie 5 are different titles. */
export const itemKey = (kind: ItemKind, id: number): string => `${kind}:${id}`;

export function parseKind(value: unknown): MediaKind | undefined {
  return value === 'movie' || value === 'tv' ? value : undefined;
}

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

function parseQueueItem(value: unknown): QueueItem | undefined {
  const ref = parseAnimeRef(value);
  if (!ref) return undefined;
  const kind = parseKind((value as Record<string, unknown>).kind);
  return kind ? { ...ref, kind } : ref;
}

/** Keeps only well-formed, unique entries. */
export function parseQueueValue(value: unknown): QueueItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: QueueItem[] = [];
  for (const entry of value) {
    const item = parseQueueItem(entry);
    if (!item) continue;
    const key = itemKey(kindOf(item), item.id);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= MAX_QUEUE_ITEMS) break;
  }
  return items;
}

/** Parses a stored queue string. Returns null if unusable. */
export function parseQueue(raw: string | null): QueueItem[] | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? parseQueueValue(value) : null;
  } catch {
    return null;
  }
}

export const queueStore = createStore<readonly QueueItem[]>(STORAGE_KEY, parseQueueValue);
