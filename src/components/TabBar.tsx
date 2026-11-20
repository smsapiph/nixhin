import { homePath, isPlainClick } from '../routes';
import type { SectionId } from '../types';
import { Icon, type IconName } from './Icon';
import type { NavigateHandler } from './navigation';
import styles from './TabBar.module.css';

interface Tab {
  readonly section: SectionId;
  readonly icon: IconName;
  readonly label: string;
}

const TABS: readonly Tab[] = [
  { section: 'top', icon: 'home', label: 'Home' },
  { section: 'browse', icon: 'grid', label: 'Browse' },
  { section: 'schedule', icon: 'calendar', label: 'Schedule' },
  { section: 'queue', icon: 'bookmark', label: 'My queue' },
];

interface TabBarProps {
  /** Highlighted tab, or null when none applies (e.g. on the watch page). */
  readonly active: SectionId | null;
  readonly onNavigate: NavigateHandler;
}

/** Bottom navigation shown on phones only. */
export function TabBar({ active, onNavigate }: TabBarProps) {
  return (
    <nav aria-label="Tabs" className={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.section === active;
        return (
          <a
            key={tab.section}
            href={homePath(tab.section)}
            className={styles.tab}
            aria-current={isActive ? 'page' : undefined}
            onClick={(event) => {
              if (!isPlainClick(event)) return;
              event.preventDefault();
              onNavigate(tab.section);
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
