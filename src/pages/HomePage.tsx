import type { AnimeRef } from '../../shared/api';
import type { QueueItem } from '../lib/queueStorage';
import { Browse } from '../components/home/Browse';
import { ContinueWatching } from '../components/home/ContinueWatching';
import { Hero } from '../components/home/Hero';
import { MyQueue, NewSeason, Trending } from '../components/home/HomeSections';
import { Schedule } from '../components/home/Schedule';
import type { NavigateHandler } from '../components/navigation';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { isTv } from '../lib/tvDevice';
import styles from './HomePage.module.css';

interface HomePageProps {
  readonly queue: readonly QueueItem[];
  readonly isQueued: (id: number) => boolean;
  readonly onToggleQueue: (anime: AnimeRef) => void;
  readonly onOpen: (id: number) => void;
  readonly onNavigate: NavigateHandler;
}

export function HomePage({ queue, isQueued, onToggleQueue, onOpen, onNavigate }: HomePageProps) {
  useDocumentTitle(null);
  return (
    <main id="top" className={styles.page}>
      <Hero showRemoteHint={isTv} isQueued={isQueued} onToggleQueue={onToggleQueue} onOpen={onOpen} />
      <ContinueWatching />
      <Trending onOpen={onOpen} onNavigate={onNavigate} />
      <NewSeason onOpen={onOpen} onNavigate={onNavigate} />
      <MyQueue items={queue} />
      <Browse onOpen={onOpen} />
      <Schedule onOpen={onOpen} />
    </main>
  );
}
