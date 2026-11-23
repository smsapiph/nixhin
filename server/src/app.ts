import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { timeout } from 'hono/timeout';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorBody, ApiErrorCode } from '../../shared/api.js';
import type { Config } from './config.js';
import { HttpError, UpstreamError } from './errors.js';
import type { AnimeCatalog, MangaCatalog, MediaCatalog } from './catalog.js';
import { silentLogger, type Logger } from './logger.js';
import { clientIp, rateLimit } from './middleware/rateLimit.js';
import { apiRoutes } from './routes/api.js';
import { mangaRoutes } from './routes/manga.js';
import { mediaRoutes } from './routes/media.js';
import { EmbedStreams } from './stream/embed.js';
import { MediaEmbedStreams } from './stream/mediaEmbed.js';

export interface AppDeps {
  readonly config: Pick<Config, 'ALLOWED_ORIGINS' | 'TRUST_PROXY' | 'RATE_LIMIT_PER_MINUTE'>;
  readonly catalog: AnimeCatalog;
  /** Episode playback; disabled when omitted. */
  readonly streams?: EmbedStreams;
  /** Movies & TV (TMDB); anime-only when omitted. */
  readonly media?: MediaCatalog | null;
  readonly mediaStreams?: MediaEmbedStreams;
  /** Manga (MangaDex); the manga routes answer 404 when omitted. */
  readonly manga?: MangaCatalog | null;
  readonly logger?: Logger;
  readonly now?: () => number;
}

const REQUEST_TIMEOUT_MS = 25_000;

function errorResponse(c: Context, status: ContentfulStatusCode, code: ApiErrorCode, message: string) {
  const body: ApiErrorBody = { error: { code, message } };
  c.header('Cache-Control', 'no-store');
  return c.json(body, status);
}

export function createApp({
  config,
  catalog,
  streams = new EmbedStreams({ template: undefined, languages: [] }),
  media = null,
  mediaStreams = new MediaEmbedStreams({ movieTemplate: undefined, tvTemplate: undefined }),
  manga = null,
  logger = silentLogger,
  now = Date.now,
}: AppDeps): Hono {
  const app = new Hono();
  const allowedOrigins = new Set(config.ALLOWED_ORIGINS);

  app.use('*', requestId());

  app.use('*', async (c, next) => {
    const started = now();
    await next();
    logger.info('request', {
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: now() - started,
    });
  });

  // A JSON-only API never needs to load or frame anything.
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      crossOriginResourcePolicy: 'same-site',
    }),
  );

  app.use(
    '/api/*',
    cors({
      origin: (origin) => (allowedOrigins.has(origin) ? origin : null),
      allowMethods: ['GET', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      maxAge: 600,
    }),
  );

  app.use(
    '/api/*',
    rateLimit({
      limit: config.RATE_LIMIT_PER_MINUTE,
      windowMs: 60_000,
      keyFor: (c) => clientIp(c, config.TRUST_PROXY),
      now,
    }),
  );

  app.use('/api/*', timeout(REQUEST_TIMEOUT_MS));

  app.get('/api/health', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ status: 'ok' });
  });

  app.route('/api', apiRoutes(catalog, streams));
  app.route('/api', mediaRoutes(media, mediaStreams));
  app.route('/api', mangaRoutes(manga));

  app.notFound((c) => errorResponse(c, 404, 'NOT_FOUND', 'Route not found'));

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return errorResponse(c, error.status, error.code, error.message);
    }

    if (error instanceof UpstreamError) {
      logger.warn('upstream error', {
        requestId: c.get('requestId'),
        kind: error.kind,
        detail: error.message,
        cause: error.cause instanceof Error ? error.cause.message : undefined,
      });
      switch (error.kind) {
        case 'not_found':
          return errorResponse(c, 404, 'NOT_FOUND', 'That title could not be found.');
        case 'bad_request':
          return errorResponse(c, 400, 'BAD_REQUEST', 'The request was not accepted. Check the search or genre.');
        case 'unavailable':
          c.header('Retry-After', '5');
          return errorResponse(c, 503, 'UPSTREAM_UNAVAILABLE', 'The catalog is busy. Try again shortly.');
        case 'bad_response':
          return errorResponse(c, 502, 'UPSTREAM_ERROR', 'The catalog returned an unexpected response.');
      }
    }

    if (error instanceof HTTPException && error.status === 504) {
      return errorResponse(c, 503, 'UPSTREAM_UNAVAILABLE', 'The request took too long. Try again shortly.');
    }

    // Unknown failure: log the details, reveal nothing.
    logger.error('unhandled error', {
      requestId: c.get('requestId'),
      name: error.name,
      detail: error.message,
      stack: error.stack,
    });
    return errorResponse(c, 500, 'INTERNAL_ERROR', 'Something went wrong.');
  });

  return app;
}
