import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { MangaChapter, MangaChapterPages, MangaDetail, MangaLanguage, MangaList, MangaSummary, Page } from '../../shared/api';
import { apiGet } from './client';

/** Manga (MangaDex) — hooks mirroring the anime and media ones. */

const MINUTE = 60_000;

const nextPage = <T>(last: Page<T>) => (last.hasNextPage ? last.page + 1 : undefined);

export const mangaKeys = {
  list: (list: MangaList) => ['manga', 'list', list] as const,
  search: (query: string) => ['manga', 'search', query] as const,
  detail: (id: string) => ['manga', id] as const,
  chapters: (id: string, language: MangaLanguage) => ['manga', id, 'chapters', language] as const,
  chapter: (id: string) => ['manga', 'chapter', id] as const,
};

/** One list, page by page (the home rows use the first page; "Load more" the rest). */
export function useMangaList(list: MangaList) {
  return useInfiniteQuery({
    queryKey: mangaKeys.list(list),
    queryFn: ({ pageParam, signal }) => apiGet<Page<MangaSummary>>(`/manga/list/${list}`, { page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    staleTime: (list === 'latest' ? 5 : 15) * MINUTE,
  });
}

export function useMangaSearch(query: string) {
  return useInfiniteQuery({
    queryKey: mangaKeys.search(query),
    queryFn: ({ pageParam, signal }) => apiGet<Page<MangaSummary>>('/manga/search', { q: query, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function useManga(id: string) {
  return useQuery({
    queryKey: mangaKeys.detail(id),
    queryFn: ({ signal }) => apiGet<MangaDetail>(`/manga/${id}`, {}, signal),
    staleTime: 30 * MINUTE,
  });
}

export function useMangaChapters(id: string, language: MangaLanguage) {
  return useQuery({
    queryKey: mangaKeys.chapters(id, language),
    queryFn: ({ signal }) => apiGet<MangaChapter[]>(`/manga/${id}/chapters`, { lang: language }, signal),
    staleTime: 10 * MINUTE,
  });
}

export function useMangaChapter(id: string) {
  return useQuery({
    queryKey: mangaKeys.chapter(id),
    queryFn: ({ signal }) => apiGet<MangaChapterPages>(`/manga/chapter/${id}`, {}, signal),
    // The fallback node address in it expires after about 15 minutes.
    staleTime: 5 * MINUTE,
  });
}
