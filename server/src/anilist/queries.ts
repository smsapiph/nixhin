/*
 * Fixed GraphQL documents. User input is passed exclusively through variables.
 * `isAdult: false` is applied everywhere: the app is SFW by design.
 */

const MEDIA_SUMMARY = /* GraphQL */ `
  fragment MediaSummary on Media {
    id
    isAdult
    title { romaji english native }
    coverImage { large extraLarge }
    bannerImage
    format
    episodes
    status
    averageScore
    meanScore
    popularity
    genres
    season
    seasonYear
    description(asHtml: false)
    nextAiringEpisode { airingAt episode }
  }
`;

const PAGE_INFO = 'pageInfo { currentPage hasNextPage }';

export const TOP_QUERY = /* GraphQL */ `
  query Top($perPage: Int!, $sort: [MediaSort], $status: MediaStatus) {
    Page(page: 1, perPage: $perPage) {
      ${PAGE_INFO}
      media(type: ANIME, isAdult: false, sort: $sort, status: $status) { ...MediaSummary }
    }
  }
  ${MEDIA_SUMMARY}
`;

export const SEASON_QUERY = /* GraphQL */ `
  query Season($page: Int!, $perPage: Int!, $season: MediaSeason!, $seasonYear: Int!) {
    Page(page: $page, perPage: $perPage) {
      ${PAGE_INFO}
      media(type: ANIME, isAdult: false, season: $season, seasonYear: $seasonYear, sort: [POPULARITY_DESC]) {
        ...MediaSummary
      }
    }
  }
  ${MEDIA_SUMMARY}
`;

export const SEARCH_QUERY = /* GraphQL */ `
  query Search($page: Int!, $perPage: Int!, $search: String, $genre: String, $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      ${PAGE_INFO}
      media(type: ANIME, isAdult: false, search: $search, genre: $genre, sort: $sort) { ...MediaSummary }
    }
  }
  ${MEDIA_SUMMARY}
`;

export const DETAIL_QUERY = /* GraphQL */ `
  query Detail($id: Int!) {
    Media(id: $id, type: ANIME) {
      ...MediaSummary
      idMal
      duration
      trailer { id site }
      rankings { rank type allTime }
      studios(isMain: true) { nodes { name } }
    }
  }
  ${MEDIA_SUMMARY}
`;

export const EPISODES_QUERY = /* GraphQL */ `
  query Episodes($id: Int!, $page: Int!, $perPage: Int!) {
    Media(id: $id, type: ANIME) {
      isAdult
      episodes
      status
      nextAiringEpisode { episode }
      streamingEpisodes { title }
      airingSchedule(page: $page, perPage: $perPage) {
        nodes { episode airingAt }
      }
    }
  }
`;

export const RECOMMENDATIONS_QUERY = /* GraphQL */ `
  query Recommendations($id: Int!, $perPage: Int!) {
    Media(id: $id, type: ANIME) {
      recommendations(page: 1, perPage: $perPage, sort: [RATING_DESC]) {
        nodes {
          mediaRecommendation {
            id
            isAdult
            type
            title { romaji english native }
            coverImage { large extraLarge }
          }
        }
      }
    }
  }
`;

export const GENRES_QUERY = /* GraphQL */ `
  query Genres {
    GenreCollection
  }
`;

export const SCHEDULE_QUERY = /* GraphQL */ `
  query Schedule($page: Int!, $from: Int!, $to: Int!) {
    Page(page: $page, perPage: 50) {
      ${PAGE_INFO}
      airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: [TIME]) {
        airingAt
        episode
        media { ...MediaSummary }
      }
    }
  }
  ${MEDIA_SUMMARY}
`;
