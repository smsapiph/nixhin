import { describe, expect, it } from 'vitest';
import type { MangaChapter } from '../../shared/api';
import { modeForPath, mangaPath, mangaReaderPath, searchPath } from '../routes';
import { imageSrc } from './images';
import { chapterLabel, chapterNumber, filterChapters, firstChapter, neighbours } from './mangaChapters';
import { parseMangaProgress, recordReading } from './mangaProgress';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const chapter = (n: number, number: string | null, group = 'A', extra: Partial<MangaChapter> = {}): MangaChapter => ({
  id: id(n),
  chapter: number,
  volume: null,
  title: null,
  language: 'en',
  pages: 20,
  publishedAt: '2024-01-01T00:00:00Z',
  groups: [group],
  externalUrl: null,
  ...extra,
});

describe('manga chapters', () => {
  const list = [chapter(1, '1'), chapter(2, '2', 'A'), chapter(3, '2', 'B'), chapter(4, '3', 'B'), chapter(5, '3', 'A'), chapter(6, '4')];

  it('skips other uploads of the same number and prefers the same group', () => {
    expect(neighbours(list, id(2))).toEqual({ previous: list[0], next: list[4] });
    expect(neighbours(list, id(3))).toEqual({ previous: list[0], next: list[3] });
    expect(neighbours(list, id(6)).next).toBeNull();
    expect(neighbours(list, id(99))).toEqual({ previous: null, next: null });
  });

  it('prefers an upload readable here over an official-site link', () => {
    const mixed = [chapter(1, '1'), chapter(2, '2', 'X', { externalUrl: 'https://x.example' }), chapter(3, '2', 'Y')];
    expect(neighbours(mixed, id(1)).next?.id).toBe(id(3));
    expect(firstChapter([mixed[1] as MangaChapter, mixed[2] as MangaChapter])?.id).toBe(id(3));
  });

  it('labels and filters chapters', () => {
    expect(chapterNumber({ chapter: '12.5', volume: '3', title: null }, true)).toBe('Vol. 3 Ch. 12.5');
    expect(chapterNumber({ chapter: null, volume: null, title: null })).toBe('Oneshot');
    expect(chapterLabel({ chapter: '1', volume: null, title: 'Romance Dawn' })).toBe('Ch. 1 · Romance Dawn');
    expect(filterChapters(list, ' 3 ').map((c) => c.id)).toEqual([id(4), id(5)]);
    expect(filterChapters(list, '')).toBe(list);
  });
});

describe('manga progress', () => {
  const entry = { id: id(1), title: 'One Piece', coverUrl: null, chapterId: id(2), chapter: '5', language: 'en', updatedAt: 1 };

  it('keeps valid entries, newest first, one per manga', () => {
    const parsed = parseMangaProgress([
      entry,
      { ...entry, chapterId: id(3), updatedAt: 5 },
      { ...entry, id: 'not-a-uuid' },
      { ...entry, id: id(9), language: 'es' },
      { ...entry, id: id(8), coverUrl: 'http://insecure.example/a.jpg' },
      'junk',
    ]);
    expect(parsed).toEqual([{ ...entry, chapterId: id(3), updatedAt: 5 }]);
    expect(parseMangaProgress({})).toEqual([]);
  });

  it('moves the latest read to the front', () => {
    const other = { ...entry, id: id(7) } as const;
    const list = recordReading(recordReading([], { ...entry, language: 'en' }), { ...other, language: 'tl' });
    expect(recordReading(list, { ...entry, language: 'en', chapter: '6' }).map((item) => [item.id, item.chapter])).toEqual([
      [id(1), '6'],
      [id(7), '5'],
    ]);
  });
});

describe('manga routes and images', () => {
  it('builds and recognises manga paths', () => {
    expect(mangaPath(id(1))).toBe(`/manga/${id(1)}`);
    expect(mangaPath(id(1), 'tl')).toBe(`/manga/${id(1)}?lang=tl`);
    expect(mangaReaderPath(id(1), id(2))).toBe(`/manga/${id(1)}/read/${id(2)}`);
    expect(modeForPath('/manga')).toBe('manga');
    expect(modeForPath(`/manga/${id(1)}/read/${id(2)}`)).toBe('manga');
    expect(searchPath('naruto', 'manga')).toBe('/search?q=naruto&type=manga');
    expect(modeForPath('/search', '?q=naruto&type=manga')).toBe('manga');
  });

  it('serves MangaDex images through this site', () => {
    expect(imageSrc('https://uploads.mangadex.org/covers/x/y.jpg.512.jpg')).toBe('/img/md/covers/x/y.jpg.512.jpg');
    expect(imageSrc('https://abc.mangadex.network/data/h/1.png')).toBe('https://abc.mangadex.network/data/h/1.png');
  });
});
