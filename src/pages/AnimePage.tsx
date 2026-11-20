import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { AnimeDetail, AnimeRef } from '../../shared/api';
import { ApiError } from '../api/client';
import { useAnime, useRecommendations, useStreamConfig } from '../api/queries';
import { CardRowSkeleton, Block, EmptyNotice, ErrorNotice, LoadingStatus } from '../components/feedback';
import { Icon } from '../components/Icon';
import { ShowCard } from '../components/ShowCard';
import { EpisodeList } from '../components/watch/EpisodeList';
import { EpisodePlayer } from '../components/watch/EpisodePlayer';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
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
          <Recommendations id={anime.id} onOpen={onOpen} />
        </>
      )}
    </main>
  );
}

/** `?ep=` → a valid episode number (1 … last), defaulting to 1 for missing or malformed values. */
function parseEpisode(raw: string | null, last: number | null): number {
  if (!raw || !/^[1-9]\d{0,3}$/.test(raw)) return 1;
  const episode = Number(raw);
  return last !== null && episode > last ? 1 : episode;
}

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

  const lastEpisode = anime.episodes;
  const episode = parseEpisode(params.get('ep'), lastEpisode);
  const langParam = params.get('lang');
  const currentLanguage = langParam && languages.includes(langParam) ? langParam : (languages[0] ?? 'sub');
  const watchingEpisode = playable && !showTrailer;

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
  const setLanguage = (lang: string) => updateParams({ lang });

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
                onClick={() => selectEpisode(episode + 1)}
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

        <Details anime={anime} queued={queued} onToggleQueue={onToggleQueue} playable={playable} />
      </section>
      <EpisodeList
        animeId={anime.id}
        totalEpisodes={anime.episodes}
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
}

function Details({ anime, queued, onToggleQueue, playable }: DetailsProps) {
  const score = formatScore(anime.score);
  const eyebrow = [anime.titleJapanese, anime.type, anime.season && anime.year && `${anime.season} ${anime.year}`]
    .filter(Boolean)
    .join(' · ');

  const facts: [string, string][] = [];
  if (score) facts.push(['Score', score]);
  if (anime.rank) facts.push(['Rank', `#${anime.rank}`]);
  facts.push(['Episodes', formatEpisodes(anime.episodes)]);
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
          <a className={styles.external} href={anime.sourceUrl} target="_blank" rel="noopener noreferrer">
            AniList<span className="sr-only"> (opens in a new tab)</span> ↗
          </a>
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
        {playable ? 'Episodes play from the configured provider; trailers from YouTube.' : 'Trailers play from YouTube.'}{' '}
        Details from AniList.
        {anime.rating && ` Rated ${anime.rating}.`}
      </p>
    </>
  );
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
