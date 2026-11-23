import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import type { MangaChapter, MangaChapterPages, MangaDetail, MangaPage as PageImage } from '../../shared/api';
import { useManga, useMangaChapter, useMangaChapters } from '../api/manga';
import { ErrorNotice, LoadingStatus } from '../components/feedback';
import { Icon } from '../components/Icon';
import { PillButton } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStore } from '../hooks/useStore';
import { imageCandidates } from '../lib/images';
import { LANGUAGE_LABELS, chapterLabel, chapterNumber, neighbours } from '../lib/mangaChapters';
import { mangaProgressStore, recordReading } from '../lib/mangaProgress';
import { createStore } from '../lib/store';
import { isTv } from '../lib/tvDevice';
import { mangaPath, mangaReaderPath } from '../routes';
import styles from './MangaReader.module.css';

interface MangaReaderPageProps {
  readonly mangaId: string;
  readonly chapterId: string;
}

/** Reader settings, kept on this device. */
interface ReaderPrefs {
  /** Smaller, compressed pages for slow or metered connections. */
  readonly dataSaver: boolean;
}

const readerPrefs = createStore<ReaderPrefs>('nixhin-manga-reader-v1', (raw) => ({
  dataSaver: typeof raw === 'object' && raw !== null && (raw as Record<string, unknown>).dataSaver === true,
}));

/** Pages loaded right away; the rest load as they scroll near. */
const EAGER_PAGES = 3;

/** `/manga/:id/read/:chapterId` — one chapter, pages top to bottom. */
export function MangaReaderPage({ mangaId, chapterId }: MangaReaderPageProps) {
  const chapter = useMangaChapter(chapterId);
  const manga = useManga(mangaId);
  const navigate = useNavigate();
  const data = chapter.data;
  useDocumentTitle(data && manga.data ? `${manga.data.title} ${chapterNumber(data)}` : 'Reading');

  // Remember where the reader is ("Continue reading"), once both the chapter and the series are known.
  const title = manga.data?.title;
  const coverUrl = manga.data?.coverUrl ?? null;
  useEffect(() => {
    if (!data || title === undefined || data.mangaId !== mangaId || data.pages.length === 0) return;
    mangaProgressStore.set((list) =>
      recordReading(list, {
        id: mangaId,
        title,
        coverUrl,
        chapterId: data.id,
        chapter: data.chapter,
        language: data.language,
        updatedAt: Date.now(),
      }),
    );
  }, [data, title, coverUrl, mangaId]);

  const back = () => navigate(mangaPath(mangaId, data?.language));

  return (
    <main className={styles.page} aria-busy={chapter.isPending || undefined}>
      <button type="button" className={styles.back} onClick={back}>
        <Icon name="back" />
        {manga.data?.title ?? 'Back to the manga'}
      </button>

      {chapter.isPending ? (
        <>
          <LoadingStatus label="Loading chapter…" />
          <div className={styles.pageSkeleton} aria-hidden="true" />
        </>
      ) : chapter.isError ? (
        <ErrorNotice error={chapter.error} onRetry={() => void chapter.refetch()} />
      ) : (
        <Chapter chapter={chapter.data} manga={manga.data} />
      )}
    </main>
  );
}

interface ChapterProps {
  readonly chapter: MangaChapterPages;
  readonly manga: MangaDetail | undefined;
}

