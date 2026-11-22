import { z } from 'zod';
import {
  SEARCH_FORMATS,
  SEARCH_MIN_YEAR,
  SEARCH_SEASONS,
  SEARCH_SORTS,
  SEARCH_STATUSES,
  TOP_FILTERS,
} from '../../../shared/api.js';
import { HttpError } from '../errors.js';

/** Strict positive integer from a string: no signs, decimals, exponents or whitespace. */
const intInRange = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d{1,9}$/, 'must be a positive integer')
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

const page = intInRange(1, 500).default(1);
/** Page size cap (kept small to protect the upstream rate limit). */
const limit = (fallback: number) => intInRange(1, 25).default(fallback);

export const IdParams = z.object({
  id: intInRange(1, 100_000_000),
});

export const TopQuery = z.object({
  filter: z.enum(TOP_FILTERS).default('airing'),
  limit: limit(12),
});

export const StreamQuery = z.object({
  episode: intInRange(1, 5000),
  language: z
    .string()
    .regex(/^[a-z]{2,10}$/, 'must be a language code like "sub"')
    .optional(),
});

export const PageQuery = z.object({
  page,
  limit: limit(24),
});

export const EpisodesQuery = z.object({
  page,
});

export const SearchQuery = z.object({
  q: z
    .string()
    .trim()
    .min(1, 'must not be empty')
    .max(100, 'must be at most 100 characters')
    // Reject control characters outright.
    .regex(/^[^\p{Cc}]*$/u, 'contains invalid characters')
    .optional(),
  // Genre names are letters, spaces and hyphens ("Slice of Life", "Sci-Fi").
  // The catalog additionally checks the value against the upstream genre list.
  genre: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z -]{0,39}$/, 'must be a genre name')
    .optional(),
  year: intInRange(SEARCH_MIN_YEAR, 2100).optional(),
  season: z.enum(SEARCH_SEASONS).optional(),
  format: z.enum(SEARCH_FORMATS).optional(),
  status: z.enum(SEARCH_STATUSES).optional(),
  sort: z.enum(SEARCH_SORTS).optional(),
  page,
  limit: limit(24),
});

/** Parses untrusted input or throws a 400 naming the offending field. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const field = issue?.path.join('.') || 'input';
  throw new HttpError(400, 'BAD_REQUEST', `Invalid ${field}: ${issue?.message ?? 'invalid value'}`);
}
