import { useState, type ReactNode } from 'react';
import styles from './Poster.module.css';
import { imageSrc } from '../lib/images';

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
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src !== null && src !== failedSrc;
  const url = imageSrc(src);
  const classes = [styles.frame, shape !== 'custom' && styles[shape], className].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      {showImage ? (
        <img
          className={styles.image}
          src={url ?? undefined}
          alt=""
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
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
