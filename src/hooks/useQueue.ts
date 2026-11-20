import { useCallback, useEffect, useState } from 'react';
import type { AnimeRef } from '../../shared/api';
import { loadQueue, saveQueue } from '../lib/queueStorage';

export interface QueueApi {
  readonly items: readonly AnimeRef[];
  readonly isQueued: (id: number) => boolean;
  readonly toggle: (anime: AnimeRef) => void;
}

/** The viewer's watch queue, persisted to this device. Newest first. */
export function useQueue(): QueueApi {
  const [items, setItems] = useState<readonly AnimeRef[]>(loadQueue);

  useEffect(() => {
    saveQueue(items);
  }, [items]);

  const isQueued = useCallback((id: number) => items.some((item) => item.id === id), [items]);

  const toggle = useCallback(({ id, title, imageUrl }: AnimeRef) => {
    setItems((current) =>
      current.some((item) => item.id === id)
        ? current.filter((item) => item.id !== id)
        : [{ id, title, imageUrl }, ...current],
    );
  }, []);

  return { items, isQueued, toggle };
}
