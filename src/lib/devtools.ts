/**
 * Deterrents against casual inspection: blocks the context menu and the usual DevTools
 * shortcuts, and detects an open DevTools panel so the episode player can be removed.
 *
 * This is a deterrent, not access control: the stream endpoint stays reachable without a
 * browser, and detection is heuristic (see `looksLikeDevtoolsOpen`).
 */

interface ShortcutEvent {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** Letters that open DevTools panels: I (inspector), J (console), C (element picker), K (Firefox console). */
const DEVTOOLS_KEYS = new Set(['KeyI', 'KeyJ', 'KeyC', 'KeyK']);

/** True for F12, Ctrl+Shift+I/J/C/K, Cmd+Option+I/J/C/K, and view-source (Ctrl+U / Cmd+Option+U). */
export function isDevtoolsShortcut(event: ShortcutEvent): boolean {
  if (event.key === 'F12' || event.code === 'F12') return true;
  const ctrlShift = event.ctrlKey && event.shiftKey && !event.altKey;
  const cmdOption = event.metaKey && event.altKey;
  if ((ctrlShift || cmdOption) && DEVTOOLS_KEYS.has(event.code)) return true;
  // View source.
  if (event.code === 'KeyU' && ((event.ctrlKey && !event.shiftKey && !event.altKey) || cmdOption)) return true;
  return false;
}

interface WindowSize {
  readonly outerWidth: number;
  readonly outerHeight: number;
  readonly innerWidth: number;
  readonly innerHeight: number;
}

/** Larger than browser chrome (toolbars, scrollbars), smaller than a docked DevTools panel. */
const DOCKED_PANEL_PX = 160;

/**
 * Detects a DevTools panel docked to the side or bottom of the window. Undocked DevTools
 * (a separate window) is not visible this way; see the debugger check in `useDevtoolsOpen`.
 */
export function looksLikeDevtoolsOpen(size: WindowSize): boolean {
  // A minimised or not-yet-laid-out window reports zeros.
  if (size.outerWidth === 0 || size.outerHeight === 0) return false;
  return (
    size.outerWidth - size.innerWidth > DOCKED_PANEL_PX ||
    size.outerHeight - size.innerHeight > DOCKED_PANEL_PX
  );
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
  );
}

/**
 * Blocks the context menu (except in text fields, so paste still works) and DevTools shortcuts.
 * Returns a cleanup function.
 */
export function installInspectBlock(target: Window = window): () => void {
  const onContextMenu = (event: MouseEvent) => {
    if (!isEditable(event.target)) event.preventDefault();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (isDevtoolsShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  target.addEventListener('contextmenu', onContextMenu);
  // Capture phase, so nothing in the page can see the shortcut first.
  target.addEventListener('keydown', onKeyDown, true);
  return () => {
    target.removeEventListener('contextmenu', onContextMenu);
    target.removeEventListener('keydown', onKeyDown, true);
  };
}
