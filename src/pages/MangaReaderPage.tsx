import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent, type ReactNode } from 'react';
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
import { arrowStep, clampPage, swipeStep, tapAction, type ReadingDirection, type Step } from '../lib/readerNav';
import { remoteKey } from '../lib/remoteKeys';
import { createStore } from '../lib/store';
import { isTv } from '../lib/tvDevice';
import { mangaPath, mangaReaderPath } from '../routes';
import styles from './MangaReader.module.css';

interface MangaReaderPageProps {
  readonly mangaId: string;
  readonly chapterId: string;
}

type ReadingMode = 'scroll' | 'paged';

/** Reader settings, kept on this device. */
interface ReaderPrefs {
  /** `scroll`: all pages top to bottom (webtoons). `paged`: one page at a time, swipe or tap to turn. */
  readonly mode: ReadingMode;
  /** Which way pages turn in `paged` mode. */
  readonly direction: ReadingDirection;
  /** Smaller, compressed pages for slow or metered connections. */
  readonly dataSaver: boolean;
}

const readerPrefs = createStore<ReaderPrefs>('nixhin-manga-reader-v1', (raw) => {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    mode: value.mode === 'paged' ? 'paged' : 'scroll',
    direction: value.direction === 'ltr' ? 'ltr' : 'rtl',
    dataSaver: value.dataSaver === true,
  };
});

const updatePrefs = (change: Partial<ReaderPrefs>) => readerPrefs.set((current) => ({ ...current, ...change }));

/** Pages loaded right away in scroll mode; the rest load as they scroll near. */
const EAGER_PAGES = 3;

/**
 * Full screen survives moving to another chapter: the reader page is re-created for each chapter,
 * so the choice is handed over here. Browser full screen is on the whole document for the same reason.
 */
let stayImmersive = false;
/** Readers currently showing full screen (0 or 1; briefly 2 while React re-mounts in development). */
let immersiveReaders = 0;

/** `/manga/:id/read/:chapterId` — one chapter, scrolled or page by page, optionally full screen. */
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

function isFormField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('input, select, textarea, [contenteditable="true"]') !== null;
}

