import { useId, useState, type FormEvent, type MouseEvent } from 'react';
import { useLocation } from 'react-router';
import { isWideLayout } from '../hooks/useLayout';
import { MAX_QUERY_LENGTH, homePath, isPlainClick } from '../routes';
import type { Layout, SectionId } from '../types';
import { Icon } from './Icon';
import { NAV_ITEMS, type NavigateHandler } from './navigation';
import { AccentDot } from './ui';
import styles from './Header.module.css';

interface HeaderProps {
  readonly layout: Layout;
  readonly onNavigate: NavigateHandler;
  readonly onSearch: (query: string) => void;
}

export function Header({ layout, onNavigate, onSearch }: HeaderProps) {
  const wide = isWideLayout(layout);
  const isPhone = layout === 'phone';
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuId = useId();
  const searchId = useId();
  const location = useLocation();
  // Keep the box in sync with /search?q=… (e.g. after a refresh or back/forward).
  const currentQuery = location.pathname === '/search' ? (new URLSearchParams(location.search).get('q') ?? '') : '';

  // Collapsible panels only exist in narrow layouts.
  const showMenu = !wide && menuOpen;
  const showSearchPanel = isPhone && searchOpen;

  const go = (section: SectionId) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    setMenuOpen(false);
    onNavigate(section);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    if (!query) return;
    setSearchOpen(false);
    setMenuOpen(false);
    onSearch(query.slice(0, MAX_QUERY_LENGTH));
  };

  const searchForm = (
    <form role="search" className={styles.search} onSubmit={submitSearch}>
      <Icon name="search" />
      <label className="sr-only" htmlFor={searchId}>
        Search anime
      </label>
      <input
        key={currentQuery}
        defaultValue={currentQuery}
        id={searchId}
        name="q"
        type="search"
        placeholder="Search anime"
        maxLength={MAX_QUERY_LENGTH}
        autoComplete="off"
        enterKeyHint="search"
        // Focus the field as soon as the phone search panel opens.
        autoFocus={isPhone}
        className={styles.searchInput}
      />
    </form>
  );

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <a href={homePath()} className={styles.brand} aria-label="Nixhin home" onClick={go('top')}>
          <span className={styles.wordmark}>nixhin</span>
          <AccentDot />
          <span className={styles.kana} aria-hidden="true">
            ニクシン
          </span>
        </a>

        {wide && (
          <nav aria-label="Main" className={styles.nav}>
            {NAV_ITEMS.map((item) => (
              <a key={item.section} href={homePath(item.section)} className={styles.navLink} onClick={go(item.section)}>
                {item.label}
              </a>
            ))}
          </nav>
        )}

        <div className={styles.spacer} />

        {isPhone ? (
          <button
            type="button"
            className={styles.roundButton}
            aria-label={showSearchPanel ? 'Close search' : 'Search'}
            aria-expanded={showSearchPanel}
            onClick={() => {
              setSearchOpen((open) => !open);
              setMenuOpen(false);
            }}
          >
            <Icon name={showSearchPanel ? 'close' : 'search'} />
          </button>
        ) : (
          searchForm
        )}

        {!wide && (
          <button
            type="button"
            className={styles.roundButton}
            aria-label={showMenu ? 'Close menu' : 'Open menu'}
            aria-expanded={showMenu}
            aria-controls={menuId}
            onClick={() => {
              setMenuOpen((open) => !open);
              setSearchOpen(false);
            }}
          >
            <Icon name={showMenu ? 'close' : 'menu'} size="1.15em" />
          </button>
        )}
      </div>

      {showSearchPanel && <div className={styles.panel}>{searchForm}</div>}

      {showMenu && (
        <nav id={menuId} aria-label="Menu" className={styles.menu}>
          {NAV_ITEMS.map((item) => (
            <a key={item.section} href={homePath(item.section)} className={styles.menuLink} onClick={go(item.section)}>
              {item.menuLabel ?? item.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
