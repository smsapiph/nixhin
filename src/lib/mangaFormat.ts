import type { MangaSummary } from '../../shared/api';

/** Card subtitle: year and first genre, or the status. */
export function mangaSubtitle(manga: MangaSummary): string {
  const parts = [manga.year, manga.tags[0]].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : (STATUS_LABELS[manga.status ?? ''] ?? 'Manga');
}

export const STATUS_LABELS: Readonly<Record<string, string>> = {
  ongoing: 'Ongoing',
  completed: 'Completed',
  hiatus: 'On hiatus',
  cancelled: 'Cancelled',
};

/** Pages of an infinite query, de-duplicated (MangaDex lists can shift between pages). */
export function flattenPages(pages: readonly { readonly items: readonly MangaSummary[] }[] | undefined): MangaSummary[] {
  const seen = new Set<string>();
  const items: MangaSummary[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
  }
  return items;
}
