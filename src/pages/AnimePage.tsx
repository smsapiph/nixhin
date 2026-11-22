import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { AnimeDetail, AnimeRef, SeasonEntry } from '../../shared/api';
import { ApiError } from '../api/client';
import { useAnime, useRecommendations, useSeasons, useStreamConfig } from '../api/queries';
import { CardRowSkeleton, Block, EmptyNotice, ErrorNotice, LoadingStatus } from '../components/feedback';
import { Icon } from '../components/Icon';
import { ShowCard } from '../components/ShowCard';
import { EpisodeList } from '../components/watch/EpisodeList';
import { EpisodePlayer } from '../components/watch/EpisodePlayer';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStore } from '../hooks/useStore';
import { prefsStore, setPreferredLanguage } from '../lib/prefs';
import { findProgress, progressStore, recordEpisode, resumeEpisode, setWatched } from '../lib/progress';
import { animePath } from '../routes';
import { TrailerPlayer } from '../components/watch/TrailerPlayer';
import { Eyebrow, PillButton, ScrollRow, TitleLines } from '../components/ui';
import { formatCompact, formatEpisodes, formatScore } from '../lib/format';
import styles from './AnimePage.module.css';

interface AnimePageProps {
  readonly id: number;
  readonly isQueued: (id: number) => boolean;
  readonly onToggleQueue: (anime: AnimeRef) => void;
  readonly onOpen: (id: number) => void;
  readonly onBack: () => void;
}

export function AnimePage({ id, isQueued, onToggleQueue, onOpen, onBack }: AnimePageProps) {
  const { data: anime, isPending, isError, error, refetch } = useAnime(id);
  useDocumentTitle(anime?.title ?? null);

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
            <EmptyNotice>We couldn’t find that anime.</EmptyNotice>
          ) : (
            <ErrorNotice error={error} onRetry={() => void refetch()} />
          )}
        </div>
      ) : (
        <>
          <Watch anime={anime} queued={isQueued(anime.id)} onToggleQueue={onToggleQueue} />
          <Seasons id={anime.id} onOpen={onOpen} />
          <Recommendations id={anime.id} onOpen={onOpen} />
        </>
      )}
    </main>
  );
}

/** `?ep=` → a valid episode number (1 … last), else `fallback` for missing or malformed values. */
function parseEpisode(raw: string | null, last: number | null, fallback: number): number {
  if (!raw || !/^[1-9]\d{0,3}$/.test(raw)) return fallback;
  const episode = Number(raw);
  return last !== null && episode > last ? fallback : episode;
}

/** An episode counts as watched after this long on the player (the embed can't report progress). */
const WATCHED_AFTER_MS = 4 * 60_000;

interface WatchProps {
  readonly anime: AnimeDetail;
  readonly queued: boolean;
  readonly onToggleQueue: (anime: AnimeRef) => void;
}

