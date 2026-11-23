import {
  MANGA_LANGUAGES,
  type MangaChapter,
  type MangaDetail,
  type MangaLanguage,
  type MangaLink,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
} from '../../../shared/api.js';
import type { Localized, RawAtHome, RawChapter, RawManga, RawRelationship } from './schemas.js';

/** Covers and chapter images. The site proxies this host as /img/md/* (netlify.toml, src/lib/images.ts). */
export const UPLOADS_ORIGIN = 'https://uploads.mangadex.org';

const STATUSES: ReadonlySet<string> = new Set<MangaStatus>(['ongoing', 'completed', 'hiatus', 'cancelled']);
const LANGUAGES: ReadonlySet<string> = new Set(MANGA_LANGUAGES);
/** Image file names from MangaDex end up in URLs; allow only plain names. */
const SAFE_FILE = /^[A-Za-z0-9._-]{1,200}$/;
const MAX_TAGS = 8;
const MAX_ALT_TITLES = 6;
const MAX_DESCRIPTION = 4000;

export function isMangaLanguage(value: string | null | undefined): value is MangaLanguage {
  return typeof value === 'string' && LANGUAGES.has(value);
}

function pick(map: Localized, languages: readonly string[]): string | undefined {
  for (const language of languages) {
    const value = map[language]?.trim();
    if (value) return value;
  }
  return undefined;
}

function firstValue(map: Localized): string | undefined {
  return Object.values(map)
    .map((value) => value.trim())
    .find(Boolean);
}

/** English title when there is one, else the romanised original. */
export function mangaTitle(raw: RawManga): string {
  const { title, altTitles } = raw.attributes;
  const english = pick(title, ['en']) ?? altTitles?.map((alt) => pick(alt, ['en'])).find(Boolean);
  return english ?? pick(title, ['ja-ro', 'ko-ro', 'zh-ro']) ?? firstValue(title) ?? 'Untitled';
}

function altTitles(raw: RawManga, main: string): string[] {
  const seen = new Set([main.toLowerCase()]);
  const titles: string[] = [];
  const all = [raw.attributes.title, ...(raw.attributes.altTitles ?? [])];
  for (const map of all) {
    const value = pick(map, ['en', 'fil', 'ja-ro', 'ja', 'ko', 'zh']);
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      titles.push(value);
    }
    if (titles.length >= MAX_ALT_TITLES) break;
  }
  return titles;
}

/**
 * MangaDex descriptions are Markdown, often followed by a `---` line and lists of links.
 * Keep the text: drop that tail, unwrap links and remove emphasis markers.
 */
export function cleanDescription(text: string): string | null {
  const body = text.replace(/\r/g, '').split(/(?:^|\n)\s*[-_*]{3,}\s*(?:\n|$)/)[0] ?? '';
  const plain = body
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|~~/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!plain) return null;
  return plain.length > MAX_DESCRIPTION ? `${plain.slice(0, MAX_DESCRIPTION).trimEnd()}…` : plain;
}

