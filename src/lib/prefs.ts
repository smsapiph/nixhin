import { createStore } from './store';

export interface Prefs {
  /** Audio/subtitle variant last chosen, e.g. "dub". Used when a link doesn't say. */
  readonly language: string | null;
}

const STORAGE_KEY = 'nixhin-prefs-v1';

export function parsePrefsValue(value: unknown): Prefs {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return { language: typeof v.language === 'string' && /^[a-z]{2,10}$/.test(v.language) ? v.language : null };
}

export const prefsStore = createStore<Prefs>(STORAGE_KEY, parsePrefsValue);

export function setPreferredLanguage(language: string): void {
  prefsStore.set((prefs) => (prefs.language === language ? prefs : { ...prefs, language }));
}
