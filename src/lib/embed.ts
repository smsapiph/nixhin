import { decodeStreamToken } from '../../shared/streamToken';

/**
 * Decodes the server's stream token. Only https embeds are ever framed, even though the
 * server builds them from a fixed template.
 */
export function safeEmbedUrl(token: string): string | null {
  const url = decodeStreamToken(token);
  if (url === null) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
