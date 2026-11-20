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

/*
 * Air dates come from the top-level `airingSchedules`, filtered by episode range. The nested
 * `Media.airingSchedule` only keeps the latest ~500 entries (One Piece's start at ep 1123), so
 * paging it by page number does not line up with episode numbers on long-running shows.
 */
export const EPISODES_QUERY = /* GraphQL */ `
  query Episodes($id: Int!, $after: Int!, $before: Int!, $perPage: Int!) {
    Media(id: $id, type: ANIME) {
      isAdult
      episodes
      status
      nextAiringEpisode { episode }
      streamingEpisodes { title }
    }
    Page(page: 1, perPage: $perPage) {
      airingSchedules(mediaId: $id, episode_greater: $after, episode_lesser: $before, sort: [EPISODE]) {
        episode
        airingAt
      }
    }
  }
`;

const FRANCHISE_NODE = /* GraphQL */ `
  fragment FranchiseNode on Media {
    id
    type
    isAdult
    format
    status
    episodes
    title { romaji english native }
    coverImage { large extraLarge }
    startDate { year month day }
    seasonYear
  }
`;

/**
 * A media node with two levels of relations, so each request walks two hops of a sequel chain.
 * AniList returns empty `relations` below the second level, so going deeper gains nothing.
 */
export const FRANCHISE_QUERY = /* GraphQL */ `
  query Franchise($id: Int!) {
    Media(id: $id, type: ANIME) {
      ...FranchiseNode
      relations { edges { relationType node {
        ...FranchiseNode
        relations { edges { relationType node { ...FranchiseNode } } }
      } } }
    }
  }
  ${FRANCHISE_NODE}
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
