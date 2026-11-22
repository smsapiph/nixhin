import { useCallback, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { tabForSection, useActiveSection } from './hooks/useActiveSection';
import { useLayout } from './hooks/useLayout';
import { useQueue } from './hooks/useQueue';
import { addSearch, searchHistoryStore } from './lib/searchHistory';
import { AnimePage } from './pages/AnimePage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SearchPage } from './pages/SearchPage';
import { MAX_QUERY_LENGTH, animePath, homePath, searchPath } from './routes';
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
  const isHome = location.pathname === '/';

  useScrollOnNavigate();

  const navigate = useCallback(
    (section: SectionId) => {
      navigateTo(homePath(section), { state: { smooth: isHome } satisfies ScrollState });
    },
    [navigateTo, isHome],
  );

  const openAnime = useCallback((id: number) => navigateTo(animePath(id)), [navigateTo]);
  const search = useCallback(
    (query: string) => {
      searchHistoryStore.set((list) => addSearch(list, query));
      navigateTo(searchPath(query));
    },
    [navigateTo],
  );

  // Go back when the previous page is ours; otherwise (deep link / refresh) go home.
  const goBack = useCallback(() => {
    if (location.key === 'default') navigateTo(homePath());
    else navigateTo(-1);
  }, [navigateTo, location.key]);

  const activeSection = useActiveSection(layout === 'phone' && isHome);

  return (
    <div className={styles.app}>
      <Header layout={layout} onNavigate={navigate} onSearch={search} />

      <div className={styles.content}>
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                layout={layout}
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
          <Route path="/search" element={<SearchRoute onOpen={openAnime} onBack={goBack} />} />
          <Route path="*" element={<NotFoundPage onHome={() => navigate('top')} />} />
        </Routes>
      </div>

      <Footer />

      {layout === 'phone' && <TabBar active={tabForSection(activeSection)} onNavigate={navigate} />}
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

type SearchRouteProps = Omit<Parameters<typeof SearchPage>[0], 'query'>;

/** `/search?q=…` — an empty query has nothing to show, so go home. */
function SearchRoute(props: SearchRouteProps) {
  const [params] = useSearchParams();
  const query = (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  if (!query) return <Navigate to={homePath()} replace />;
  return <SearchPage key={query} query={query} {...props} />;
}
