import { describe, expect, it } from 'vitest';
import { toLocalSlot, weekdayIndex } from './broadcast';
import { formatEpisodes, formatScore, genreLine } from './format';
import { isDevtoolsShortcut, looksLikeDevtoolsOpen } from './devtools';
import { parseQueue } from './queueStorage';

const NOW = new Date('2026-11-20T12:00:00Z'); // a Friday

describe('toLocalSlot', () => {
  it('converts JST to Manila time (UTC+8)', () => {
    const slot = toLocalSlot(
      { day: 'saturday', time: '23:00', timezone: 'Asia/Tokyo' },
      { timeZone: 'Asia/Manila', locale: 'en-US', now: NOW },
    );
    expect(slot).toEqual({ dayIndex: 5, time: '10:00 PM', minuteOfDay: 22 * 60 });
  });

  it('rolls back to the previous day when crossing midnight', () => {
    const slot = toLocalSlot(
      { day: 'monday', time: '00:30', timezone: 'Asia/Tokyo' },
      { timeZone: 'Asia/Manila', locale: 'en-US', now: NOW },
    );
    expect(slot).toEqual({ dayIndex: 6, time: '11:30 PM', minuteOfDay: 23 * 60 + 30 });
  });

  it('handles zones far behind Japan', () => {
    const slot = toLocalSlot(
      { day: 'saturday', time: '01:00', timezone: 'Asia/Tokyo' },
      { timeZone: 'UTC', locale: 'en-US', now: NOW },
    );
    expect(slot).toEqual({ dayIndex: 4, time: '4:00 PM', minuteOfDay: 16 * 60 });
  });
});

describe('weekdayIndex', () => {
  it('treats Monday as 0 and Sunday as 6', () => {
    expect(weekdayIndex(new Date('2026-11-16T12:00:00Z'), 'UTC')).toBe(0);
    expect(weekdayIndex(new Date('2026-11-22T12:00:00Z'), 'UTC')).toBe(6);
  });
});

describe('parseQueue', () => {
  it('keeps only well-formed entries and strips extra fields', () => {
    const raw = JSON.stringify([
      { id: 1, title: 'A', imageUrl: null, extra: 'x' },
      { id: 'bad', title: 'B', imageUrl: null },
      { id: 2, title: 'C', imageUrl: 'https://cdn.myanimelist.net/c.jpg' },
    ]);
    expect(parseQueue(raw)).toEqual([
      { id: 1, title: 'A', imageUrl: null },
      { id: 2, title: 'C', imageUrl: 'https://cdn.myanimelist.net/c.jpg' },
    ]);
  });

  it.each([null, 'not json', '{"a":1}'])('rejects %s', (raw) => {
    expect(parseQueue(raw)).toBeNull();
  });
});

describe('format', () => {
  it('formats genres, scores and episode counts', () => {
    expect(genreLine({ genres: ['Action', 'Drama', 'Fantasy'], type: 'TV' })).toBe('Action · Drama');
    expect(genreLine({ genres: [], type: 'Movie' })).toBe('Movie');
    expect(formatScore(9.1)).toBe('9.1');
    expect(formatScore(null)).toBeNull();
    expect(formatEpisodes(1)).toBe('1 episode');
    expect(formatEpisodes(null)).toBe('Ongoing');
  });
});

describe('isDevtoolsShortcut', () => {
  const key = (code: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}) => ({
    key: code.replace('Key', ''),
    code,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });

  it('blocks F12, Ctrl+Shift+I/J/C, Cmd+Option+I and view-source', () => {
    expect(isDevtoolsShortcut(key('F12'))).toBe(true);
    expect(isDevtoolsShortcut(key('KeyI', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isDevtoolsShortcut(key('KeyJ', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isDevtoolsShortcut(key('KeyC', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isDevtoolsShortcut(key('KeyI', { metaKey: true, altKey: true }))).toBe(true);
    expect(isDevtoolsShortcut(key('KeyU', { ctrlKey: true }))).toBe(true);
  });

  it('leaves ordinary shortcuts alone', () => {
    expect(isDevtoolsShortcut(key('KeyC', { ctrlKey: true }))).toBe(false); // copy
    expect(isDevtoolsShortcut(key('KeyI', { ctrlKey: true }))).toBe(false); // italic
    expect(isDevtoolsShortcut(key('KeyU', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isDevtoolsShortcut(key('KeyJ'))).toBe(false);
  });
});

describe('looksLikeDevtoolsOpen', () => {
  it('detects a docked panel and ignores normal browser chrome', () => {
    expect(looksLikeDevtoolsOpen({ outerWidth: 1440, outerHeight: 900, innerWidth: 1440, innerHeight: 800 })).toBe(false);
    expect(looksLikeDevtoolsOpen({ outerWidth: 1440, outerHeight: 900, innerWidth: 900, innerHeight: 800 })).toBe(true);
    expect(looksLikeDevtoolsOpen({ outerWidth: 1440, outerHeight: 900, innerWidth: 1440, innerHeight: 450 })).toBe(true);
    expect(looksLikeDevtoolsOpen({ outerWidth: 0, outerHeight: 0, innerWidth: 1440, innerHeight: 800 })).toBe(false);
  });
});
