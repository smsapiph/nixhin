import { AccentDot } from './ui';
import styles from './Footer.module.css';

/** `showTmdb`: movies & TV are on, so the blurb mentions them. */
export function Footer({ showTmdb = false }: { readonly showTmdb?: boolean }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.about}>
          <div className={styles.brand}>
            <span className={styles.wordmark}>nixhin</span>
            <AccentDot size="0.35em" />
          </div>
          <p className={styles.blurb}>
            {showTmdb ? 'Anime, movies, TV and manga, free and quiet.' : 'Anime and manga, free and quiet.'} No account
            needed — your queue stays on this device.
          </p>
        </div>
      </div>
    </footer>
  );
}
