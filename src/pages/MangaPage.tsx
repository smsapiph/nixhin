import { useId, useState, type MouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { MANGA_LANGUAGES, type MangaChapter, type MangaDetail, type MangaLanguage } from '../../shared/api';
import { useManga, useMangaChapters } from '../api/manga';
import { Block, EmptyNotice, ErrorNotice, LoadingStatus } from '../components/feedback';
import { Icon } from '../components/Icon';
import { STATUS_LABELS } from '../lib/mangaFormat';
import { Poster } from '../components/Poster';
import { Eyebrow, PillButton } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStore } from '../hooks/useStore';
import { LANGUAGE_LABELS, chapterLabel, chapterNumber, filterChapters, firstChapter } from '../lib/mangaChapters';
import { findReading, mangaProgressStore } from '../lib/mangaProgress';
import { isPlainClick, mangaReaderPath } from '../routes';
import animeStyles from './AnimePage.module.css';
import styles from './MangaPage.module.css';

interface MangaPageProps {
  readonly id: string;
  readonly onBack: () => void;
}

/** How many chapters the list shows before "Show more". */
const CHAPTER_STEP = 100;

function isLanguage(value: string | null): value is MangaLanguage {
  return value !== null && (MANGA_LANGUAGES as readonly string[]).includes(value);
}

/** `/manga/:id` — details and the chapter list in English or Filipino. */
export function MangaPage({ id, onBack }: MangaPageProps) {
  const manga = useManga(id);
  const [params, setParams] = useSearchParams();
  useDocumentTitle(manga.data?.title ?? null);

  const requested = params.get('lang');
  const available = manga.data?.languages ?? [];
  // The asked-for language, else English when it has chapters, else whatever does.
  const language: MangaLanguage = isLanguage(requested) ? requested : (available[0] ?? 'en');
  const chooseLanguage = (next: MangaLanguage) =>
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (next === 'en') updated.delete('lang');
      else updated.set('lang', next);
      return updated;
    }, { replace: true });

  return (
    <main className={animeStyles.page} aria-busy={manga.isPending || undefined}>
      <button type="button" className={animeStyles.back} onClick={onBack}>
        <Icon name="back" />
        Back
      </button>

      {manga.isPending ? (
        <>
          <LoadingStatus />
          <div className={styles.detail}>
            <Block className={styles.coverSkeleton} />
            <div className={styles.info}>
              <Block className={styles.lineSkeleton} />
              <Block className={styles.lineSkeletonShort} />
            </div>
          </div>
        </>
      ) : manga.isError ? (
        <ErrorNotice error={manga.error} onRetry={() => void manga.refetch()} />
      ) : (
        <>
          <MangaInfo manga={manga.data} />
          <Chapters manga={manga.data} language={language} onLanguage={chooseLanguage} />
        </>
      )}
    </main>
  );
}

