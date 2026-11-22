/**
 * A tiny persisted store: one localStorage key, parsed defensively, kept in memory so
 * `useSyncExternalStore` gets a stable snapshot, and synced across tabs via the `storage` event.
 * Storage can be unavailable (private mode, blocked site data); the store then lives in memory only.
 */
export interface Store<T> {
  readonly key: string;
  get(): T;
  set(next: T | ((current: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

function readRaw(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

/** `parse` receives untrusted JSON (or undefined when nothing is stored) and must return a valid value. */
export function createStore<T>(key: string, parse: (raw: unknown) => T): Store<T> {
  let value: T | undefined;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const onStorage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    value = parse(readRaw(key));
    notify();
  };

  return {
    key,
    get() {
      if (value === undefined) value = parse(typeof window === 'undefined' ? undefined : readRaw(key));
      return value;
    },
    set(next) {
      const current = this.get();
      const updated = typeof next === 'function' ? (next as (current: T) => T)(current) : next;
      if (Object.is(updated, current)) return;
      value = updated;
      try {
        window.localStorage.setItem(key, JSON.stringify(updated));
      } catch {
        // Non-critical: the value simply won't persist.
      }
      notify();
    },
    subscribe(listener) {
      if (listeners.size === 0 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      };
    },
  };
}

export const isPositiveInt = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max;

/** An optional https image URL, or null. */
export function parseImageUrl(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 500) return undefined;
  try {
    return new URL(value).protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** A short single-line string (titles, queries), or undefined if unusable. */
export function parseShortText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  // eslint-disable-next-line no-control-regex
  if (text.length === 0 || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return undefined;
  return text;
}
