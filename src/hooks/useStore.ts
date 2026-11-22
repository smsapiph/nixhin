import { useSyncExternalStore } from 'react';
import type { Store } from '../lib/store';

/** Subscribes a component to a persisted store. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
