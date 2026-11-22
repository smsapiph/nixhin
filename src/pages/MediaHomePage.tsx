import { useNavigate } from 'react-router';
import type { MediaKind, MediaSummary } from '../../shared/api';
import { useMovieList, useTvList } from '../api/media';
import { ContinueWatching } from '../components/home/ContinueWatching';
import { MyQueue } from '../components/home/HomeSections';
import { MediaHero } from '../components/media/MediaHero';
import { GenreBrowse, MediaRowSection } from '../components/media/MediaSections';
import { releaseLine } from '../components/media/mediaFormat';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { QueueApi } from '../hooks/useQueue';
import { isTv } from '../lib/tvDevice';
import { mediaPath } from '../routes';
import styles from './HomePage.module.css';

interface MediaHomePageProps {
  readonly kind: MediaKind;
  readonly queue: QueueApi;
}

/** Home of the Movies or TV shows mode (same building blocks as the anime home). */
export function MediaHomePage({ kind, queue }: MediaHomePageProps) {
  useDocumentTitle(kind === 'movie' ? 'Movies' : 'TV shows');
  const navigate = useNavigate();
  const open = (item: MediaSummary) => navigate(mediaPath(item.kind, item.id));
  return (
    <main id="top" className={styles.page}>
      {kind === 'movie' ? <MovieSections onOpen={open} queue={queue} /> : <TvSections onOpen={open} queue={queue} />}
      <MyQueue items={queue.items} />
    </main>
  );
}

interface SectionsProps {
  readonly onOpen: (item: MediaSummary) => void;
  readonly queue: QueueApi;
}

function heroProps(query: ReturnType<typeof useMovieList>, queue: QueueApi, onOpen: (item: MediaSummary) => void) {
  return {
    items: query.data?.items,
    isPending: query.isPending,
    error: query.error,
    onRetry: () => void query.refetch(),
    showRemoteHint: isTv,
    isQueued: (item: MediaSummary) => queue.isQueued(item.id, item.kind),
    onToggleQueue: queue.toggle,
    onOpen,
  };
}

function MovieSections({ onOpen, queue }: SectionsProps) {
  const trending = useMovieList('trending');
  const nowPlaying = useMovieList('now_playing');
  const upcoming = useMovieList('upcoming');
  return (
    <>
      <MediaHero eyebrow="Popular this week · 映画" {...heroProps(trending, queue, onOpen)} />
      <ContinueWatching />
      <MediaRowSection id="popular" eyebrow="Popular · 人気" title="Most watched this week" query={trending} onOpen={onOpen} ranked />
      <MediaRowSection id="now" eyebrow="In cinemas · 上映中" title="Now in cinemas" query={nowPlaying} onOpen={onOpen} />
      <GenreBrowse kind="movie" onOpen={onOpen} />
      <MediaRowSection
        id="upcoming"
        eyebrow="Coming soon · 近日公開"
        title="Coming to cinemas"
        query={upcoming}
        onOpen={onOpen}
        subtitle={releaseLine}
      />
    </>
  );
}

function TvSections({ onOpen, queue }: SectionsProps) {
  const trending = useTvList('trending');
  const onTheAir = useTvList('on_the_air');
  return (
    <>
      <MediaHero eyebrow="Trending · 話題のドラマ" {...heroProps(trending, queue, onOpen)} />
      <ContinueWatching />
      <MediaRowSection id="trending" eyebrow="Trending · 人気" title="Top shows right now" query={trending} onOpen={onOpen} ranked />
      <MediaRowSection id="new" eyebrow="New episodes · 新着" title="New episodes this week" query={onTheAir} onOpen={onOpen} />
      <GenreBrowse kind="tv" onOpen={onOpen} />
    </>
  );
}
