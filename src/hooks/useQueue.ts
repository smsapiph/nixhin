import { useCallback } from 'react';
import type { MediaKind } from '../../shared/api';
import { itemKey, kindOf, queueStore, type ItemKind, type QueueItem } from '../lib/queueStorage';
import { useStore } from './useStore';

export interface QueueApi {
  readonly items: readonly QueueItem[];
  /** Anime by default; pass the kind for movies and TV shows. */
  readonly isQueued: (id: number, kind?: ItemKind) => boolean;
  /** Adds or removes a title. Movies and TV shows pass `kind` (on the item, e.g. a MediaSummary). */
  readonly toggle: (item: QueueItem) => void;
}

/** The viewer's watch queue, persisted to this device. Newest first. */
export function useQueue(): QueueApi {
  const items = useStore(queueStore);

  const isQueued = useCallback(
    (id: number, kind: ItemKind = 'anime') => items.some((item) => itemKey(kindOf(item), item.id) === itemKey(kind, id)),
    [items],
  );

  const toggle = useCallback(({ id, title, imageUrl, kind }: QueueItem) => {
    const key = itemKey(kind ?? 'anime', id);
    const stored: QueueItem = kind ? { id, title, imageUrl, kind: kind satisfies MediaKind } : { id, title, imageUrl };
    queueStore.set((current) =>
      current.some((item) => itemKey(kindOf(item), item.id) === key)
        ? current.filter((item) => itemKey(kindOf(item), item.id) !== key)
        : [stored, ...current],
    );
  }, []);

  return { items, isQueued, toggle };
}
