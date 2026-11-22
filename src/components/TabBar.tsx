import { isPlainClick } from '../routes';
import { Icon } from './Icon';
import type { Tab } from './navigation';
import styles from './TabBar.module.css';

interface TabBarProps {
  readonly tabs: readonly Tab[];
  /** Section of the highlighted tab, or null when none applies (e.g. on the watch page). */
  readonly active: string | null;
  readonly onLink: (href: string) => void;
}

/** Bottom navigation shown on phones only. */
export function TabBar({ tabs, active, onLink }: TabBarProps) {
  return (
    <nav aria-label="Tabs" className={styles.bar}>
      {tabs.map((tab) => {
        const isActive = tab.section === active;
        return (
          <a
            key={tab.href}
            href={tab.href}
            className={styles.tab}
            aria-current={isActive ? 'page' : undefined}
            onClick={(event) => {
              if (!isPlainClick(event)) return;
              event.preventDefault();
              onLink(tab.href);
            }}
          >
            <span className={styles.icon}>
              <Icon name={tab.icon} size="1.45em" />
            </span>
            <span className={styles.label}>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
