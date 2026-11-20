import { useEpisodes } from '../../api/queries';
import { formatDate } from '../../lib/format';
import { Block, ErrorNotice, LoadingStatus, LoadMore } from '../feedback';
import { Muted } from '../ui';
import styles from './EpisodeList.module.css';

interface EpisodeListProps {
  readonly animeId: number;
  readonly totalEpisodes: number | null;
  /** Episode now playing, highlighted in the list. */
  readonly current?: number | null;
  /** When set, episodes become buttons that start playback. */
  readonly onSelect?: (episode: number) => void;
}

export function EpisodeList({ animeId, totalEpisodes, current = null, onSelect }: EpisodeListProps) {
  const { data, isPending, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useEpisodes(animeId);
  const episodes = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <aside aria-labelledby="episodes-title" aria-busy={isPending || undefined} className={styles.panel}>
      <div className={styles.header}>
        <h2 id="episodes-title" className={styles.title}>
          Episodes
        </h2>
        {totalEpisodes !== null && <Muted>{totalEpisodes} total</Muted>}
      </div>

      {isPending ? (
        <div className={styles.skeleton}>
          <LoadingStatus label="Loading episodes…" />
          {Array.from({ length: 6 }, (_, i) => (
            <Block key={i} className={styles.skelRow} />
          ))}
        </div>
      ) : isError ? (
        <div className={styles.message}>
          <ErrorNotice error={error} onRetry={() => void refetch()} />
        </div>
      ) : episodes.length === 0 ? (
        <p className={styles.message}>No episode information yet.</p>
      ) : (
        <div className={styles.scroll}>
          <ol className={styles.list}>
            {episodes.map((episode) => {
              const aired = formatDate(episode.aired);
              const tags = [episode.filler && 'Filler', episode.recap && 'Recap'].filter(Boolean);
              const content = (
                <>
                  <span className={styles.number} aria-hidden="true">
                    {String(episode.number).padStart(2, '0')}
                  </span>
                  <span className={styles.body}>
                    <span className={styles.name}>
                      <span className="sr-only">Episode {episode.number}: </span>
                      {episode.title ?? `Episode ${episode.number}`}
                    </span>
                    <span className={styles.status}>
                      {[aired && `Aired ${aired}`, ...tags].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                </>
              );
              const isCurrent = episode.number === current;
              return (
                <li key={episode.number}>
                  {onSelect ? (
                    <button
                      type="button"
                      className={`${styles.episode} ${styles.selectable}`}
                      aria-current={isCurrent ? 'true' : undefined}
                      onClick={() => onSelect(episode.number)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className={styles.episode}>{content}</div>
                  )}
                </li>
              );
            })}
          </ol>
          <LoadMore
            hasMore={hasNextPage}
            loading={isFetchingNextPage}
            onLoadMore={() => void fetchNextPage()}
            label="More episodes"
          />
        </div>
      )}
    </aside>
  );
}
