import type { AnimeSummary } from '../../shared/api';
import { ShowCard } from './ShowCard';
import { TitleLines } from './ui';
import styles from './AnimeGrid.module.css';

interface AnimeGridProps {
  readonly items: readonly AnimeSummary[];
  readonly onOpen: (id: number) => void;
  readonly subtitle: (anime: AnimeSummary) => string;
}

export function AnimeGrid({ items, onOpen, subtitle }: AnimeGridProps) {
  return (
    <div className={styles.grid}>
      {items.map((anime) => (
        <ShowCard key={anime.id} anime={anime} onOpen={onOpen} layout="grid">
          <TitleLines title={anime.title} subtitle={subtitle(anime)} />
        </ShowCard>
      ))}
    </div>
  );
}
