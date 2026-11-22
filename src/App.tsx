import { useCallback, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { TvRemote } from './components/tv/TvRemote';
import type { MediaKind, MediaSummary } from '../shared/api';
import { useMediaConfig } from './api/media';
import { HOME_SECTIONS, tabsFor } from './components/navigation';
import { tabForSection, useActiveSection } from './hooks/useActiveSection';
import { useLayout } from './hooks/useLayout';
import { useQueue } from './hooks/useQueue';
import { addSearch, searchHistoryStore } from './lib/searchHistory';
import { isTv } from './lib/tvDevice';
import { AnimePage } from './pages/AnimePage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SearchPage } from './pages/SearchPage';
import { MediaHomePage } from './pages/MediaHomePage';
import { MediaPage } from './pages/MediaPage';
import { MediaSearchPage } from './pages/MediaSearchPage';
import { PersonPage } from './pages/PersonPage';
import { MAX_QUERY_LENGTH, MODE_HOMES, animePath, homePath, mediaPath, modeForPath, searchPath } from './routes';
import type { SectionId } from './types';
import styles from './App.module.css';

/** Navigation state: smooth-scroll only when moving within the page already on screen. */
interface ScrollState {
  readonly smooth?: boolean;
}

function isScrollState(value: unknown): value is ScrollState {
  return typeof value === 'object' && value !== null;
}

/** How long to keep a section pinned while content above it (images, data) is still loading. */
const SETTLE_MS = 3000;

/**
 * Scrolls to a section and keeps it in place while the layout above it settles — on a refresh
 * or deep link the carousels above load after the first scroll and would push it down.
 * Stops as soon as the reader scrolls themselves. Returns a cleanup function.
 */
function scrollToSection(id: string, behavior: ScrollBehavior): () => void {
  const target = document.getElementById(id);
  if (!target) return () => undefined;
  target.scrollIntoView({ behavior, block: 'start' });

  const stop = () => {
    observer.disconnect();
    clearTimeout(timer);
    for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, stop);
  };
  // Re-align (instantly) whenever the page above the section changes size.
  const observer = new ResizeObserver(() => target.scrollIntoView({ behavior: 'instant', block: 'start' }));
  observer.observe(document.body);
  const timer = setTimeout(stop, SETTLE_MS);
  for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, stop, { passive: true, once: true });
  return stop;
}

const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * Scroll handling for client-side navigation:
 * - `/#section` scrolls to that home section;
 * - other new pages start at the top;
 * - back/forward (POP) keeps the browser's own scroll restoration.
 */
function useScrollOnNavigate() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    const behavior: ScrollBehavior = isScrollState(location.state) && location.state.smooth ? 'smooth' : 'instant';
    const section = location.hash.slice(1);
    if (section) {
      return scrollToSection(section, behavior);
    } else if (navigationType !== 'POP') {
      window.scrollTo({ top: 0, behavior });
    }
    // location.key changes on every navigation, including repeated taps on the same link.
  }, [location.key, location.hash, location.state, navigationType]);
}

