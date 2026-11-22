/**
 * "Player mode" on TV: keyboard focus moves into the video's iframe, so the remote's arrows and OK
 * go to the embedded player (seek, volume, pause) instead of moving around the page.
 *
 * The page can't see keys pressed inside a cross-origin iframe, so leaving uses the browser's own
 * history: entering pushes a history entry, and the remote's Back button (which TV browsers turn into
 * "go back" when the player doesn't use it) pops it. Focus coming back to the page any other way
 * (a pointer click outside the video) also leaves player mode.
 */

const HISTORY_FLAG = 'nixhinTvPlayer';

type Listener = () => void;
const listeners = new Set<Listener>();
let active = false;
let leave: ((popHistory: boolean) => void) | null = null;
let activeFrame: HTMLIFrameElement | null = null;
/** Set when an episode was chosen from the list: its player takes control as soon as it appears. */
let pending: { readonly key: string; readonly until: number } | null = null;
const PENDING_MS = 15_000;

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribePlayerMode(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const isPlayerMode = (): boolean => active;

function hasOwnEntry(): boolean {
  const state: unknown = window.history.state;
  return typeof state === 'object' && state !== null && HISTORY_FLAG in state;
}

/**
 * Hands the remote to the player in `frame`. `returnTo` gets focus back afterwards.
 * Pass `alreadyFocused` when the viewer put focus in the frame themselves (pointer click).
 */
export function enterPlayerMode(frame: HTMLIFrameElement, returnTo: HTMLElement, alreadyFocused = false): void {
  if (active) return;
  pending = null;

  if (!alreadyFocused) {
    frame.focus();
    try {
      frame.contentWindow?.focus();
    } catch {
      // Cross-origin focus is allowed in browsers we know of; ignore any that refuse.
    }
    // The frame refused focus (not loaded, or removed): stay on the page.
    if (document.activeElement !== frame) return;
  }

  active = true;
  activeFrame = frame;
  const state: unknown = window.history.state;
  window.history.pushState({ ...(typeof state === 'object' && state !== null ? state : {}), [HISTORY_FLAG]: true }, '');

  const onPop = () => finish(false);
  // Focus returned to the page itself (the frame lost it).
  // The window regaining focus as a whole (an OS overlay closing) keeps it in the frame, so check.
  const onFocus = () =>
    window.setTimeout(() => {
      if (document.activeElement !== frame) finish(true);
    }, 0);
  // Focus reloads with the frame when its document changes; keep it inside.
  const onLoad = () => {
    if (document.activeElement === frame) frame.contentWindow?.focus();
  };

  function finish(popHistory: boolean) {
    if (!active) return;
    active = false;
    leave = null;
    activeFrame = null;
    window.removeEventListener('popstate', onPop);
    window.removeEventListener('focus', onFocus);
    frame.removeEventListener('load', onLoad);
    if (popHistory && hasOwnEntry()) window.history.back();
    if (returnTo.isConnected && document.activeElement !== returnTo) {
      if (document.activeElement === frame) frame.blur();
      returnTo.focus({ preventScroll: true });
    }
    notify();
  }

  leave = finish;
  window.addEventListener('popstate', onPop);
  window.addEventListener('focus', onFocus);
  frame.addEventListener('load', onLoad);
  notify();
}

/** Leaves player mode from the page side, if `frame` is the one in control (it is being removed). */
export function exitPlayerMode(frame: HTMLIFrameElement): void {
  if (frame === activeFrame) leave?.(true);
}

/**
 * Ask the player identified by `key` to take the remote: the current one if it already shows that
 * video, else the one that appears once it has loaded. Other players ignore the request.
 */
export function requestPlayerControl(key: string): void {
  pending = { key, until: Date.now() + PENDING_MS };
  notify();
}

/** True once per request, for the player it names: the caller should enter player mode now. */
export function takePlayerRequest(key: string): boolean {
  if (pending === null || Date.now() > pending.until) {
    pending = null;
    return false;
  }
  if (pending.key !== key) return false;
  pending = null;
  return true;
}

/** Names an episode's player for `requestPlayerControl`. */
export const episodeControlKey = (episode: number, language: string): string => `episode:${episode}:${language}`;
