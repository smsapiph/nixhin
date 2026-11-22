import { useEffect, useId, useRef, useState } from 'react';
import type { TvSeason } from '../../../shared/api';
import { useTvSeason } from '../../api/media';
import { formatDate } from '../../lib/format';
import { episodeKey } from '../../lib/progress';
import { Block, ErrorNotice, LoadingStatus } from '../feedback';
import { Muted } from '../ui';
import styles from './EpisodeList.module.css';

interface TvEpisodeListProps {
  readonly showId: number;
  readonly seasons: readonly TvSeason[];
  /** Episode now playing (highlighted), or null when nothing plays. */
  readonly current: { readonly season: number; readonly episode: number } | null;
  /** Season to show when nothing plays. */
  readonly defaultSeason: number;
  /** When set, episodes become buttons that start playback. */
  readonly onSelect?: (season: number, episode: number) => void;
  /** `episodeKey` values marked watched. */
  readonly watched: ReadonlySet<number>;
  readonly onToggleWatched: (season: number, episode: number, watched: boolean) => void;
}

/** The TV show episode panel: a season picker above that season's episodes (same look as the anime list). */
export function TvEpisodeList({ showId, seasons, current, defaultSeason, onSelect, watched, onToggleWatched }: TvEpisodeListProps) {
  const playingSeason = current?.season ?? defaultSeason;
  // Browsing another season lasts until the playing episode moves to a different season.
  const [browse, setBrowse] = useState<{ readonly from: number; readonly season: number } | null>(null);
  const season = browse?.from === playingSeason ? browse.season : playingSeason;
  const selectId = useId();
  const { data, isPending, isPlaceholderData, isError, error, refetch } = useTvSeason(showId, season);
  const episodes = data ?? [];
  const watchedCount = [...watched].filter((key) => Math.floor(key / 10_000) > 0).length;
  const total = seasons.filter((entry) => entry.number > 0).reduce((sum, entry) => sum + entry.episodeCount, 0);
  const today = new Date().toISOString().slice(0, 10);

  const scrollRef = useRef<HTMLDivElement>(null);
  const highlighted = current && current.season === season ? current.episode : null;
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || isPlaceholderData) return;
    const row = highlighted === null ? null : scroller.querySelector<HTMLElement>(`[data-episode="${highlighted}"]`);
    scroller.scrollTop = row ? row.offsetTop - scroller.clientHeight / 2 + row.offsetHeight / 2 : 0;
  }, [highlighted, season, isPlaceholderData]);

  return (
    <aside aria-labelledby="episodes-title" aria-busy={isPending || isPlaceholderData || undefined} className={styles.panel}>
      <div className={styles.header}>
        <h2 id="episodes-title" className={styles.title}>
          Episodes
        </h2>
        {total > 0 && (
          <Muted>
            {watchedCount > 0 && `${watchedCount.toLocaleString()} watched · `}
            {total.toLocaleString()} total
          </Muted>
        )}
      </div>

      {seasons.length > 1 && (
        <div className={styles.pager}>
          <label htmlFor={selectId} className="sr-only">
            Season
          </label>
          <select
            id={selectId}
            className={styles.range}
            value={season}
            onChange={(event) => setBrowse({ from: playingSeason, season: Number(event.target.value) })}
          >
            {seasons.map((entry) => (
              <option key={entry.number} value={entry.number}>
                {[entry.name, entry.year, `${entry.episodeCount} episode${entry.episodeCount === 1 ? '' : 's'}`]
                  .filter(Boolean)
                  .join(' · ')}
              </option>
            ))}
          </select>
        </div>
      )}

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
        <div ref={scrollRef} className={`${styles.scroll} ${isPlaceholderData ? styles.stale : ''}`}>
          <ol className={styles.list}>
            {episodes.map((episode) => {
              const aired = formatDate(episode.aired);
              const upcoming = episode.aired !== null && episode.aired > today;
              const key = episodeKey(season, episode.number);
              const isWatched = watched.has(key);
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
                      {[aired && (upcoming ? `Airs ${aired}` : `Aired ${aired}`), episode.runtime && `${episode.runtime} min`]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={episode.number} data-episode={episode.number} className={`${styles.row} ${isWatched ? styles.watched : ''}`}>
                  {onSelect && !upcoming ? (
                    <button
                      type="button"
                      className={`${styles.episode} ${styles.selectable}`}
                      aria-current={episode.number === highlighted ? 'true' : undefined}
                      onClick={() => onSelect(season, episode.number)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className={`${styles.episode} ${episode.number === highlighted ? styles.targeted : ''}`}>{content}</div>
                  )}
                  {!upcoming && (
                    <button
                      type="button"
                      className={styles.watchedToggle}
                      aria-pressed={isWatched}
                      aria-label={`Watched season ${season} episode ${episode.number}`}
                      title={isWatched ? 'Mark as not watched' : 'Mark as watched'}
                      onClick={() => onToggleWatched(season, episode.number, !isWatched)}
                    >
                      <span aria-hidden="true">✓</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </aside>
  );
}
