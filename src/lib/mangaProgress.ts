import { MANGA_LANGUAGES, type MangaLanguage } from '../../shared/api';
import { MANGA_ID_PATTERN } from '../routes';
import { createStore, parseImageUrl, parseShortText } from './store';

/** Where the reader left off in each manga ("Continue reading"), newest first. Stays on this device. */
export interface MangaProgress {
  readonly id: string;
  readonly title: string;
  readonly coverUrl: string | null;
  readonly chapterId: string;
  /** Chapter number as text, or null for a oneshot. */
  readonly chapter: string | null;
  readonly language: MangaLanguage;
  readonly updatedAt: number;
}

const STORAGE_KEY = 'nixhin-manga-progress-v1';
export const MAX_MANGA_PROGRESS = 50;

const isLanguage = (value: unknown): value is MangaLanguage =>
  typeof value === 'string' && (MANGA_LANGUAGES as readonly string[]).includes(value);

const isId = (value: unknown): value is string => typeof value === 'string' && MANGA_ID_PATTERN.test(value);

function parseEntry(value: unknown): MangaProgress | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const title = parseShortText(raw.title, 300);
  const coverUrl = parseImageUrl(raw.coverUrl ?? null);
  const chapter = raw.chapter === null ? null : parseShortText(raw.chapter, 20);
  if (!isId(raw.id) || !isId(raw.chapterId) || title === undefined || coverUrl === undefined || chapter === undefined) return null;
  if (!isLanguage(raw.language) || typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) return null;
  return { id: raw.id, title, coverUrl, chapterId: raw.chapterId, chapter, language: raw.language, updatedAt: raw.updatedAt };
}

/** Untrusted JSON → a valid list (bad entries dropped, one entry per manga, newest first). */
export function parseMangaProgress(value: unknown): MangaProgress[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map(parseEntry)
    .filter((entry): entry is MangaProgress => entry !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((entry) => !seen.has(entry.id) && Boolean(seen.add(entry.id)))
    .slice(0, MAX_MANGA_PROGRESS);
}

export const mangaProgressStore = createStore<readonly MangaProgress[]>(STORAGE_KEY, parseMangaProgress);

/** Moves `entry` to the front, replacing the manga's previous position. */
export function recordReading(list: readonly MangaProgress[], entry: MangaProgress): MangaProgress[] {
  return [entry, ...list.filter((item) => item.id !== entry.id)].slice(0, MAX_MANGA_PROGRESS);
}

export function removeReading(list: readonly MangaProgress[], id: string): MangaProgress[] {
  return list.filter((item) => item.id !== id);
}

export function findReading(list: readonly MangaProgress[], id: string): MangaProgress | undefined {
  return list.find((item) => item.id === id);
}
