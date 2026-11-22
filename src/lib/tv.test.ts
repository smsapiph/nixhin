import { describe, expect, it } from 'vitest';
import { remoteKey } from './remoteKeys';
import { moveScore, pickNext, type Box } from './spatialNav';
import { looksLikeTv, parseTvOverride } from './tvDevice';

describe('looksLikeTv', () => {
  it.each([
    'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.0 TV Safari/537.36',
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager',
    'Mozilla/5.0 (Linux; Android 11; BRAVIA 4K VH2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 9; AFTMM) AppleWebKit/537.36 (KHTML, like Gecko) Silk/120.4.1 like Chrome/120.0.0.0 Safari/537.36',
  ])('detects %s', (ua) => {
    expect(looksLikeTv(ua, 0)).toBe(true);
  });

  it('treats a touch-less Android device without "Mobile" as a TV box', () => {
    expect(looksLikeTv('Mozilla/5.0 (Linux; Android 12; X96) AppleWebKit/537.36 Chrome/120 Safari/537.36', 0)).toBe(true);
  });

  it.each([
    ['phone', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 5],
    ['tablet', 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 Chrome/120 Safari/537.36', 10],
    ['iPad', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', 5],
    ['desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36', 0],
  ])('ignores a %s', (_, ua, touch) => {
    expect(looksLikeTv(ua as string, touch as number)).toBe(false);
  });
});

describe('parseTvOverride', () => {
  it('reads ?tv=1 and ?tv=0', () => {
    expect(parseTvOverride('?tv=1')).toBe(true);
    expect(parseTvOverride('?q=frieren&tv=0')).toBe(false);
    expect(parseTvOverride('?tv=yes')).toBeNull();
    expect(parseTvOverride('')).toBeNull();
  });
});

describe('remoteKey', () => {
  it('maps arrows, OK and the Back buttons of TV platforms', () => {
    expect(remoteKey({ key: 'ArrowLeft' })).toBe('left');
    expect(remoteKey({ key: 'Unidentified', keyCode: 40 })).toBe('down');
    expect(remoteKey({ key: 'Enter' })).toBe('enter');
    expect(remoteKey({ key: 'Unidentified', keyCode: 10009 })).toBe('back'); // Samsung
    expect(remoteKey({ key: 'GoBack', keyCode: 461 })).toBe('back'); // LG
    expect(remoteKey({ key: 'Escape' })).toBe('back');
    expect(remoteKey({ key: 'a', keyCode: 65 })).toBeNull();
  });
});

const box = (left: number, top: number, width = 100, height = 150): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe('pickNext', () => {
  // Two rows of cards, 120px apart horizontally, 300px apart vertically.
  const [a0, a1, a2, a3] = [box(0, 0), box(120, 0), box(240, 0), box(360, 0)];
  const [b0, b1, b2] = [box(0, 300), box(120, 300), box(240, 300)];
  const all = [a0, a1, a2, a3, b0, b1, b2];

  it('moves to the neighbour in the same row', () => {
    expect(pickNext(a1, all, 'right')).toBe(2);
    expect(pickNext(a1, all, 'left')).toBe(0);
  });

  it('moves to the card straight below, not the nearest corner', () => {
    expect(pickNext(a2, all, 'down')).toBe(6);
    expect(pickNext(b0, all, 'up')).toBe(0);
  });

  it('prefers the next card in the row over a closer one in another row', () => {
    const header = box(130, -60, 40, 20);
    expect(pickNext(a0, [header, a1], 'right')).toBe(1);
  });

  it('returns -1 at the edge', () => {
    expect(pickNext(a3, all, 'right')).toBe(-1);
    expect(pickNext(a0, all, 'up')).toBe(-1);
  });

  it('ignores targets behind the current element', () => {
    expect(moveScore(a2, a1, 'right')).toBeNull();
  });
});
