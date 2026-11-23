import { useState, type ReactNode } from 'react';
import styles from './Poster.module.css';
import { imageCandidates } from '../lib/images';

type Shape = 'poster' | 'wide' | 'custom';

interface PosterProps {
  readonly src: string | null;
  /** Used for the fallback tile when there is no image. */
  readonly title: string;
  /** `poster` = 2:3, `wide` = 16:9, `custom` = aspect ratio supplied via className. */
  readonly shape?: Shape;
  /** Load eagerly (above-the-fold images). */
  readonly priority?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

/**
 * Rounded image frame with lazy loading and a graceful fallback.
 * The image is decorative (alt=""): cards always show the title as text next to it.
 */
export function Poster({ src, title, shape = 'poster', priority = false, className, children }: PosterProps) {
  // How many addresses of `src` have failed (MangaDex images have a second route); reset when `src` changes.
  const [failed, setFailed] = useState<{ readonly src: string | null; readonly count: number }>({ src: null, count: 0 });
  const failures = failed.src === src ? failed.count : 0;
  const candidates = src === null ? [] : imageCandidates(src);
  const url = candidates[failures] ?? null;
  const showImage = url !== null;
  const classes = [styles.frame, shape !== 'custom' && styles[shape], className].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      {showImage ? (
        <img
          className={styles.image}
          key={url}
          src={url}
          alt=""
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed({ src, count: failures + 1 })}
        />
      ) : (
        <span className={styles.fallback} aria-hidden="true">
          {title.slice(0, 1)}
        </span>
      )}
      {children}
    </span>
  );
}
