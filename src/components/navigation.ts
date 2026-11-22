import { MODE_HOMES, homePath, mediaHomePath, type Mode } from '../routes';
import type { SectionId } from '../types';
import type { IconName } from './Icon';

export interface NavItem {
  readonly section: SectionId;
  readonly label: string;
  /** Longer label used in the collapsed mobile menu. */
  readonly menuLabel?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { section: 'trending', label: 'Trending' },
  { section: 'season', label: 'This season' },
  { section: 'browse', label: 'Browse' },
  { section: 'schedule', label: 'Schedule' },
  { section: 'queue', label: 'My queue' },
];

export type NavigateHandler = (section: SectionId) => void;

/** A header or tab-bar link: a path, usually a home page `#section`. */
export interface NavLink {
  readonly href: string;
  readonly label: string;
  /** The `#section` it scrolls to (for the tab bar's highlight); 'top' for the home itself. */
  readonly section: string;
}

export const MODE_LABELS: Readonly<Record<Mode, string>> = { anime: 'Anime', movie: 'Movies', tv: 'TV shows' };
export const MODE_SEARCH_LABELS: Readonly<Record<Mode, string>> = {
  anime: 'Search anime',
  movie: 'Search movies',
  tv: 'Search TV shows',
};

const MEDIA_NAV: Readonly<Record<'movie' | 'tv', readonly NavLink[]>> = {
  movie: [
    { href: mediaHomePath('movie', 'popular'), label: 'Popular', section: 'popular' },
    { href: mediaHomePath('movie', 'now'), label: 'Now in cinemas', section: 'now' },
    { href: mediaHomePath('movie', 'browse'), label: 'Browse', section: 'browse' },
    { href: mediaHomePath('movie', 'upcoming'), label: 'Coming soon', section: 'upcoming' },
    { href: mediaHomePath('movie', 'queue'), label: 'My queue', section: 'queue' },
  ],
  tv: [
    { href: mediaHomePath('tv', 'trending'), label: 'Trending', section: 'trending' },
    { href: mediaHomePath('tv', 'new'), label: 'New episodes', section: 'new' },
    { href: mediaHomePath('tv', 'browse'), label: 'Browse', section: 'browse' },
    { href: mediaHomePath('tv', 'queue'), label: 'My queue', section: 'queue' },
  ],
};

/** The header links of a mode. */
export function navLinks(mode: Mode): readonly NavLink[] {
  if (mode === 'anime') return NAV_ITEMS.map((item) => ({ href: homePath(item.section), label: item.label, section: item.section }));
  return MEDIA_NAV[mode];
}

export interface Tab extends NavLink {
  readonly icon: IconName;
}

/** The phone tab bar of a mode. */
export function tabsFor(mode: Mode): readonly Tab[] {
  const home = MODE_HOMES[mode];
  if (mode === 'anime') {
    return [
      { href: home, label: 'Home', section: 'top', icon: 'home' },
      { href: homePath('browse'), label: 'Browse', section: 'browse', icon: 'grid' },
      { href: homePath('schedule'), label: 'Schedule', section: 'schedule', icon: 'calendar' },
      { href: homePath('queue'), label: 'My queue', section: 'queue', icon: 'bookmark' },
    ];
  }
  const soon = mode === 'movie' ? { section: 'upcoming', label: 'Coming soon' } : { section: 'new', label: 'New' };
  return [
    { href: home, label: 'Home', section: 'top', icon: 'home' },
    { href: `${home}#browse`, label: 'Browse', section: 'browse', icon: 'grid' },
    { href: `${home}#${soon.section}`, label: soon.label, section: soon.section, icon: 'calendar' },
    { href: `${home}#queue`, label: 'My queue', section: 'queue', icon: 'bookmark' },
  ];
}

/** Section anchors of each home, in page order (for the tab bar's scroll spy). */
export const HOME_SECTIONS: Readonly<Record<Mode, readonly string[]>> = {
  anime: ['continue', 'trending', 'season', 'queue', 'browse', 'schedule'],
  movie: ['continue', 'popular', 'now', 'browse', 'upcoming', 'queue'],
  tv: ['continue', 'trending', 'new', 'browse', 'queue'],
};

/** Sections that belong to a home's "Home" tab (the rows near the top). */
export const TOP_SECTIONS: ReadonlySet<string> = new Set(['continue', 'trending', 'season', 'popular', 'now', 'new']);
