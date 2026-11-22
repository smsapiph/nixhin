import { describe, expect, it } from 'vitest';
import { parseBackup } from './backup';
import {
  episodeKey,
  findProgress,
  isFinished,
  mergeProgress,
  parseProgressValue,
  recordEpisode,
  removeProgress,
  resumeEpisode,
  setWatched,
  type WatchProgress,
} from './progress';
import { parseQueueValue } from './queueStorage';
import { addSearch, matchSearches, parseSearchesValue, removeSearch } from './searchHistory';

const show = { id: 7, title: 'Frieren', imageUrl: 'https://img.example/f.jpg', total: 12 };

describe('watch progress', () => {
  it('records the episode opened and moves the show to the front', () => {
    let list = recordEpisode([], { ...show, id: 1 }, 3, 'sub', 1000);
    list = recordEpisode(list, show, 2, 'dub', 2000);
    expect(list.map((entry) => entry.id)).toEqual([7, 1]);
    expect(list[0]).toMatchObject({ episode: 2, language: 'dub', total: 12, watched: [], updatedAt: 2000 });
  });

  it('marks and unmarks watched episodes, sorted and unique', () => {
    let list = setWatched([], show, 5, true, 1);
    list = setWatched(list, show, 2, true, 2);
    list = setWatched(list, show, 5, true, 3);
    expect(list[0]?.watched).toEqual([2, 5]);
    list = setWatched(list, show, 5, false, 4);
    expect(list[0]?.watched).toEqual([2]);
  });

  it('resumes at the next episode once the current one is watched', () => {
    const base: WatchProgress = { ...show, episode: 4, language: null, watched: [], updatedAt: 1 };
    expect(resumeEpisode(base)).toBe(4);
    expect(resumeEpisode({ ...base, watched: [4] })).toBe(5);
    expect(resumeEpisode({ ...base, episode: 12, watched: [12] })).toBe(12);
    expect(isFinished({ ...base, episode: 12, watched: Array.from({ length: 12 }, (_, i) => i + 1) })).toBe(true);
  });

  it('drops malformed stored entries', () => {
    const list = parseProgressValue([
      { ...show, episode: 3, watched: [1, 2, 'x', -1, 2], updatedAt: 5, language: 'sub' },
      { ...show, id: 8, episode: 0, updatedAt: 5 },
      { ...show, id: 9, imageUrl: 'javascript:alert(1)', episode: 1, updatedAt: 5 },
      'nope',
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 7, watched: [1, 2], language: 'sub' });
  });

  it('merges lists: newest position wins, watched episodes are united', () => {
    const a = setWatched(recordEpisode([], show, 3, 'sub', 10), show, 1, true, 10);
    const b = setWatched(recordEpisode([], show, 6, 'dub', 20), show, 5, true, 20);
    const merged = mergeProgress(a, b);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ episode: 6, language: 'dub', watched: [1, 5] });
    expect(removeProgress(merged, 7)).toEqual([]);
  });
});

describe('search history', () => {
  it('keeps the newest ten, without case-insensitive duplicates', () => {
    let list: string[] = [];
    for (let i = 0; i < 12; i += 1) list = addSearch(list, `q${i}`);
    list = addSearch(list, 'Q5');
    expect(list).toHaveLength(10);
    expect(list[0]).toBe('Q5');
    expect(list.filter((item) => item.toLowerCase() === 'q5')).toHaveLength(1);
    expect(removeSearch(list, 'Q5')).not.toContain('Q5');
  });

  it('filters by what is typed', () => {
    expect(matchSearches(['One Piece', 'Frieren', 'one punch man'], 'one')).toEqual(['One Piece', 'one punch man']);
    expect(matchSearches(['Frieren'], '')).toEqual(['Frieren']);
  });

  it('ignores junk in storage', () => {
    expect(parseSearchesValue(['ok', 42, '', 'a\u0000b', 'OK'])).toEqual(['ok']);
  });
});

describe('backup', () => {
  it('accepts a valid backup and sanitises its contents', () => {
    const backup = parseBackup(
      JSON.stringify({
        app: 'nixhin',
        version: 1,
        exportedAt: '2026-11-22T00:00:00.000Z',
        queue: [{ id: 1, title: 'A', imageUrl: null }, { id: 'x' }],
        progress: [{ ...show, episode: 2, watched: [1], updatedAt: 3 }],
        searches: ['frieren'],
        prefs: { language: 'dub' },
      }),
    );
    expect(backup?.queue).toEqual([{ id: 1, title: 'A', imageUrl: null }]);
    expect(backup?.progress[0]).toMatchObject({ id: 7, episode: 2 });
    expect(backup?.prefs).toEqual({ language: 'dub' });
  });

  it('rejects files that are not Nixhin backups', () => {
    expect(parseBackup('not json')).toBeNull();
    expect(parseBackup(JSON.stringify({ app: 'other', version: 1 }))).toBeNull();
    expect(parseBackup(JSON.stringify([]))).toBeNull();
  });

  it('de-duplicates queue entries', () => {
    expect(parseQueueValue([{ id: 1, title: 'A', imageUrl: null }, { id: 1, title: 'B', imageUrl: null }])).toHaveLength(1);
  });
});

describe('movies and TV shows in the same stores', () => {
  const shogun = { id: 7, title: 'Shōgun', imageUrl: null, kind: 'tv' as const, total: episodeKey(1, 10) };
  const movie = { id: 7, title: 'Dune', imageUrl: null, kind: 'movie' as const, total: 1 };

  it('keeps anime, movie and TV entries with the same id apart', () => {
    let list = recordEpisode([], show, 3, 'sub', 1);
    list = recordEpisode(list, shogun, 4, null, 2, 1);
    list = recordEpisode(list, movie, 1, null, 3);
    expect(list).toHaveLength(3);
    expect(findProgress(list, 7)?.title).toBe('Frieren');
    expect(findProgress(list, 7, 'tv')).toMatchObject({ season: 1, episode: 4, kind: 'tv' });
    expect(removeProgress(list, 7, 'movie').map((entry) => entry.title)).toEqual(['Shōgun', 'Frieren']);
  });

  it('tracks TV episodes per season and finishes at the latest aired one', () => {
    let list = setWatched([], shogun, episodeKey(1, 3), true, 1);
    expect(list[0]).toMatchObject({ season: 1, episode: 3, watched: [10003] });
    list = setWatched(list, shogun, episodeKey(1, 10), true, 2);
    expect(isFinished(list[0] as WatchProgress)).toBe(true);
  });

  it('survives a storage round trip and rejects TV entries without a season', () => {
    const list = recordEpisode([], shogun, 2, null, 5, 1);
    expect(parseProgressValue(JSON.parse(JSON.stringify(list)))).toEqual(list);
    expect(parseProgressValue([{ ...list[0], season: undefined }])).toEqual([]);
  });

  it('stores the kind in the queue and de-duplicates per kind', () => {
    expect(
      parseQueueValue([
        { id: 1, title: 'A', imageUrl: null },
        { id: 1, title: 'B', imageUrl: null, kind: 'movie' },
        { id: 1, title: 'B again', imageUrl: null, kind: 'movie' },
        { id: 1, title: 'C', imageUrl: null, kind: 'podcast' },
      ]),
    ).toEqual([
      { id: 1, title: 'A', imageUrl: null },
      { id: 1, title: 'B', imageUrl: null, kind: 'movie' },
    ]);
  });
});
