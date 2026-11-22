import { useEffect, useState } from 'react';
import { TOP_SECTIONS } from '../components/navigation';

/**
 * Scroll spy: reports which of `sections` (home-page anchors, in page order) crosses a line just
 * above the middle of the viewport. Returns 'top' while the hero is in view, null when disabled.
 */
export function useActiveSection(enabled: boolean, sections: readonly string[]): string | null {
  const [active, setActive] = useState('top');
  const key = sections.join(',');

  useEffect(() => {
    if (!enabled) return;
    const ids = key.split(',');
    const elements = ids.map((id) => document.getElementById(id)).filter((el) => el !== null);
    const first = elements[0];
    if (!first) return;

    const crossing = new Set<string>();
    const update = () => {
      const current = ids.find((id) => crossing.has(id));
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
  }, [enabled, key]);

  return enabled ? active : null;
}

/** The tab that represents a section: the rows near the top all belong to Home. */
export function tabForSection(section: string | null): string | null {
  return section !== null && TOP_SECTIONS.has(section) ? 'top' : section;
}
