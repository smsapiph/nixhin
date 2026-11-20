import { buildApp } from '../../src/bootstrap.js';
import { loadConfig } from '../../src/config.js';
import { createLogger } from '../../src/logger.js';

/** The subset of Netlify's function context we use (avoids depending on @netlify/functions). */
interface NetlifyContext {
  readonly ip: string;
}

// Built once per function instance, so the cache and upstream throttle survive between warm invocations.
// Env vars come from the Netlify UI (scope must include Functions); netlify.toml [build.environment] is not visible here.
const appConfig = loadConfig({ ...process.env, NODE_ENV: 'production' });
const app = buildApp(appConfig, createLogger('info'));

export default (request: Request, context: NetlifyContext) =>
  // Netlify's edge reports the real client IP; pass it to the rate limiter as a binding, never via a spoofable header.
  app.fetch(request, { clientIp: context.ip });

export const config = { path: '/api/*' };
