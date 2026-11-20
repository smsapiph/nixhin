export interface WindowRule {
  readonly limit: number;
  readonly windowMs: number;
}

export class QueueFullError extends Error {
  constructor() {
    super('Upstream request queue is full');
    this.name = 'QueueFullError';
  }
}

interface SchedulerOptions {
  readonly rules: readonly WindowRule[];
  /** Maximum tasks waiting for a slot before new ones are rejected. */
  readonly maxQueue: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Serialises outbound calls so they never exceed any of the sliding-window rules
 * (e.g. Jikan's 3 req/s and 60 req/min). Bounded so a traffic spike sheds load
 * instead of building an unbounded backlog.
 */
export class RequestScheduler {
  private readonly rules: readonly WindowRule[];
  private readonly maxQueue: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxWindowMs: number;

  private timestamps: number[] = [];
  private tail: Promise<void> = Promise.resolve();
  private waiting = 0;

  constructor({ rules, maxQueue, now = Date.now, sleep = defaultSleep }: SchedulerOptions) {
    if (rules.length === 0) throw new RangeError('At least one rule is required');
    this.rules = rules;
    this.maxQueue = maxQueue;
    this.now = now;
    this.sleep = sleep;
    this.maxWindowMs = Math.max(...rules.map((rule) => rule.windowMs));
  }

  get pending(): number {
    return this.waiting;
  }

  schedule<T>(task: () => Promise<T>): Promise<T> {
    if (this.waiting >= this.maxQueue) {
      return Promise.reject(new QueueFullError());
    }
    this.waiting += 1;

    const slot = this.tail.then(() => this.acquireSlot());
    // Keep the chain alive regardless of individual outcomes.
    this.tail = slot.catch(() => undefined);

    return slot.then(
      () => {
        this.waiting -= 1;
        return task();
      },
      (error: unknown) => {
        this.waiting -= 1;
        throw error;
      },
    );
  }

  /** Milliseconds until another call is allowed (0 = now). Exposed for testing. */
  delayUntilNextSlot(): number {
    const now = this.now();
    this.timestamps = this.timestamps.filter((t) => t > now - this.maxWindowMs);

    let wait = 0;
    for (const { limit, windowMs } of this.rules) {
      const inWindow = this.timestamps.filter((t) => t > now - windowMs);
      if (inWindow.length >= limit) {
        // The call that must age out before we drop below the limit.
        const blocking = inWindow[inWindow.length - limit];
        if (blocking !== undefined) wait = Math.max(wait, blocking + windowMs - now);
      }
    }
    return wait;
  }

  private async acquireSlot(): Promise<void> {
    for (let wait = this.delayUntilNextSlot(); wait > 0; wait = this.delayUntilNextSlot()) {
      await this.sleep(wait);
    }
    this.timestamps.push(this.now());
  }
}
