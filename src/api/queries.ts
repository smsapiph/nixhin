import { QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  AnimeDetail,
  AnimeRef,
  AnimeSummary,
  Episode,
  Genre,
  Page,
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
  search: (query: string | undefined, genre: string | undefined) =>
    ['anime', 'search', { query, genre }] as const,
  anime: (id: number) => ['anime', id] as const,
  episodes: (id: number) => ['anime', id, 'episodes'] as const,
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

interface SearchArgs {
  readonly query?: string;
  /** Genre name, e.g. "Slice of Life". */
  readonly genre?: string;
}

export function useAnimeSearch({ query, genre }: SearchArgs) {
  return useInfiniteQuery({
    queryKey: queryKeys.search(query, genre),
    queryFn: ({ pageParam, signal }) =>
      apiGet<Page<AnimeSummary>>(
        '/anime/search',
        { q: query, genre, page: pageParam, limit: PAGE_SIZE },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function useAnime(id: number) {
  return useQuery({
    queryKey: queryKeys.anime(id),
    queryFn: ({ signal }) => apiGet<AnimeDetail>(`/anime/${id}`, {}, signal),
    staleTime: 30 * MINUTE,
  });
}

export function useEpisodes(id: number) {
  return useInfiniteQuery({
    queryKey: queryKeys.episodes(id),
    queryFn: ({ pageParam, signal }) =>
      apiGet<Page<Episode>>(`/anime/${id}/episodes`, { page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    staleTime: 30 * MINUTE,
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
