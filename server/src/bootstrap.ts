import type { Hono } from 'hono';
import { AniListCatalog } from './anilist/catalog.js';
import { AniListClient } from './anilist/client.js';
import { createApp } from './app.js';
import type { Config } from './config.js';
import { RequestScheduler } from './lib/requestScheduler.js';
import { TtlCache } from './lib/ttlCache.js';
import type { Logger } from './logger.js';
import { EmbedStreams } from './stream/embed.js';

/** The real AniList catalog with its upstream throttle and cache. */
export function buildCatalog(config: Config, logger: Logger): AniListCatalog {
  const scheduler = new RequestScheduler({
    rules: [
      { limit: 2, windowMs: 1_000 },
      { limit: config.UPSTREAM_REQUESTS_PER_MINUTE, windowMs: 60_000 },
    ],
    maxQueue: 60,
  });

  const client = new AniListClient({
    endpoint: config.ANILIST_URL,
    timeoutMs: config.UPSTREAM_TIMEOUT_MS,
    scheduler,
    cache: new TtlCache<unknown>(1_000),
  });

  return new AniListCatalog(client, {
    onInvalidItem: (error) => logger.debug('skipped invalid upstream item', { issues: error.issues.slice(0, 3) }),
  });
}

/** Wires the real AniList catalog and stream provider into the app. Shared by the Node server and Netlify. */
export function buildApp(config: Config, logger: Logger): Hono {
  const catalog = buildCatalog(config, logger);

  const streams = new EmbedStreams({ template: config.STREAM_EMBED_TEMPLATE, languages: config.STREAM_LANGUAGES });
  if (streams.config().enabled) {
    logger.info('episode playback enabled', { provider: new URL(config.STREAM_EMBED_TEMPLATE ?? '').origin });
  }

  return createApp({ config, catalog, streams, logger });
}
