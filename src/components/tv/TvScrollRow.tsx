import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import { ROW_ATTRIBUTE } from '../../lib/spatialNav';
import styles from './TvScrollRow.module.css';

interface RowState {
  readonly active: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly index: number;
  readonly count: number;
}

const IDLE: RowState = { active: false, left: false, right: false, index: 0, count: 0 };

const sameState = (a: RowState, b: RowState) =>
  a.active === b.active && a.left === b.left && a.right === b.right && a.index === b.index && a.count === b.count;

/**
 * TV version of a horizontal card row: the same row, plus ‹ › buttons in the page gutter on sides with
 * more cards (clickable with a TV browser's pointer) and, while the D-pad is on the row, a "3 / 20" position.
 */
export function TvScrollRow({ className, children, ...props }: ComponentPropsWithoutRef<'div'>) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RowState>(IDLE);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const update = () => {
      const focused = document.activeElement;
      const active = focused !== null && row.contains(focused);
      const max = row.scrollWidth - row.clientWidth;
      const items = Array.from(row.children);
      const next: RowState = {
        active,
        left: row.scrollLeft > 1,
        right: row.scrollLeft < max - 1,
        index: active ? items.findIndex((item) => item.contains(focused)) + 1 : 0,
        count: items.length,
      };
      setState((prev) => (sameState(prev, next) ? prev : next));
    };
    // focusout fires before focus lands on the next element.
    const onFocusOut = () => window.setTimeout(update, 0);

    update();
    row.addEventListener('scroll', update, { passive: true });
    row.addEventListener('focusin', update);
    row.addEventListener('focusout', onFocusOut);
    const resize = new ResizeObserver(update);
    resize.observe(row);
    const mutations = new MutationObserver(update);
    mutations.observe(row, { childList: true });
    return () => {
      row.removeEventListener('scroll', update);
      row.removeEventListener('focusin', update);
      row.removeEventListener('focusout', onFocusOut);
      resize.disconnect();
      mutations.disconnect();
    };
  }, []);

  const on = (visible: boolean) => (state.active && visible ? styles.on : '');

  /** Scrolls most of a screen's width; the pointer of a TV remote can't swipe or use a scroll wheel. */
  const scrollBy = (direction: 1 | -1) => {
    const row = rowRef.current;
    if (!row) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollBy({ left: direction * row.clientWidth * 0.8, behavior: reduced ? 'instant' : 'smooth' });
  };

  return (
    <div className={`${styles.wrap} ${state.active ? styles.active : ''}`}>
      <div ref={rowRef} className={`${className ?? ''} ${styles.row}`} {...{ [ROW_ATTRIBUTE]: '' }} {...props}>
        {children}
      </div>
      {/* Pointer buttons: skipped by the D-pad (which scrolls the row by moving between cards). */}
      <button
        type="button"
        tabIndex={-1}
        data-tv-skip=""
        aria-label="Scroll left"
        className={`${styles.edge} ${styles.left} ${state.left ? styles.shown : ''}`}
        onClick={() => scrollBy(-1)}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        data-tv-skip=""
        aria-label="Scroll right"
        className={`${styles.edge} ${styles.right} ${state.right ? styles.shown : ''}`}
        onClick={() => scrollBy(1)}
      >
        <span aria-hidden="true">›</span>
      </button>
      <span aria-hidden="true" className={`${styles.count} ${on(state.index > 0 && state.count > 1)}`}>
        {state.index} / {state.count}
      </span>
    </div>
  );
}
