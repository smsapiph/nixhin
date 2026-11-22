import type { MediaKind, MediaSummary } from '../../shared/api';
import { useMediaSearch } from '../api/media';
import { AnimeGrid } from '../components/AnimeGrid';
import { CardGridSkeleton, EmptyNotice, ErrorNotice, LoadingStatus, LoadMore } from '../components/feedback';
import { Icon } from '../components/Icon';
import { Eyebrow } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import styles from './SearchPage.module.css';

interface MediaSearchPageProps {
  readonly kind: MediaKind;
  readonly query: string;
  readonly onOpen: (item: MediaSummary) => void;
  readonly onBack: () => void;
}

/** Search results in the Movies or TV shows mode (same layout as the anime search). */
export function MediaSearchPage({ kind, query, onOpen, onBack }: MediaSearchPageProps) {
  useDocumentTitle(`Search: ${query}`);
  const results = useMediaSearch(kind, query);
  const items = results.data?.pages.flatMap((page) => page.items) ?? [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const noun = kind === 'movie' ? 'movies' : 'TV shows';

  return (
    <main className={styles.page} aria-busy={results.isPending || undefined}>
      <button type="button" className={styles.back} onClick={onBack}>
        <Icon name="back" />
        Home
      </button>

      <header className={styles.header}>
        <Eyebrow>{kind === 'movie' ? 'Search movies · 検索' : 'Search TV shows · 検索'}</Eyebrow>
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
        <EmptyNotice>
          No {noun} matched “{query}”. Try a different spelling or the original title.
        </EmptyNotice>
      ) : (
        <>
          <p role="status" className="sr-only">
            {items.length} results loaded
          </p>
          <AnimeGrid
            items={items}
            onOpen={(id) => {
              const item = byId.get(id);
              if (item) onOpen(item);
            }}
            subtitle={(item) => [item.year, item.genres[0]].filter(Boolean).join(' · ')}
          />
          <LoadMore hasMore={results.hasNextPage} loading={results.isFetchingNextPage} onLoadMore={() => void results.fetchNextPage()} />
        </>
      )}
    </main>
  );
}
