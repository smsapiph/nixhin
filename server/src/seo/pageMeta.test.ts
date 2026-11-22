import { describe, expect, it } from 'vitest';
import type { AnimeDetail, MediaDetail } from '../../../shared/api.js';
import {
  META_END,
  META_START,
  animeMeta,
  cardPath,
  injectMeta,
  isCrawler,
  mediaCardPath,
  mediaMeta,
  parseAnimeLink,
  parseCardLink,
  parseMediaCardLink,
  parseMediaLink,
  renderMetaTags,
} from './pageMeta.js';

const anime: AnimeDetail = {
  id: 108632,
  title: 'Black Clover 2nd Season',
  titleJapanese: null,
  titleEnglish: null,
  imageUrl: 'https://s4.anilist.co/poster.jpg',
  imageUrlLarge: 'https://s4.anilist.co/poster-xl.jpg',
  bannerUrl: 'https://s4.anilist.co/banner.jpg',
  type: 'TV',
  episodes: 12,
  score: 8,
  members: 100,
  genres: [],
  year: 2026,
  season: 'fall',
  airing: true,
  synopsis: 'Asta and Yuno keep chasing the Wizard King title.',
  broadcast: null,
  status: null,
  duration: null,
  rating: null,
  rank: null,
  studios: [],
  trailer: null,
  malId: null,
  airedEpisodes: 12,
};
const SITE = 'https://nixhin.example';

describe('isCrawler', () => {
  it('detects link-preview bots and leaves browsers alone', () => {
    expect(isCrawler('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')).toBe(true);
    expect(isCrawler('Twitterbot/1.0')).toBe(true);
    expect(isCrawler('Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)')).toBe(true);
    expect(isCrawler('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(isCrawler(null)).toBe(false);
  });
});

describe('parseAnimeLink', () => {
  it('reads id, episode and language', () => {
    expect(parseAnimeLink(new URL(`${SITE}/anime/108632?ep=5&lang=dub`))).toEqual({ id: 108632, episode: 5, language: 'dub' });
    expect(parseAnimeLink(new URL(`${SITE}/anime/1`))).toEqual({ id: 1, episode: null, language: null });
  });

  it('rejects bad paths and ignores bad params', () => {
    expect(parseAnimeLink(new URL(`${SITE}/anime/abc`))).toBeNull();
    expect(parseAnimeLink(new URL(`${SITE}/anime/0`))).toBeNull();
    expect(parseAnimeLink(new URL(`${SITE}/anime/1/extra`))).toBeNull();
    expect(parseAnimeLink(new URL(`${SITE}/anime/1?ep=-2&lang=<x>`))).toEqual({ id: 1, episode: null, language: null });
  });

  it('round-trips share-card paths', () => {
    const link = { id: 97940, episode: 5, language: 'dub' };
    expect(cardPath(link)).toBe('/og/anime/97940.jpg?ep=5&lang=dub');
    expect(parseCardLink(new URL(SITE + cardPath(link)))).toEqual(link);
    // Language without an episode is not shown on the card, so it is left out of the URL.
    expect(cardPath({ id: 1, episode: null, language: 'dub' })).toBe('/og/anime/1.jpg');
    expect(parseCardLink(new URL(`${SITE}/og/anime/1.png`))).toBeNull();
  });
});

describe('animeMeta', () => {
  it('describes a specific episode and points at its share card', () => {
    const meta = animeMeta(anime, { id: anime.id, episode: 5, language: 'dub' }, SITE);
    expect(meta.title).toBe('Watch Black Clover 2nd Season Episode 5 (English dub) · Nixhin');
    expect(meta.description.startsWith('Episode 5 of Black Clover 2nd Season, English dub.')).toBe(true);
    expect(meta.url).toBe(`${SITE}/anime/108632?ep=5&lang=dub`);
    expect(meta.image).toBe(`${SITE}/og/anime/108632.jpg?ep=5&lang=dub`);
    expect(meta.imageAlt).toBe('Watch Black Clover 2nd Season Episode 5 (English dub)');
    expect(meta.type).toBe('website');
  });

  it('describes the show without an episode', () => {
    const meta = animeMeta(anime, { id: anime.id, episode: null, language: null }, SITE);
    expect(meta.title).toBe('Watch Black Clover 2nd Season · Nixhin');
    expect(meta.image).toBe(`${SITE}/og/anime/108632.jpg`);
    expect(meta.type).toBe('website');
  });

  it('truncates long synopses', () => {
    const meta = animeMeta({ ...anime, synopsis: 'word '.repeat(100) }, { id: 1, episode: null, language: null }, SITE);
    expect(meta.description.length).toBeLessThanOrEqual(200);
    expect(meta.description.endsWith('…')).toBe(true);
  });
});

describe('renderMetaTags / injectMeta', () => {
  it('escapes values and replaces only the marked block', () => {
    const tags = renderMetaTags({
      title: 'A "quoted" <title> & more',
      description: 'd',
      url: `${SITE}/anime/1`,
      image: `${SITE}/i.png`,
      imageAlt: 'alt',
      type: 'video.tv_show',
    });
    expect(tags).toContain('<title>A &quot;quoted&quot; &lt;title&gt; &amp; more</title>');
    expect(tags).not.toContain('<title>A "quoted"');

    const html = `<head><meta charset="utf-8" />${META_START}<title>old</title>${META_END}<link rel="icon" /></head>`;
    const out = injectMeta(html, tags);
    expect(out).not.toContain('<title>old</title>');
    expect(out).toContain('<meta charset="utf-8" />');
    expect(out).toContain('<link rel="icon" />');
    expect(injectMeta('<head></head>', tags)).toBe('<head></head>');
  });
});

describe('media links', () => {
  it('parses movie and TV links, keeping a season only together with an episode', () => {
    expect(parseMediaLink(new URL('https://x.test/movie/693134'))).toEqual({ kind: 'movie', id: 693134, season: null, episode: null });
    expect(parseMediaLink(new URL('https://x.test/tv/126308?s=1&ep=4'))).toEqual({ kind: 'tv', id: 126308, season: 1, episode: 4 });
    expect(parseMediaLink(new URL('https://x.test/tv/126308?s=1'))).toEqual({ kind: 'tv', id: 126308, season: null, episode: null });
    expect(parseMediaLink(new URL('https://x.test/tv/abc'))).toBeNull();
    expect(parseMediaCardLink(new URL('https://x.test/og/tv/126308.jpg?s=2&ep=1'))).toEqual({ kind: 'tv', id: 126308, season: 2, episode: 1 });
    expect(mediaCardPath({ kind: 'tv', id: 5, season: 1, episode: 2 })).toBe('/og/tv/5.jpg?s=1&ep=2');
  });

  it('builds episode titles and the card URL', () => {
    const detail = { id: 126308, title: 'Shōgun', year: 2024, synopsis: 'Japan, 1600.' } as unknown as MediaDetail;
    const meta = mediaMeta(detail, { kind: 'tv', id: 126308, season: 1, episode: 4 }, 'https://nixhin.test');
    expect(meta.title).toBe('Watch Shōgun S1 Episode 4 · Nixhin');
    expect(meta.url).toBe('https://nixhin.test/tv/126308?s=1&ep=4');
    expect(meta.image).toBe('https://nixhin.test/og/tv/126308.jpg?s=1&ep=4');
    expect(mediaMeta(detail, { kind: 'movie', id: 126308, season: null, episode: null }, 'https://n.test').title).toBe(
      'Watch Shōgun (2024) · Nixhin',
    );
  });
});
