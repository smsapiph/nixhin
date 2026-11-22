import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { MediaDetail, MediaKind, MediaSummary, TvSeason } from '../../shared/api';
import { ApiError } from '../api/client';
import { useCollection, useMediaConfig, useMediaDetail } from '../api/media';
import { Block, CardRowSkeleton, EmptyNotice, ErrorNotice, LoadingStatus } from '../components/feedback';
import { Icon } from '../components/Icon';
import { KIND_LABELS, runtimeLabel } from '../components/media/mediaFormat';
import { ShowCard } from '../components/ShowCard';
import { Eyebrow, Muted, PillButton, ScrollRow, TitleLines } from '../components/ui';
import { MediaPlayer } from '../components/watch/MediaPlayer';
import { TrailerPlayer } from '../components/watch/TrailerPlayer';
import { TvEpisodeList } from '../components/watch/TvEpisodeList';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { QueueApi } from '../hooks/useQueue';
import { useStore } from '../hooks/useStore';
import { formatDate, formatScore } from '../lib/format';
import { episodeKey, findProgress, progressStore, recordEpisode, setWatched, type ShowInfo } from '../lib/progress';
import { isTv } from '../lib/tvDevice';
import { mediaControlKey, requestPlayerControl } from '../lib/tvPlayer';
import { mediaPath, tvPath } from '../routes';
import { ShareButton } from './AnimePage';
import styles from './AnimePage.module.css';
import own from './MediaPage.module.css';
import { imageSrc } from '../lib/images';

interface MediaPageProps {
  readonly kind: MediaKind;
  readonly id: number;
  readonly queue: QueueApi;
  readonly onOpen: (item: MediaSummary) => void;
  readonly onBack: () => void;
}

