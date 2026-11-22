import { useCallback, useState } from 'react';
import type { MediaSummary } from '../../../shared/api';
import { useAutoAdvance } from '../../hooks/useAutoAdvance';
import { formatScore } from '../../lib/format';
import type { QueueItem } from '../../lib/queueStorage';
import { Block, ErrorNotice, LoadingStatus } from '../feedback';
import { Icon } from '../Icon';
import { AccentDot, Eyebrow, PillButton } from '../ui';
import styles from '../home/Hero.module.css';
import { heroLine } from './mediaFormat';

const FEATURED_COUNT = 5;
const ROTATE_MS = 8000;

interface MediaHeroProps {
  readonly eyebrow: string;
  readonly items: readonly MediaSummary[] | undefined;
  readonly isPending: boolean;
  readonly error: Error | null;
  readonly onRetry: () => void;
  readonly showRemoteHint: boolean;
  readonly isQueued: (item: MediaSummary) => boolean;
  readonly onToggleQueue: (item: QueueItem) => void;
  readonly onOpen: (item: MediaSummary) => void;
}

/** The Movies / TV home banner: the week's top titles, rotating (same look as the anime hero). */
export function MediaHero({ items, isPending, error, onRetry, ...props }: MediaHeroProps) {
  if (isPending) return <HeroSkeleton />;
  if (error) {
    return (
      <section aria-label="Featured" className={styles.hero}>
        <div className={styles.text}>
          <ErrorNotice error={error} onRetry={onRetry} />
        </div>
      </section>
    );
  }
  // Titles without a backdrop look broken in a wide banner.
  const featured = (items ?? []).filter((item) => item.backdropUrl ?? item.imageUrlLarge).slice(0, FEATURED_COUNT);
  if (featured.length === 0) return null;
  return <Carousel featured={featured} {...props} />;
}

interface CarouselProps extends Omit<MediaHeroProps, 'items' | 'isPending' | 'error' | 'onRetry'> {
  readonly featured: readonly MediaSummary[];
}

function Carousel({ featured, eyebrow, showRemoteHint, isQueued, onToggleQueue, onOpen }: CarouselProps) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const advance = useCallback(() => setIndex((i) => (i + 1) % featured.length), [featured.length]);
  useAutoAdvance({ intervalMs: ROTATE_MS, paused: hovered || focused, maxScrollY: 400, onAdvance: advance });

  const item = featured[index % featured.length];
  if (!item) return null;
  const queued = isQueued(item);
  const score = formatScore(item.score);
  const poster = item.imageUrlLarge ?? item.imageUrl;

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
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className={styles.title}>{item.title}</h1>
        <span className={styles.meta}>{[item.originalTitle, heroLine(item)].filter(Boolean).join(' · ')}</span>
        {item.synopsis && <p className={styles.synopsis}>{item.synopsis}</p>}
        <div className={styles.actions}>
          <PillButton onClick={() => onOpen(item)}>
            <Icon name="play" size="0.95em" />
            {item.kind === 'movie' ? 'Watch now' : 'View details'}
          </PillButton>
          <PillButton variant="outline" aria-pressed={queued} onClick={() => onToggleQueue(item)}>
            {queued ? 'In your queue' : 'Add to queue'}
          </PillButton>
        </div>
        <span className={styles.note}>
          <AccentDot />
          {score ? `Rated ${score}/10 by viewers` : 'Trending this week'}
        </span>
        <div role="group" aria-label="Featured titles" className={styles.dots}>
          {featured.map((entry, i) => (
            <button
              key={entry.id}
              type="button"
              className={styles.dotButton}
              aria-label={`Show ${entry.title}`}
              aria-pressed={i === index % featured.length}
              onClick={() => setIndex(i)}
            >
              <span className={styles.dot} />
            </button>
          ))}
        </div>
        {showRemoteHint && <span className={styles.hint}>Use the arrows on your remote to move, OK to select.</span>}
      </div>

      <div className={`${styles.artBox} ${styles.art}`}>
        {item.backdropUrl ? (
          <img key={`bg-${item.backdropUrl}`} className={styles.banner} src={item.backdropUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          poster && <img key={`bg-${poster}`} className={styles.backdrop} src={poster} alt="" referrerPolicy="no-referrer" />
        )}
        {poster && <img key={poster} className={styles.contain} src={poster} alt="" referrerPolicy="no-referrer" />}
      </div>
    </section>
  );
}

function HeroSkeleton() {
  return (
    <section aria-label="Featured" aria-busy="true" className={styles.hero}>
      <LoadingStatus label="Loading featured titles…" />
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
