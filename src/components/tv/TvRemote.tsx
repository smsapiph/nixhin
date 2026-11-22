import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import { remoteKey } from '../../lib/remoteKeys';
import { findNext, focusableElements, focusElement, rememberFocus, type Direction } from '../../lib/spatialNav';
import { isPlayerMode, subscribePlayerMode } from '../../lib/tvPlayer';
import styles from './TvRemote.module.css';

interface TvRemoteProps {
  readonly isHome: boolean;
  readonly onBack: () => void;
}

/** How long the button guide stays up after the last key press. */
const HINT_MS = 4000;
/** How long after a page change to keep looking for something to focus while content loads. */
const SETTLE_MS = 4000;

function isTextField(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'submit', 'reset', 'range'].includes(el.type);
}

/** In a text field, ◀ ▶ move the caret until it reaches either end. */
function caretCanMove(el: HTMLInputElement | HTMLTextAreaElement, dir: Direction): boolean {
  let start: number | null;
  try {
    start = el.selectionStart;
  } catch {
    return false; // number inputs etc. have no caret API
  }
  if (start === null) return false;
  if (start !== el.selectionEnd) return true; // collapse the selection first
  return dir === 'left' ? start > 0 : start < el.value.length;
}

/** Where focus starts on a page: the video, then the page's own first control below the header. */
function initialTarget(): HTMLElement | null {
  const main = document.querySelector('main');
  if (!main) return null;
  const preferred = main.querySelector<HTMLElement>('[data-tv-autofocus]');
  if (preferred && focusableElements(main).includes(preferred)) return preferred;
  return focusableElements(main)[0] ?? null;
}

function hasPageFocus(): boolean {
  const el = document.activeElement;
  return el !== null && el !== document.body && el.isConnected;
}

/**
 * TV only: drives the whole UI with a remote's D-pad. Arrows move focus to the nearest control in
 * that direction (scrolling rows and lists along), OK activates it (the browser's own Enter
 * behaviour), and Back returns to the previous page — or, on the home page, to the top menu.
 */
export function TvRemote({ isHome, onBack }: TvRemoteProps) {
  const location = useLocation();
  const [hintVisible, setHintVisible] = useState(true);
  const hintTimer = useRef(0);
  const controllingVideo = useSyncExternalStore(subscribePlayerMode, isPlayerMode, () => false);
  const lastKeyAt = useRef(0);

  const showHint = useCallback(() => {
    setHintVisible(true);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHintVisible(false), HINT_MS);
  }, []);

  // The guide fades on its own at first, and comes back when the remote is handed to (or taken
  // back from) the video.
  useEffect(() => {
    hintTimer.current = window.setTimeout(() => setHintVisible(false), HINT_MS);
    const unsubscribe = subscribePlayerMode(showHint);
    return () => {
      unsubscribe();
      window.clearTimeout(hintTimer.current);
    };
  }, [showHint]);

  // Rows remember their last card.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Element) rememberFocus(event.target);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  // A new page: put focus on it once its content has loaded, unless the viewer already moved.
  // Only the path counts: ?ep= changes and #section jumps stay on the same page.
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > SETTLE_MS || lastKeyAt.current > startedAt || isPlayerMode()) {
        window.clearInterval(timer);
        return;
      }
      const target = initialTarget();
      const current = document.activeElement;
      // Upgrade from a fallback (e.g. the Back button) to the video once it appears.
      const upgrade = target?.hasAttribute('data-tv-autofocus') && current !== target;
      if (target && (!hasPageFocus() || upgrade)) {
        focusElement(target);
        if (upgrade) window.clearInterval(timer);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [location.pathname]);

  const backRef = useRef({ isHome, onBack });
  useEffect(() => {
    backRef.current = { isHome, onBack };
  }, [isHome, onBack]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const key = remoteKey(event);
      if (key === null) return;
      lastKeyAt.current = Date.now();
      showHint();
      const current = document.activeElement;

      if (key === 'back') {
        // Backspace edits text; Escape and the remote's Back still leave the field.
        if (current && isTextField(current) && event.key === 'Backspace') return;
        const { isHome: home, onBack: back } = backRef.current;
        if (!home) {
          event.preventDefault();
          back();
          return;
        }
        const header = document.querySelector('header');
        if (header && current && header.contains(current)) return; // let the TV leave the site
        const first = header ? focusableElements(header)[0] : undefined;
        if (first) {
          event.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          focusElement(first);
        }
        return;
      }

      if (key === 'enter') {
        if (!hasPageFocus()) {
          const target = initialTarget();
          if (target) {
            event.preventDefault();
            focusElement(target);
          }
        }
        return; // buttons and links handle Enter themselves
      }

      // Arrows.
      if (!hasPageFocus() || !(current instanceof HTMLElement)) {
        const target = initialTarget();
        if (target) {
          event.preventDefault();
          focusElement(target);
        }
        return;
      }
      if (isTextField(current) && (key === 'left' || key === 'right') && caretCanMove(current, key)) return;
      // Inside an open <select> list the browser handles the arrows; on the closed control we move.
      event.preventDefault();
      const next = findNext(current, key);
      if (next) focusElement(next);
    };
    // Capture: run before inputs and selects change value on arrow keys.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [showHint]);

  return (
    <div className={`${styles.hint} ${hintVisible ? '' : styles.hidden}`} aria-hidden="true">
      {controllingVideo ? (
        <>
          <span>The remote now controls the video</span>
          <span>
            <span className={styles.key}>↩</span>Back to the page
          </span>
        </>
      ) : (
        <>
          <span>
            <span className={styles.key}>◀ ▶</span>Scroll
          </span>
          <span>
            <span className={styles.key}>▲ ▼</span>Section
          </span>
          <span>
            <span className={styles.key}>OK</span>Open
          </span>
          <span>
            <span className={styles.key}>↩</span>Back
          </span>
        </>
      )}
    </div>
  );
}
