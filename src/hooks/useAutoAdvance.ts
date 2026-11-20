import { useEffect } from 'react';

interface AutoAdvanceOptions {
  readonly intervalMs: number;
  readonly paused: boolean;
  /** Only advance while the page is scrolled less than this many pixels. */
  readonly maxScrollY: number;
  readonly onAdvance: () => void;
}

/**
 * Calls `onAdvance` on an interval while the tab is visible, the user hasn't
 * scrolled away, and they haven't asked for reduced motion.
 */
export function useAutoAdvance({ intervalMs, paused, maxScrollY, onAdvance }: AutoAdvanceOptions): void {
  useEffect(() => {
    if (paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const id = window.setInterval(() => {
      if (!document.hidden && window.scrollY < maxScrollY) onAdvance();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, paused, maxScrollY, onAdvance]);
}
