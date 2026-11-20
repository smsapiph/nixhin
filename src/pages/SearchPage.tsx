import { useAnimeSearch } from '../api/queries';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { AnimeGrid } from '../components/AnimeGrid';
import { CardGridSkeleton, EmptyNotice, ErrorNotice, LoadingStatus, LoadMore } from '../components/feedback';
import { Icon } from '../components/Icon';
import { Eyebrow } from '../components/ui';
import { formatEpisodes, genreLine } from '../lib/format';
import styles from './SearchPage.module.css';

interface SearchPageProps {
  readonly query: string;
  readonly onOpen: (id: number) => void;
  readonly onBack: () => void;
}

export function SearchPage({ query, onOpen, onBack }: SearchPageProps) {
  useDocumentTitle(`Search: ${query}`);
  const results = useAnimeSearch({ query });
  const items = results.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <main className={styles.page} aria-busy={results.isPending || undefined}>
      <button type="button" className={styles.back} onClick={onBack}>
        <Icon name="back" />
        Home
      </button>

      <header className={styles.header}>
        <Eyebrow>Search · 検索</Eyebrow>
        <h1 className={styles.title}>Results for “{query}”</h1>
      </header>

      {results.isPending ? (
        <>
          <LoadingStatus label="Searching…" />
          <CardGridSkeleton />
        </>
      ) : results.isError ? (
        <ErrorNotice error={results.error} onRetry={() => void results.refetch()} />
      ) : items.length === 0 ? (
        <EmptyNotice>No anime matched “{query}”. Try a different spelling or the original Japanese title.</EmptyNotice>
      ) : (
        <>
          <p role="status" className="sr-only">
            {items.length} results loaded
          </p>
          <AnimeGrid
            items={items}
            onOpen={onOpen}
            subtitle={(anime) => [anime.type, anime.year, formatEpisodes(anime.episodes)].filter(Boolean).join(' · ') || genreLine(anime)}
          />
          <LoadMore
            hasMore={results.hasNextPage}
            loading={results.isFetchingNextPage}
            onLoadMore={() => void results.fetchNextPage()}
          />
        </>
      )}
    </main>
  );
}
