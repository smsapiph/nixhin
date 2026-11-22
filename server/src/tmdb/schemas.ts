import { z } from 'zod';

/* Raw TMDB shapes — only the fields we use. Nullable upstream fields are `nullish`; unknown keys are stripped. */

const Genre = z.object({ id: z.number().int(), name: z.string() });

/** A movie or show as it appears in lists, search results and recommendations. */
export const RawListItem = z.object({
  id: z.number().int().positive(),
  media_type: z.string().nullish(),
  adult: z.boolean().nullish(),
  title: z.string().nullish(),
  name: z.string().nullish(),
  original_title: z.string().nullish(),
  original_name: z.string().nullish(),
  poster_path: z.string().nullish(),
  backdrop_path: z.string().nullish(),
  release_date: z.string().nullish(),
  first_air_date: z.string().nullish(),
  vote_average: z.number().nullish(),
  vote_count: z.number().nullish(),
  genre_ids: z.array(z.number().int()).nullish(),
  overview: z.string().nullish(),
});
export type RawListItem = z.infer<typeof RawListItem>;

export const RawPage = z.object({
  page: z.number().int(),
  total_pages: z.number().int(),
  results: z.array(z.unknown()),
});

export const RawGenres = z.object({ genres: z.array(Genre) });

const Video = z.object({ site: z.string().nullish(), type: z.string().nullish(), key: z.string().nullish(), official: z.boolean().nullish() });
const Cast = z.object({ id: z.number().int().positive().nullish(), name: z.string(), character: z.string().nullish(), profile_path: z.string().nullish(), order: z.number().nullish() });
const Crew = z.object({ name: z.string(), job: z.string().nullish() });
const Named = z.object({ name: z.string() });

const DetailCommon = RawListItem.extend({
  genres: z.array(Genre).nullish(),
  tagline: z.string().nullish(),
  status: z.string().nullish(),
  credits: z.object({ cast: z.array(Cast).nullish(), crew: z.array(Crew).nullish() }).nullish(),
  videos: z.object({ results: z.array(Video).nullish() }).nullish(),
  recommendations: z.object({ results: z.array(z.unknown()).nullish() }).nullish(),
  external_ids: z.object({ imdb_id: z.string().nullish() }).nullish(),
});

export const RawMovieDetail = DetailCommon.extend({
  runtime: z.number().int().nullish(),
  imdb_id: z.string().nullish(),
  production_companies: z.array(Named).nullish(),
  belongs_to_collection: z.object({ id: z.number().int(), name: z.string() }).nullish(),
  release_dates: z
    .object({
      results: z
        .array(
          z.object({
            iso_3166_1: z.string(),
            release_dates: z.array(z.object({ certification: z.string().nullish() })).nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
});
export type RawMovieDetail = z.infer<typeof RawMovieDetail>;

const Episode = z.object({ season_number: z.number().int(), episode_number: z.number().int() });

export const RawTvDetail = DetailCommon.extend({
  episode_run_time: z.array(z.number().int()).nullish(),
  number_of_seasons: z.number().int().nullish(),
  number_of_episodes: z.number().int().nullish(),
  networks: z.array(Named).nullish(),
  created_by: z.array(Named).nullish(),
  seasons: z
    .array(
      z.object({
        season_number: z.number().int(),
        name: z.string().nullish(),
        episode_count: z.number().int().nullish(),
        air_date: z.string().nullish(),
      }),
    )
    .nullish(),
  last_episode_to_air: Episode.nullish(),
  content_ratings: z.object({ results: z.array(z.object({ iso_3166_1: z.string(), rating: z.string().nullish() })).nullish() }).nullish(),
});
export type RawTvDetail = z.infer<typeof RawTvDetail>;

export const RawSeason = z.object({
  episodes: z
    .array(
      z.object({
        episode_number: z.number().int(),
        name: z.string().nullish(),
        air_date: z.string().nullish(),
        runtime: z.number().int().nullish(),
        overview: z.string().nullish(),
      }),
    )
    .nullish(),
});

export const RawCollection = z.object({
  id: z.number().int(),
  name: z.string(),
  parts: z.array(z.unknown()).nullish(),
});

/** A credit in /person/:id?append_to_response=combined_credits (a list item plus the person's part in it). */
export const RawPersonCredit = RawListItem.extend({
  character: z.string().nullish(),
  job: z.string().nullish(),
  popularity: z.number().nullish(),
  episode_count: z.number().int().nullish(),
});
export type RawPersonCredit = z.infer<typeof RawPersonCredit>;

export const RawPerson = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  adult: z.boolean().nullish(),
  profile_path: z.string().nullish(),
  known_for_department: z.string().nullish(),
  biography: z.string().nullish(),
  birthday: z.string().nullish(),
  deathday: z.string().nullish(),
  place_of_birth: z.string().nullish(),
  combined_credits: z.object({ cast: z.array(z.unknown()).nullish(), crew: z.array(z.unknown()).nullish() }).nullish(),
});
export type RawPerson = z.infer<typeof RawPerson>;
