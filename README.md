# Nixhin

A free, no-account anime discovery UI — with optional movies and TV shows. React + TypeScript frontend,
with a small, hardened Node/TypeScript backend that proxies the [AniList GraphQL API](https://docs.anilist.co)
and, when a token is set, [TMDB](https://developer.themoviedb.org/) for movies and TV.

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
| `/api/anime/search?q=&genre=&year=&season=&format=&status=&sort=&page=` | Search / browse with filters, SFW only |
| `/api/anime/:id`                      | Details (incl. validated YouTube trailer id)|
| `/api/anime/:id/episodes?page=`       | Aired episodes (titles/dates when known)    |
| `/api/anime/:id/recommendations`      | Fan recommendations                         |
| `/api/genres`                         | Genre names (explicit genres excluded)      |
| `/api/schedule`                       | Shows airing in the next 7 days             |
| `/api/stream/config`                  | Whether episode playback is configured      |
| `/api/media/config`                   | Whether movies & TV (TMDB) and their playback are on |
| `/api/movie/list/:list?page=`         | `trending`, `popular`, `now_playing`, `upcoming` |
| `/api/tv/list/:list?page=`            | `trending`, `popular`, `on_the_air`, `airing_today` |
| `/api/{movie,tv}/discover?genre=&page=` | Popular titles, optionally in one TMDB genre id |
| `/api/{movie,tv}/genres`              | TMDB genres (id + name)                     |
| `/api/{movie,tv}/search?q=&page=`     | Search (adult titles excluded)              |
| `/api/movie/:id`, `/api/tv/:id`       | Details: cast, trailer, rating, seasons, recommendations |
| `/api/tv/:id/season/:n`               | Episodes of one season                      |
| `/api/movie/collection/:id`           | A movie series in release order             |
| `/api/person/:id`                     | An actor or filmmaker and their movies and shows |
| `/api/movie/:id/stream`, `/api/tv/:id/stream?season=&episode=` | Encoded embed URL (provider) |
| `/api/anime/:id/stream?episode=&language=` | Encoded embed URL for one episode (provider) |
| `/api/manga/list/:list?page=`         | MangaDex lists: `popular`, `latest`, `top`, `new` (English/Filipino chapters only) |
| `/api/manga/search?q=&page=`          | Manga search                                |
| `/api/manga/:id`                      | Manga details (MangaDex UUID)               |
| `/api/manga/:id/chapters?lang=en\|tl` (tl = Filipino) | Every readable chapter in one language, in reading order |
| `/api/manga/chapter/:id`              | One chapter's page images (+ data-saver set) |

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
- The API returns the embed URL as an encoded `token` (`shared/streamToken.ts`); the browser decodes it just
  before setting the iframe `src`. This is obfuscation, not encryption: the key ships in the frontend bundle.
- The player iframe is not sandboxed, and it is removed while DevTools appears to be open.
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

## Movies & TV shows (TMDB)

Set `TMDB_READ_TOKEN` (the **API Read Access Token** from themoviedb.org → Settings → API) and the header gets an
**Anime / Movies / TV shows** switch. Without it the site is anime-only, exactly as before.

- Pages: `/movies` and `/tv` (homes), `/movie/:id`, `/tv/:id?s=1&ep=4`, `/search?q=…&type=movie|tv`.
- Code: `server/src/tmdb/` (client, zod schemas, mappers, catalog), `server/src/routes/media.ts`,
  `src/api/media.ts`, `src/pages/Media*.tsx`, `src/components/media/`.
- Playback is optional and separate from anime: `STREAM_MOVIE_TEMPLATE` (`{tmdbId}` or `{imdbId}`) and
  `STREAM_TV_TEMPLATE` (also `{season}`, `{episode}`), https only, validated at startup like
  `STREAM_EMBED_TEMPLATE`. Without them movie and TV pages play trailers. Add the provider's origin to `frame-src`
  in `netlify.toml`. Example for links like `/embed/movie/tt1300854` and `/embed/tv/1399/1/1`:
  `STREAM_MOVIE_TEMPLATE=https://mydomain.com/embed/movie/{imdbId}` and
  `STREAM_TV_TEMPLATE=https://mydomain.com/embed/tv/{tmdbId}/{season}/{episode}`. With `{imdbId}`, the few
  movies TMDB has no IMDb id for say "This movie is not available to play".
- My queue and Continue watching hold all three kinds (anime entries saved before keep working); TV progress is
  tracked per season.
- Cast members open a person page (`/person/:id`, `/api/person/:id`) listing their movies and TV shows.
- TMDB's terms ask for attribution ("This product uses the TMDB API but is not endorsed or certified by TMDB");
  it is in this README, and movie/TV pages say "Movie and TV information from TMDB". Commercial use needs a TMDB
  commercial licence.

## TV remote navigation

On TV browsers (Samsung Tizen, LG webOS, Android/Google TV, Fire TV; detected from the user agent in
`src/lib/tvDevice.ts`, not from screen width) the whole UI works with a remote's D-pad. Phones, tablets and
monitors are unchanged. Add `?tv=1` to any URL to try it in a desktop browser (`?tv=0` turns it off again).

- ◀ ▶ ▲ ▼ move focus to the nearest control in that direction (`src/lib/spatialNav.ts`); card rows and the
  episode list scroll along, and rows remember the last card used. OK is the browser's own Enter.
- Back returns to the previous page; on the home page it jumps to the top menu.
- On the watch page, OK on the video (or choosing an episode from the list) hands the remote to the embedded
  player, so its arrows seek/change volume. Back returns to the page (`src/lib/tvPlayer.ts`): the page can't
  read keys inside the provider's iframe, so it pushes a history entry that the TV's Back button pops.

## Data kept on the device (no database)

Everything personal lives in the viewer's browser (`localStorage`, `src/lib/store.ts`), synced across tabs:

| Key | What |
| --- | --- |
| `nixhin-queue-v3` | My queue |
| `nixhin-progress-v1` | Continue watching: last episode + language per show, watched episodes |
| `nixhin-searches-v1` | Last 10 searches (shown under the search box) |
| `nixhin-prefs-v1` | Preferred audio language (sub/dub) |
| `nixhin-tv-v1` | TV mode forced on/off with `?tv=1` / `?tv=0` |

An episode is marked watched after 4 minutes on the player, when the viewer presses Next, or by hand in the
episode list. **Export / Import backup** (under My queue) downloads all of it as one JSON file and merges it back
on another device. The file is validated on import (`src/lib/backup.ts`).

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

## Deploying to Netlify

`netlify.toml` deploys both halves from this repo: the frontend is built to `dist/`, and the API runs as one
Netlify Function (`server/netlify/functions/api.ts`) mounted at `/api/*`, so the browser calls same-origin
`/api` with no CORS. The function reuses the same Hono app as `server/src/index.ts` (`server/src/bootstrap.ts`),
and rate-limits on Netlify's `context.ip`.

- Set runtime config (e.g. `TMDB_READ_TOKEN`, `STREAM_EMBED_TEMPLATE`, `STREAM_LANGUAGES`) in **Site configuration →
  Environment variables**, with a scope that includes **Functions**. Values in `netlify.toml` are not visible to
  functions. Redeploy after changing them.
- If you change the stream provider, update `frame-src` in the CSP in `netlify.toml`.
- Cache, rate limiter and upstream throttle are per function instance, so under load several warm instances can
  together exceed AniList's 30 req/min (they back off on 429). Use a shared store if that becomes a problem.

### Link previews (Open Graph)

- The home page uses the static tags in `index.html` and `public/og-image.png`. Crawlers need absolute URLs, so
  `%SITE_URL%` is filled in at build time from Netlify's `URL` (or `SITE_URL` if you set it).
- `/anime/*`, `/movie/*` and `/tv/*` are served by a second function (`server/netlify/functions/page.ts`). For link-preview bots and
  search crawlers it replaces the `<!-- page-meta -->` block with the anime's title, episode and language
  (e.g. *Watch Black Clover Episode 5 (English dub) · Nixhin*); see `server/src/seo/pageMeta.ts`. Browsers get
  `index.html` unchanged, so normal visits cost no extra AniList call. If AniList is slow (>4 s) or the id is
  unknown, the site-wide preview is used.
- `og:image` points at a branded share card, `/og/anime/:id.jpg?ep=&lang=` (or `/og/movie/:id.jpg`,
  `/og/tv/:id.jpg?s=&ep=`), rendered by a third function
  (`server/netlify/functions/og.ts`, layout in `server/src/seo/ogCard.ts`): banner background, poster, title and
  an episode badge. It uses satori + resvg, is encoded as JPEG (~100–150 KB; Messenger and WhatsApp skip heavy images), and uses the fonts in `public/og-fonts/` (SIL Open Font License): Shippori Mincho and Zen Kaku Gothic New,
  plus Latin Extended subsets of Noto Serif and Noto Sans for letters those lack (ō, ū in "Shōgun", ł, š, …). Netlify's
  CDN keeps each card for a week; unknown ids redirect to `/og-image.png`. An episode badge only appears for
  episodes that have aired.
- Facebook/Messenger cache previews; use the [Sharing Debugger](https://developers.facebook.com/tools/debug/)
  to refresh one after a change.

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

Anime data from AniList. Movie and TV data from TMDB. Nixhin is not affiliated with AniList or TMDB; this product
uses the TMDB API but is not endorsed or certified by TMDB.

## Manga (MangaDex)

The Manga mode (`/manga`) reads from the public [MangaDex API](https://api.mangadex.org/docs/). No key or account
is needed, so it is on by default (`MANGA_ENABLED=false` hides it).

- Only titles rated `safe` or `suggestive` with English or Filipino chapters are listed.
- The server sends its own User-Agent (MangaDex blocks browser-like ones) and stays under MangaDex's rate limit
  (about 5 requests/second per IP), caching every response.
- Covers and pages load through this site at `/img/md/*`: a Netlify Function (`server/netlify/functions/img.ts`) that
  fetches them from `uploads.mangadex.org` with the server's own User-Agent (MangaDex refuses browser User-Agents
  arriving through a proxy), and Netlify's CDN caches each image. In development a Vite proxy does the same. If that
  fails, the reader tries the MangaDex@Home node, then `uploads.mangadex.org` directly (both allowed in the CSP).
- Each chapter credits its scanlation group and MangaDex. Chapters published on an official site (e.g. MANGA Plus)
  link there instead.
- Reading progress ("Continue reading") stays in the browser (`nixhin-manga-progress-v1`).
