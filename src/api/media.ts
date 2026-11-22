import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  MediaCollection,
  MediaConfig,
  MediaDetail,
  MediaGenre,
  MediaKind,
  MediaStreamSource,
  MediaSummary,
  MovieList,
  Page,
  TvEpisode,
  TvList,
} from '../../shared/api';
import { apiGet } from './client';

/** Movies & TV shows (TMDB) — hooks mirroring the anime ones in queries.ts. */

const MINUTE = 60_000;

const nextPage = <T>(last: Page<T>) => (last.hasNextPage ? last.page + 1 : undefined);

export const mediaKeys = {
  config: () => ['media', 'config'] as const,
  list: (kind: MediaKind, list: string) => ['media', kind, 'list', list] as const,
  discover: (kind: MediaKind, genre: number | null) => ['media', kind, 'discover', genre] as const,
  genres: (kind: MediaKind) => ['media', kind, 'genres'] as const,
  search: (kind: MediaKind, query: string) => ['media', kind, 'search', query] as const,
  detail: (kind: MediaKind, id: number) => ['media', kind, id] as const,
  season: (id: number, season: number) => ['media', 'tv', id, 'season', season] as const,
  collection: (id: number) => ['media', 'collection', id] as const,
  stream: (kind: MediaKind, id: number, season: number | null, episode: number | null) =>
    ['media', kind, id, 'stream', season, episode] as const,
};

export function useMediaConfig() {
  return useQuery({
    queryKey: mediaKeys.config(),
    queryFn: ({ signal }) => apiGet<MediaConfig>('/media/config', {}, signal),
    staleTime: 30 * MINUTE,
  });
}

export function useMovieList(list: MovieList) {
  return useQuery({
    queryKey: mediaKeys.list('movie', list),
    queryFn: ({ signal }) => apiGet<Page<MediaSummary>>(`/movie/list/${list}`, {}, signal),
  });
}

export function useTvList(list: TvList) {
  return useQuery({
    queryKey: mediaKeys.list('tv', list),
    queryFn: ({ signal }) => apiGet<Page<MediaSummary>>(`/tv/list/${list}`, {}, signal),
  });
}

/** Popular titles, optionally in one genre, page by page. Keeps the previous genre on screen while the next loads. */
export function useDiscover(kind: MediaKind, genre: number | null) {
  return useInfiniteQuery({
    queryKey: mediaKeys.discover(kind, genre),
    queryFn: ({ pageParam, signal }) =>
      apiGet<Page<MediaSummary>>(`/${kind}/discover`, { genre: genre ?? undefined, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    placeholderData: (previous) => previous,
    staleTime: 30 * MINUTE,
  });
}

export function useMediaGenres(kind: MediaKind) {
  return useQuery({
    queryKey: mediaKeys.genres(kind),
    queryFn: ({ signal }) => apiGet<MediaGenre[]>(`/${kind}/genres`, {}, signal),
    staleTime: 60 * MINUTE,
  });
}

export function useMediaSearch(kind: MediaKind, query: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: mediaKeys.search(kind, query),
    queryFn: ({ pageParam, signal }) => apiGet<Page<MediaSummary>>(`/${kind}/search`, { q: query, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled,
  });
}

export function useMediaDetail(kind: MediaKind, id: number) {
  return useQuery({
    queryKey: mediaKeys.detail(kind, id),
    queryFn: ({ signal }) => apiGet<MediaDetail>(`/${kind}/${id}`, {}, signal),
    staleTime: 30 * MINUTE,
  });
}

export function useTvSeason(id: number, season: number | null) {
  return useQuery({
    queryKey: mediaKeys.season(id, season ?? -1),
    queryFn: ({ signal }) => apiGet<TvEpisode[]>(`/tv/${id}/season/${season ?? 1}`, {}, signal),
    enabled: season !== null,
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === id ? previous : undefined),
    staleTime: 30 * MINUTE,
  });
}

export function useCollection(id: number | null) {
  return useQuery({
    queryKey: mediaKeys.collection(id ?? 0),
    queryFn: ({ signal }) => apiGet<MediaCollection>(`/movie/collection/${id ?? 0}`, {}, signal),
    enabled: id !== null,
    staleTime: 60 * MINUTE,
  });
}

export function useMediaStream(kind: MediaKind, id: number, season: number | null, episode: number | null, enabled: boolean) {
  return useQuery({
    queryKey: mediaKeys.stream(kind, id, season, episode),
    queryFn: ({ signal }) =>
      apiGet<MediaStreamSource>(
        `/${kind}/${id}/stream`,
        kind === 'tv' ? { season: season ?? 1, episode: episode ?? 1 } : {},
        signal,
      ),
    staleTime: 5 * MINUTE,
    enabled,
  });
}
