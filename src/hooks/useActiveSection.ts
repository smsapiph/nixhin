import { useEffect, useState } from 'react';
import type { SectionId } from '../types';

/** Home-page sections in document order (the hero has no anchor; above them means "top"). */
const SECTIONS: readonly SectionId[] = ['trending', 'season', 'queue', 'browse', 'schedule'];

/**
 * Scroll spy: reports which home section crosses a line just above the middle of the viewport.
 * Returns 'top' while the hero is in view. Inactive (returns null) when `enabled` is false.
 */
export function useActiveSection(enabled: boolean): SectionId | null {
  const [active, setActive] = useState<SectionId>('top');

  useEffect(() => {
    if (!enabled) return;
    const elements = SECTIONS.map((id) => document.getElementById(id)).filter((el) => el !== null);
    const first = elements[0];
    if (!first) return;

    const crossing = new Set<string>();
    const update = () => {
      const current = SECTIONS.find((id) => crossing.has(id));
      if (current) setActive(current);
      else if (first.getBoundingClientRect().top > window.innerHeight * 0.4) setActive('top');
    };

    // A 1px-tall band at 40% of the viewport height: whichever section overlaps it is active.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) crossing.add(entry.target.id);
          else crossing.delete(entry.target.id);
        }
        update();
      },
      { rootMargin: '-40% 0px -60% 0px' },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [enabled]);

  return enabled ? active : null;
}

/** The tab that represents a section: the top-of-page carousels all belong to Home. */
export function tabForSection(section: SectionId | null): SectionId | null {
  return section === 'trending' || section === 'season' ? 'top' : section;
}
