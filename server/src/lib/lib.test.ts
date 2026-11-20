import { describe, expect, it } from 'vitest';
import { QueueFullError, RequestScheduler } from './requestScheduler.js';
import { TtlCache } from './ttlCache.js';

describe('TtlCache', () => {
  it('expires entries after their TTL', () => {
    let time = 0;
    const cache = new TtlCache<string>(10, () => time);
    cache.set('a', 'x', 100);
    expect(cache.get('a')).toBe('x');
    time = 100;
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the least recently used entry when full', () => {
    const cache = new TtlCache<number>(2);
    cache.set('a', 1, 1000);
    cache.set('b', 2, 1000);
    cache.get('a'); // 'b' is now least recently used
    cache.set('c', 3, 1000);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });
});

describe('RequestScheduler', () => {
  function fakeClock() {
    const clock = { time: 0, sleeps: [] as number[] };
    const sleep = async (ms: number) => {
      clock.sleeps.push(ms);
      clock.time += ms;
    };
    return { clock, now: () => clock.time, sleep };
  }

  it('spaces calls to respect every window', async () => {
    const { clock, now, sleep } = fakeClock();
    const scheduler = new RequestScheduler({ rules: [{ limit: 2, windowMs: 1000 }], maxQueue: 10, now, sleep });

    const startTimes: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        scheduler.schedule(async () => {
          startTimes.push(clock.time);
        }),
      ),
    );

    expect(startTimes).toEqual([0, 0, 1000, 1000, 2000]);
  });

  it('applies the strictest of several rules', async () => {
    const { clock, now, sleep } = fakeClock();
    const scheduler = new RequestScheduler({
      rules: [
        { limit: 3, windowMs: 1000 },
        { limit: 4, windowMs: 60_000 },
      ],
      maxQueue: 10,
      now,
      sleep,
    });
    // Four calls made at t = 0s, 1s, 2s, 3s.
    for (const t of [0, 1000, 2000, 3000]) {
      clock.time = t;
      await scheduler.schedule(async () => undefined);
    }
    expect(clock.sleeps).toEqual([]);
    // Allowed by the per-second rule but blocked by the per-minute rule until t=60s.
    expect(scheduler.delayUntilNextSlot()).toBe(57_000);
  });

  it('rejects work beyond the queue bound', async () => {
    const { now } = fakeClock();
    const neverSleep = () => new Promise<void>(() => undefined);
    const scheduler = new RequestScheduler({
      rules: [{ limit: 1, windowMs: 1000 }],
      maxQueue: 2,
      now,
      sleep: neverSleep,
    });
    void scheduler.schedule(async () => undefined);
    void scheduler.schedule(async () => undefined);
    await expect(scheduler.schedule(async () => undefined)).rejects.toBeInstanceOf(QueueFullError);
  });
});
