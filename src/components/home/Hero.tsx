import { useCallback, useState } from 'react';
import type { AnimeRef, AnimeSummary } from '../../../shared/api';
import { useTopAnime } from '../../api/queries';
import { useAutoAdvance } from '../../hooks/useAutoAdvance';
import { formatEpisodes, formatScore, genreLine } from '../../lib/format';
import { Block, ErrorNotice, LoadingStatus } from '../feedback';
import { Icon } from '../Icon';
import { AccentDot, Eyebrow, PillButton } from '../ui';
import styles from './Hero.module.css';

const FEATURED_COUNT = 5;
const ROTATE_MS = 8000;

interface HeroProps {
  readonly showRemoteHint: boolean;
  readonly isQueued: (id: number) => boolean;
  readonly onToggleQueue: (anime: AnimeRef) => void;
  readonly onOpen: (id: number) => void;
}

export function Hero(props: HeroProps) {
  const { data, isPending, isError, error, refetch } = useTopAnime('airing');

  if (isPending) return <HeroSkeleton />;
  if (isError) {
    return (
      <section aria-label="Featured" className={styles.hero}>
        <div className={styles.text}>
          <ErrorNotice error={error} onRetry={() => void refetch()} />
        </div>
      </section>
    );
  }

  const featured = data.slice(0, FEATURED_COUNT);
  if (featured.length === 0) return null;
  return <HeroCarousel featured={featured} {...props} />;
}

interface HeroCarouselProps extends HeroProps {
  readonly featured: readonly AnimeSummary[];
}

function HeroCarousel({ featured, showRemoteHint, isQueued, onToggleQueue, onOpen }: HeroCarouselProps) {
  const [index, setIndex] = useState(0);
  // Pause rotation while the viewer is interacting with the banner (WCAG 2.2.2).
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const advance = useCallback(() => setIndex((i) => (i + 1) % featured.length), [featured.length]);
  useAutoAdvance({ intervalMs: ROTATE_MS, paused: hovered || focused, maxScrollY: 400, onAdvance: advance });

  const anime = featured[index % featured.length];
  if (!anime) return null;
  const queued = isQueued(anime.id);
  const score = formatScore(anime.score);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className={styles.hero}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className={styles.text}>
        <Eyebrow>Top airing · 今週の注目</Eyebrow>
        <h1 className={styles.title}>{anime.title}</h1>
        <span className={styles.meta}>
          {[anime.titleJapanese, genreLine(anime, 3), formatEpisodes(anime.episodes)].filter(Boolean).join(' · ')}
        </span>
        {anime.synopsis && <p className={styles.synopsis}>{anime.synopsis}</p>}

        <div className={styles.actions}>
          <PillButton onClick={() => onOpen(anime.id)}>
            <Icon name="play" size="0.95em" />
            View details
          </PillButton>
          <PillButton variant="outline" aria-pressed={queued} onClick={() => onToggleQueue(anime)}>
            {queued ? 'In your queue' : 'Add to queue'}
          </PillButton>
        </div>

        <span className={styles.note}>
          <AccentDot />
          {score ? `Rated ${score}/10 on AniList` : 'Data from AniList'}
        </span>

        <div role="group" aria-label="Featured shows" className={styles.dots}>
          {featured.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={styles.dotButton}
              aria-label={`Show ${item.title}`}
              aria-pressed={i === index % featured.length}
              onClick={() => setIndex(i)}
            >
              <span className={styles.dot} />
            </button>
          ))}
        </div>

        {showRemoteHint && <span className={styles.hint}>Use the arrows on your remote to move, OK to select.</span>}
      </div>

      <HeroArt anime={anime} />
    </section>
  );
}

/**
 * The poster, centred over a backdrop: the show's wide banner when it has one,
 * otherwise a blurred copy of the poster.
 */
function HeroArt({ anime }: { readonly anime: AnimeSummary }) {
  const poster = anime.imageUrlLarge ?? anime.imageUrl;
  const backdrop = anime.bannerUrl ?? poster;
  return (
    <div className={`${styles.artBox} ${styles.art}`}>
      {backdrop && (
        <img
          key={`bg-${backdrop}`}
          className={anime.bannerUrl ? styles.banner : styles.backdrop}
          src={backdrop}
          alt=""
          referrerPolicy="no-referrer"
        />
      )}
      {poster && <img key={poster} className={styles.contain} src={poster} alt="" referrerPolicy="no-referrer" />}
      {anime.titleJapanese && (
        <span className={styles.vertical} aria-hidden="true">
          {anime.titleJapanese}
        </span>
      )}
    </div>
  );
}

function HeroSkeleton() {
  return (
    <section aria-label="Featured" aria-busy="true" className={styles.hero}>
      <LoadingStatus label="Loading featured anime…" />
      <div className={styles.text}>
        <Block className={styles.skelEyebrow} />
        <Block className={styles.skelTitle} />
        <Block className={styles.skelLine} />
        <Block className={styles.skelLine} />
        <Block className={styles.skelButton} />
      </div>
      <Block className={styles.artBox} />
    </section>
  );
}
