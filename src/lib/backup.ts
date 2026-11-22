import type { AnimeRef } from '../../shared/api';
import { prefsStore, parsePrefsValue, type Prefs } from './prefs';
import { mergeProgress, parseProgressValue, progressStore, type WatchProgress } from './progress';
import { MAX_QUEUE_ITEMS, parseQueueValue, queueStore } from './queueStorage';
import { MAX_SEARCHES, parseSearchesValue, searchHistoryStore } from './searchHistory';

/** Everything Nixhin keeps on this device, as one portable file. */
export interface Backup {
  readonly app: 'nixhin';
  readonly version: 1;
  readonly exportedAt: string;
  readonly queue: readonly AnimeRef[];
  readonly progress: readonly WatchProgress[];
  readonly searches: readonly string[];
  readonly prefs: Prefs;
}

/** Backups are small (a few hundred KB at most); anything bigger isn't ours. */
export const MAX_BACKUP_BYTES = 2_000_000;

export function createBackup(now = new Date()): Backup {
  return {
    app: 'nixhin',
    version: 1,
    exportedAt: now.toISOString(),
    queue: queueStore.get(),
    progress: progressStore.get(),
    searches: searchHistoryStore.get(),
    prefs: prefsStore.get(),
  };
}

/** Validates an imported file. Returns null when it isn't a Nixhin backup. */
export function parseBackup(text: string): Backup | null {
  if (text.length > MAX_BACKUP_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.app !== 'nixhin' || v.version !== 1) return null;
  return {
    app: 'nixhin',
    version: 1,
    exportedAt: typeof v.exportedAt === 'string' ? v.exportedAt : '',
    queue: parseQueueValue(v.queue),
    progress: parseProgressValue(v.progress),
    searches: parseSearchesValue(v.searches),
    prefs: parsePrefsValue(v.prefs),
  };
}

export interface ImportSummary {
  readonly queueAdded: number;
  readonly showsTracked: number;
}

/** Merges a backup into this device's data; nothing already here is lost. */
export function importBackup(backup: Backup): ImportSummary {
  const queueBefore = queueStore.get();
  const known = new Set(queueBefore.map((item) => item.id));
  const added = backup.queue.filter((item) => !known.has(item.id));
  queueStore.set([...queueBefore, ...added].slice(0, MAX_QUEUE_ITEMS));

  const progress = mergeProgress(progressStore.get(), backup.progress);
  progressStore.set(progress);

  const searches = searchHistoryStore.get();
  searchHistoryStore.set(parseSearchesValue([...searches, ...backup.searches]).slice(0, MAX_SEARCHES));

  if (prefsStore.get().language === null && backup.prefs.language !== null) prefsStore.set(backup.prefs);

  return { queueAdded: added.length, showsTracked: progress.length };
}

export function backupFileName(now = new Date()): string {
  return `nixhin-backup-${now.toISOString().slice(0, 10)}.json`;
}
