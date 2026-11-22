import type { AnimeDetail, StreamConfig, StreamSource } from '../../../shared/api.js';
import { encodeStreamToken } from '../../../shared/streamToken.js';
import { HttpError } from '../errors.js';

/**
 * Provider-agnostic episode embeds.
 *
 * The provider is described entirely by an https URL template from the environment, e.g.
 *   https://player.example.com/embed/{anilistId}/{episode}/{language}
 * Supported placeholders: {anilistId}, {malId}, {episode}, {language}.
 *
 * Only validated integers and allow-listed language codes are substituted, and only into the
 * path/query: the scheme and host are fixed by the template, so a request can never point the
 * player at another site.
 */

const PLACEHOLDERS = new Set(['anilistId', 'malId', 'episode', 'language']);
const PLACEHOLDER = /\{(\w+)\}/g;
const LANGUAGE = /^[a-z]{2,10}$/;

export interface EmbedVars {
  readonly anilistId: number;
  readonly malId: number | null;
  readonly episode: number;
  readonly language: string;
}

/** Returns a reason the template is unusable, or null if it is valid. */
export function templateProblem(template: string): string | null {
  for (const [, name = ''] of template.matchAll(PLACEHOLDER)) {
    if (!PLACEHOLDERS.has(name)) return `unknown placeholder {${name}}`;
  }
  if (!template.includes('{episode}')) return 'must contain {episode}';
  if (!template.includes('{anilistId}') && !template.includes('{malId}')) {
    return 'must contain {anilistId} or {malId}';
  }
  let url: URL;
  try {
    url = new URL(template.replace(PLACEHOLDER, '0'));
  } catch {
    return 'must be an absolute URL';
  }
  if (url.protocol !== 'https:') return 'must use https';
  if (url.username || url.password) return 'must not contain credentials';
  // Placeholders may only appear after the origin.
  if (!template.startsWith(`${url.origin}/`) && template !== url.origin) {
    return 'placeholders are not allowed in the scheme or host';
  }
  return null;
}

/** Substitutes the variables; returns null when the template needs a value the title lacks. */
export function buildEmbedUrl(template: string, vars: EmbedVars): string | null {
  if (!LANGUAGE.test(vars.language)) return null;
  let missing = false;
  const filled = template.replace(PLACEHOLDER, (_, name: string) => {
    const value = vars[name as keyof EmbedVars];
    if (value === null || value === undefined) {
      missing = true;
      return '';
    }
    return encodeURIComponent(String(value));
  });
  return missing ? null : filled;
}

export interface EmbedStreamOptions {
  /** Unset disables playback (the UI falls back to trailers). */
  readonly template: string | undefined;
  readonly languages: readonly string[];
}

export class EmbedStreams {
  readonly #template: string | undefined;
  readonly #languages: readonly string[];

  constructor({ template, languages }: EmbedStreamOptions) {
    const problem = template === undefined ? null : templateProblem(template);
    if (problem) throw new Error(`STREAM_EMBED_TEMPLATE ${problem}`);
    this.#template = template;
    this.#languages = languages.filter((language) => LANGUAGE.test(language));
  }

  config(): StreamConfig {
    return { enabled: this.#template !== undefined && this.#languages.length > 0, languages: this.#languages };
  }

  /** Throws 404 when playback is not configured. */
  assertEnabled(): void {
    if (!this.config().enabled) throw new HttpError(404, 'NOT_FOUND', 'Episode playback is not configured.');
  }

  source(anime: AnimeDetail, episode: number, language: string | undefined): StreamSource {
    this.assertEnabled();
    const template = this.#template ?? '';
    const lang = language ?? this.#languages[0] ?? '';
    if (!this.#languages.includes(lang)) {
      throw new HttpError(400, 'BAD_REQUEST', `language: must be one of ${this.#languages.join(', ')}`);
    }
    if (anime.episodes !== null && episode > anime.episodes) {
      throw new HttpError(404, 'NOT_FOUND', 'That episode does not exist.');
    }
    const embedUrl = buildEmbedUrl(template, { anilistId: anime.id, malId: anime.malId, episode, language: lang });
    if (!embedUrl) throw new HttpError(404, 'NOT_FOUND', 'This title is not available to play.');
    return { episode, language: lang, token: encodeStreamToken(embedUrl) };
  }
}
