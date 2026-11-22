import { useState } from 'react';
import type { MediaKind, MediaSummary, Page } from '../../../shared/api';
import { useDiscover, useMediaGenres } from '../../api/media';
import { AnimeGrid } from '../AnimeGrid';
import { CardGridSkeleton, CardRowSkeleton, EmptyNotice, ErrorNotice, LoadingStatus, LoadMore } from '../feedback';
import { HomeSection } from '../home/HomeSections';
import { ShowCard } from '../ShowCard';
import { ScrollRow, TitleLines } from '../ui';
import browseStyles from '../home/Browse.module.css';
import sectionStyles from '../home/HomeSections.module.css';
import { cardLine } from './mediaFormat';

export type MediaOpenHandler = (item: MediaSummary) => void;

interface ListQuery {
  readonly data: Page<MediaSummary> | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly refetch: () => unknown;
}

interface RowSectionProps {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly query: ListQuery;
  readonly onOpen: MediaOpenHandler;
  /** Numbers the cards 01, 02, … (charts). */
  readonly ranked?: boolean;
  /** Card subtitle; defaults to score and genre. */
  readonly subtitle?: (item: MediaSummary) => string;
  readonly empty?: string;
}

/** A home section with one horizontal row of movies or shows. */
export function MediaRowSection({ id, eyebrow, title, query, onOpen, ranked = false, subtitle = cardLine, empty }: RowSectionProps) {
  const items = query.data?.items ?? [];
  return (
    <HomeSection id={id} eyebrow={eyebrow} title={title} busy={query.isPending}>
      {query.isPending ? (
        <>
          <LoadingStatus />
          <CardRowSkeleton />
        </>
      ) : query.isError ? (
        <ErrorNotice error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyNotice>{empty ?? 'Nothing to show here right now.'}</EmptyNotice>
      ) : (
        <ScrollRow className={sectionStyles.paddedRow}>
          {items.map((item, i) => (
            <ShowCard key={item.id} anime={item} onOpen={() => onOpen(item)}>
              {ranked ? (
                <span className={sectionStyles.ranked}>
                  <span className={sectionStyles.rank}>
                    <span className="sr-only">Rank </span>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className={sectionStyles.rankedText}>
                    <TitleLines title={item.title} subtitle={subtitle(item)} />
                  </span>
                </span>
              ) : (
                <TitleLines title={item.title} subtitle={subtitle(item)} />
              )}
            </ShowCard>
          ))}
        </ScrollRow>
      )}
    </HomeSection>
  );
}

/** "Browse by genre": genre chips over a grid of the most popular titles in that genre. */
export function GenreBrowse({ kind, onOpen }: { readonly kind: MediaKind; readonly onOpen: MediaOpenHandler }) {
  const [genre, setGenre] = useState<number | null>(null);
  const genres = useMediaGenres(kind);
  const results = useDiscover(kind, genre);
  const items = results.data?.pages.flatMap((page) => page.items) ?? [];
  const byId = new Map(items.map((item) => [item.id, item]));

  return (
    <HomeSection id="browse" eyebrow="Genres · ジャンル" title="Browse by genre" busy={results.isPending}>
      <div role="group" aria-label="Filter by genre" className={browseStyles.chips}>
        <button type="button" className={browseStyles.chip} aria-pressed={genre === null} onClick={() => setGenre(null)}>
          All
        </button>
        {genres.data?.map(({ id, name }) => (
          <button key={id} type="button" className={browseStyles.chip} aria-pressed={id === genre} onClick={() => setGenre(id)}>
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
      ) : items.length === 0 ? (
        <EmptyNotice>Nothing in this genre yet.</EmptyNotice>
      ) : (
        <>
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
    </HomeSection>
  );
}
