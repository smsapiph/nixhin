import type { AnimeRef } from '../../shared/api';
import { ShowCard } from './ShowCard';
import { TitleLines } from './ui';
import styles from './AnimeGrid.module.css';

interface AnimeGridProps<T extends AnimeRef> {
  readonly items: readonly T[];
  readonly onOpen: (id: number) => void;
  readonly subtitle: (item: T) => string;
}

/** A grid of poster cards (anime, movies or TV shows). */
export function AnimeGrid<T extends AnimeRef>({ items, onOpen, subtitle }: AnimeGridProps<T>) {
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
