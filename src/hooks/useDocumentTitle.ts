import { useEffect } from 'react';

const SITE = 'Nixhin';
const DEFAULT_TITLE = 'Nixhin — watch anime free';

/** Sets the tab title for the current page (null = the default site title). */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE}` : DEFAULT_TITLE;
  }, [title]);
}
