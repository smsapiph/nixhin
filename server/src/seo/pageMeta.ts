import type { AnimeDetail } from '../../../shared/api.js';

/**
 * Link-preview metadata for share links. Crawlers (Facebook/Messenger, X, Discord, …) do not
 * run JavaScript, so the SPA's index.html is rewritten server-side for `/anime/:id` pages.
 * The block between these markers in index.html is replaced as a whole.
 */
export const META_START = '<!-- page-meta -->';
export const META_END = '<!-- /page-meta -->';

const SITE_NAME = 'Nixhin';
const DESCRIPTION_LIMIT = 200;

/** Link-preview bots and search crawlers. Humans get the untouched page (no extra upstream call). */
const CRAWLER_PATTERN =
  /bot\b|bot\/|crawler|spider|facebookexternalhit|facebookcatalog|meta-externalagent|embedly|iframely|slack|discord|telegram|whatsapp|skype|linkedin|pinterest|vkshare|kakaotalk|viber|bluesky|mastodon|google|bing|yandex|duckduck|applebot|preview/i;

export function isCrawler(userAgent: string | null | undefined): boolean {
  return !!userAgent && CRAWLER_PATTERN.test(userAgent);
}

export interface AnimeLink {
  readonly id: number;
  readonly episode: number | null;
  readonly language: string | null;
}

function parseLink(url: URL, pattern: RegExp): AnimeLink | null {
  const match = pattern.exec(url.pathname);
  if (!match) return null;
  const id = Number(match[1]);
  if (id < 1) return null;
  const epRaw = url.searchParams.get('ep');
  const episode = epRaw && /^\d{1,5}$/.test(epRaw) && Number(epRaw) >= 1 ? Number(epRaw) : null;
  const langRaw = url.searchParams.get('lang');
  const language = langRaw && /^[a-z]{2,10}$/.test(langRaw) ? langRaw : null;
  return { id, episode, language };
}

/** Parses `/anime/:id?ep=&lang=`; null if the path is not a valid anime page. */
export function parseAnimeLink(url: URL): AnimeLink | null {
  return parseLink(url, /^\/anime\/(\d{1,9})\/?$/);
}

/** Parses the share-card URL `/og/anime/:id.png?ep=&lang=`. */
export function parseCardLink(url: URL): AnimeLink | null {
  return parseLink(url, /^\/og\/anime\/(\d{1,9})\.png$/);
}

function linkQuery(link: AnimeLink): string {
  const params = new URLSearchParams();
  if (link.episode !== null) params.set('ep', String(link.episode));
  if (link.language !== null) params.set('lang', link.language);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Path of the branded share card (rendered by server/netlify/functions/og.ts). */
export function cardPath(link: AnimeLink): string {
  // Language only matters next to an episode badge; dropping it otherwise avoids duplicate renders.
  return `/og/anime/${link.id}.png${linkQuery(link.episode === null ? { ...link, language: null } : link)}`;
}

export interface PageMeta {
  readonly title: string;
  readonly description: string;
  readonly url: string;
  readonly image: string;
  readonly imageAlt: string;
  readonly type: string;
}

function truncate(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, '')}…`;
}

function languageLabel(language: string | null): string | null {
  if (language === 'dub') return 'English dub';
  if (language === 'sub') return 'subbed';
  return null;
}

/** e.g. "Watch Black Clover Episode 5 (English dub) · Nixhin". */
export function animeMeta(anime: AnimeDetail, link: AnimeLink, siteUrl: string): PageMeta {
  const lang = languageLabel(link.language);
  const url = `${siteUrl}/anime/${anime.id}${linkQuery(link)}`;

  let title: string;
  let description: string;
  if (link.episode !== null) {
    title = `Watch ${anime.title} Episode ${link.episode}${lang ? ` (${lang})` : ''} · ${SITE_NAME}`;
    const lead = `Episode ${link.episode} of ${anime.title}${lang ? `, ${lang}` : ''}. Free on ${SITE_NAME}, no account needed.`;
    description = anime.synopsis ? truncate(`${lead} ${anime.synopsis}`, DESCRIPTION_LIMIT) : lead;
  } else {
    title = `Watch ${anime.title} · ${SITE_NAME}`;
    description = anime.synopsis
      ? truncate(anime.synopsis, DESCRIPTION_LIMIT)
      : `Watch ${anime.title} free on ${SITE_NAME}. No account needed.`;
  }

  return {
    title,
    description,
    url,
    image: `${siteUrl}${cardPath({ ...link, id: anime.id })}`,
    imageAlt: title.replace(` · ${SITE_NAME}`, ''),
    type: link.episode !== null ? 'video.episode' : 'video.tv_show',
  };
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMetaTags(meta: PageMeta): string {
  const a = (value: string) => escapeAttr(value);
  return [
    META_START,
    `<title>${a(meta.title)}</title>`,
    `<meta name="description" content="${a(meta.description)}" />`,
    `<link rel="canonical" href="${a(meta.url)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${a(meta.type)}" />`,
    `<meta property="og:title" content="${a(meta.title)}" />`,
    `<meta property="og:description" content="${a(meta.description)}" />`,
    `<meta property="og:url" content="${a(meta.url)}" />`,
    `<meta property="og:image" content="${a(meta.image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${a(meta.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${a(meta.title)}" />`,
    `<meta name="twitter:description" content="${a(meta.description)}" />`,
    `<meta name="twitter:image" content="${a(meta.image)}" />`,
    `<meta name="twitter:image:alt" content="${a(meta.imageAlt)}" />`,
    META_END,
  ].join('\n    ');
}

/** Replaces the page-meta block; returns the page unchanged if the markers are missing. */
export function injectMeta(html: string, tags: string): string {
  const start = html.indexOf(META_START);
  const end = html.indexOf(META_END, start);
  if (start === -1 || end === -1) return html;
  return html.slice(0, start) + tags + html.slice(end + META_END.length);
}
