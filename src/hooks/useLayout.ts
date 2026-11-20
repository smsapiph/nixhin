import { useSyncExternalStore } from 'react';
import type { Layout } from '../types';

/**
 * Breakpoints, widest first. Keep in sync with the media queries in styles/tokens.css.
 * Sizing is handled in CSS; this hook exists only for structural differences
 * (e.g. the phone tab bar or the inline nav on wide screens).
 */
const BREAKPOINTS: readonly (readonly [Layout, string])[] = [
  ['tv', '(min-width: 1760px)'],
  ['laptop', '(min-width: 1100px)'],
  ['tablet', '(min-width: 640px)'],
];

function getSnapshot(): Layout {
  for (const [layout, query] of BREAKPOINTS) {
    if (window.matchMedia(query).matches) return layout;
  }
  return 'phone';
}

function subscribe(onChange: () => void): () => void {
  const lists = BREAKPOINTS.map(([, query]) => window.matchMedia(query));
  lists.forEach((list) => list.addEventListener('change', onChange));
  return () => lists.forEach((list) => list.removeEventListener('change', onChange));
}

const getServerSnapshot = (): Layout => 'laptop';

export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function isWideLayout(layout: Layout): boolean {
  return layout === 'laptop' || layout === 'tv';
}
