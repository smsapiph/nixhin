/** Page-turning rules for the paged manga reader (pure, so they can be tested without a DOM). */

/** `rtl`: traditional manga, the next page is to the left. `ltr`: western comics and most manhwa. */
export type ReadingDirection = 'rtl' | 'ltr';

/** A turn: +1 next page, -1 previous page, 0 nothing. */
export type Step = 1 | -1 | 0;

/** Arrow keys turn the page the way the book reads: in `rtl`, ← is the next page. */
export function arrowStep(key: 'left' | 'right', direction: ReadingDirection): Step {
  const forward = direction === 'rtl' ? 'left' : 'right';
  return key === forward ? 1 : -1;
}

/** Minimum horizontal travel (px) for a swipe; shorter movements are taps. */
export const SWIPE_MIN_PX = 45;

/**
 * A finished pointer gesture. Swiping pulls the next page in from the side it reads from:
 * in `rtl` a swipe to the right (dx > 0) is the next page, in `ltr` a swipe to the left.
 * Returns null for a tap (or a mostly vertical drag, which is left to scrolling and zooming).
 */
export function swipeStep(dx: number, dy: number, direction: ReadingDirection): Step | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return Math.abs(dy) >= SWIPE_MIN_PX ? 0 : null;
  const toRight = dx > 0;
  return (direction === 'rtl') === toRight ? 1 : -1;
}

/**
 * A tap at `fraction` of the reader's width (0 = left edge): the outer thirds turn the page,
 * the middle shows or hides the controls.
 */
export function tapAction(fraction: number, direction: ReadingDirection): Step | 'menu' {
  if (fraction > 1 / 3 && fraction < 2 / 3) return 'menu';
  const leftSide = fraction <= 1 / 3;
  return (direction === 'rtl') === leftSide ? 1 : -1;
}

/** Keeps the page index inside 0…count, where `count` itself is the end-of-chapter screen. */
export function clampPage(index: number, count: number): number {
  return Math.min(Math.max(index, 0), count);
}
