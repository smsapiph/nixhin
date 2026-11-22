import { AccentDot } from './ui';
import styles from './Footer.module.css';

const FOOTER_LINKS = ['About', 'Help', 'Request a show', 'Terms', 'Privacy'] as const;

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
            {showTmdb ? 'Anime, movies and TV, free and quiet.' : 'Anime, free and quiet.'} No account needed — your queue
            stays on this device.
          </p>

        </div>
        <nav aria-label="Footer" className={styles.links}>
          {FOOTER_LINKS.map((label) => (
            // Placeholder destinations until these pages exist.
            <a key={label} href="/" className={styles.link}>
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
