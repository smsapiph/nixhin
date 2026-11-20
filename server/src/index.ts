import { serve } from '@hono/node-server';
import { buildApp } from './bootstrap.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const logger = createLogger(config.NODE_ENV === 'development' ? 'debug' : 'info');
const app = buildApp(config, logger);

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
