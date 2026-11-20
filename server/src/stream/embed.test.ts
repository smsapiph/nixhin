import { describe, expect, it } from 'vitest';
import type { AnimeDetail } from '../../../shared/api.js';
import { HttpError } from '../errors.js';
import { EmbedStreams, buildEmbedUrl, templateProblem } from './embed.js';

const TEMPLATE = 'https://player.example.com/embed/{anilistId}/{episode}/{language}';

const anime = { id: 154587, malId: 52991, episodes: 28 } as AnimeDetail;

describe('templateProblem', () => {
  it('accepts well-formed https templates', () => {
    expect(templateProblem(TEMPLATE)).toBeNull();
    expect(templateProblem('https://example.com/e?mal={malId}&ep={episode}&lang={language}')).toBeNull();
  });

  it.each([
    ['http://example.com/{anilistId}/{episode}', 'must use https'],
    ['https://{anilistId}.example.com/{episode}', 'placeholders are not allowed in the scheme or host'],
    ['https://example.com/{anilistId}', 'must contain {episode}'],
    ['https://example.com/{episode}', 'must contain {anilistId} or {malId}'],
    ['https://example.com/{anilistId}/{episode}/{token}', 'unknown placeholder {token}'],
    ['https://user:pw@example.com/{anilistId}/{episode}', 'must not contain credentials'],
    ['javascript:{anilistId}{episode}', 'must use https'],
  ])('rejects %s', (template, problem) => {
    expect(templateProblem(template)).toBe(problem);
  });
});

describe('buildEmbedUrl', () => {
  it('fills placeholders', () => {
    expect(buildEmbedUrl(TEMPLATE, { anilistId: 1, malId: null, episode: 3, language: 'dub' })).toBe(
      'https://player.example.com/embed/1/3/dub',
    );
  });

  it('returns null when a needed id is missing or the language is unsafe', () => {
    const malTemplate = 'https://example.com/{malId}/{episode}';
    expect(buildEmbedUrl(malTemplate, { anilistId: 1, malId: null, episode: 1, language: 'sub' })).toBeNull();
    expect(buildEmbedUrl(TEMPLATE, { anilistId: 1, malId: null, episode: 1, language: '../x' })).toBeNull();
  });
});

describe('EmbedStreams', () => {
  const streams = new EmbedStreams({ template: TEMPLATE, languages: ['sub', 'dub'] });

  it('reports its config', () => {
    expect(streams.config()).toEqual({ enabled: true, languages: ['sub', 'dub'] });
    expect(new EmbedStreams({ template: undefined, languages: ['sub'] }).config().enabled).toBe(false);
  });

  it('builds a source, defaulting to the first language', () => {
    expect(streams.source(anime, 2, undefined)).toEqual({
      episode: 2,
      language: 'sub',
      embedUrl: 'https://player.example.com/embed/154587/2/sub',
    });
  });

  it('rejects unknown languages, missing episodes and disabled playback', () => {
    expect(() => streams.source(anime, 1, 'raw')).toThrow(HttpError);
    expect(() => streams.source(anime, 29, 'sub')).toThrow('That episode does not exist.');
    expect(() => new EmbedStreams({ template: undefined, languages: ['sub'] }).source(anime, 1, 'sub')).toThrow(
      'not configured',
    );
  });

  it('refuses an invalid template at startup', () => {
    expect(() => new EmbedStreams({ template: 'http://x.test/{anilistId}/{episode}', languages: ['sub'] })).toThrow(
      'must use https',
    );
  });
});
