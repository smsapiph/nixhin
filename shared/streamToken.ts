/**
 * Encodes stream embed URLs so the `/api/anime/:id/stream` response doesn't show them in
 * plain text. The backend encodes; the browser decodes just before setting the iframe src.
 *
 * This is obfuscation, not encryption: the key ships in the frontend bundle, so anyone who
 * reads that code can decode a token. A random nonce makes every token for the same URL
 * look different. Synchronous and dependency-free (no Web Crypto), so it also works on
 * plain-http dev hosts such as a LAN IP.
 *
 * Changing STREAM_TOKEN_KEY invalidates tokens already handed out (they live at most as
 * long as the response cache), so redeploy frontend and backend together.
 */

const STREAM_TOKEN_KEY = 'nixhin:stream:v1:7f3a9c1e5b2d8046';
const VERSION = 1;
const NONCE_BYTES = 8;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const KEY = encoder.encode(STREAM_TOKEN_KEY);

function keystream(nonce: Uint8Array, index: number): number {
  return (KEY[index % KEY.length] ?? 0) ^ (nonce[index % NONCE_BYTES] ?? 0) ^ ((index * 31 + 17) & 0xff);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** `nonce` is only for tests; normally a random one is used. */
export function encodeStreamToken(url: string, nonce: Uint8Array = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))): string {
  const data = encoder.encode(url);
  const out = new Uint8Array(1 + NONCE_BYTES + data.length);
  out[0] = VERSION;
  out.set(nonce.subarray(0, NONCE_BYTES), 1);
  data.forEach((byte, i) => {
    out[1 + NONCE_BYTES + i] = byte ^ keystream(nonce, i);
  });
  return toBase64Url(out);
}

/** Returns the URL, or null for a malformed or foreign token. */
export function decodeStreamToken(token: string): string | null {
  const bytes = fromBase64Url(token);
  if (!bytes || bytes.length <= 1 + NONCE_BYTES || bytes[0] !== VERSION) return null;
  const nonce = bytes.subarray(1, 1 + NONCE_BYTES);
  const data = bytes.subarray(1 + NONCE_BYTES).map((byte, i) => byte ^ keystream(nonce, i));
  try {
    return decoder.decode(data);
  } catch {
    return null;
  }
}
