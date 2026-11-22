import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AnimeDetail } from '../../../shared/api.js';
import { cardContent, renderCard } from './ogCard.js';

const anime = {
  id: 97940,
  title: 'Black Clover',
  titleJapanese: 'ブラッククローバー',
  type: 'TV',
  year: 2017,
  episodes: 170,
  airedEpisodes: 170,
  score: 8.1,
  genres: ['Action'],
} as unknown as AnimeDetail;

describe('cardContent', () => {
  it('shows the episode and language badge', () => {
    expect(cardContent(anime, { id: 97940, episode: 5, language: 'dub' })).toEqual({
      title: 'Black Clover',
      native: 'ブラッククローバー',
      badge: 'EPISODE 5',
      language: 'ENGLISH DUB',
      details: ['TV', '2017', '170 episodes', '★ 8.1'],
    });
  });

  it('stays generic without an episode, or for one that does not exist yet', () => {
    expect(cardContent(anime, { id: 97940, episode: null, language: 'dub' })).toMatchObject({ badge: 'WATCH NOW', language: null });
    expect(cardContent(anime, { id: 97940, episode: 999, language: 'sub' })).toMatchObject({ badge: 'WATCH NOW', language: null });
  });

  it('uses the first genre when the episode count is unknown', () => {
    const ongoing = { ...anime, episodes: null, airedEpisodes: null, score: null } as unknown as AnimeDetail;
    expect(cardContent(ongoing, { id: 1, episode: 1200, language: null }).details).toEqual(['TV', '2017', 'Action']);
  });
});

describe('renderCard', () => {
  it('renders a 1200×630 PNG, with or without images', { timeout: 20_000 }, async () => {
    const font = (name: string) => readFileSync(new URL(`../../../public/og-fonts/${name}`, import.meta.url)).buffer as ArrayBuffer;
    const fonts = { serif: font('shippori-mincho-700.ttf'), sans: font('zen-kaku-gothic-new-500.ttf') };
    const png = await renderCard(cardContent(anime, { id: 97940, episode: 5, language: 'sub' }), { banner: null, poster: null }, fonts);
    expect(Buffer.from(png.subarray(1, 4)).toString()).toBe('PNG');
    const view = new DataView(png.buffer, png.byteOffset);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
  });
});
