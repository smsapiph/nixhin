/**
 * Spatial (D-pad) navigation: picks the focusable element that an arrow key should move to,
 * and scrolls it into view. The geometry (`pickNext`) is pure so it can be tested without a DOM.
 */

export type Direction = 'left' | 'right' | 'up' | 'down';

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Gap between two ranges on one axis; 0 when they overlap. */
function rangeGap(a1: number, a2: number, b1: number, b2: number): number {
  if (b2 < a1) return a1 - b2;
  if (b1 > a2) return b1 - a2;
  return 0;
}

/** Tolerance for elements that touch or overlap slightly (focus rings, negative margins). */
const EDGE_SLOP = 2;

/**
 * Score of moving from `from` to `to` in `dir`, or null when `to` isn't in that direction.
 * Lower is better: distance along the direction, plus a heavier penalty for being off-axis.
 */
export function moveScore(from: Box, to: Box, dir: Direction): number | null {
  const horizontal = dir === 'left' || dir === 'right';
  let along: number;
  switch (dir) {
    case 'right':
      along = to.left - from.right;
      break;
    case 'left':
      along = from.left - to.right;
      break;
    case 'down':
      along = to.top - from.bottom;
      break;
    case 'up':
      along = from.top - to.bottom;
      break;
  }
  if (along < -EDGE_SLOP) {
    // Overlapping boxes still count when the target's centre is clearly further along.
    const fromCentre = horizontal ? (from.left + from.right) / 2 : (from.top + from.bottom) / 2;
    const toCentre = horizontal ? (to.left + to.right) / 2 : (to.top + to.bottom) / 2;
    const ahead = dir === 'right' || dir === 'down' ? toCentre - fromCentre : fromCentre - toCentre;
    const extent = horizontal ? from.right - from.left : from.bottom - from.top;
    if (ahead <= extent / 2) return null;
    along = 0;
  }
  along = Math.max(0, along);

  const offAxis = horizontal
    ? rangeGap(from.top, from.bottom, to.top, to.bottom)
    : rangeGap(from.left, from.right, to.left, to.right);
  const centreOffset = horizontal
    ? Math.abs((from.top + from.bottom) / 2 - (to.top + to.bottom) / 2)
    : Math.abs((from.left + from.right) / 2 - (to.left + to.right) / 2);

  return along + offAxis * 3 + centreOffset * 0.1;
}

/** Index of the best candidate in `dir`, or -1 when there is none. */
export function pickNext(from: Box, candidates: readonly Box[], dir: Direction): number {
  let best = -1;
  let bestScore = Infinity;
  candidates.forEach((box, i) => {
    const score = moveScore(from, box, dir);
    if (score !== null && score < bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

/* ------------------------------------------------------------------ DOM helpers */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Rows that remember the last focused item, so moving up/down returns to the same card. */
export const ROW_ATTRIBUTE = 'data-tv-row';

function isUsable(el: HTMLElement): boolean {
  if (el.closest('[inert], [aria-hidden="true"]')) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

export function focusableElements(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isUsable);
}

const rowMemory = new WeakMap<Element, HTMLElement>();

/** Call on every focus change so rows remember where the viewer was. */
export function rememberFocus(el: Element): void {
  const row = el.closest(`[${ROW_ATTRIBUTE}]`);
  if (row && el instanceof HTMLElement) rowMemory.set(row, el);
}

/** The element an arrow press should move to from `current`, or null at the edge of the page. */
export function findNext(current: HTMLElement, dir: Direction): HTMLElement | null {
  const candidates = focusableElements().filter((el) => el !== current && !current.contains(el));
  const index = pickNext(current.getBoundingClientRect(), candidates.map((el) => el.getBoundingClientRect()), dir);
  const next = candidates[index];
  if (!next) return null;

  // Entering a different row from above or below: go back to the card last used there.
  if (dir === 'up' || dir === 'down') {
    const row = next.closest(`[${ROW_ATTRIBUTE}]`);
    if (row && !row.contains(current)) {
      const remembered = rowMemory.get(row);
      if (remembered && remembered.isConnected && isUsable(remembered)) return remembered;
    }
  }
  return next;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function isScrollable(style: CSSStyleDeclaration, axis: 'x' | 'y'): boolean {
  const overflow = axis === 'x' ? style.overflowX : style.overflowY;
  return overflow === 'auto' || overflow === 'scroll';
}

/**
 * Scrolls `el` into view inside its scrolling rows/lists (with one item of look-ahead), then keeps it
 * comfortably inside the window, clear of the sticky header.
 */
export function reveal(el: HTMLElement): void {
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'instant' : 'smooth';

  for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const box = parent.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    if (isScrollable(style, 'x') && parent.scrollWidth > parent.clientWidth) {
      const ahead = Math.min(rect.width * 1.25, box.width / 3);
      let delta = 0;
      if (rect.right + ahead > box.right) delta = rect.right + ahead - box.right;
      else if (rect.left - ahead < box.left) delta = rect.left - ahead - box.left;
      if (delta !== 0) parent.scrollTo({ left: parent.scrollLeft + delta, behavior });
    }
    if (isScrollable(style, 'y') && parent.scrollHeight > parent.clientHeight) {
      const ahead = Math.min(rect.height, box.height / 4);
      let delta = 0;
      if (rect.bottom + ahead > box.bottom) delta = rect.bottom + ahead - box.bottom;
      else if (rect.top - ahead < box.top) delta = rect.top - ahead - box.top;
      if (delta !== 0) parent.scrollTo({ top: parent.scrollTop + delta, behavior });
    }
  }

  // The sticky header is always on screen.
  const header = document.querySelector('header');
  if (header?.contains(el)) return;
  const rect = el.getBoundingClientRect();
  const headerBottom = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
  const view = window.innerHeight;
  const top = headerBottom + view * 0.12;
  const bottom = view * 0.88;
  if (rect.top >= top && rect.bottom <= bottom) return;

  const usable = view - headerBottom;
  // Tall things (the player) line up under the header; everything else is centred.
  const target =
    rect.height > usable * 0.6
      ? window.scrollY + rect.top - headerBottom - view * 0.03
      : window.scrollY + rect.top - headerBottom - (usable - rect.height) / 2;
  window.scrollTo({ top: Math.max(0, target), behavior });
}

/** Moves focus to `el` and scrolls it into view. */
export function focusElement(el: HTMLElement): void {
  el.focus({ preventScroll: true });
  reveal(el);
}
