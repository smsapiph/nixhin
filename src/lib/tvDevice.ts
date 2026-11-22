/**
 * Detects a TV browser (Samsung Tizen, LG webOS, Android/Google TV, Fire TV, …) so remote-control
 * navigation turns on only there. Screen width is not used: large monitors keep the normal behaviour.
 *
 * `?tv=1` forces TV mode on any browser (for testing) and `?tv=0` turns it off; the choice is remembered.
 */

const TV_USER_AGENT =
  /SMART-?TV|SmartTV|Tizen|Web0S|webOS|NetCast|HbbTV|Android ?TV|GoogleTV|BRAVIA|\bAFT[A-Z]|CrKey|Roku|VIDAA|PhilipsTV|Opera TV|Viera|AppleTV|Xbox|PlayStation/i;

const OVERRIDE_KEY = 'nixhin-tv-v1';

/** True for user agents of TV browsers and TV boxes. */
export function looksLikeTv(userAgent: string, maxTouchPoints: number): boolean {
  if (TV_USER_AGENT.test(userAgent)) return true;
  // Android TV boxes often send a plain Android user agent: no "Mobile" and no touch screen.
  return /Android/i.test(userAgent) && !/Mobile/i.test(userAgent) && maxTouchPoints === 0;
}

/** `?tv=1` / `?tv=0` → true / false; anything else → null. */
export function parseTvOverride(search: string): boolean | null {
  const value = new URLSearchParams(search).get('tv');
  return value === '1' ? true : value === '0' ? false : null;
}

function readOverride(): boolean | null {
  const fromUrl = parseTvOverride(window.location.search);
  try {
    if (fromUrl !== null) window.localStorage.setItem(OVERRIDE_KEY, fromUrl ? '1' : '0');
    else {
      const stored = window.localStorage.getItem(OVERRIDE_KEY);
      if (stored === '1' || stored === '0') return stored === '1';
    }
  } catch {
    // Storage blocked: the URL override still applies to this page load.
  }
  return fromUrl;
}

function detect(): boolean {
  if (typeof window === 'undefined') return false;
  return readOverride() ?? looksLikeTv(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** Fixed for the life of the page: a device doesn't stop being a TV. */
export const isTv: boolean = detect();
