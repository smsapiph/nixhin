import { useMangaSearch } from '../api/manga';
import { MangaGrid } from '../components/manga/MangaCards';
import { flattenPages } from '../lib/mangaFormat';
import { Icon } from '../components/Icon';
import { Eyebrow } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { mangaPath } from '../routes';
import styles from './SearchPage.module.css';

interface MangaSearchPageProps {
  readonly query: string;
  readonly onBack: () => void;
}

/** Search results in the Manga mode (same layout as the other searches). */
export function MangaSearchPage({ query, onBack }: MangaSearchPageProps) {
  useDocumentTitle(`Search: ${query}`);
  const results = useMangaSearch(query);
  const items = flattenPages(results.data?.pages);

  return (
    <main className={styles.page} aria-busy={results.isPending || undefined}>
      <button type="button" className={styles.back} onClick={onBack}>
        <Icon name="back" />
        Home
      </button>

      <header className={styles.header}>
        <Eyebrow>Search manga · 検索</Eyebrow>
        <h1 className={styles.title}>Results for “{query}”</h1>
      </header>

      {!results.isPending && items.length > 0 && (
        <p role="status" className="sr-only">
          {items.length} results loaded
        </p>
      )}
      <MangaGrid
        items={items}
        isPending={results.isPending}
        error={results.error}
        onRetry={() => void results.refetch()}
        hasMore={results.hasNextPage}
        loadingMore={results.isFetchingNextPage}
        onLoadMore={() => void results.fetchNextPage()}
        empty={`No manga with English or Filipino chapters matched “${query}”. Try the original or English title.`}
        hrefFor={(manga) => mangaPath(manga.id)}
      />
    </main>
  );
}
