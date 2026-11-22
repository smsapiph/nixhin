import { z } from 'zod';
import { templateProblem } from './stream/embed.js';
import { mediaTemplateProblem, type MediaTemplateKind } from './stream/mediaEmbed.js';

const originList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(
    z.array(
      z.string().refine((origin) => {
        try {
          // Must be a bare origin: scheme + host (+ port), nothing else.
          return new URL(origin).origin === origin;
        } catch {
          return false;
        }
      }, 'Each ALLOWED_ORIGINS entry must be an origin like https://example.com'),
    ),
  );

/** Optional movie/TV embed template: empty means "no playback" (trailers only). */
const mediaTemplate = (kind: MediaTemplateKind) =>
  z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
    .superRefine((value, ctx) => {
      const problem = value === undefined ? null : mediaTemplateProblem(value, kind);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  ALLOWED_ORIGINS: originList.default(['http://localhost:5173']),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(120),
  ANILIST_URL: z
    .url()
    .refine((url) => url.startsWith('https://'), 'ANILIST_URL must use https')
    .default('https://graphql.anilist.co'),
  /** AniList currently allows 30 req/min (90 when not degraded); stay under it. */
  UPSTREAM_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(90).default(28),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(8000),
  /** Episode embed URL template for a licensed provider; empty/unset disables playback. */
  STREAM_EMBED_TEMPLATE: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
    .superRefine((value, ctx) => {
      const problem = value === undefined ? null : templateProblem(value);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    }),
  /** Comma-separated variants the provider offers; the first is the default. */
  STREAM_LANGUAGES: z
    .string()
    .default('sub,dub')
    .transform((value) => value.split(',').map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^[a-z]{2,10}$/, 'language codes must be 2-10 lowercase letters')).min(1)),
  /** TMDB "API Read Access Token"; empty/unset keeps the site anime-only. */
  TMDB_READ_TOKEN: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
    .refine((value) => value === undefined || /^[A-Za-z0-9._-]{20,1000}$/.test(value), 'must be a TMDB read access token'),
  TMDB_API_URL: z
    .url()
    .refine((url) => url.startsWith('https://') || url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost'), 'TMDB_API_URL must use https')
    .default('https://api.themoviedb.org/3'),
  STREAM_MOVIE_TEMPLATE: mediaTemplate('movie'),
  STREAM_TV_TEMPLATE: mediaTemplate('tv'),
});

export type Config = z.infer<typeof EnvSchema>;

/** Validates the environment once at startup and fails fast with a readable message. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${details.join('\n')}`);
  }
  return result.data;
}
