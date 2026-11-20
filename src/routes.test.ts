import { describe, expect, it } from 'vitest';
import { animePath, homePath, isPlainClick, searchPath } from './routes';

describe('route builders', () => {
  it('builds home and section paths', () => {
    expect(homePath()).toBe('/');
    expect(homePath('top')).toBe('/');
    expect(homePath('schedule')).toBe('/#schedule');
  });

  it('builds anime paths with optional episode and language', () => {
    expect(animePath(154587)).toBe('/anime/154587');
    expect(animePath(154587, { episode: 3, language: 'dub' })).toBe('/anime/154587?ep=3&lang=dub');
  });

  it('encodes and trims search queries', () => {
    expect(searchPath('  frieren  ')).toBe('/search?q=frieren');
    expect(searchPath('a&b=c #1')).toBe('/search?q=a%26b%3Dc+%231');
    expect(searchPath('x'.repeat(150))).toBe(`/search?q=${'x'.repeat(100)}`);
  });
});

describe('isPlainClick', () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  it('accepts plain left clicks only', () => {
    expect(isPlainClick(click)).toBe(true);
    expect(isPlainClick({ ...click, ctrlKey: true })).toBe(false);
    expect(isPlainClick({ ...click, metaKey: true })).toBe(false);
    expect(isPlainClick({ ...click, button: 1 })).toBe(false);
  });
});
