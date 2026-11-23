import { describe, expect, it } from 'vitest';
import { proxyMangaImage, upstreamImageUrl } from './imageProxy.js';

const COVER = '/img/md/covers/32d76d19-8a05-4db0-9fc2-e0b0648fe9d0/e90bdc47-c8b9-4df7-b2c0-17641b645ee1.jpg.512.jpg';
const PAGE = '/img/md/data/3303dd03ac8d27452cce3f2a882e94b2/1-abc.png';

describe('upstreamImageUrl', () => {
  it('maps cover and page paths to uploads.mangadex.org', () => {
    expect(upstreamImageUrl(COVER)).toBe(`https://uploads.mangadex.org${COVER.slice('/img/md'.length)}`);
    expect(upstreamImageUrl(PAGE)).toBe('https://uploads.mangadex.org/data/3303dd03ac8d27452cce3f2a882e94b2/1-abc.png');
    expect(upstreamImageUrl('/img/md/data-saver/3303dd03ac8d27452cce3f2a882e94b2/1.jpg')).not.toBeNull();
  });

  it('refuses anything else', () => {
    expect(upstreamImageUrl('/img/md/covers/not-a-uuid/a.jpg')).toBeNull();
    expect(upstreamImageUrl('/img/md/data/3303dd03ac8d27452cce3f2a882e94b2/../../x')).toBeNull();
    expect(upstreamImageUrl('/img/md/manga/random')).toBeNull();
    expect(upstreamImageUrl('/img/tmdb/w342/a.jpg')).toBeNull();
  });
});

describe('proxyMangaImage', () => {
  it('asks MangaDex with the server User-Agent and lets the CDN cache the image', async () => {
    let sent: Headers | undefined;
    const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg', 'content-length': '3' } });
    }) as typeof fetch;
    const response = await proxyMangaImage(
      new Request(`https://nixhin.example${COVER}`, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/130', Referer: 'https://x' } }),
      fetchFn,
    );
    expect(response.status).toBe(200);
    expect(sent?.get('user-agent')).toBe('nixhin-server/0.1');
    expect(sent?.get('referer')).toBeNull();
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('netlify-cdn-cache-control')).toContain('durable');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('does not pass on non-images or upstream errors', async () => {
    const html = (async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })) as typeof fetch;
    expect((await proxyMangaImage(new Request(`https://nixhin.example${COVER}`), html)).status).toBe(502);
    const missing = (async () => new Response('', { status: 404 })) as typeof fetch;
    expect((await proxyMangaImage(new Request(`https://nixhin.example${COVER}`), missing)).status).toBe(404);
    expect((await proxyMangaImage(new Request('https://nixhin.example/img/md/etc/passwd'))).status).toBe(404);
  });
});
