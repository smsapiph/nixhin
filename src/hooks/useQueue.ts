import { useCallback } from 'react';
import type { AnimeRef } from '../../shared/api';
import { queueStore } from '../lib/queueStorage';
import { useStore } from './useStore';

export interface QueueApi {
  readonly items: readonly AnimeRef[];
  readonly isQueued: (id: number) => boolean;
  readonly toggle: (anime: AnimeRef) => void;
}

/** The viewer's watch queue, persisted to this device. Newest first. */
export function useQueue(): QueueApi {
  const items = useStore(queueStore);

  const isQueued = useCallback((id: number) => items.some((item) => item.id === id), [items]);

  const toggle = useCallback(({ id, title, imageUrl }: AnimeRef) => {
    queueStore.set((current) =>
      current.some((item) => item.id === id)
        ? current.filter((item) => item.id !== id)
        : [{ id, title, imageUrl }, ...current],
    );
  }, []);

  return { items, isQueued, toggle };
}
