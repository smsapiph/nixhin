import { serve } from '@hono/node-server';
import { AniListCatalog } from './anilist/catalog.js';
import { AniListClient } from './anilist/client.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { RequestScheduler } from './lib/requestScheduler.js';
import { TtlCache } from './lib/ttlCache.js';
import { createLogger } from './logger.js';
import { EmbedStreams } from './stream/embed.js';

const config = loadConfig();
const logger = createLogger(config.NODE_ENV === 'development' ? 'debug' : 'info');

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

const catalog = new AniListCatalog(client, {
  onInvalidItem: (error) => logger.debug('skipped invalid upstream item', { issues: error.issues.slice(0, 3) }),
});

const streams = new EmbedStreams({ template: config.STREAM_EMBED_TEMPLATE, languages: config.STREAM_LANGUAGES });
if (streams.config().enabled) {
  logger.info('episode playback enabled', { provider: new URL(config.STREAM_EMBED_TEMPLATE ?? '').origin });
}
const app = createApp({ config, catalog, streams, logger });

const server = serve({ fetch: app.fetch, hostname: config.HOST, port: config.PORT }, (info) => {
  logger.info('server listening', { url: `http://${info.address}:${info.port}`, env: config.NODE_ENV });
});

function shutdown(signal: string) {
  logger.info('shutting down', { signal });
  server.close((error) => {
    if (error) {
      logger.error('error during shutdown', { detail: error.message });
      process.exit(1);
    }
    process.exit(0);
  });
  // Don't hang forever on open keep-alive connections.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection', { reason: String(reason) });
});
