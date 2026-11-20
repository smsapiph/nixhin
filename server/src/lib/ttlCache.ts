interface Entry<V> {
  readonly value: V;
  readonly expiresAt: number;
}

/**
 * Bounded in-memory cache with per-entry TTL and least-recently-used eviction.
 * Relies on Map preserving insertion order: re-inserting on read marks an entry as fresh.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(maxEntries: number, now: () => number = Date.now) {
    if (maxEntries < 1) throw new RangeError('maxEntries must be at least 1');
    this.maxEntries = maxEntries;
    this.now = now;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    this.entries.delete(key);
    if (entry.expiresAt <= this.now()) return undefined;

    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}