function Chapter({ chapter, manga }: ChapterProps) {
  const list = useMangaChapters(chapter.mangaId, chapter.language);
  const prefs = useStore(readerPrefs);
  const navigate = useNavigate();
  const all = list.data ?? [];
  const { previous, next } = neighbours(all, chapter.id);
  const pages = prefs.dataSaver && chapter.pagesDataSaver.length > 0 ? chapter.pagesDataSaver : chapter.pages;

  const go = (target: MangaChapter | null) => {
    if (!target) return;
    if (target.externalUrl) window.open(target.externalUrl, '_blank', 'noopener,noreferrer');
    else navigate(mangaReaderPath(chapter.mangaId, target.id));
  };

  // Keyboard (not on TVs, where the arrows move focus): ← previous chapter, → next chapter.
  useEffect(() => {
    if (isTv) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, select, textarea, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft' && previous) go(previous);
      if (event.key === 'ArrowRight' && next) go(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const credit = (
    <p className={styles.credit}>
      {LANGUAGE_LABELS[chapter.language]} · Translated by {chapter.groups.join(', ') || 'an unknown group'} · Source:{' '}
      <a href={`https://mangadex.org/chapter/${chapter.id}`} target="_blank" rel="noreferrer noopener">
        MangaDex
      </a>
    </p>
  );

  const nav = (where: 'top' | 'bottom') => (
    <nav className={styles.nav} aria-label={where === 'top' ? 'Chapter' : 'Chapter (end)'}>
      <PillButton variant="outline" disabled={!previous} onClick={() => go(previous)}>
        ‹ Previous
      </PillButton>
      <ChapterSelect chapters={all} currentId={chapter.id} onChoose={go} />
      <PillButton variant={where === 'bottom' ? 'primary' : 'outline'} disabled={!next} onClick={() => go(next)} data-tv-autofocus={where === 'top' ? '' : undefined}>
        Next ›
      </PillButton>
    </nav>
  );

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {manga && <span className={styles.series}>{manga.title}</span>}
          {chapterLabel(chapter)}
        </h1>
        {credit}
        <div className={styles.tools}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={prefs.dataSaver}
              onChange={(event) => readerPrefs.set({ dataSaver: event.target.checked })}
            />
            Data saver
          </label>
        </div>
        {nav('top')}
      </header>

      {pages.length === 0 ? (
        <div className={styles.external}>
          {chapter.externalUrl ? (
            <>
              <p>This chapter is published on an official site, free to read there.</p>
              <a className={styles.externalButton} href={chapter.externalUrl} target="_blank" rel="noreferrer noopener">
                Read on the official site ↗
              </a>
            </>
          ) : (
            <p>This chapter has no pages on MangaDex.</p>
          )}
        </div>
      ) : (
        <div className={styles.pages}>
          {pages.map((page, index) => (
            <PageView key={page.url} page={page} index={index} count={pages.length} />
          ))}
        </div>
      )}

      <footer className={styles.end}>
        <p className={styles.endTitle}>{next ? `End of ${chapterNumber(chapter)}` : list.isPending ? '' : 'You are all caught up.'}</p>
        {nav('bottom')}
        {credit}
      </footer>
    </>
  );
}

interface ChapterSelectProps {
  readonly chapters: readonly MangaChapter[];
  readonly currentId: string;
  readonly onChoose: (chapter: MangaChapter) => void;
}

/** Jump to any chapter. One entry per chapter number (the first upload), plus the current one. */
function ChapterSelect({ chapters, currentId, onChoose }: ChapterSelectProps) {
  if (chapters.length === 0) return null;
  const seen = new Set<string>();
  const options = chapters.filter((chapter) => {
    const key = chapter.chapter ?? chapter.id;
    if (chapter.id === currentId) {
      seen.add(key);
      return true;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const byId = new Map(options.map((chapter) => [chapter.id, chapter]));
  const choose = (event: ChangeEvent<HTMLSelectElement>) => {
    const chapter = byId.get(event.target.value);
    if (chapter) onChoose(chapter);
  };
  return (
    <label className={styles.select}>
      <span className="sr-only">Go to chapter</span>
      <select value={byId.has(currentId) ? currentId : ''} onChange={choose}>
        {!byId.has(currentId) && <option value="">Chapter…</option>}
        {options.map((chapter) => (
          <option key={chapter.id} value={chapter.id}>
            {chapterNumber(chapter, true)}
            {chapter.externalUrl ? ' (official site)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

type PageState = 'loading' | 'loaded' | 'failed';

/**
 * One page image: tries this site's /img/md/ copy, then the MangaDex@Home node, then uploads.mangadex.org, then offers a
 * retry (which starts over with cache-busted addresses). Focusable on TVs so the D-pad scrolls page by page.
 */
function PageView({ page, index, count }: { readonly page: PageImage; readonly index: number; readonly count: number }) {
  const [attempt, setAttempt] = useState(0);
  const [round, setRound] = useState(0);
  const [state, setState] = useState<PageState>('loading');
  const [proxied, ...rest] = imageCandidates(page.url);
  const candidates = [proxied ?? page.url, page.fallbackUrl, ...rest];
  const base = candidates[attempt] ?? page.url;
  const src = round > 0 ? `${base}${base.includes('?') ? '&' : '?'}retry=${round}` : base;

  return (
    <figure className={`${styles.pageFrame} ${state === 'loading' ? styles.pending : ''}`} tabIndex={isTv ? 0 : undefined}>
      {state === 'failed' ? (
        <div className={styles.failed}>
          <p>Page {index + 1} did not load.</p>
          <button
            type="button"
            className={styles.retry}
            onClick={() => {
              setState('loading');
              setAttempt(0);
              setRound((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <img
          key={src}
          className={styles.image}
          src={src}
          alt={`Page ${index + 1} of ${count}`}
          loading={index < EAGER_PAGES ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setState('loaded')}
          onError={() => {
            if (attempt + 1 < candidates.length) setAttempt(attempt + 1);
            else setState('failed');
          }}
        />
      )}
    </figure>
  );
}
