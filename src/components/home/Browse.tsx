import { useState } from 'react';
import { useAnimeSearch, useGenres } from '../../api/queries';
import { formatEpisodes, genreLine } from '../../lib/format';
import { CardGridSkeleton, ErrorNotice, LoadingStatus, LoadMore } from '../feedback';
import { AnimeGrid } from '../AnimeGrid';
import { Muted } from '../ui';
import { HomeSection, type OpenHandler } from './HomeSections';
import styles from './Browse.module.css';

export function Browse({ onOpen }: { readonly onOpen: OpenHandler }) {
  const [genre, setGenre] = useState<string | undefined>(undefined);
  const genres = useGenres();
  const results = useAnimeSearch({ genre });
  const items = results.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <HomeSection
      id="browse"
      eyebrow="Library · さがす"
      title="Browse by genre"
      busy={results.isPending}
      aside={<Muted>Most popular first</Muted>}
    >
      <div role="group" aria-label="Filter by genre" className={styles.chips}>
        <button
          type="button"
          className={styles.chip}
          aria-pressed={genre === undefined}
          onClick={() => setGenre(undefined)}
        >
          All
        </button>
        {genres.data?.map(({ name }) => (
          <button
            key={name}
            type="button"
            className={styles.chip}
            aria-pressed={name === genre}
            onClick={() => setGenre(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {results.isPending ? (
        <>
          <LoadingStatus />
          <CardGridSkeleton />
        </>
      ) : results.isError ? (
        <ErrorNotice error={results.error} onRetry={() => void results.refetch()} />
      ) : (
        <>
          <AnimeGrid
            items={items}
            onOpen={onOpen}
            subtitle={(anime) => `${genreLine(anime)} · ${formatEpisodes(anime.episodes)}`}
          />
          <LoadMore
            hasMore={results.hasNextPage}
            loading={results.isFetchingNextPage}
            onLoadMore={() => void results.fetchNextPage()}
          />
        </>
      )}
    </HomeSection>
  );
}