/** Player + episode list. Plays episodes when the server has a provider configured, else trailers. */
function Watch({ anime, queued, onToggleQueue }: WatchProps) {
  const { data: config } = useStreamConfig();
  const playable = config?.enabled === true;
  const languages = config?.languages ?? [];
  // Episode and language live in the URL (?ep=3&lang=dub) so refreshes and shared links keep them.
  const [params, setParams] = useSearchParams();
  const [showTrailer, setShowTrailer] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const progress = findProgress(useStore(progressStore), anime.id);
  const prefs = useStore(prefsStore);
  // Where this show was left off when the page opened; later progress shouldn't move the player.
  const [resumed] = useState(() => findProgress(progressStore.get(), anime.id));

  // Ongoing shows (One Piece) have no episode total; bound playback by what has aired instead.
  const lastEpisode = anime.airedEpisodes ?? anime.episodes;
  const resumeAt = resumed ? Math.max(1, Math.min(resumeEpisode(resumed), lastEpisode || Infinity)) : 1;
  const episode = parseEpisode(params.get('ep'), lastEpisode, resumeAt);
  // A link's ?lang= wins, then this show's last language, then the viewer's usual one.
  const currentLanguage =
    [params.get('lang'), resumed?.language, prefs.language].find((lang) => lang && languages.includes(lang)) ??
    languages[0] ??
    'sub';
  const watchingEpisode = playable && !showTrailer;
  const watched = new Set(progress?.watched);

  const showInfo = { id: anime.id, title: anime.title, imageUrl: anime.imageUrl, total: lastEpisode || null };
  const markWatched = (number: number, value: boolean) =>
    progressStore.set((list) => setWatched(list, showInfo, number, value));

  // Opening an episode puts the show at the front of "Continue watching"…
  useEffect(() => {
    if (!watchingEpisode) return;
    const show = { id: anime.id, title: anime.title, imageUrl: anime.imageUrl, total: lastEpisode || null };
    progressStore.set((list) => recordEpisode(list, show, episode, currentLanguage));
    // …and staying on it for a few minutes marks it watched.
    const timer = window.setTimeout(
      () => progressStore.set((list) => setWatched(list, show, episode, true)),
      WATCHED_AFTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [watchingEpisode, anime.id, anime.title, anime.imageUrl, lastEpisode, episode, currentLanguage]);

  // replace: switching episodes shouldn't fill the back button with every episode watched.
  const updateParams = (changes: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const setLanguage = (lang: string) => {
    setPreferredLanguage(lang);
    updateParams({ lang });
  };

  const selectEpisode = (next: number) => {
    updateParams({ ep: String(next) });
    setShowTrailer(false);
    // On stacked layouts the list sits below the player: bring the player back into view.
    const player = playerRef.current;
    if (player && player.getBoundingClientRect().top < 0) {
      player.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className={styles.layout}>
      <section aria-labelledby="anime-title" className={styles.main}>
        <div ref={playerRef} className={styles.playerAnchor}>
          {watchingEpisode ? (
            <EpisodePlayer anime={anime} episode={episode} language={currentLanguage} />
          ) : (
            <TrailerPlayer key={anime.id} anime={anime} />
          )}
        </div>

        {playable && (
          <div className={styles.controls} role="toolbar" aria-label="Playback">
            <div className={styles.controlGroup}>
              <button
                type="button"
                className={styles.control}
                aria-label="Previous episode"
                disabled={!watchingEpisode || episode <= 1}
                onClick={() => selectEpisode(episode - 1)}
              >
                ‹ Prev
              </button>
              <span className={styles.nowPlaying} aria-live="polite">
                {watchingEpisode ? `Episode ${episode}` : 'Trailer'}
              </span>
              <button
                type="button"
                className={styles.control}
                aria-label="Next episode"
                disabled={!watchingEpisode || (lastEpisode !== null && episode >= lastEpisode)}
                onClick={() => {
                  // Moving on means the current one is done.
                  markWatched(episode, true);
                  selectEpisode(episode + 1);
                }}
              >
                Next ›
              </button>
            </div>
            <div className={styles.controlGroup}>
              {languages.length > 1 &&
                languages.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className={styles.control}
                    aria-pressed={watchingEpisode && lang === currentLanguage}
                    onClick={() => {
                      setLanguage(lang);
                      setShowTrailer(false);
                    }}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              {anime.trailer && (
                <button
                  type="button"
                  className={styles.control}
                  aria-pressed={showTrailer}
                  onClick={() => setShowTrailer((on) => !on)}
                >
                  Trailer
                </button>
              )}
            </div>
          </div>
        )}

        <Details
          anime={anime}
          queued={queued}
          onToggleQueue={onToggleQueue}
          playable={playable}
          shareUrl={animePath(anime.id, watchingEpisode ? { episode, language: currentLanguage } : {})}
          shareTitle={watchingEpisode ? `${anime.title} · Episode ${episode}` : anime.title}
        />
      </section>
      <EpisodeList
        animeId={anime.id}
        airedEpisodes={anime.airedEpisodes}
        airing={anime.airing}
        watched={watched}
        onToggleWatched={markWatched}
        {...(playable && { current: watchingEpisode ? episode : null, onSelect: selectEpisode })}
      />
    </div>
  );
}

interface DetailsProps {
  readonly anime: AnimeDetail;
  readonly queued: boolean;
  readonly onToggleQueue: (anime: AnimeRef) => void;
  readonly playable: boolean;
  /** Path of this page as it should be shared (keeps the episode and language). */
  readonly shareUrl: string;
  readonly shareTitle: string;
}

function Details({ anime, queued, onToggleQueue, playable, shareUrl, shareTitle }: DetailsProps) {
  const score = formatScore(anime.score);
  const eyebrow = [anime.titleJapanese, anime.type, anime.season && anime.year && `${anime.season} ${anime.year}`]
    .filter(Boolean)
    .join(' · ');

  const facts: [string, string][] = [];
  if (score) facts.push(['Score', score]);
  if (anime.rank) facts.push(['Rank', `#${anime.rank}`]);
  facts.push([
    'Episodes',
    anime.episodes === null && anime.airing && anime.airedEpisodes
      ? `${anime.airedEpisodes.toLocaleString()} aired · ongoing`
      : formatEpisodes(anime.episodes),
  ]);
  if (anime.status) facts.push(['Status', anime.status]);
  if (anime.duration) facts.push(['Duration', anime.duration]);
  if (anime.studios.length > 0) facts.push(['Studio', anime.studios.join(', ')]);
  if (anime.members) facts.push(['Members', formatCompact(anime.members)]);

  return (
    <>
      <div className={styles.details}>
        <div className={styles.info}>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 id="anime-title" className={styles.title}>
            {anime.title}
          </h1>
          {anime.titleEnglish && anime.titleEnglish !== anime.title && (
            <div className={styles.subtitle}>{anime.titleEnglish}</div>
          )}
          {anime.genres.length > 0 && (
            <ul className={styles.genres} aria-label="Genres">
              {anime.genres.map((genre) => (
                <li key={genre} className={styles.genre}>
                  {genre}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={styles.actions}>
          <PillButton variant={queued ? 'outline' : 'primary'} aria-pressed={queued} onClick={() => onToggleQueue(anime)}>
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

      {anime.synopsis && (
        <div className={styles.synopsis}>
          {anime.synopsis.split(/\n{2,}/).map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      )}

      <p className={styles.note}>
        {playable ? 'Episodes play from the configured provider; trailers from YouTube.' : 'Trailers play from YouTube.'}
        {anime.rating && ` Rated ${anime.rating}.`}
      </p>
    </>
  );
}

/**
 * Shares the page with the system share sheet where there is one (phones), else copies the link.
 * Link previews show the episode, so the shared URL keeps ?ep= and ?lang=.
 */
function ShareButton({ path, title }: { readonly path: string; readonly title: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const timer = window.setTimeout(() => setStatus('idle'), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `${title} · Nixhin`, url });
        return;
      } catch (error) {
        // The viewer closed the share sheet: nothing to do.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <>
      <PillButton variant="outline" onClick={() => void share()}>
        Share
      </PillButton>
      <span role="status" className={styles.shareStatus}>
        {status === 'copied' ? 'Link copied' : status === 'failed' ? 'Couldn’t copy the link' : ''}
      </span>
    </>
  );
}

/** The franchise watch order (seasons, movies, OVAs), shown when the show is part of one. */
function Seasons({ id, onOpen }: { readonly id: number; readonly onOpen: (id: number) => void }) {
  const { data, isPending, isError } = useSeasons(id);

  // Like recommendations: optional, so hide on failure or for standalone shows.
  if (isError || (data && data.length < 2)) return null;

  return (
    <section aria-labelledby="seasons-title" className={styles.more} aria-busy={isPending || undefined}>
      <Eyebrow>Watch order · シーズン</Eyebrow>
      <h2 id="seasons-title" className={styles.moreTitle}>
        {data ? `Seasons & related (${data.length})` : 'Seasons & related'}
      </h2>
      {isPending ? (
        <CardRowSkeleton />
      ) : (
        <ScrollRow>
          {data.map((entry, index) => (
            <ShowCard key={entry.id} anime={entry} onOpen={onOpen} current={entry.id === id}>
              <TitleLines title={entry.title} subtitle={seasonLine(entry, index, entry.id === id)} />
            </ShowCard>
          ))}
        </ScrollRow>
      )}
    </section>
  );
}

/** "#3 · TV · 2017 · 12 eps", with "Now viewing" for the open title. */
function seasonLine(entry: SeasonEntry, index: number, current: boolean): string {
  const parts = [`#${index + 1}`, entry.type, entry.year, entry.airing ? 'Airing' : entry.episodes && `${entry.episodes} eps`];
  const line = parts.filter(Boolean).join(' · ');
  return current ? `Now viewing · ${line}` : line;
}

function Recommendations({ id, onOpen }: { readonly id: number; readonly onOpen: (id: number) => void }) {
  const { data, isPending, isError } = useRecommendations(id);

  // Recommendations are a nice-to-have: hide quietly on failure or when empty.
  if (isError || (data && data.length === 0)) return null;

  return (
    <section aria-labelledby="more-title" className={styles.more} aria-busy={isPending || undefined}>
      <Eyebrow>You may like · おすすめ</Eyebrow>
      <h2 id="more-title" className={styles.moreTitle}>
        Fans also watched
      </h2>
      {isPending ? (
        <CardRowSkeleton />
      ) : (
        <ScrollRow>
          {data.map((rec) => (
            <ShowCard key={rec.id} anime={rec} onOpen={onOpen}>
              <TitleLines title={rec.title} subtitle="Recommended by fans" />
            </ShowCard>
          ))}
        </ScrollRow>
      )}
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className={styles.layout} aria-busy="true">
      <LoadingStatus label="Loading anime details…" />
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