function MangaInfo({ manga }: { readonly manga: MangaDetail }) {
  const [expanded, setExpanded] = useState(false);
  const people = [...new Set([...manga.authors, ...manga.artists])];
  const facts: [string, string][] = [
    ['Status', manga.status ? (STATUS_LABELS[manga.status] ?? manga.status) : '—'],
    ['Year', manga.year ? String(manga.year) : '—'],
    ['Demographic', manga.demographic ? manga.demographic[0]?.toUpperCase() + manga.demographic.slice(1) : '—'],
    ['Languages', manga.languages.map((language) => LANGUAGE_LABELS[language]).join(', ') || '—'],
  ];
  const long = (manga.description?.length ?? 0) > 600;

  return (
    <div className={styles.detail}>
      <Poster src={manga.coverUrl} title={manga.title} priority className={styles.cover} />
      <div className={styles.info}>
        <Eyebrow>Manga · 漫画</Eyebrow>
        <h1 className={animeStyles.title}>{manga.title}</h1>
        {manga.altTitles.length > 0 && <p className={animeStyles.subtitle}>{manga.altTitles.slice(0, 3).join(' · ')}</p>}
        {people.length > 0 && <p className={styles.people}>By {people.join(', ')}</p>}
        {manga.tags.length > 0 && (
          <ul className={animeStyles.genres} aria-label="Genres">
            {manga.tags.map((tag) => (
              <li key={tag} className={animeStyles.genre}>
                {tag}
              </li>
            ))}
          </ul>
        )}
        <dl className={animeStyles.facts}>
          {facts.map(([label, value]) => (
            <div key={label} className={animeStyles.fact}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {manga.description && (
          <div className={animeStyles.synopsis}>
            <p className={`${styles.description} ${long && !expanded ? styles.clamped : ''}`}>{manga.description}</p>
            {long && (
              <button type="button" className={styles.textButton} onClick={() => setExpanded((value) => !value)}>
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        )}
        {manga.links.length > 0 && (
          <p className={styles.links}>
            <span className={styles.linksLabel}>Support the author:</span>
            {manga.links.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noreferrer noopener" className={styles.externalLink}>
                {link.label} ↗
              </a>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

interface ChaptersProps {
  readonly manga: MangaDetail;
  readonly language: MangaLanguage;
  readonly onLanguage: (language: MangaLanguage) => void;
}

function Chapters({ manga, language, onLanguage }: ChaptersProps) {
  const chapters = useMangaChapters(manga.id, language);
  const navigate = useNavigate();
  const progress = useStore(mangaProgressStore);
  const [newestFirst, setNewestFirst] = useState(true);
  const [typed, setTyped] = useState('');
  const [shown, setShown] = useState(CHAPTER_STEP);
  const filterId = useId();

  const all = chapters.data ?? [];
  const reading = findReading(progress, manga.id);
  const resume = reading?.language === language ? all.find((chapter) => chapter.id === reading.chapterId) : undefined;
  const start = firstChapter(all);
  const latest = [...all].reverse().find((chapter) => !chapter.externalUrl);
  const matching = filterChapters(all, typed);
  const ordered = newestFirst ? [...matching].reverse() : matching;
  const visible = ordered.slice(0, shown);

  const open = (chapter: MangaChapter) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (chapter.externalUrl || !isPlainClick(event)) return;
    event.preventDefault();
    navigate(mangaReaderPath(manga.id, chapter.id));
  };

  return (
    <section className={styles.chapters} aria-labelledby="chapters-title">
      <div className={styles.chaptersHeader}>
        <div>
          <Eyebrow>Chapters · 章</Eyebrow>
          <h2 id="chapters-title" className={animeStyles.moreTitle}>
            {chapters.isSuccess ? `${new Set(all.map((chapter) => chapter.chapter ?? chapter.id)).size} chapters` : 'Chapters'}
          </h2>
        </div>
        <div className={styles.languages} role="group" aria-label="Chapter language">
          {MANGA_LANGUAGES.map((item) => (
            <button
              key={item}
              type="button"
              className={styles.language}
              aria-pressed={item === language}
              onClick={() => onLanguage(item)}
            >
              {LANGUAGE_LABELS[item]}
              {!manga.languages.includes(item) && <span className="sr-only"> (no chapters)</span>}
            </button>
          ))}
        </div>
      </div>

      {chapters.isSuccess && all.length > 0 && (
        <div className={animeStyles.actions}>
          {resume ? (
            <PillButton data-tv-autofocus="" onClick={() => navigate(mangaReaderPath(manga.id, resume.id))}>
              Continue {chapterNumber(resume)}
            </PillButton>
          ) : (
            start && (
              <PillButton data-tv-autofocus="" onClick={() => navigate(mangaReaderPath(manga.id, start.id))}>
                Start reading{start.chapter ? ` · ${chapterNumber(start)}` : ''}
              </PillButton>
            )
          )}
          {latest && latest.id !== (resume ?? start)?.id && (
            <PillButton variant="outline" onClick={() => navigate(mangaReaderPath(manga.id, latest.id))}>
              Latest · {chapterNumber(latest)}
            </PillButton>
          )}
        </div>
      )}

      {chapters.isPending ? (
        <>
          <LoadingStatus label="Loading chapters…" />
          <div className={styles.chapterList} aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Block key={i} className={styles.chapterSkeleton} />
            ))}
          </div>
        </>
      ) : chapters.isError ? (
        <ErrorNotice error={chapters.error} onRetry={() => void chapters.refetch()} />
      ) : all.length === 0 ? (
        <EmptyNotice>
          No {LANGUAGE_LABELS[language]} chapters on MangaDex yet.
          {manga.links.length > 0 ? ' Try the official links above.' : ''}
          {language === 'tl' && manga.languages.includes('en') ? ' English chapters are available.' : ''}
        </EmptyNotice>
      ) : (
        <>
          <div className={styles.toolbar}>
            <label className={styles.filter} htmlFor={filterId}>
              <span className="sr-only">Go to chapter number</span>
              <Icon name="search" size="0.95em" />
              <input
                id={filterId}
                type="search"
                inputMode="decimal"
                placeholder="Chapter number"
                value={typed}
                maxLength={10}
                onChange={(event) => {
                  setTyped(event.target.value.replace(/[^\d.]/g, ''));
                  setShown(CHAPTER_STEP);
                }}
              />
            </label>
            <button type="button" className={styles.textButton} onClick={() => setNewestFirst((value) => !value)}>
              {newestFirst ? 'Newest first' : 'Oldest first'} ⇅
            </button>
          </div>

          {visible.length === 0 ? (
            <EmptyNotice>No chapter {typed}.</EmptyNotice>
          ) : (
            <ol className={styles.chapterList}>
              {visible.map((chapter) => (
                <li key={chapter.id}>
                  <a
                    className={styles.chapter}
                    href={chapter.externalUrl ?? mangaReaderPath(manga.id, chapter.id)}
                    onClick={open(chapter)}
                    aria-current={chapter.id === reading?.chapterId ? 'true' : undefined}
                    {...(chapter.externalUrl ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
                  >
                    <span className={styles.chapterTitle}>
                      {chapterLabel(chapter)}
                      {chapter.externalUrl && <span className={styles.official}> · Official site ↗</span>}
                    </span>
                    <span className={styles.chapterMeta}>
                      {[chapter.groups.join(', ') || 'No group', formatDate(chapter.publishedAt)].filter(Boolean).join(' · ')}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          )}
          {ordered.length > shown && (
            <div className={styles.showMore}>
              <PillButton variant="outline" onClick={() => setShown((value) => value + CHAPTER_STEP)}>
                Show more ({ordered.length - shown} left)
              </PillButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

function formatDate(iso: string): string {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? dateFormat.format(time) : '';
}
