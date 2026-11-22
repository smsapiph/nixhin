import { MAX_QUERY_LENGTH } from '../routes';
import { createStore, parseShortText } from './store';

const STORAGE_KEY = 'nixhin-searches-v1';
export const MAX_SEARCHES = 10;

const normalize = (query: string) => query.trim().toLocaleLowerCase();

export function parseSearchesValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const entry of value) {
    const text = parseShortText(entry, MAX_QUERY_LENGTH);
    if (text === undefined || seen.has(normalize(text))) continue;
    seen.add(normalize(text));
    items.push(text);
    if (items.length >= MAX_SEARCHES) break;
  }
  return items;
}

export const searchHistoryStore = createStore<readonly string[]>(STORAGE_KEY, parseSearchesValue);

/** Puts a query at the front, dropping case-insensitive duplicates. */
export function addSearch(list: readonly string[], query: string): string[] {
  const text = query.trim();
  if (!text) return [...list];
  return [text, ...list.filter((item) => normalize(item) !== normalize(text))].slice(0, MAX_SEARCHES);
}

export function removeSearch(list: readonly string[], query: string): string[] {
  return list.filter((item) => item !== query);
}

/** Recent searches that start with (or contain) what's typed so far. */
export function matchSearches(list: readonly string[], typed: string): readonly string[] {
  const needle = normalize(typed);
  if (!needle) return list;
  return list.filter((item) => normalize(item) !== needle && normalize(item).includes(needle));
}
