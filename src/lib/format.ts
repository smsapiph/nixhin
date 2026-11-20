import type { AnimeSummary } from '../../shared/api';

/** "Action · Fantasy" — first two genres, or the media type as a fallback. */
export function genreLine(anime: Pick<AnimeSummary, 'genres' | 'type'>, max = 2): string {
  const genres = anime.genres.slice(0, max);
  return genres.length > 0 ? genres.join(' · ') : (anime.type ?? 'Anime');
}

export function formatScore(score: number | null): string | null {
  return score === null ? null : score.toFixed(1);
}

export function formatEpisodes(episodes: number | null): string {
  if (episodes === null) return 'Ongoing';
  return `${episodes} ${episodes === 1 ? 'episode' : 'episodes'}`;
}

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
export function formatCompact(value: number): string {
  return compact.format(value);
}

const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}
