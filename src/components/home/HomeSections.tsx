import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useSeasonNow, useTopAnime } from '../../api/queries';
import { pluralLocalDay } from '../../lib/broadcast';
import { formatScore, genreLine } from '../../lib/format';
import type { SectionId } from '../../types';
import { CardRowSkeleton, EmptyNotice, ErrorNotice, LoadingStatus } from '../feedback';
import type { NavigateHandler } from '../navigation';
import { ShowCard } from '../ShowCard';
import { Muted, ScrollRow, SectionHeader, TextLink, TitleLines } from '../ui';
import { Backup } from './Backup';
import styles from './HomeSections.module.css';
import { homePath, isPlainClick, titlePath } from '../../routes';
import { itemKey, kindOf, type QueueItem } from '../../lib/queueStorage';

export type OpenHandler = (id: number) => void;

interface SectionProps {
  /** Anchor id (`/#trending`, `/movies#popular`, …). */
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly aside?: ReactNode;
  readonly busy?: boolean;
  readonly children: ReactNode;
}

/** Shared home-page section shell: anchor target, heading and spacing. */
export function HomeSection({ id, eyebrow, title, aside, busy, children }: SectionProps) {
  const headingId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={headingId} aria-busy={busy || undefined} className={styles.section}>
      <SectionHeader headingId={headingId} eyebrow={eyebrow} title={title} aside={aside} />
      {children}
    </section>
  );
}

function SectionLink({ to, label, onNavigate }: { to: SectionId; label: string; onNavigate: NavigateHandler }) {
  return (
    <TextLink
      href={homePath(to)}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onNavigate(to);
      }}
    >
      {label}
    </TextLink>
  );
}

const KIND_LABELS = { movie: 'Movie', tv: 'TV show' } as const;

/** The viewer's saved titles. Movies and TV shows (saved from their modes) say what they are. */
export function MyQueue({ items }: { readonly items: readonly QueueItem[] }) {
  const navigate = useNavigate();
  return (
    <HomeSection
      id="queue"
      eyebrow="My queue · リスト"
      title="Saved for later"
      aside={<Muted>{items.length > 0 ? `${items.length} saved on this device` : 'Saved on this device'}</Muted>}
    >
      {items.length === 0 ? (
        <EmptyNotice>Nothing here yet. Use “Add to queue” on any show to save it for later.</EmptyNotice>
      ) : (
        <ScrollRow>
          {items.map((item) => {
            const kind = kindOf(item);
            return (
              <ShowCard key={itemKey(kind, item.id)} anime={item} onOpen={() => navigate(titlePath(kind, item.id))}>
                {item.kind ? (
                  <TitleLines title={item.title} subtitle={KIND_LABELS[item.kind]} />
                ) : (
                  <span className={styles.cardTitle}>{item.title}</span>
                )}
              </ShowCard>
            );
          })}
        </ScrollRow>
      )}
      <Backup />
    </HomeSection>
  );
}

interface LinkedSectionProps {
  readonly onOpen: OpenHandler;
  readonly onNavigate: NavigateHandler;
}

export function Trending({ onOpen, onNavigate }: LinkedSectionProps) {
  const { data, isPending, isError, error, refetch } = useTopAnime('airing');

  return (
    <HomeSection
      id="trending"
      eyebrow="Trending · 人気"
      title="Top airing right now"
      busy={isPending}
      aside={<SectionLink to="browse" label="Browse all" onNavigate={onNavigate} />}
    >
      {isPending ? (
        <>
          <LoadingStatus />
          <CardRowSkeleton />
        </>
      ) : isError ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} />
      ) : (
        // Extra padding keeps focus rings from being clipped by the scroller.
        <ScrollRow className={styles.paddedRow}>
          {data.map((anime, i) => {
            const score = formatScore(anime.score);
            return (
              <ShowCard key={anime.id} anime={anime} onOpen={onOpen}>
                <span className={styles.ranked}>
                  <span className={styles.rank}>
                    <span className="sr-only">Rank </span>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className={styles.rankedText}>
                    <TitleLines
                      title={anime.title}
                      subtitle={score ? `★ ${score} · ${genreLine(anime, 1)}` : genreLine(anime)}
                    />
                  </span>
                </span>
              </ShowCard>
            );
          })}
        </ScrollRow>
      )}
    </HomeSection>
  );
}

export function NewSeason({ onOpen, onNavigate }: LinkedSectionProps) {
  const { data, isPending, isError, error, refetch } = useSeasonNow();

  return (
    <HomeSection
      id="season"
      eyebrow="This season · 今期"
      title="Airing this season"
      busy={isPending}
      aside={<SectionLink to="schedule" label="Schedule" onNavigate={onNavigate} />}
    >
      {isPending ? (
        <>
          <LoadingStatus />
          <CardRowSkeleton />
        </>
      ) : isError ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} />
      ) : (
        <ScrollRow>
          {data.items.map((anime) => (
            <ShowCard key={anime.id} anime={anime} onOpen={onOpen}>
              <span className={styles.newBadge}>
                {anime.broadcast ? `New · ${pluralLocalDay(anime.broadcast)}` : 'This season'}
              </span>
              <TitleLines title={anime.title} subtitle={genreLine(anime)} />
            </ShowCard>
          ))}
        </ScrollRow>
      )}
    </HomeSection>
  );
}