function description(raw: RawManga): string | null {
  const map = Object.fromEntries(
    Object.entries(raw.attributes.description).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  const text = pick(map, ['en', 'fil']) ?? firstValue(map);
  return text ? cleanDescription(text) : null;
}

function related(raw: { readonly relationships?: readonly RawRelationship[] | null | undefined }, type: string): RawRelationship[] {
  return (raw.relationships ?? []).filter((relation) => relation.type === type);
}

function attributeText(relation: RawRelationship, key: string): string | undefined {
  const value = relation.attributes?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function names(raw: RawManga, type: string): string[] {
  return [...new Set(related(raw, type).map((relation) => attributeText(relation, 'name')).filter((name) => name !== undefined))];
}

export function coverUrl(raw: RawManga): string | null {
  const cover = related(raw, 'cover_art')[0];
  const fileName = cover ? attributeText(cover, 'fileName') : undefined;
  if (!fileName || !SAFE_FILE.test(fileName) || !/^[0-9a-f-]{36}$/.test(raw.id)) return null;
  // The 512px thumbnail: sharp on cards, a fraction of the original's size.
  return `${UPLOADS_ORIGIN}/covers/${raw.id}/${fileName}.512.jpg`;
}

export function toMangaSummary(raw: RawManga): MangaSummary {
  const { attributes } = raw;
  const status = attributes.status && STATUSES.has(attributes.status) ? (attributes.status as MangaStatus) : null;
  const tags = (attributes.tags ?? [])
    .filter((tag) => tag.attributes.group === 'genre' || tag.attributes.group === 'theme')
    .map((tag) => pick(tag.attributes.name, ['en']) ?? firstValue(tag.attributes.name))
    .filter((name): name is string => name !== undefined)
    .slice(0, MAX_TAGS);
  const languages = MANGA_LANGUAGES.filter((language) => attributes.availableTranslatedLanguages?.includes(language));
  return {
    id: raw.id,
    title: mangaTitle(raw),
    coverUrl: coverUrl(raw),
    status,
    year: attributes.year ?? null,
    tags,
    languages,
  };
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Official places to read or buy the series, from MangaDex's `links` map. */
function officialLinks(raw: RawManga): MangaLink[] {
  const links = raw.attributes.links;
  const candidates: readonly [string, string | null][] = [
    ['Official English', httpsUrl(links.engtl)],
    ['Official (original)', httpsUrl(links.raw)],
    ['BookWalker', typeof links.bw === 'string' && /^[\w/.-]+$/.test(links.bw) ? `https://bookwalker.jp/${links.bw}` : null],
    ['Amazon', httpsUrl(links.amz)],
    ['eBookJapan', httpsUrl(links.ebj)],
  ];
  return candidates.filter((entry): entry is [string, string] => entry[1] !== null).map(([label, url]) => ({ label, url }));
}

export function toMangaDetail(raw: RawManga): MangaDetail {
  const summary = toMangaSummary(raw);
  return {
    ...summary,
    altTitles: altTitles(raw, summary.title),
    description: description(raw),
    authors: names(raw, 'author'),
    artists: names(raw, 'artist'),
    demographic: raw.attributes.publicationDemographic ?? null,
    lastChapter: raw.attributes.lastChapter?.trim() || null,
    links: officialLinks(raw),
  };
}

function groups(raw: RawChapter): string[] {
  return related(raw, 'scanlation_group')
    .map((relation) => attributeText(relation, 'name'))
    .filter((name): name is string => name !== undefined);
}

/** Null for chapters in other languages. */
export function toMangaChapter(raw: RawChapter): MangaChapter | null {
  const { attributes } = raw;
  if (!isMangaLanguage(attributes.translatedLanguage)) return null;
  return {
    id: raw.id,
    chapter: attributes.chapter?.trim() || null,
    volume: attributes.volume?.trim() || null,
    title: attributes.title?.trim() || null,
    language: attributes.translatedLanguage,
    pages: attributes.pages ?? 0,
    publishedAt: attributes.readableAt ?? attributes.publishAt ?? '',
    groups: groups(raw),
    externalUrl: httpsUrl(attributes.externalUrl),
  };
}

export function chapterMangaId(raw: RawChapter): string | null {
  return related(raw, 'manga')[0]?.id ?? null;
}

/**
 * Page image URLs. The primary one is on uploads.mangadex.org (proxied by this site so ISP blocks and
 * hotlink checks don't matter); the MangaDex@Home node MangaDex picked is kept as the fallback.
 */
export function toPages(atHome: RawAtHome, quality: 'data' | 'data-saver'): MangaPage[] {
  const files = quality === 'data' ? atHome.chapter.data : (atHome.chapter.dataSaver ?? []);
  const node = httpsUrl(atHome.baseUrl)?.replace(/\/+$/, '');
  return files
    .filter((file) => SAFE_FILE.test(file))
    .map((file) => {
      const path = `/${quality}/${atHome.chapter.hash}/${file}`;
      const url = `${UPLOADS_ORIGIN}${path}`;
      return { url, fallbackUrl: node ? `${node}${path}` : url };
    });
}
