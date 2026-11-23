import { z } from 'zod';

/**
 * Shapes of the MangaDex API responses we read (https://api.mangadex.org/docs/). Only the fields
 * the site uses; unknown fields are dropped. MangaDex sends an empty JSON array instead of an empty
 * object for some maps (descriptions, links), so those are read leniently.
 */

/** `{ "en": "…", "ja-ro": "…" }` */
export const Localized = z.record(z.string(), z.string());
export type Localized = z.infer<typeof Localized>;

/** A map that may arrive as `[]` (or null) when empty. */
const LenientMap = z
  .union([z.record(z.string(), z.unknown()), z.array(z.unknown()), z.null()])
  .optional()
  .transform((value) => (value && !Array.isArray(value) ? value : {}));

export const RawRelationship = z.object({
  id: z.string(),
  type: z.string(),
  attributes: z.record(z.string(), z.unknown()).nullish(),
});
export type RawRelationship = z.infer<typeof RawRelationship>;

const RawTag = z.object({
  attributes: z.object({
    name: Localized,
    group: z.string().nullish(),
  }),
});

export const RawManga = z.object({
  id: z.string(),
  attributes: z.object({
    title: Localized,
    altTitles: z.array(Localized).nullish(),
    description: LenientMap,
    links: LenientMap,
    status: z.string().nullish(),
    year: z.number().int().nullish(),
    contentRating: z.string().nullish(),
    publicationDemographic: z.string().nullish(),
    lastChapter: z.string().nullish(),
    tags: z.array(RawTag).nullish(),
    availableTranslatedLanguages: z.array(z.string().nullable()).nullish(),
  }),
  relationships: z.array(RawRelationship).nullish(),
});
export type RawManga = z.infer<typeof RawManga>;

export const RawChapter = z.object({
  id: z.string(),
  attributes: z.object({
    volume: z.string().nullish(),
    chapter: z.string().nullish(),
    title: z.string().nullish(),
    translatedLanguage: z.string(),
    externalUrl: z.string().nullish(),
    publishAt: z.string().nullish(),
    readableAt: z.string().nullish(),
    pages: z.number().int().nonnegative().nullish(),
  }),
  relationships: z.array(RawRelationship).nullish(),
});
export type RawChapter = z.infer<typeof RawChapter>;

/** `GET /manga`, `GET /manga/{id}/feed`: a page of entities (each validated separately). */
export const RawCollection = z.object({
  data: z.array(z.unknown()),
  limit: z.number().int(),
  offset: z.number().int(),
  total: z.number().int(),
});

/** `GET /manga/{id}`, `GET /chapter/{id}` */
export const RawEntity = z.object({ data: z.unknown() });

/** `GET /at-home/server/{chapterId}`: where the chapter's images are served from. */
export const RawAtHome = z.object({
  baseUrl: z.url(),
  chapter: z.object({
    hash: z.string().regex(/^[0-9a-f]{16,64}$/),
    data: z.array(z.string()),
    dataSaver: z.array(z.string()).nullish(),
  }),
});
export type RawAtHome = z.infer<typeof RawAtHome>;
