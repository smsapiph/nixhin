import { QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  AnimeDetail,
  AnimeRef,
  AnimeSummary,
  Episode,
  Genre,
  Page,
  SearchFormat,
  SearchSeason,
  SearchSort,
  SearchStatus,
  SeasonEntry,
  StreamConfig,
  StreamSource,
  TopFilter,
} from '../../shared/api';
import { ApiError, apiGet } from './client';

const MINUTE = 60_000;
export const PAGE_SIZE = 24;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * MINUTE,
        refetchOnWindowFocus: false,
        // The backend already retries upstream failures, so one client-side retry is enough.
        retry: (failureCount, error) =>
          failureCount < 1 && (!(error instanceof ApiError) || error.isRetryable),
      },
    },
  });
}

/** Central query-key factory so keys stay consistent across hooks. */
export const queryKeys = {
  top: (filter: TopFilter, limit: number) => ['anime', 'top', filter, limit] as const,
  seasonNow: (limit: number) => ['anime', 'season-now', limit] as const,
  search: (args: SearchArgs) => ['anime', 'search', { ...args }] as const,
  anime: (id: number) => ['anime', id] as const,
  episodes: (id: number, page: number) => ['anime', id, 'episodes', page] as const,
  seasons: (id: number) => ['anime', id, 'seasons'] as const,
  recommendations: (id: number) => ['anime', id, 'recommendations'] as const,
  genres: () => ['genres'] as const,
  schedule: () => ['schedule'] as const,
  streamConfig: () => ['stream', 'config'] as const,
  stream: (id: number, episode: number, language: string) => ['anime', id, 'stream', episode, language] as const,
};

const nextPage = <T>(last: Page<T>) => (last.hasNextPage ? last.page + 1 : undefined);

export function useTopAnime(filter: TopFilter = 'airing', limit = 12) {
  return useQuery({
    queryKey: queryKeys.top(filter, limit),
    queryFn: ({ signal }) => apiGet<AnimeSummary[]>('/anime/top', { filter, limit }, signal),
  });
}

export function useSeasonNow(limit = 12) {
  return useQuery({
    queryKey: queryKeys.seasonNow(limit),
    queryFn: ({ signal }) => apiGet<Page<AnimeSummary>>('/anime/season-now', { limit }, signal),
  });
}

/** Browse filters; every field is optional and an unset field means "any". */
export interface BrowseFilters {
  /** Genre name, e.g. "Slice of Life". */
  readonly genre?: string;
  readonly year?: number;
  readonly season?: SearchSeason;
  readonly format?: SearchFormat;
  readonly status?: SearchStatus;
  readonly sort?: SearchSort;
}

export interface SearchArgs extends BrowseFilters {
  readonly query?: string;
}

function searchPage(args: SearchArgs, page: number, signal?: AbortSignal) {
  const { query, ...filters } = args;
  return apiGet<Page<AnimeSummary>>('/anime/search', { q: query, ...filters, page, limit: PAGE_SIZE }, signal);
}

export function useAnimeSearch(args: SearchArgs) {
  return useInfiniteQuery({
    queryKey: queryKeys.search(args),
    queryFn: ({ pageParam, signal }) => searchPage(args, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** How deep "Surprise me" digs into the (popularity-sorted) results. */
const RANDOM_PAGES = 20;

/**
 * A random title matching the filters, or null when nothing matches. Picks a random results
 * page, falling back to the first page when the filters leave fewer results than that.
 */
export async function randomAnime(filters: BrowseFilters, random = Math.random): Promise<AnimeSummary | null> {
  const args: SearchArgs = { ...filters, sort: filters.sort ?? 'popularity' };
  const page = 1 + Math.floor(random() * RANDOM_PAGES);
  let result = await searchPage(args, page);
  if (result.items.length === 0 && page > 1) result = await searchPage(args, 1);
  const { items } = result;
  return items.length === 0 ? null : (items[Math.floor(random() * items.length)] ?? null);
}

export function useAnime(id: number) {
  return useQuery({
    queryKey: queryKeys.anime(id),
    queryFn: ({ signal }) => apiGet<AnimeDetail>(`/anime/${id}`, {}, signal),
    staleTime: 30 * MINUTE,
  });
}

/** Episodes per backend page; the episode list's ranges ("1–50", "51–100", …) line up with it. */
export const EPISODES_PAGE_SIZE = 50;

/** One page of episodes. Keeps the previous page on screen while the next range loads. */
export function useEpisodePage(id: number, page: number) {
  return useQuery({
    queryKey: queryKeys.episodes(id, page),
    queryFn: ({ signal }) => apiGet<Page<Episode>>(`/anime/${id}/episodes`, { page }, signal),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === id ? previous : undefined,
    staleTime: 30 * MINUTE,
  });
}

export function useSeasons(id: number) {
  return useQuery({
    queryKey: queryKeys.seasons(id),
    queryFn: ({ signal }) => apiGet<SeasonEntry[]>(`/anime/${id}/seasons`, {}, signal),
    staleTime: 60 * MINUTE,
  });
}

export function useRecommendations(id: number) {
  return useQuery({
    queryKey: queryKeys.recommendations(id),
    queryFn: ({ signal }) => apiGet<AnimeRef[]>(`/anime/${id}/recommendations`, {}, signal),
    staleTime: 30 * MINUTE,
  });
}

export function useGenres() {
  return useQuery({
    queryKey: queryKeys.genres(),
    queryFn: ({ signal }) => apiGet<Genre[]>('/genres', {}, signal),
    staleTime: 60 * MINUTE,
  });
}

export function useSchedule() {
  return useQuery({
    queryKey: queryKeys.schedule(),
    queryFn: ({ signal }) => apiGet<AnimeSummary[]>('/schedule', {}, signal),
    staleTime: 15 * MINUTE,
  });
}

export function useStreamConfig() {
  return useQuery({
    queryKey: queryKeys.streamConfig(),
    queryFn: ({ signal }) => apiGet<StreamConfig>('/stream/config', {}, signal),
    staleTime: 30 * MINUTE,
  });
}

export function useStream(id: number, episode: number, language: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.stream(id, episode, language),
    queryFn: ({ signal }) => apiGet<StreamSource>(`/anime/${id}/stream`, { episode, language }, signal),
    staleTime: 5 * MINUTE,
    enabled,
  });
}
