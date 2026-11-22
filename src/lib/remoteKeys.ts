/** The remote-control buttons the TV mode understands. */
export type RemoteKey = 'left' | 'right' | 'up' | 'down' | 'enter' | 'back';

interface KeyLike {
  readonly key: string;
  readonly keyCode?: number;
}

/** Back buttons by key name (Chrome/Android TV, Fire TV, keyboards) … */
const BACK_KEYS = new Set(['Escape', 'Backspace', 'BrowserBack', 'GoBack', 'XF86Back']);
/** … and by key code: 10009 Samsung Tizen, 461 LG webOS, 8 Backspace, 27 Escape. */
const BACK_CODES = new Set([10009, 461, 8, 27]);

const ARROWS: Record<string, RemoteKey> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Left: 'left',
  Right: 'right',
  Up: 'up',
  Down: 'down',
};
const ARROW_CODES: Record<number, RemoteKey> = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };

/** Maps a key event from a TV remote (or keyboard) to a remote button, or null for other keys. */
export function remoteKey(event: KeyLike): RemoteKey | null {
  const arrow = ARROWS[event.key];
  if (arrow) return arrow;
  if (event.key === 'Enter') return 'enter';
  if (BACK_KEYS.has(event.key)) return 'back';
  // Some TV browsers report "Unidentified" (or nothing useful) and only a key code.
  const code = event.keyCode ?? 0;
  if (ARROW_CODES[code]) return ARROW_CODES[code];
  if (code === 13) return 'enter';
  if (BACK_CODES.has(code)) return 'back';
  return null;
}
