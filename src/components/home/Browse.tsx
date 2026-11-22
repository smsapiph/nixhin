import { useId, useState, type ReactNode } from 'react';
import {
  SEARCH_FORMATS,
  SEARCH_MIN_YEAR,
  SEARCH_SEASONS,
  SEARCH_SORTS,
  SEARCH_STATUSES,
  type SearchFormat,
  type SearchSeason,
  type SearchSort,
  type SearchStatus,
} from '../../../shared/api';
import { randomAnime, useAnimeSearch, useGenres, type BrowseFilters } from '../../api/queries';
import { formatEpisodes, genreLine } from '../../lib/format';
import { CardGridSkeleton, ErrorNotice, LoadingStatus, LoadMore } from '../feedback';
import { AnimeGrid } from '../AnimeGrid';
import { HomeSection, type OpenHandler } from './HomeSections';
import styles from './Browse.module.css';

const SEASON_LABELS: Record<SearchSeason, string> = { winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' };
const FORMAT_LABELS: Record<SearchFormat, string> = {
  tv: 'TV',
  tv_short: 'TV short',
  movie: 'Movie',
  ova: 'OVA',
  ona: 'ONA',
  special: 'Special',
};
const STATUS_LABELS: Record<SearchStatus, string> = { airing: 'Airing', finished: 'Finished', upcoming: 'Upcoming' };
const SORT_LABELS: Record<SearchSort, string> = {
  popularity: 'Most popular',
  score: 'Highest rated',
  trending: 'Trending',
  newest: 'Newest',
  title: 'Title A–Z',
};

const YEARS = Array.from(
  { length: new Date().getFullYear() + 1 - SEARCH_MIN_YEAR + 1 },
  (_, i) => new Date().getFullYear() + 1 - i,
);

export function Browse({ onOpen }: { readonly onOpen: OpenHandler }) {
  const [filters, setFilters] = useState<BrowseFilters>({});
  const genres = useGenres();
  const results = useAnimeSearch(filters);
  const items = results.data?.pages.flatMap((page) => page.items) ?? [];
  const hasFilters = Object.values(filters).some((value) => value !== undefined);

  const update = (changes: Partial<BrowseFilters>) => setFilters((current) => ({ ...current, ...changes }));

  return (
    <HomeSection
      id="browse"
      eyebrow="Library · さがす"
      title="Browse the library"
      busy={results.isPending}
      aside={<SurpriseMe filters={filters} onOpen={onOpen} />}
    >
      <div role="group" aria-label="Filter by genre" className={styles.chips}>
        <button
          type="button"
          className={styles.chip}
          aria-pressed={filters.genre === undefined}
          onClick={() => update({ genre: undefined })}
        >
          All
        </button>
        {genres.data?.map(({ name }) => (
          <button
            key={name}
            type="button"
            className={styles.chip}
            aria-pressed={name === filters.genre}
            onClick={() => update({ genre: name })}
          >
            {name}
          </button>
        ))}
      </div>

      <div role="group" aria-label="More filters" className={styles.filters}>
        <Select
          label="Year"
          value={filters.year === undefined ? '' : String(filters.year)}
          onChange={(value) => update({ year: value ? Number(value) : undefined })}
        >
          {YEARS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
        <Select
          label="Season"
          value={filters.season ?? ''}
          onChange={(value) => update({ season: (value || undefined) as SearchSeason | undefined })}
        >
          {SEARCH_SEASONS.map((season) => (
            <option key={season} value={season}>
              {SEASON_LABELS[season]}
            </option>
          ))}
        </Select>
        <Select
          label="Format"
          value={filters.format ?? ''}
          onChange={(value) => update({ format: (value || undefined) as SearchFormat | undefined })}
        >
          {SEARCH_FORMATS.map((format) => (
            <option key={format} value={format}>
              {FORMAT_LABELS[format]}
            </option>
          ))}
        </Select>
        <Select
          label="Status"
          value={filters.status ?? ''}
          onChange={(value) => update({ status: (value || undefined) as SearchStatus | undefined })}
        >
          {SEARCH_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
        <Select
          label="Sort"
          anyLabel={SORT_LABELS.popularity}
          value={filters.sort === 'popularity' ? '' : (filters.sort ?? '')}
          onChange={(value) => update({ sort: (value || undefined) as SearchSort | undefined })}
        >
          {SEARCH_SORTS.filter((sort) => sort !== 'popularity').map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </Select>
        {hasFilters && (
          <button type="button" className={styles.reset} onClick={() => setFilters({})}>
            Clear filters
          </button>
        )}
      </div>

      {results.isPending ? (
        <>
          <LoadingStatus />
          <CardGridSkeleton />
        </>
      ) : results.isError ? (
        <ErrorNotice error={results.error} onRetry={() => void results.refetch()} />
      ) : items.length === 0 ? (
        <p className={styles.empty}>Nothing matches these filters. Try removing one.</p>
      ) : (
        <>
          <AnimeGrid
            items={items}
            onOpen={onOpen}
            subtitle={(anime) =>
              [genreLine(anime), anime.year, formatEpisodes(anime.episodes)].filter(Boolean).join(' · ')
            }
          />
          <LoadMore
            hasMore={results.hasNextPage}
            loading={results.isFetchingNextPage}
            onLoadMore={() => void results.fetchNextPage()}
          />
        </>
      )}
    </HomeSection>
  );
}

interface SelectProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Text of the empty ("no filter") option. */
  readonly anyLabel?: string;
  readonly children: ReactNode;
}

function Select({ label, value, onChange, anyLabel = 'Any', children }: SelectProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <select
        id={id}
        className={styles.select}
        value={value}
        data-active={value !== '' || undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{anyLabel}</option>
        {children}
      </select>
    </div>
  );
}

/** Opens a random title matching the current filters. */
function SurpriseMe({ filters, onOpen }: { readonly filters: BrowseFilters; readonly onOpen: OpenHandler }) {
  const [state, setState] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');

  const pick = async () => {
    setState('loading');
    try {
      const anime = await randomAnime(filters);
      if (anime) {
        setState('idle');
        onOpen(anime.id);
      } else {
        setState('empty');
      }
    } catch {
      setState('error');
    }
  };

  return (
    <div className={styles.surprise}>
      <button type="button" className={styles.surpriseButton} disabled={state === 'loading'} onClick={() => void pick()}>
        <span aria-hidden="true">🎲</span> {state === 'loading' ? 'Picking…' : 'Surprise me'}
      </button>
      <span role="status" className={styles.surpriseStatus}>
        {state === 'empty' ? 'Nothing matches these filters.' : state === 'error' ? 'Couldn’t pick one. Try again.' : ''}
      </span>
    </div>
  );
}
