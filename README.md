# Nixhin

A free, no-account anime discovery UI. React + TypeScript frontend, with a small,
hardened Node/TypeScript backend that proxies the [AniList GraphQL API](https://docs.anilist.co).

> History: the project first used Jikan (unofficial MyAnimeList API), but Jikan’s public API
> was shut down on 1 Oct 2026, so the data source was switched to AniList. Only the backend
> adapter (`server/src/anilist/`) changed; the frontend contract stayed the same.

```
browser ──/api──▶ Vite dev proxy ──▶ Nixhin API (Hono, :8787) ──▶ graphql.anilist.co
```

The browser never calls AniList directly. The backend validates every input, caches and
throttles upstream calls to stay inside AniList's rate limit (currently 30 req/min), and returns
a small, stable contract (`shared/api.ts`) instead of raw upstream payloads.

## Running locally

```bash
# 1. Backend
cd server
npm install
cp .env.example .env      # optional; defaults work for local dev
npm run dev               # http://127.0.0.1:8787

# 2. Frontend (new terminal, project root)
npm install
npm run dev               # http://localhost:5173 (proxies /api to the backend)
```

## Scripts

| Where     | Command             | What it does                                  |
| --------- | ------------------- | --------------------------------------------- |
| root      | `npm run dev`       | Frontend dev server                           |
| root      | `npm run build`     | Type-check + production build to `dist/`      |
| root      | `npm run lint`      | ESLint (typescript-eslint, react-hooks)       |
| root      | `npm test`          | Frontend unit tests (Vitest)                  |
| `server/` | `npm run dev`       | API with hot reload (tsx)                     |
| `server/` | `npm run build`     | Type-check + bundle to `server/dist/index.js` |
| `server/` | `npm start`         | Run the built API                             |
| `server/` | `npm test`          | Backend unit + HTTP tests (Vitest)            |

## API

All endpoints are `GET`, return JSON, and validate their inputs (400 with a clear message otherwise).

| Endpoint                              | Description                                 |
| ------------------------------------- | ------------------------------------------- |
| `/api/health`                         | Liveness check                              |
| `/api/anime/top?filter=&limit=`       | Top anime (`airing`, `upcoming`, …)         |
| `/api/anime/season-now?page=&limit=`  | Current season                              |
| `/api/anime/search?q=&genre=&page=`   | Search / browse by genre name, SFW only     |
| `/api/anime/:id`                      | Details (incl. validated YouTube trailer id)|
| `/api/anime/:id/episodes?page=`       | Aired episodes (titles/dates when known)    |
| `/api/anime/:id/recommendations`      | Fan recommendations                         |
| `/api/genres`                         | Genre names (explicit genres excluded)      |
| `/api/schedule`                       | Shows airing in the next 7 days             |
| `/api/stream/config`                  | Whether episode playback is configured      |
| `/api/anime/:id/stream?episode=&language=` | Embed URL for one episode (provider)   |

Errors share one shape: `{ "error": { "code": "...", "message": "..." } }`.

## Episode playback (licensed provider)

Episodes play through your provider's embed player, configured only in `server/.env`:

```
STREAM_EMBED_TEMPLATE=https://example.com/embed/{anilistId}/{episode}/{language}
STREAM_LANGUAGES=sub,dub
```

- Placeholders: `{anilistId}`, `{malId}`, `{episode}`, `{language}`. The template is validated at startup
  (https only, no placeholders in the host), so requests can only ever load that one provider.
- Leave `STREAM_EMBED_TEMPLATE` empty to disable playback; the watch page then shows trailers only.
- The player iframe is sandboxed without `allow-popups` / `allow-top-navigation`, so the embedded page
  cannot open pop-ups or redirect Nixhin.
- When deploying with a CSP, add the provider's origin to `frame-src`.
- Only configure a provider you are licensed to use; check its terms for embedding.

## Security measures (backend)

- **Input validation**: strict Zod schemas for every param (integer ranges, enums, length,
  control-character and genre-name checks; genres are also checked against AniList’s list).
- **No query injection / SSRF**: GraphQL documents are fixed strings; user input only travels
  as GraphQL variables, to a fixed https endpoint.
- **Output sanitising**: upstream responses are schema-validated and mapped to our own types;
  adult titles are excluded everywhere.
  Image URLs are restricted to https on allow-listed hosts, and YouTube ids are regex-checked.
- **Rate limiting**: per-IP limit (`RATE_LIMIT_PER_MINUTE`) with `RateLimit-*` / `Retry-After`
  headers. `X-Forwarded-For` is only trusted when `TRUST_PROXY=true`.
- **Upstream protection**: a sliding-window scheduler (≤2 req/s, ≤28 req/min, configurable)
  with a bounded queue, TTL + LRU cache, in-flight de-duplication, timeouts, and retries on
  429/5xx that honour `Retry-After`.
- **Headers**: Hono `secureHeaders` (HSTS, nosniff, frame denial, CSP `default-src 'none'`),
  CORS limited to `ALLOWED_ORIGINS`, GET/OPTIONS only.
- **Errors**: never leak stack traces or upstream details. Structured JSON logs with request ids.
- **Config**: environment validated at startup. The server binds to `127.0.0.1` by default.

## Routes

| URL | Page |
| --- | --- |
| `/` (`/#trending`, `/#browse`, `/#schedule`, …) | Home, scrolled to a section |
| `/anime/:id?ep=&lang=` | Watch page; episode and language survive refresh |
| `/search?q=` | Search results |
| anything else | 404 page |

## Frontend structure

```
shared/api.ts          API contract shared by frontend and backend
src/
  api/                 fetch client (typed errors) + TanStack Query hooks
  lib/                 pure helpers: JST→local broadcast time, formatting, queue storage
  hooks/               useLayout (breakpoints), useQueue (localStorage), useAutoAdvance
  components/          Header, Footer, TabBar, Poster, ShowCard, feedback (skeleton/error)
    home/              Hero, Trending, This season, My queue, Browse, Schedule
    watch/             TrailerPlayer (click-to-load, youtube-nocookie), EpisodeList
  pages/               HomePage, AnimePage, SearchPage
  styles/              design tokens (per-breakpoint CSS variables) + globals
```

## Before deploying

- Serve the frontend with a Content-Security-Policy, e.g.
  `img-src 'self' https://s4.anilist.co https://i.ytimg.com;
  frame-src https://www.youtube-nocookie.com; connect-src 'self' <api-origin>`.
- Set `NODE_ENV=production`, `ALLOWED_ORIGINS`, and `TRUST_PROXY` to match your hosting.
- **SPA fallback:** the app uses real URLs (`/anime/154587?ep=3`, `/search?q=…`). The host must serve
  `index.html` for any path that is not a file or `/api/*`, or refreshing a deep link returns 404.
  Vite dev and `npm run preview` already do this; e.g. nginx: `try_files $uri /index.html;`,
  Netlify: `/* /index.html 200`, Vercel: a rewrite of `/(.*)` to `/index.html`.
- The rate limiter and cache are in-memory (single instance). Use Redis or similar if you scale out.

Anime data from AniList. Nixhin is not affiliated with AniList.
