import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** The one proxy event used below (the root project has no Node typings for http-proxy's EventEmitter). */
interface ProxyEvents {
  on(event: 'proxyReq', listener: (request: { removeHeader(name: string): void }) => void): void;
}

/** Where the backend runs in development (see server/.env.example). */
const apiTarget = 'http://127.0.0.1:8787';

/**
 * Absolute site origin for the link-preview tags in index.html (crawlers need absolute URLs).
 * Netlify sets URL to the site's main address during builds; SITE_URL overrides it.
 */
const env = loadEnv('production', '.', ['SITE_URL', 'URL']);
const siteUrl = (env.SITE_URL ?? env.URL ?? '').replace(/\/+$/, '');

export default defineConfig({
  plugins: [
    react(),
    { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl) },
  ],
  build: {
    // Transpile syntax for older iPhones/iPads still in use (iOS 15+), alongside evergreen browsers.
    target: ['es2020', 'ios15', 'safari15', 'chrome100', 'firefox100', 'edge100'],
    rolldownOptions: {
      output: {
        // Keep the `debugger` statement the DevTools check relies on (src/hooks/useDevtoolsOpen.ts).
        minify: { compress: { dropDebugger: false } },
      },
    },
  },
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  server: {
    // Same-origin `/api` in dev: no CORS round-trips, and the browser never talks to AniList directly.
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      // Same as the /img/tmdb/* rule in netlify.toml (see src/lib/images.ts).
      '/img/tmdb': { target: 'https://image.tmdb.org', changeOrigin: true, rewrite: (path) => path.replace(/^\/img\/tmdb/, '/t/p') },
      // Same as the /img/md/* function in production: no Referer, and a non-browser User-Agent (MangaDex refuses
      // browser User-Agents arriving through a proxy).
      '/img/md': {
        target: 'https://uploads.mangadex.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/img\/md/, ''),
        headers: { 'User-Agent': 'nixhin-dev/0.1' },
        configure: (proxy) => (proxy as unknown as ProxyEvents).on('proxyReq', (request) => request.removeHeader('referer')),
      },
    },
  },
  preview: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
