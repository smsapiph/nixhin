import { useId, useState, type FormEvent, type MouseEvent } from 'react';
import { useLocation } from 'react-router';
import { isWideLayout } from '../hooks/useLayout';
import { useStore } from '../hooks/useStore';
import { matchSearches, removeSearch, searchHistoryStore } from '../lib/searchHistory';
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
  const [typed, setTyped] = useState(currentQuery);
  const [syncedQuery, setSyncedQuery] = useState(currentQuery);
  if (syncedQuery !== currentQuery) {
    setSyncedQuery(currentQuery);
    setTyped(currentQuery);
  }
  const history = useStore(searchHistoryStore);
  const [suggesting, setSuggesting] = useState(false);
  const suggestions = suggesting ? matchSearches(history, typed) : [];
  const suggestionsId = useId();

  // Collapsible panels only exist in narrow layouts.
  const showMenu = !wide && menuOpen;
  const showSearchPanel = isPhone && searchOpen;

  const go = (section: SectionId) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    setMenuOpen(false);
    onNavigate(section);
  };

  const runSearch = (raw: string) => {
    const query = raw.trim();
    if (!query) return;
    setSearchOpen(false);
    setMenuOpen(false);
    setSuggesting(false);
    setTyped(query);
    onSearch(query.slice(0, MAX_QUERY_LENGTH));
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch(String(new FormData(event.currentTarget).get('q') ?? ''));
  };

  const searchForm = (
    <form
      role="search"
      className={styles.search}
      onSubmit={submitSearch}
      onFocus={() => setSuggesting(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setSuggesting(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setSuggesting(false);
      }}
    >
      <Icon name="search" />
      <label className="sr-only" htmlFor={searchId}>
        Search anime
      </label>
      <input
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
          setSuggesting(true);
        }}
        aria-controls={suggestions.length > 0 ? suggestionsId : undefined}
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
      {suggestions.length > 0 && (
        <div id={suggestionsId} className={styles.suggestions}>
          <div className={styles.suggestionsHeader}>
            <span>Recent searches</span>
            <button type="button" className={styles.clearHistory} onClick={() => searchHistoryStore.set([])}>
              Clear
            </button>
          </div>
          <ul className={styles.suggestionList}>
            {suggestions.map((item) => (
              <li key={item} className={styles.suggestion}>
                <button type="button" className={styles.suggestionButton} onClick={() => runSearch(item)}>
                  <Icon name="search" size="0.95em" />
                  <span className={styles.suggestionText}>{item}</span>
                </button>
                <button
                  type="button"
                  className={styles.suggestionRemove}
                  aria-label={`Remove “${item}” from recent searches`}
                  onClick={() => searchHistoryStore.set((list) => removeSearch(list, item))}
                >
                  <Icon name="close" size="0.85em" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
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
