import { useSyncExternalStore } from 'react';
import { looksLikeDevtoolsOpen } from '../lib/devtools';

const CHECK_INTERVAL_MS = 1000;
/** A `debugger` statement only takes this long when DevTools is open and paused on it. */
const DEBUGGER_PAUSE_MS = 100;

let open = false;
let timer: number | undefined;
const listeners = new Set<() => void>();

/** Touch devices have no attached DevTools, and their outer/inner sizes differ for other reasons. */
function hasCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
}

/**
 * Catches undocked DevTools: the statement is a no-op normally, but pauses execution while
 * DevTools is open (unless breakpoints are deactivated). Production only, so local
 * development isn't interrupted every second.
 */
function checkDebuggerPause(): boolean {
  if (!import.meta.env.PROD) return false;
  const start = performance.now();
  // eslint-disable-next-line no-debugger
  debugger;
  return performance.now() - start > DEBUGGER_PAUSE_MS;
}

function check(): void {
  const next = checkDebuggerPause() || (!hasCoarsePointer() && looksLikeDevtoolsOpen(window));
  if (next !== open) {
    open = next;
    listeners.forEach((listener) => listener());
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    check();
    timer = window.setInterval(check, CHECK_INTERVAL_MS);
    window.addEventListener('resize', check);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval(timer);
      window.removeEventListener('resize', check);
    }
  };
}

/** True while DevTools appears to be open. Shared across components; polls only while used. */
export function useDevtoolsOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}
