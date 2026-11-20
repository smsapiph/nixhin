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

export function searchPath(query: string): string {
  return `/search?${new URLSearchParams({ q: query.trim().slice(0, MAX_QUERY_LENGTH) }).toString()}`;
}

/** True for an ordinary left click; modified clicks (new tab/window) should keep browser behaviour. */
export function isPlainClick(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
