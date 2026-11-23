import type { MouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { MangaSummary } from '../../../shared/api';
import { isPlainClick } from '../../routes';
import { mangaSubtitle } from '../../lib/mangaFormat';
import { Poster } from '../Poster';
import { CardGridSkeleton, CardRowSkeleton, EmptyNotice, ErrorNotice, LoadingStatus, LoadMore } from '../feedback';
import { ScrollRow, TitleLines } from '../ui';
import { HomeSection } from '../home/HomeSections';
import gridStyles from '../AnimeGrid.module.css';
import cardStyles from '../ShowCard.module.css';
import homeStyles from '../home/HomeSections.module.css';
import styles from './MangaCards.module.css';

interface MangaCardProps {
  readonly href: string;
  readonly title: string;
  readonly coverUrl: string | null;
  readonly layout?: 'row' | 'grid';
  readonly children: ReactNode;
}

/** A cover card that links to `href` (a real link, so it opens in a new tab too). */
export function MangaCard({ href, title, coverUrl, layout = 'row', children }: MangaCardProps) {
  const navigate = useNavigate();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} className={`${cardStyles.card} ${cardStyles[layout]} ${styles.link}`} onClick={onClick}>
      <Poster src={coverUrl} title={title} />
      <span className={cardStyles.body}>{children}</span>
    </a>
  );
}

interface ListState {
  readonly items: readonly MangaSummary[];
  readonly isPending: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
}

interface MangaRowSectionProps extends ListState {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly ranked?: boolean;
  readonly hrefFor: (manga: MangaSummary) => string;
}

/** A home section with one horizontal row of manga. */
export function MangaRowSection({ id, eyebrow, title, items, isPending, error, onRetry, ranked = false, hrefFor }: MangaRowSectionProps) {
  return (
    <HomeSection id={id} eyebrow={eyebrow} title={title} busy={isPending}>
      {isPending ? (
        <>
          <LoadingStatus />
          <CardRowSkeleton />
        </>
      ) : error ? (
        <ErrorNotice error={error} onRetry={onRetry} />
      ) : items.length === 0 ? (
        <EmptyNotice>Nothing here right now.</EmptyNotice>
      ) : (
        <ScrollRow className={homeStyles.paddedRow}>
          {items.map((manga, i) => (
            <MangaCard key={manga.id} href={hrefFor(manga)} title={manga.title} coverUrl={manga.coverUrl}>
              {ranked ? (
                <span className={homeStyles.ranked}>
                  <span className={homeStyles.rank}>
                    <span className="sr-only">Rank </span>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className={homeStyles.rankedText}>
                    <TitleLines title={manga.title} subtitle={mangaSubtitle(manga)} />
                  </span>
                </span>
              ) : (
                <TitleLines title={manga.title} subtitle={mangaSubtitle(manga)} />
              )}
            </MangaCard>
          ))}
        </ScrollRow>
      )}
    </HomeSection>
  );
}

interface MangaGridProps extends ListState {
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly onLoadMore: () => void;
  readonly empty: ReactNode;
  readonly hrefFor: (manga: MangaSummary) => string;
}

/** A grid of manga with "Load more". */
export function MangaGrid({ items, isPending, error, onRetry, hasMore, loadingMore, onLoadMore, empty, hrefFor }: MangaGridProps) {
  if (isPending) {
    return (
      <>
        <LoadingStatus />
        <CardGridSkeleton />
      </>
    );
  }
  if (error && items.length === 0) return <ErrorNotice error={error} onRetry={onRetry} />;
  if (items.length === 0) return <EmptyNotice>{empty}</EmptyNotice>;
  return (
    <>
      <div className={gridStyles.grid}>
        {items.map((manga) => (
          <MangaCard key={manga.id} href={hrefFor(manga)} title={manga.title} coverUrl={manga.coverUrl} layout="grid">
            <TitleLines title={manga.title} subtitle={mangaSubtitle(manga)} />
          </MangaCard>
        ))}
      </div>
      <LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
    </>
  );
}
