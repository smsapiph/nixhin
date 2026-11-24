import type { MangaChapter, MangaLanguage } from '../../shared/api';

/** Chapter list helpers for the manga page and the reader. Chapters arrive in reading order. */

export const LANGUAGE_LABELS: Readonly<Record<MangaLanguage, string>> = { en: 'English', tl: 'Filipino' };

type Numbered = Pick<MangaChapter, 'chapter' | 'volume' | 'title'>;

/** "Ch. 12", "Vol. 2 Ch. 12" when asked, or "Oneshot". */
export function chapterNumber(chapter: Numbered, withVolume = false): string {
  if (chapter.chapter === null) return chapter.title ? chapter.title : 'Oneshot';
  const volume = withVolume && chapter.volume ? `Vol. ${chapter.volume} ` : '';
  return `${volume}Ch. ${chapter.chapter}`;
}

/** "Ch. 12 · Title", or just the number. */
export function chapterLabel(chapter: Numbered): string {
  const number = chapterNumber(chapter);
  return chapter.chapter !== null && chapter.title ? `${number} · ${chapter.title}` : number;
}

const key = (chapter: Pick<MangaChapter, 'chapter' | 'id'>) => chapter.chapter ?? `oneshot:${chapter.id}`;

/**
 * The chapters just before and after `currentId`, skipping other uploads of the same chapter number
 * (several groups often translate one chapter). Prefers the same group as the current upload.
 */
export function neighbours(
  chapters: readonly MangaChapter[],
  currentId: string,
): { previous: MangaChapter | null; next: MangaChapter | null } {
  const index = chapters.findIndex((chapter) => chapter.id === currentId);
  if (index === -1) return { previous: null, next: null };
  const current = chapters[index] as MangaChapter;
  const group = current.groups[0];

  const find = (direction: 1 | -1): MangaChapter | null => {
    let target: string | null = null;
    let fallback: MangaChapter | null = null;
    for (let i = index + direction; i >= 0 && i < chapters.length; i += direction) {
      const candidate = chapters[i] as MangaChapter;
      const candidateKey = key(candidate);
      if (candidateKey === key(current)) continue;
      if (target === null) {
        target = candidateKey;
        fallback = candidate;
      } else if (candidateKey !== target) {
        break;
      }
      if (group !== undefined && candidate.groups[0] === group) return candidate;
      // Prefer an upload readable here over one only on an official site.
      if (fallback?.externalUrl && !candidate.externalUrl) fallback = candidate;
    }
    return fallback;
  };

  return { previous: find(-1), next: find(1) };
}

/** Matches a typed chapter number ("12" finds 12, 12.5, 120, …). Empty matches everything. */
export function filterChapters(chapters: readonly MangaChapter[], typed: string): readonly MangaChapter[] {
  const query = typed.trim();
  if (!query) return chapters;
  return chapters.filter((chapter) => chapter.chapter?.startsWith(query));
}

/** The first chapter to read: the lowest number, preferring uploads with pages here. */
export function firstChapter(chapters: readonly MangaChapter[]): MangaChapter | null {
  return chapters.find((chapter) => !chapter.externalUrl) ?? chapters[0] ?? null;
}

/**
 * Drops official-site links for chapter numbers that also have an upload readable here, so the list shows what can
 * be read on this site. Chapters only on an official site stay (marked in the list).
 */
export function preferReadable(chapters: readonly MangaChapter[]): readonly MangaChapter[] {
  const readable = new Set(chapters.filter((chapter) => !chapter.externalUrl).map(key));
  return chapters.filter((chapter) => !chapter.externalUrl || !readable.has(key(chapter)));
}