function Chapter({ chapter, manga }: ChapterProps) {
  const list = useMangaChapters(chapter.mangaId, chapter.language);
  const prefs = useStore(readerPrefs);
  const navigate = useNavigate();
  const all = list.data ?? [];
  const { previous, next } = neighbours(all, chapter.id);
  const pages = prefs.dataSaver && chapter.pagesDataSaver.length > 0 ? chapter.pagesDataSaver : chapter.pages;
  const [immersive, setImmersive] = useState(() => stayImmersive);
  // The hand-over is used once (cleared after mount; React may run state initialisers twice).
  useEffect(() => {
    stayImmersive = false;
  }, []);
  const [barVisible, setBarVisible] = useState(true);
  // Kept here, not in the paged viewer: entering or leaving full screen re-creates the viewer.
  const [pageIndex, setPageIndex] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const immersiveRef = useRef(immersive);

  const go = (target: MangaChapter | null) => {
    if (!target) return;
    if (target.externalUrl) {
      window.open(target.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    stayImmersive = immersiveRef.current;
    navigate(mangaReaderPath(chapter.mangaId, target.id));
  };

  const enterImmersive = () => {
    setImmersive(true);
    setBarVisible(true);
    // Not every browser can (iPhone Safari): the reader then just covers the page.
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const exitImmersive = () => {
    setImmersive(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };

  // While full screen: no page scroll behind the reader, focus inside it, and leaving browser full screen
  // (Esc, the system back gesture) closes it too.
  useEffect(() => {
    immersiveRef.current = immersive;
    if (!immersive) return;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    overlayRef.current?.focus({ preventScroll: true });
    let wasFullscreen = document.fullscreenElement !== null;
    const onFullscreenChange = () => {
      if (document.fullscreenElement) wasFullscreen = true;
      else if (wasFullscreen) setImmersive(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    immersiveReaders += 1;
    return () => {
      root.style.overflow = previousOverflow;
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      immersiveReaders -= 1;
      // Leaving the reader (not changing chapter, not a re-mount): leave browser full screen as well.
      window.setTimeout(() => {
        if (immersiveReaders === 0 && !stayImmersive && document.fullscreenElement) {
          void document.exitFullscreen().catch(() => undefined);
        }
      }, 0);
    };
  }, [immersive]);

  // Keys: Esc / the remote's Back closes full screen; in scroll mode ← → change chapter (not on TVs,
  // where the arrows move focus). Paged mode handles its own arrows.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isFormField(event.target)) return;
      const key = remoteKey(event);
      if (immersive && key === 'back') {
        event.preventDefault();
        exitImmersive();
        return;
      }
      if (prefs.mode !== 'scroll' || isTv) return;
      if (key === 'left' && previous) go(previous);
      if (key === 'right' && next) go(next);
    };
    // Capture, so the TV remote's own Back (leave the page) doesn't run first.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
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
      <PillButton variant={where === 'bottom' ? 'primary' : 'outline'} disabled={!next} onClick={() => go(next)}>
        Next ›
      </PillButton>
    </nav>
  );

  const endOfChapter = (
    <div className={styles.endPanel}>
      <p className={styles.endTitle}>{next ? `End of ${chapterNumber(chapter)}` : list.isPending ? '' : 'You are all caught up.'}</p>
      {next && (
        <PillButton onClick={() => go(next)}>
          Next: {chapterNumber(next)}
          {next.externalUrl ? ' (official site ↗)' : ''}
        </PillButton>
      )}
    </div>
  );

  const reading: ReactNode =
    pages.length === 0 ? (
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
    ) : prefs.mode === 'paged' ? (
      <PagedReader
        pages={pages}
        index={Math.min(pageIndex, pages.length)}
        onIndex={setPageIndex}
        direction={prefs.direction}
        immersive={immersive}
        end={endOfChapter}
        onPastEnd={() => go(next)}
        onPastStart={() => go(previous)}
        onToggleBar={() => setBarVisible((value) => !value)}
      />
    ) : (
      <div className={styles.pages}>
        {pages.map((page, index) => (
          <PageView key={page.url} page={page} index={index} count={pages.length} />
        ))}
      </div>
    );

  const settings = (
    <ReaderSettings
      prefs={prefs}
      immersive={immersive}
      onFullscreen={immersive ? exitImmersive : enterImmersive}
      showFullscreen={pages.length > 0}
    />
  );

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {manga && <span className={styles.series}>{manga.title}</span>}
          {chapterLabel(chapter)}
        </h1>
        {credit}
        {settings}
        {nav('top')}
      </header>

      {immersive ? (
        <div
          ref={overlayRef}
          className={`${styles.overlay} ${prefs.mode === 'paged' ? styles.overlayPaged : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={`${manga?.title ?? 'Manga'} ${chapterNumber(chapter)}`}
          tabIndex={-1}
        >
          <div className={`${styles.bar} ${barVisible ? '' : styles.barHidden}`}>
            <button type="button" className={styles.barButton} onClick={exitImmersive} aria-label="Exit full screen">
              <Icon name="close" />
            </button>
            <span className={styles.barTitle}>
              {manga && <span className={styles.barSeries}>{manga.title}</span>}
              {chapterNumber(chapter)}
            </span>
            <button type="button" className={styles.barButton} disabled={!previous} onClick={() => go(previous)} aria-label="Previous chapter">
              ‹
            </button>
            <button type="button" className={styles.barButton} disabled={!next} onClick={() => go(next)} aria-label="Next chapter">
              ›
            </button>
            {settings}
          </div>
          {prefs.mode === 'paged' ? (
            reading
          ) : (
            <>
              {reading}
              {pages.length > 0 && <div className={styles.overlayEnd}>{endOfChapter}</div>}
            </>
          )}
        </div>
      ) : (
        reading
      )}

      <footer className={styles.end}>
        {prefs.mode === 'scroll' && (
          <p className={styles.endTitle}>{next ? `End of ${chapterNumber(chapter)}` : list.isPending ? '' : 'You are all caught up.'}</p>
        )}
        {nav('bottom')}
        {credit}
      </footer>
    </>
  );
}

interface ReaderSettingsProps {
  readonly prefs: ReaderPrefs;
  readonly immersive: boolean;
  readonly showFullscreen: boolean;
  readonly onFullscreen: () => void;
}

/** Reading mode, page direction, data saver and full screen. */
function ReaderSettings({ prefs, immersive, showFullscreen, onFullscreen }: ReaderSettingsProps) {
  return (
    <div className={styles.tools}>
      <div className={styles.segmented} role="group" aria-label="Reading mode">
        <button type="button" aria-pressed={prefs.mode === 'scroll'} onClick={() => updatePrefs({ mode: 'scroll' })}>
          Scroll down
        </button>
        <button type="button" aria-pressed={prefs.mode === 'paged'} onClick={() => updatePrefs({ mode: 'paged' })}>
          Page by page
        </button>
      </div>
      {prefs.mode === 'paged' && (
        <div className={styles.segmented} role="group" aria-label="Page direction">
          <button type="button" aria-pressed={prefs.direction === 'rtl'} onClick={() => updatePrefs({ direction: 'rtl' })}>
            ← Right to left
          </button>
          <button type="button" aria-pressed={prefs.direction === 'ltr'} onClick={() => updatePrefs({ direction: 'ltr' })}>
            Left to right →
          </button>
        </div>
      )}
      <label className={styles.toggle}>
        <input type="checkbox" checked={prefs.dataSaver} onChange={(event) => updatePrefs({ dataSaver: event.target.checked })} />
        Data saver
      </label>
      {showFullscreen && !immersive && (
        <button type="button" className={styles.fullscreen} onClick={onFullscreen} data-tv-autofocus="">
          ⛶ Full screen
        </button>
      )}
    </div>
  );
}

interface PagedReaderProps {
  readonly pages: readonly PageImage[];
  /** The page on screen; `pages.length` is the end-of-chapter screen. */
  readonly index: number;
  readonly onIndex: (index: number) => void;
  readonly direction: ReadingDirection;
  readonly immersive: boolean;
  /** Shown after the last page. */
  readonly end: ReactNode;
  readonly onPastEnd: () => void;
  readonly onPastStart: () => void;
  readonly onToggleBar: () => void;
}

/**
 * One page at a time. Swipe, tap the outer thirds of the page, use ← → (or the remote's D-pad) or the
 * buttons to turn; tap the middle to show or hide the full-screen controls. After the last page comes the
 * end-of-chapter screen, and one more turn opens the next chapter.
 */
function PagedReader({ pages, index, onIndex, direction, immersive, end, onPastEnd, onPastStart, onToggleBar }: PagedReaderProps) {
  const count = pages.length;
  const areaRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const turn = (step: Step) => {
    if (step === 0) return;
    if (step === 1 && index >= count) onPastEnd();
    else if (step === -1 && index === 0) onPastStart();
    else onIndex(clampPage(index + step, count));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isFormField(event.target)) return;
      // On TVs the D-pad also moves between controls: only turn pages while the reader itself has focus.
      const area = areaRef.current;
      const focused = document.activeElement;
      const inReader = !focused || focused === document.body || (area !== null && area.contains(focused)) || focused === area?.closest('[role="dialog"]');
      if (isTv && !inReader) return;
      const key = remoteKey(event);
      let step: Step = 0;
      if (key === 'left' || key === 'right') step = arrowStep(key, direction);
      else if (event.key === 'PageDown' || event.key === ' ') step = 1;
      else if (event.key === 'PageUp') step = -1;
      if (step === 0) return;
      // Handled here: keeps the TV remote's focus movement and the page scroll out of it.
      event.preventDefault();
      turn(step);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  });

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointer.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start || (event.target instanceof HTMLElement && event.target.closest('button, a'))) return;
    const swipe = swipeStep(event.clientX - start.x, event.clientY - start.y, direction);
    if (swipe !== null) {
      turn(swipe);
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const action = tapAction((event.clientX - box.left) / box.width, direction);
    if (action === 'menu') onToggleBar();
    else turn(action);
  };

  // The current page plus its neighbours stay mounted, so turning back and forth is instant.
  const window_ = [index - 1, index, index + 1, index + 2].filter((i) => i >= 0 && i < count);
  const nextLabel = direction === 'rtl' ? '‹ Next page' : 'Next page ›';
  const previousLabel = direction === 'rtl' ? 'Previous page ›' : '‹ Previous page';
  const previousButton = (
    <PillButton variant="outline" onClick={() => turn(-1)} disabled={index === 0}>
      {previousLabel}
    </PillButton>
  );
  const nextButton = (
    <PillButton variant="outline" onClick={() => turn(1)}>
      {index >= count ? 'Next chapter' : nextLabel}
    </PillButton>
  );

  return (
    <>
      <div
        ref={areaRef}
        className={`${styles.paged} ${immersive ? styles.pagedImmersive : styles.pagedInline}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (pointer.current = null)}
        tabIndex={isTv ? 0 : undefined}
        aria-roledescription="page viewer"
        aria-label={index < count ? `Page ${index + 1} of ${count}` : 'End of chapter'}
      >
        {window_.map((i) => (
          <PageView key={pages[i]?.url} page={pages[i] as PageImage} index={i} count={count} paged hidden={i !== index} />
        ))}
        {index >= count && end}
        <span className={styles.counter} aria-hidden="true">
          {Math.min(index + 1, count)} / {count}
        </span>
      </div>
      {!immersive && (
        <div className={styles.pageControls}>
          {/* Buttons sit on the side their page turn goes to. */}
          {direction === 'rtl' ? (
            <>
              {nextButton}
              {previousButton}
            </>
          ) : (
            <>
              {previousButton}
              {nextButton}
            </>
          )}
        </div>
      )}
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

interface PageViewProps {
  readonly page: PageImage;
  readonly index: number;
  readonly count: number;
  /** Fit the page inside the paged viewer instead of filling the width. */
  readonly paged?: boolean;
  /** Mounted (so it loads) but not shown: a neighbour in the paged viewer. */
  readonly hidden?: boolean;
}

/**
 * One page image: tries this site's /img/md/ copy, then the MangaDex@Home node, then uploads.mangadex.org, then offers a
 * retry (which starts over with cache-busted addresses). Focusable on TVs in scroll mode so the D-pad scrolls page by page.
 */
function PageView({ page, index, count, paged = false, hidden = false }: PageViewProps) {
  const [attempt, setAttempt] = useState(0);
  const [round, setRound] = useState(0);
  const [state, setState] = useState<PageState>('loading');
  const [proxied, ...rest] = imageCandidates(page.url);
  const candidates = [proxied ?? page.url, page.fallbackUrl, ...rest];
  const base = candidates[attempt] ?? page.url;
  const src = round > 0 ? `${base}${base.includes('?') ? '&' : '?'}retry=${round}` : base;
  const classes = [styles.pageFrame, state === 'loading' && styles.pending, hidden && styles.hiddenPage].filter(Boolean).join(' ');

  return (
    <figure className={classes} tabIndex={isTv && !paged ? 0 : undefined} aria-hidden={hidden || undefined}>
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
          loading={paged || index < EAGER_PAGES ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
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
