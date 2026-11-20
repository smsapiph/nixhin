import type { AnimeRef } from '../../shared/api';
import { Browse } from '../components/home/Browse';
import { Hero } from '../components/home/Hero';
import { MyQueue, NewSeason, Trending } from '../components/home/HomeSections';
import { Schedule } from '../components/home/Schedule';
import type { NavigateHandler } from '../components/navigation';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Layout } from '../types';
import styles from './HomePage.module.css';

interface HomePageProps {
  readonly layout: Layout;
  readonly queue: readonly AnimeRef[];
  readonly isQueued: (id: number) => boolean;
  readonly onToggleQueue: (anime: AnimeRef) => void;
  readonly onOpen: (id: number) => void;
  readonly onNavigate: NavigateHandler;
}

export function HomePage({ layout, queue, isQueued, onToggleQueue, onOpen, onNavigate }: HomePageProps) {
  useDocumentTitle(null);
  return (
    <main id="top" className={styles.page}>
      <Hero showRemoteHint={layout === 'tv'} isQueued={isQueued} onToggleQueue={onToggleQueue} onOpen={onOpen} />
      <Trending onOpen={onOpen} onNavigate={onNavigate} />
      <NewSeason onOpen={onOpen} onNavigate={onNavigate} />
      <MyQueue items={queue} onOpen={onOpen} />
      <Browse onOpen={onOpen} />
      <Schedule onOpen={onOpen} />
    </main>
  );
}
