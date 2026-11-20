import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Eyebrow, PillButton } from '../components/ui';
import styles from './SearchPage.module.css';

export function NotFoundPage({ onHome }: { readonly onHome: () => void }) {
  useDocumentTitle('Page not found');
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Eyebrow>404 · 見つかりません</Eyebrow>
        <h1 className={styles.title}>This page doesn’t exist</h1>
      </header>
      <p className={styles.notFoundText}>The link may be broken, or the page may have moved.</p>
      <PillButton variant="primary" onClick={onHome}>
        Back to home
      </PillButton>
    </main>
  );
}
