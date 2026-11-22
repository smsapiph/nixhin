import type { MediaDetail, MediaStreamSource } from '../../../shared/api.js';
import { encodeStreamToken } from '../../../shared/streamToken.js';
import { HttpError } from '../errors.js';

/**
 * Movie and TV embeds from a licensed provider, described by https URL templates (like the anime one):
 *   STREAM_MOVIE_TEMPLATE  https://player.example.com/movie/{tmdbId}
 *   STREAM_TV_TEMPLATE     https://player.example.com/tv/{tmdbId}/{season}/{episode}
 * Placeholders: {tmdbId}, {imdbId}, plus {season} and {episode} for TV. Only validated values are
 * substituted, and only after the fixed origin.
 */

export type MediaTemplateKind = 'movie' | 'tv';

const PLACEHOLDER = /\{(\w+)\}/g;
const ALLOWED: Readonly<Record<MediaTemplateKind, ReadonlySet<string>>> = {
  movie: new Set(['tmdbId', 'imdbId']),
  tv: new Set(['tmdbId', 'imdbId', 'season', 'episode']),
};

/** Returns a reason the template is unusable, or null if it is valid. */
export function mediaTemplateProblem(template: string, kind: MediaTemplateKind): string | null {
  for (const [, name = ''] of template.matchAll(PLACEHOLDER)) {
    if (!ALLOWED[kind].has(name)) return `unknown placeholder {${name}}`;
  }
  if (!template.includes('{tmdbId}') && !template.includes('{imdbId}')) return 'must contain {tmdbId} or {imdbId}';
  if (kind === 'tv' && (!template.includes('{season}') || !template.includes('{episode}'))) {
    return 'must contain {season} and {episode}';
  }
  let url: URL;
  try {
    url = new URL(template.replace(PLACEHOLDER, '0'));
  } catch {
    return 'must be an absolute URL';
  }
  if (url.protocol !== 'https:') return 'must use https';
  if (url.username || url.password) return 'must not contain credentials';
  if (!template.startsWith(`${url.origin}/`)) return 'placeholders are not allowed in the scheme or host';
  return null;
}

interface Vars {
  readonly tmdbId: number;
  readonly imdbId: string | null;
  readonly season?: number;
  readonly episode?: number;
}

function fill(template: string, vars: Vars): string | null {
  let missing = false;
  const url = template.replace(PLACEHOLDER, (_, name: string) => {
    const value = vars[name as keyof Vars];
    if (value === null || value === undefined) {
      missing = true;
      return '';
    }
    return encodeURIComponent(String(value));
  });
  return missing ? null : url;
}

export interface MediaEmbedOptions {
  readonly movieTemplate: string | undefined;
  readonly tvTemplate: string | undefined;
}

export class MediaEmbedStreams {
  readonly #movie: string | undefined;
  readonly #tv: string | undefined;

  constructor({ movieTemplate, tvTemplate }: MediaEmbedOptions) {
    const movieProblem = movieTemplate === undefined ? null : mediaTemplateProblem(movieTemplate, 'movie');
    if (movieProblem) throw new Error(`STREAM_MOVIE_TEMPLATE ${movieProblem}`);
    const tvProblem = tvTemplate === undefined ? null : mediaTemplateProblem(tvTemplate, 'tv');
    if (tvProblem) throw new Error(`STREAM_TV_TEMPLATE ${tvProblem}`);
    this.#movie = movieTemplate;
    this.#tv = tvTemplate;
  }

  get moviePlayback(): boolean {
    return this.#movie !== undefined;
  }

  get tvPlayback(): boolean {
    return this.#tv !== undefined;
  }

  assertEnabled(kind: MediaTemplateKind): void {
    if ((kind === 'movie' ? this.#movie : this.#tv) === undefined) {
      throw new HttpError(404, 'NOT_FOUND', `${kind === 'movie' ? 'Movie' : 'TV'} playback is not configured.`);
    }
  }

  movie(detail: MediaDetail): MediaStreamSource {
    this.assertEnabled('movie');
    const url = fill(this.#movie ?? '', { tmdbId: detail.id, imdbId: detail.imdbId });
    if (!url) throw new HttpError(404, 'NOT_FOUND', 'This movie is not available to play.');
    return { season: null, episode: null, token: encodeStreamToken(url) };
  }

  tv(detail: MediaDetail, season: number, episode: number): MediaStreamSource {
    this.assertEnabled('tv');
    const known = detail.seasons.find((entry) => entry.number === season);
    if (!known || episode > known.episodeCount) throw new HttpError(404, 'NOT_FOUND', 'That episode does not exist.');
    const url = fill(this.#tv ?? '', { tmdbId: detail.id, imdbId: detail.imdbId, season, episode });
    if (!url) throw new HttpError(404, 'NOT_FOUND', 'This show is not available to play.');
    return { season, episode, token: encodeStreamToken(url) };
  }
}
