import type { SectionId } from '../types';

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
