import type { ReactNode } from 'react';
import type { AnimeRef } from '../../shared/api';
import { Poster } from './Poster';
import styles from './ShowCard.module.css';

interface ShowCardProps {
  readonly anime: AnimeRef;
  readonly onOpen: (id: number) => void;
  /** `row` = fixed width for horizontal scrollers; `grid` = fills its grid cell. */
  readonly layout?: 'row' | 'grid';
  /** Content rendered under the poster. Should include the title. */
  readonly children: ReactNode;
}

export function ShowCard({ anime, onOpen, layout = 'row', children }: ShowCardProps) {
  return (
    <button type="button" className={`${styles.card} ${styles[layout]}`} onClick={() => onOpen(anime.id)}>
      <Poster src={anime.imageUrl} title={anime.title} />
      <span className={styles.body}>{children}</span>
    </button>
  );
}
