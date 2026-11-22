import type { MediaDetail, MediaKind, MediaSummary } from '../../../shared/api';
import { formatScore } from '../../lib/format';

export const KIND_LABELS: Readonly<Record<MediaKind, string>> = { movie: 'Movie', tv: 'TV show' };

/** "2h 46m", "58m", or null. */
export function runtimeLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** Card subtitle: "★ 8.2 · Sci-fi", or the year and first genre when unrated. */
export function cardLine(item: MediaSummary): string {
  const score = formatScore(item.score);
  const genre = item.genres[0];
  return [score && `★ ${score}`, score ? genre : item.year, score ? null : genre].filter(Boolean).join(' · ') || KIND_LABELS[item.kind];
}

/** Release line for upcoming titles: "Dec 19". */
export function releaseLine(item: MediaSummary): string {
  if (!item.releaseDate) return 'Coming soon';
  const date = new Date(`${item.releaseDate}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

/** Hero meta line: "2024 · Sci-fi · Adventure · 2h 46m · PG-13" (details add runtime and rating). */
export function heroLine(item: MediaSummary | MediaDetail): string {
  const detail = 'runtime' in item ? item : null;
  return [
    item.year,
    ...item.genres.slice(0, 2),
    detail && (item.kind === 'movie' ? runtimeLabel(detail.runtime) : null),
    detail?.rating,
  ]
    .filter(Boolean)
    .join(' · ');
}
