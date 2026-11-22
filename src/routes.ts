import type { MediaKind } from '../shared/api';
import type { SectionId } from './types';

/** URL builders, so every link and navigation agrees on the route shapes. */

export const MAX_QUERY_LENGTH = 100;

/** `/` or `/#section` for a home-page section. */
export function homePath(section: SectionId = 'top'): string {
  return section === 'top' ? '/' : `/#${section}`;
}

export function animePath(id: number, options: { episode?: number; language?: string } = {}): string {
  const params = new URLSearchParams();
  if (options.episode !== undefined) params.set('ep', String(options.episode));
  if (options.language !== undefined) params.set('lang', options.language);
  const search = params.toString();
  return `/anime/${id}${search ? `?${search}` : ''}`;
}

/** What the site is browsing: anime (the original site), movies or TV shows. */
export type Mode = 'anime' | MediaKind;

/** Home of each mode. */
export const MODE_HOMES: Readonly<Record<Mode, string>> = { anime: '/', movie: '/movies', tv: '/tv' };

/** Sections of the Movies and TV homes, used as `#anchors`. */
export type MediaSectionId = 'top' | 'continue' | 'popular' | 'now' | 'browse' | 'upcoming' | 'trending' | 'new' | 'queue';

export function mediaHomePath(kind: MediaKind, section: MediaSectionId = 'top'): string {
  const home = MODE_HOMES[kind];
  return section === 'top' ? home : `${home}#${section}`;
}

export function moviePath(id: number): string {
  return `/movie/${id}`;
}

/** `/tv/:id`, or `/tv/:id?s=1&ep=4` for an episode. */
export function tvPath(id: number, options: { season?: number; episode?: number } = {}): string {
  return options.season !== undefined && options.episode !== undefined
    ? `/tv/${id}?s=${options.season}&ep=${options.episode}`
    : `/tv/${id}`;
}

export function mediaPath(kind: MediaKind, id: number): string {
  return kind === 'movie' ? moviePath(id) : tvPath(id);
}

/** An actor's or filmmaker's page. `from` keeps the header on the mode they were opened from. */
export function personPath(id: number, from: MediaKind = 'movie'): string {
  return from === 'tv' ? `/person/${id}?from=tv` : `/person/${id}`;
}

/** The page of any saved title (anime, movie or TV show). */
export function titlePath(kind: Mode, id: number): string {
  return kind === 'anime' ? animePath(id) : mediaPath(kind, id);
}

/** Which mode a path belongs to (the header switch follows it). */
export function modeForPath(pathname: string, search = ''): Mode {
  if (pathname === '/movies' || pathname.startsWith('/movie/')) return 'movie';
  if (pathname === '/tv' || pathname.startsWith('/tv/')) return 'tv';
  if (pathname.startsWith('/person/')) return new URLSearchParams(search).get('from') === 'tv' ? 'tv' : 'movie';
  if (pathname === '/search') {
    const type = new URLSearchParams(search).get('type');
    if (type === 'movie' || type === 'tv') return type;
  }
  return 'anime';
}

/** `/search?q=…`, plus `&type=movie|tv` outside anime. */
export function searchPath(query: string, mode: Mode = 'anime'): string {
  const params = new URLSearchParams({ q: query.trim().slice(0, MAX_QUERY_LENGTH) });
  if (mode !== 'anime') params.set('type', mode);
  return `/search?${params.toString()}`;
}

/** True for an ordinary left click; modified clicks (new tab/window) should keep browser behaviour. */
export function isPlainClick(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
