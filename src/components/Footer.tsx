import { AccentDot } from './ui';
import styles from './Footer.module.css';

const FOOTER_LINKS = ['About', 'Help', 'Request a show', 'Terms', 'Privacy'] as const;

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.about}>
          <div className={styles.brand}>
            <span className={styles.wordmark}>nixhin</span>
            <AccentDot size="0.35em" />
          </div>
          <p className={styles.blurb}>
            Anime, free and quiet. No account needed — your queue stays on this device.
          </p>
          <p className={styles.blurb}>
            Anime data from{' '}
            <a href="https://anilist.co" target="_blank" rel="noopener noreferrer">
              AniList
            </a>
            . Nixhin is not affiliated with AniList.
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