/** A movie or TV show: player (or trailer), details, and the cast or episode panel. */
export function MediaPage({ kind, id, queue, onOpen, onBack }: MediaPageProps) {
  const { data: detail, isPending, isError, error, refetch } = useMediaDetail(kind, id);
  useDocumentTitle(detail?.title ?? null);

  return (
    <main className={styles.page}>
      <button type="button" className={styles.back} onClick={onBack}>
        <Icon name="back" />
        Back
      </button>

      {isPending ? (
        <DetailSkeleton />
      ) : isError ? (
        <div className={styles.errorBox}>
          {error instanceof ApiError && error.status === 404 ? (
            <EmptyNotice>We couldn’t find that {kind === 'movie' ? 'movie' : 'show'}.</EmptyNotice>
          ) : (
            <ErrorNotice error={error} onRetry={() => void refetch()} />
          )}
        </div>
      ) : (
        <>
          <Watch detail={detail} queue={queue} />
          {detail.collection && <Collection id={detail.collection.id} currentId={detail.id} onOpen={onOpen} />}
          <Recommendations items={detail.recommendations} onOpen={onOpen} />
        </>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ episode positions (TV) */

interface Position {
  readonly season: number;
  readonly episode: number;
}

/** Regular seasons first; a show with only specials uses those. */
function playableSeasons(seasons: readonly TvSeason[]): readonly TvSeason[] {
  const regular = seasons.filter((season) => season.number > 0);
  return regular.length > 0 ? regular : seasons;
}

function isValid(seasons: readonly TvSeason[], position: Position): boolean {
  const season = seasons.find((entry) => entry.number === position.season);
  return season !== undefined && position.episode >= 1 && position.episode <= season.episodeCount;
}

function nextPosition(seasons: readonly TvSeason[], { season, episode }: Position): Position | null {
  const list = playableSeasons(seasons);
  const current = list.find((entry) => entry.number === season);
  if (current && episode < current.episodeCount) return { season, episode: episode + 1 };
  const following = list.find((entry) => entry.number > season);
  return following ? { season: following.number, episode: 1 } : null;
}

function previousPosition(seasons: readonly TvSeason[], { season, episode }: Position): Position | null {
  if (episode > 1) return { season, episode: episode - 1 };
  const earlier = [...playableSeasons(seasons)].reverse().find((entry) => entry.number < season);
  return earlier ? { season: earlier.number, episode: earlier.episodeCount } : null;
}

const parsePositive = (raw: string | null, max: number) =>
  raw && /^\d{1,4}$/.test(raw) && Number(raw) <= max ? Number(raw) : null;

/** A TV episode counts as watched after half its length on the player (4–30 min); a movie after 70%. */
function watchedAfterMs(detail: MediaDetail): number {
  const minutes = detail.runtime ?? (detail.kind === 'movie' ? 100 : 40);
  const share = detail.kind === 'movie' ? 0.7 : 0.5;
  const capped = detail.kind === 'movie' ? minutes * share : Math.min(30, Math.max(4, minutes * share));
  return capped * 60_000;
}

/* ------------------------------------------------------------------ watch area */

function Watch({ detail, queue }: { readonly detail: MediaDetail; readonly queue: QueueApi }) {
  const { data: config } = useMediaConfig();
  const playable = (detail.kind === 'movie' ? config?.moviePlayback : config?.tvPlayback) === true;
  const [showTrailer, setShowTrailer] = useState(false);
  const watching = playable && !showTrailer;
  const [params, setParams] = useSearchParams();
  const progress = findProgress(useStore(progressStore), detail.id, detail.kind);
  const [resumed] = useState(() => findProgress(progressStore.get(), detail.id, detail.kind));
  const isShow = detail.kind === 'tv';

  // Where a TV show plays: the link's ?s=&ep=, else where it was left (moving on if that one is done), else S1E1.
  const firstSeason = playableSeasons(detail.seasons)[0]?.number ?? 1;
  const fromLink = { season: parsePositive(params.get('s'), 500) ?? -1, episode: parsePositive(params.get('ep'), 5000) ?? -1 };
  let position: Position = { season: firstSeason, episode: 1 };
  if (isShow) {
    if (isValid(detail.seasons, fromLink)) position = fromLink;
    else if (resumed?.season !== undefined) {
      const left = { season: resumed.season, episode: resumed.episode };
      const done = resumed.watched.includes(episodeKey(left.season, left.episode));
      const resumeAt = done ? (nextPosition(detail.seasons, left) ?? left) : left;
      if (isValid(detail.seasons, resumeAt)) position = resumeAt;
    }
  }
  const watched = new Set(progress?.watched);

  const lastKey = detail.lastAired ? episodeKey(detail.lastAired.season, detail.lastAired.episode) : null;
  const show: ShowInfo = {
    id: detail.id,
    title: detail.title,
    imageUrl: detail.imageUrl,
    kind: detail.kind,
    total: isShow ? lastKey : 1,
  };

  // Opening the movie or an episode puts it at the front of "Continue watching"; staying marks it watched.
  const { season, episode } = position;
  const afterMs = watchedAfterMs(detail);
  useEffect(() => {
    if (!watching) return;
    const info = { ...show };
    progressStore.set((list) =>
      isShow ? recordEpisode(list, info, episode, null, Date.now(), season) : recordEpisode(list, info, 1, null),
    );
    const key = isShow ? episodeKey(season, episode) : 1;
    const timer = window.setTimeout(() => progressStore.set((list) => setWatched(list, info, key, true)), afterMs);
    return () => window.clearTimeout(timer);
    // `show` is rebuilt every render from the values listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, detail.id, detail.title, detail.imageUrl, isShow, season, episode, lastKey, afterMs]);

  const toggleWatched = (key: number, value: boolean) => progressStore.set((list) => setWatched(list, show, key, value));

  const select = (next: Position) => {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set('s', String(next.season));
        out.set('ep', String(next.episode));
        return out;
      },
      { replace: true },
    );
    setShowTrailer(false);
  };
  const previous = isShow ? previousPosition(detail.seasons, position) : null;
  const next = isShow ? nextPosition(detail.seasons, position) : null;

  const shareUrl = isShow && watching ? tvPath(detail.id, position) : mediaPath(detail.kind, detail.id);
  const shareTitle = isShow && watching ? `${detail.title} · S${season} Episode ${episode}` : detail.title;
  const queued = queue.isQueued(detail.id, detail.kind);

  return (
    <div className={styles.layout}>
      <section aria-labelledby="media-title" className={styles.main}>
        <div className={styles.playerAnchor}>
          {watching ? (
            <MediaPlayer detail={detail} season={isShow ? season : null} episode={isShow ? episode : null} />
          ) : (
            <TrailerPlayer key={detail.id} anime={{ ...detail, bannerUrl: detail.backdropUrl }} />
          )}
        </div>

        {(playable || isShow) && (
          <div className={styles.controls} role="toolbar" aria-label="Playback">
            <div className={styles.controlGroup}>
              {isShow && (
                <>
                  <button
                    type="button"
                    className={styles.control}
                    aria-label="Previous episode"
                    disabled={!watching || previous === null}
                    onClick={() => previous && select(previous)}
                  >
                    ‹ Prev
                  </button>
                  <span className={styles.nowPlaying} aria-live="polite">
                    {watching ? `S${season} · Episode ${episode}` : 'Trailer'}
                  </span>
                  <button
                    type="button"
                    className={styles.control}
                    aria-label="Next episode"
                    disabled={!watching || next === null}
                    onClick={() => {
                      // Moving on means the current one is done.
                      toggleWatched(episodeKey(season, episode), true);
                      if (next) select(next);
                    }}
                  >
                    Next ›
                  </button>
                </>
              )}
              {!isShow && <span className={styles.nowPlaying}>{watching ? 'Movie' : 'Trailer'}</span>}
            </div>
            <div className={styles.controlGroup}>
              {playable && detail.trailer && (
                <button type="button" className={styles.control} aria-pressed={showTrailer} onClick={() => setShowTrailer((on) => !on)}>
                  Trailer
                </button>
              )}
            </div>
          </div>
        )}

        <Details detail={detail} queued={queued} onToggleQueue={() => queue.toggle(detail)} shareUrl={shareUrl} shareTitle={shareTitle} />
      </section>

      {isShow ? (
        <TvEpisodeList
          showId={detail.id}
          seasons={detail.seasons}
          current={watching ? position : null}
          defaultSeason={position.season}
          watched={watched}
          onToggleWatched={(s, e, value) => toggleWatched(episodeKey(s, e), value)}
          {...(playable && {
            onSelect: (s: number, e: number) => {
              select({ season: s, episode: e });
              // On a TV, choosing an episode hands the remote straight to the video.
              if (isTv) requestPlayerControl(mediaControlKey('tv', s, e));
            },
          })}
        />
      ) : (
        <CastPanel detail={detail} watched={watched.has(1)} onToggleWatched={(value) => toggleWatched(1, value)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ details */

interface DetailsProps {
  readonly detail: MediaDetail;
  readonly queued: boolean;
  readonly onToggleQueue: () => void;
  readonly shareUrl: string;
  readonly shareTitle: string;
}

function Details({ detail, queued, onToggleQueue, shareUrl, shareTitle }: DetailsProps) {
  const isShow = detail.kind === 'tv';
  const score = formatScore(detail.score);
  const regular = detail.seasons.filter((season) => season.number > 0);
  const episodes = regular.reduce((sum, season) => sum + season.episodeCount, 0);
  const eyebrow = [KIND_LABELS[detail.kind], detail.year, detail.companies[0]].filter(Boolean).join(' · ');

  const facts: [string, string][] = [];
  if (score) facts.push(['Score', score]);
  if (isShow) {
    if (regular.length > 0) facts.push(['Seasons', String(regular.length)]);
    if (episodes > 0) facts.push(['Episodes', episodes.toLocaleString()]);
    if (detail.runtime) facts.push(['Runtime', `~${detail.runtime} min`]);
  } else {
    const runtime = runtimeLabel(detail.runtime);
    if (runtime) facts.push(['Runtime', runtime]);
  }
  if (detail.rating) facts.push(['Rated', detail.rating]);
  const released = formatDate(detail.releaseDate);
  if (released) facts.push([isShow ? 'First aired' : 'Released', released]);
  if (detail.status) facts.push(['Status', detail.status]);
  if (detail.makers.length > 0) facts.push([isShow ? 'Created by' : 'Director', detail.makers.join(', ')]);
  if (detail.companies.length > 0) facts.push([isShow ? 'Network' : 'Studio', detail.companies.join(', ')]);

  return (
    <>
      <div className={styles.details}>
        <div className={styles.info}>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 id="media-title" className={styles.title}>
            {detail.title}
          </h1>
          {detail.originalTitle && <div className={styles.subtitle}>{detail.originalTitle}</div>}
          {detail.genres.length > 0 && (
            <ul className={styles.genres} aria-label="Genres">
              {detail.genres.map((genre) => (
                <li key={genre} className={styles.genre}>
                  {genre}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={styles.actions}>
          <PillButton variant={queued ? 'outline' : 'primary'} aria-pressed={queued} onClick={onToggleQueue}>
            {queued ? 'In your queue' : 'Add to queue'}
          </PillButton>
          <ShareButton path={shareUrl} title={shareTitle} />
        </div>
      </div>

      <dl className={styles.facts}>
        {facts.map(([label, value]) => (
          <div key={label} className={styles.fact}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {(detail.tagline ?? detail.synopsis) && (
        <div className={styles.synopsis}>
          {detail.tagline && (
            <p>
              <em>{detail.tagline}</em>
            </p>
          )}
          {detail.synopsis && <p>{detail.synopsis}</p>}
        </div>
      )}

      <p className={styles.note}>Movie and TV information from TMDB.</p>
    </>
  );
}

function CastPanel({
  detail,
  watched,
  onToggleWatched,
}: {
  readonly detail: MediaDetail;
  readonly watched: boolean;
  readonly onToggleWatched: (watched: boolean) => void;
}) {
  return (
    <aside aria-labelledby="cast-title" className={own.panel}>
      <div className={own.panelHeader}>
        <h2 id="cast-title" className={own.panelTitle}>
          Cast
        </h2>
        <Muted>Top billed</Muted>
      </div>
      {detail.cast.length === 0 ? (
        <p className={own.personRole}>No cast information yet.</p>
      ) : (
        <ul className={own.cast}>
          {detail.cast.slice(0, 8).map((person) => (
            <li key={`${person.name}-${person.character ?? ''}`} className={own.person}>
              {person.imageUrl ? (
                <img className={own.avatar} src={imageSrc(person.imageUrl)} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <span className={own.avatar} aria-hidden="true" />
              )}
              <span className={own.personText}>
                <span className={own.personName}>{person.name}</span>
                {person.character && <span className={own.personRole}>{person.character}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <hr className={own.divider} />
      <div className={own.watchedRow}>
        <h2 className={own.panelTitle}>{watched ? 'You’ve seen this' : 'Seen it already?'}</h2>
        <div>
          <PillButton variant="outline" aria-pressed={watched} onClick={() => onToggleWatched(!watched)}>
            {watched ? 'Watched ✓' : 'Mark as watched'}
          </PillButton>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ rows below */

function Collection({ id, currentId, onOpen }: { readonly id: number; readonly currentId: number; readonly onOpen: (item: MediaSummary) => void }) {
  const { data, isPending, isError } = useCollection(id);
  if (isError || (data && data.parts.length < 2)) return null;
  return (
    <section aria-labelledby="collection-title" className={styles.more} aria-busy={isPending || undefined}>
      <Eyebrow>Collection · シリーズ</Eyebrow>
      <h2 id="collection-title" className={styles.moreTitle}>
        {data ? `${data.name} (${data.parts.length})` : 'Collection'}
      </h2>
      {isPending ? (
        <CardRowSkeleton />
      ) : (
        <ScrollRow>
          {data.parts.map((part, index) => (
            <ShowCard key={part.id} anime={part} onOpen={() => onOpen(part)} current={part.id === currentId}>
              <TitleLines
                title={part.title}
                subtitle={[part.id === currentId ? 'Now viewing' : null, `#${index + 1}`, part.year ?? 'Coming soon'].filter(Boolean).join(' · ')}
              />
            </ShowCard>
          ))}
        </ScrollRow>
      )}
    </section>
  );
}

function Recommendations({ items, onOpen }: { readonly items: readonly MediaSummary[]; readonly onOpen: (item: MediaSummary) => void }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="more-title" className={styles.more}>
      <Eyebrow>More like this · おすすめ</Eyebrow>
      <h2 id="more-title" className={styles.moreTitle}>
        You might also like
      </h2>
      <ScrollRow>
        {items.map((item) => (
          <ShowCard key={item.id} anime={item} onOpen={() => onOpen(item)}>
            <TitleLines title={item.title} subtitle={[item.year, item.genres[0]].filter(Boolean).join(' · ')} />
          </ShowCard>
        ))}
      </ScrollRow>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className={styles.layout} aria-busy="true">
      <LoadingStatus label="Loading details…" />
      <div className={styles.main}>
        <Block className={styles.skelPlayer} />
        <Block className={styles.skelTitle} />
        <Block className={styles.skelLine} />
        <Block className={styles.skelLine} />
      </div>
      <Block className={styles.skelAside} />
    </div>
  );
}
