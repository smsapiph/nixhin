import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import type { AnimeDetail, MediaDetail } from '../../../shared/api.js';
import { CARD_FONT_FILES, cardContent, mediaCardContent, renderCard } from './ogCard.js';

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

  it('hides a native title that repeats the main one', () => {
    const onePiece = { ...anime, title: 'ONE PIECE', titleJapanese: 'ONE PIECE' } as unknown as AnimeDetail;
    expect(cardContent(onePiece, { id: 21, episode: null, language: null }).native).toBeNull();
  });

  it('uses the first genre when the episode count is unknown', () => {
    const ongoing = { ...anime, episodes: null, airedEpisodes: null, score: null } as unknown as AnimeDetail;
    expect(cardContent(ongoing, { id: 1, episode: 1200, language: null }).details).toEqual(['TV', '2017', 'Action']);
  });
});

describe('renderCard', () => {
  it('renders a 1200×630 JPEG, with or without images', { timeout: 20_000 }, async () => {
    const font = (name: string) => readFileSync(new URL(`../../../public/og-fonts/${name}`, import.meta.url)).buffer as ArrayBuffer;
    const fonts = {
      serif: font(CARD_FONT_FILES.serif),
      sans: font(CARD_FONT_FILES.sans),
      serifLatin: font(CARD_FONT_FILES.serifLatin),
      sansLatin: font(CARD_FONT_FILES.sansLatin),
    };
    const card = await renderCard(cardContent(anime, { id: 97940, episode: 5, language: 'sub' }), { banner: null, poster: null }, fonts);
    const decoded = jpeg.decode(card);
    expect([decoded.width, decoded.height]).toEqual([1200, 630]);
    expect(card.length).toBeLessThan(300_000);
  });
});

const show = {
  kind: 'tv',
  id: 126308,
  title: 'Shōgun',
  originalTitle: '将軍',
  year: 2024,
  runtime: 58,
  score: 8.6,
  genres: ['Drama'],
  seasons: [
    { number: 1, name: 'Season 1', episodeCount: 10, year: 2024 },
    { number: 0, name: 'Specials', episodeCount: 2, year: 2024 },
  ],
} as unknown as MediaDetail;

describe('mediaCardContent', () => {
  it('describes a TV episode with a season badge', () => {
    expect(mediaCardContent(show, { kind: 'tv', id: 1, season: 1, episode: 4 })).toEqual({
      title: 'Shōgun',
      native: '将軍',
      badge: 'S1 · EPISODE 4',
      language: null,
      details: ['TV show', '2024', '1 season', '★ 8.6'],
    });
  });

  it('drops the badge for episodes that do not exist', () => {
    expect(mediaCardContent(show, { kind: 'tv', id: 1, season: 1, episode: 11 }).badge).toBe('WATCH NOW');
    expect(mediaCardContent(show, { kind: 'tv', id: 1, season: 7, episode: 1 }).badge).toBe('WATCH NOW');
  });

  it('describes a movie with its runtime', () => {
    const movie = { ...show, kind: 'movie', title: 'Dune: Part Two', originalTitle: null, runtime: 166, seasons: [] } as unknown as MediaDetail;
    expect(mediaCardContent(movie, { kind: 'movie', id: 1, season: null, episode: null }).details).toEqual([
      'Movie',
      '2024',
      '2h 46m',
      '★ 8.6',
    ]);
  });
});
