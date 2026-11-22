import { useState } from 'react';
import type { MediaKind, MediaSummary, PersonCredit } from '../../shared/api';
import { ApiError } from '../api/client';
import { usePerson } from '../api/media';
import { AnimeGrid } from '../components/AnimeGrid';
import { Block, EmptyNotice, ErrorNotice, LoadingStatus } from '../components/feedback';
import { Icon } from '../components/Icon';
import { Eyebrow } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatDate } from '../lib/format';
import { imageSrc } from '../lib/images';
import styles from './PersonPage.module.css';

interface PersonPageProps {
  readonly id: number;
  /** The mode the person was opened from: its credits come first. */
  readonly from: MediaKind;
  readonly onOpen: (item: MediaSummary) => void;
  readonly onBack: () => void;
}

const DEPARTMENT_LABELS: Readonly<Record<string, string>> = {
  Acting: 'Actor · 俳優',
  Directing: 'Director · 監督',
  Writing: 'Writer · 脚本',
  Production: 'Producer · 製作',
};

/** Age in whole years on `until` (today when alive). */
function age(birthday: string, until: string | null): number {
  const born = new Date(`${birthday}T00:00:00`);
  const end = until ? new Date(`${until}T00:00:00`) : new Date();
  let years = end.getFullYear() - born.getFullYear();
  if (end.getMonth() < born.getMonth() || (end.getMonth() === born.getMonth() && end.getDate() < born.getDate())) years -= 1;
  return years;
}

/** An actor's or filmmaker's page: photo, biography, and their movies and TV shows. */
export function PersonPage({ id, from, onOpen, onBack }: PersonPageProps) {
  const { data: person, isPending, isError, error, refetch } = usePerson(id);
  const [expanded, setExpanded] = useState(false);
  useDocumentTitle(person?.name ?? null);

  const facts = person
    ? [
        person.birthday &&
          `Born ${formatDate(person.birthday)}${person.deathday ? '' : ` (age ${age(person.birthday, null)})`}`,
        person.deathday && `Died ${formatDate(person.deathday)}${person.birthday ? ` (aged ${age(person.birthday, person.deathday)})` : ''}`,
        person.birthplace,
      ].filter(Boolean)
    : [];
  const paragraphs = person?.biography?.split(/\n{2,}/) ?? [];
  const long = (person?.biography?.length ?? 0) > 600;

  const sections: { kind: MediaKind; title: string; items: readonly PersonCredit[] }[] = person
    ? [
        { kind: 'movie' as const, title: 'Movies', items: person.movies },
        { kind: 'tv' as const, title: 'TV shows', items: person.shows },
      ].sort((a, b) => (a.kind === from ? -1 : b.kind === from ? 1 : 0))
    : [];

  return (
    <main className={styles.page}>
      <button type="button" className={styles.back} onClick={onBack}>
        <Icon name="back" />
        Back
      </button>

      {isPending ? (
        <div className={styles.profile} aria-busy="true">
          <LoadingStatus label="Loading…" />
          <Block className={styles.skelPhoto} />
          <div className={styles.info}>
            <Block className={styles.skelLine} />
            <Block className={styles.skelLine} />
            <Block className={styles.skelLine} />
          </div>
        </div>
      ) : isError ? (
        error instanceof ApiError && error.status === 404 ? (
          <EmptyNotice>We couldn’t find that person.</EmptyNotice>
        ) : (
          <ErrorNotice error={error} onRetry={() => void refetch()} />
        )
      ) : (
        <>
          <section className={styles.profile} aria-labelledby="person-name">
            {person.imageUrl ? (
              <img className={styles.photo} src={imageSrc(person.imageUrl)} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className={`${styles.photo} ${styles.photoFallback}`} aria-hidden="true">
                {person.name.slice(0, 1)}
              </span>
            )}
            <div className={styles.info}>
              {person.knownFor && <Eyebrow>{DEPARTMENT_LABELS[person.knownFor] ?? person.knownFor}</Eyebrow>}
              <h1 id="person-name" className={styles.name}>
                {person.name}
              </h1>
              {facts.length > 0 && <p className={styles.facts}>{facts.join(' · ')}</p>}
              {paragraphs.length > 0 && (
                <>
                  <div className={`${styles.bio} ${long && !expanded ? styles.clamped : ''}`}>
                    {paragraphs.map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                  </div>
                  {long && (
                    <button type="button" className={styles.more} aria-expanded={expanded} onClick={() => setExpanded((on) => !on)}>
                      {expanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          {sections.map(
            (section) =>
              section.items.length > 0 && (
                <section key={section.kind} className={styles.credits} aria-labelledby={`${section.kind}-credits`}>
                  <Eyebrow>{section.kind === 'movie' ? 'Filmography · 出演作' : 'On TV · 出演番組'}</Eyebrow>
                  <h2 id={`${section.kind}-credits`} className={styles.creditsTitle}>
                    {section.title} ({section.items.length})
                  </h2>
                  <CreditGrid items={section.items} onOpen={onOpen} />
                </section>
              ),
          )}
          {sections.every((section) => section.items.length === 0) && (
            <div className={styles.credits}>
              <EmptyNotice>No movies or shows listed for {person.name} yet.</EmptyNotice>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function CreditGrid({ items, onOpen }: { readonly items: readonly PersonCredit[]; readonly onOpen: (item: MediaSummary) => void }) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return (
    <AnimeGrid
      items={items}
      onOpen={(id) => {
        const item = byId.get(id);
        if (item) onOpen(item);
      }}
      subtitle={(item) => [item.role, item.year].filter(Boolean).join(' · ') || 'Coming soon'}
    />
  );
}
