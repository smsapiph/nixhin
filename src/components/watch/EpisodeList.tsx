import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { EPISODES_PAGE_SIZE, useEpisodePage } from '../../api/queries';
import { formatDate } from '../../lib/format';
import { Block, ErrorNotice, LoadingStatus } from '../feedback';
import { Muted } from '../ui';
import styles from './EpisodeList.module.css';

interface EpisodeListProps {
  readonly animeId: number;
  /** Episodes released so far; drives the range picker. Null when unknown. */
  readonly airedEpisodes: number | null;
  /** Ongoing shows say "aired" instead of "total". */
  readonly airing: boolean;
  /** Episode now playing, highlighted in the list. */
  readonly current?: number | null;
  /** When set, episodes become buttons that start playback. */
  readonly onSelect?: (episode: number) => void;
}

const pageOf = (episode: number) => Math.ceil(episode / EPISODES_PAGE_SIZE);

function rangeLabel(page: number, aired: number): string {
  const first = (page - 1) * EPISODES_PAGE_SIZE + 1;
  const last = Math.min(page * EPISODES_PAGE_SIZE, aired);
  return first === last ? String(first) : `${first}–${last}`;
}

/**
 * Episodes in ranges of 50 with a range picker and "go to episode", so a 1,000+ episode show
 * (One Piece) is a couple of taps away from any episode instead of dozens of "Load more" clicks.
 */
export function EpisodeList({ animeId, airedEpisodes, airing, current = null, onSelect }: EpisodeListProps) {
  // The visible range follows the playing episode. Browsing another range is remembered only
  // until the playing episode moves to a different range, so no effect is needed to sync them.
  const playingPage = current === null ? 1 : pageOf(current);
  const [browse, setBrowse] = useState<{ readonly from: number; readonly page: number } | null>(null);
  const page = browse?.from === playingPage ? browse.page : playingPage;
  const goToPage = (next: number) => setBrowse({ from: playingPage, page: next });

  // Without playback, "go to episode" highlights the episode instead of playing it.
  const [target, setTarget] = useState<number | null>(null);
  const highlighted = onSelect ? current : target;

  const { data, isPending, isPlaceholderData, isError, error, refetch } = useEpisodePage(animeId, page);
  const episodes = data?.items ?? [];
  const pageCount = airedEpisodes ? pageOf(airedEpisodes) : null;
  const hasNext = pageCount !== null ? page < pageCount : (data?.hasNextPage ?? false);
  const showPager = page > 1 || hasNext;

  const scrollRef = useRef<HTMLDivElement>(null);
  const showingPage = data?.page;
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || showingPage === undefined) return;
    const row = highlighted === null ? null : scroller.querySelector<HTMLElement>(`[data-episode="${highlighted}"]`);
    // Centre the highlighted episode inside the list (not the page), else start at the top of the range.
    scroller.scrollTop = row ? row.offsetTop - scroller.clientHeight / 2 + row.offsetHeight / 2 : 0;
  }, [highlighted, showingPage]);

  return (
    <aside aria-labelledby="episodes-title" aria-busy={isPending || isPlaceholderData || undefined} className={styles.panel}>
      <div className={styles.header}>
        <h2 id="episodes-title" className={styles.title}>
          Episodes
        </h2>
        {airedEpisodes !== null && airedEpisodes > 0 && (
          <Muted>
            {airedEpisodes.toLocaleString()} {airing ? 'aired' : 'total'}
          </Muted>
        )}
      </div>

      {showPager && (
        <Pager
          page={page}
          pageCount={pageCount}
          airedEpisodes={airedEpisodes}
          hasNext={hasNext}
          onPage={goToPage}
          onJump={(episode) => {
            if (onSelect) onSelect(episode);
            else {
              setTarget(episode);
              goToPage(pageOf(episode));
            }
          }}
        />
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
              const isCurrent = episode.number === highlighted;
              return (
                <li key={episode.number} data-episode={episode.number}>
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
                    <div className={`${styles.episode} ${isCurrent ? styles.targeted : ''}`}>{content}</div>
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

interface PagerProps {
  readonly page: number;
  readonly pageCount: number | null;
  readonly airedEpisodes: number | null;
  readonly hasNext: boolean;
  readonly onPage: (page: number) => void;
  readonly onJump: (episode: number) => void;
}

function Pager({ page, pageCount, airedEpisodes, hasNext, onPage, onJump }: PagerProps) {
  const rangeId = useId();
  const jumpId = useId();
  const [draft, setDraft] = useState('');
  const max = airedEpisodes ?? undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const episode = Number(draft);
    if (!Number.isInteger(episode) || episode < 1 || (max !== undefined && episode > max)) return;
    onJump(episode);
    setDraft('');
  };

  return (
    <div className={styles.pager}>
      <div className={styles.pagerRow}>
        <button
          type="button"
          className={styles.pagerButton}
          aria-label="Previous range"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ‹
        </button>
        {pageCount !== null && airedEpisodes !== null ? (
          <>
            <label htmlFor={rangeId} className="sr-only">
              Episode range
            </label>
            <select
              id={rangeId}
              className={styles.range}
              value={page}
              onChange={(event) => onPage(Number(event.target.value))}
            >
              {Array.from({ length: pageCount }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {rangeLabel(i + 1, airedEpisodes)}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className={styles.rangeText}>Page {page}</span>
        )}
        <button
          type="button"
          className={styles.pagerButton}
          aria-label="Next range"
          disabled={!hasNext}
          onClick={() => onPage(page + 1)}
        >
          ›
        </button>
      </div>
      <form className={styles.jump} onSubmit={submit}>
        <label htmlFor={jumpId} className="sr-only">
          Go to episode
        </label>
        <input
          id={jumpId}
          className={styles.jumpInput}
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          placeholder="Ep #"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className={styles.pagerButton} disabled={draft === ''}>
          Go
        </button>
      </form>
    </div>
  );
}
