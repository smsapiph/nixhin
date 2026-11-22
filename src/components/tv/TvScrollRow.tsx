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
 * TV version of a horizontal card row: the same row, plus ‹ › markers in the page gutter while the
 * remote is on it (only on sides with more cards) and a "3 / 20" position under the right marker.
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

  return (
    <div className={styles.wrap}>
      <div ref={rowRef} className={`${className ?? ''} ${styles.row}`} {...{ [ROW_ATTRIBUTE]: '' }} {...props}>
        {children}
      </div>
      <span aria-hidden="true" className={`${styles.edge} ${styles.left} ${on(state.left)}`}>
        ‹
      </span>
      <span aria-hidden="true" className={`${styles.edge} ${styles.right} ${on(state.right)}`}>
        ›
      </span>
      <span aria-hidden="true" className={`${styles.count} ${on(state.index > 0 && state.count > 1)}`}>
        {state.index} / {state.count}
      </span>
    </div>
  );
}
