import { z } from 'zod';

/*
 * Raw AniList shapes — only the fields we request. Everything nullable upstream is
 * `nullish` so a missing field degrades gracefully. Unknown keys are stripped.
 */

const Title = z.object({
  romaji: z.string().nullish(),
  english: z.string().nullish(),
  native: z.string().nullish(),
});

const CoverImage = z.object({
  large: z.string().nullish(),
  extraLarge: z.string().nullish(),
});

export const RawMedia = z.object({
  id: z.number().int().positive(),
  isAdult: z.boolean().nullish(),
  title: Title.nullish(),
  coverImage: CoverImage.nullish(),
  bannerImage: z.string().nullish(),
  format: z.string().nullish(),
  episodes: z.number().int().nullish(),
  status: z.string().nullish(),
  averageScore: z.number().nullish(),
  meanScore: z.number().nullish(),
  popularity: z.number().int().nullish(),
  genres: z.array(z.string()).nullish(),
  season: z.string().nullish(),
  seasonYear: z.number().int().nullish(),
  description: z.string().nullish(),
  nextAiringEpisode: z
    .object({ airingAt: z.number().int(), episode: z.number().int() })
    .nullish(),
});
export type RawMedia = z.infer<typeof RawMedia>;

export const RawMediaDetail = RawMedia.extend({
  idMal: z.number().int().positive().nullish(),
  duration: z.number().int().nullish(),
  trailer: z.object({ id: z.string().nullish(), site: z.string().nullish() }).nullish(),
  rankings: z
    .array(z.object({ rank: z.number().int(), type: z.string(), allTime: z.boolean().nullish() }))
    .nullish(),
  studios: z.object({ nodes: z.array(z.object({ name: z.string() })).nullish() }).nullish(),
});
export type RawMediaDetail = z.infer<typeof RawMediaDetail>;

const PageInfo = z.object({
  currentPage: z.number().int().nullish(),
  hasNextPage: z.boolean().nullish(),
});

/** `media` items stay `unknown` here and are validated one by one. */
export const MediaPageData = z.object({
  Page: z.object({
    pageInfo: PageInfo.nullish(),
    media: z.array(z.unknown()),
  }),
});

export const DetailData = z.object({
  Media: z.unknown(),
});

export const EpisodesData = z.object({
  Media: z.object({
    isAdult: z.boolean().nullish(),
    episodes: z.number().int().nullish(),
    status: z.string().nullish(),
    nextAiringEpisode: z.object({ episode: z.number().int() }).nullish(),
    streamingEpisodes: z.array(z.object({ title: z.string().nullish() })).nullish(),
    airingSchedule: z
      .object({
        nodes: z.array(z.object({ episode: z.number().int(), airingAt: z.number().int() }).nullable()).nullish(),
      })
      .nullish(),
  }),
});

export const RawRecommendationTarget = z.object({
  id: z.number().int().positive(),
  isAdult: z.boolean().nullish(),
  type: z.string().nullish(),
  title: Title.nullish(),
  coverImage: CoverImage.nullish(),
});

export const RecommendationsData = z.object({
  Media: z.object({
    recommendations: z
      .object({
        nodes: z.array(z.object({ mediaRecommendation: z.unknown() }).nullable()),
      })
      .nullish(),
  }),
});

export const GenresData = z.object({
  GenreCollection: z.array(z.string()),
});

export const ScheduleData = z.object({
  Page: z.object({
    pageInfo: PageInfo.nullish(),
    airingSchedules: z.array(z.unknown()),
  }),
});

export const RawAiring = z.object({
  airingAt: z.number().int(),
  episode: z.number().int(),
  media: RawMedia.nullish(),
});