export function App() {
  const layout = useLayout();
  const queue = useQueue();
  const location = useLocation();
  const navigateTo = useNavigate();
  const { data: mediaConfig } = useMediaConfig();
  const mediaEnabled = mediaConfig?.enabled === true;
  // Movies & TV links still work while the config loads; the switch appears once it says yes.
  const mode = modeForPath(location.pathname, location.search);
  const modeHome = MODE_HOMES[mode];
  const isModeHome = location.pathname === modeHome;

  useScrollOnNavigate();

  // Smooth-scroll only within the page already on screen.
  const goTo = useCallback(
    (href: string) => {
      const path = href.split('#')[0] || '/';
      navigateTo(href, { state: { smooth: path === location.pathname } satisfies ScrollState });
    },
    [navigateTo, location.pathname],
  );

  const navigate = useCallback((section: SectionId) => goTo(homePath(section)), [goTo]);

  const openAnime = useCallback((id: number) => navigateTo(animePath(id)), [navigateTo]);
  const openMedia = useCallback((item: MediaSummary) => navigateTo(mediaPath(item.kind, item.id)), [navigateTo]);
  const search = useCallback(
    (query: string) => {
      searchHistoryStore.set((list) => addSearch(list, query));
      navigateTo(searchPath(query, mode));
    },
    [navigateTo, mode],
  );

  // Go back when the previous page is ours; otherwise (deep link / refresh) go to this mode's home.
  const goBack = useCallback(() => {
    if (location.key === 'default') navigateTo(modeHome);
    else navigateTo(-1);
  }, [navigateTo, location.key, modeHome]);

  const activeSection = useActiveSection(layout === 'phone' && isModeHome, HOME_SECTIONS[mode]);

  return (
    <div className={styles.app}>
      <Header layout={layout} mode={mode} showModes={mediaEnabled} onLink={goTo} onSearch={search} />

      <div className={styles.content}>
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                queue={queue.items}
                isQueued={queue.isQueued}
                onToggleQueue={queue.toggle}
                onOpen={openAnime}
                onNavigate={navigate}
              />
            }
          />
          <Route
            path="/anime/:id"
            element={
              <AnimeRoute isQueued={queue.isQueued} onToggleQueue={queue.toggle} onOpen={openAnime} onBack={goBack} />
            }
          />
          <Route path="/movies" element={<MediaHomePage key="movie" kind="movie" queue={queue} />} />
          <Route path="/tv" element={<MediaHomePage key="tv" kind="tv" queue={queue} />} />
          <Route path="/movie/:id" element={<MediaRoute kind="movie" queue={queue} onOpen={openMedia} onBack={goBack} />} />
          <Route path="/tv/:id" element={<MediaRoute kind="tv" queue={queue} onOpen={openMedia} onBack={goBack} />} />
          <Route path="/person/:id" element={<PersonRoute onOpen={openMedia} onBack={goBack} />} />
          <Route path="/search" element={<SearchRoute onOpen={openAnime} onOpenMedia={openMedia} onBack={goBack} />} />
          <Route path="*" element={<NotFoundPage onHome={() => navigate('top')} />} />
        </Routes>
      </div>

      <Footer showTmdb={mediaEnabled} />

      {isTv && <TvRemote isHome={isModeHome} onBack={goBack} />}
      {layout === 'phone' && <TabBar tabs={tabsFor(mode)} active={tabForSection(activeSection)} onLink={goTo} />}
    </div>
  );
}

type AnimeRouteProps = Omit<Parameters<typeof AnimePage>[0], 'id'>;

/** `/anime/:id` — only plain positive integer ids are valid. */
function AnimeRoute(props: AnimeRouteProps) {
  const { id } = useParams();
  if (!id || !/^[1-9]\d{0,8}$/.test(id)) return <NotFoundPage onHome={props.onBack} />;
  // key: a fresh page (state, scroll, queries) per title.
  return <AnimePage key={id} id={Number(id)} {...props} />;
}

interface MediaRouteProps extends Omit<Parameters<typeof MediaPage>[0], 'id'> {
  readonly kind: MediaKind;
}

/** `/movie/:id` and `/tv/:id` — only plain positive integer ids are valid. */
function MediaRoute(props: MediaRouteProps) {
  const { id } = useParams();
  if (!id || !/^[1-9]\d{0,8}$/.test(id)) return <NotFoundPage onHome={props.onBack} />;
  return <MediaPage key={`${props.kind}-${id}`} id={Number(id)} {...props} />;
}

type PersonRouteProps = Omit<Parameters<typeof PersonPage>[0], 'id' | 'from'>;

/** `/person/:id?from=tv` — an actor's or filmmaker's page. */
function PersonRoute(props: PersonRouteProps) {
  const { id } = useParams();
  const [params] = useSearchParams();
  if (!id || !/^[1-9]\d{0,8}$/.test(id)) return <NotFoundPage onHome={props.onBack} />;
  return <PersonPage key={id} id={Number(id)} from={params.get('from') === 'tv' ? 'tv' : 'movie'} {...props} />;
}

interface SearchRouteProps extends Omit<Parameters<typeof SearchPage>[0], 'query'> {
  readonly onOpenMedia: (item: MediaSummary) => void;
}

/** `/search?q=…&type=movie|tv` — an empty query has nothing to show, so go home. */
function SearchRoute({ onOpenMedia, ...props }: SearchRouteProps) {
  const [params] = useSearchParams();
  const query = (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  const type = params.get('type');
  const kind: MediaKind | null = type === 'movie' || type === 'tv' ? type : null;
  if (!query) return <Navigate to={kind ? MODE_HOMES[kind] : homePath()} replace />;
  if (kind) return <MediaSearchPage key={`${kind}-${query}`} kind={kind} query={query} onOpen={onOpenMedia} onBack={props.onBack} />;
  return <SearchPage key={query} query={query} {...props} />;
}
