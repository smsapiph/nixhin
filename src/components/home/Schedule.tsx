import { useEffect, useMemo, useRef } from 'react';
import type { AnimeSummary } from '../../../shared/api';
import { useSchedule } from '../../api/queries';
import { WEEKDAYS, toLocalSlot, weekdayIndex } from '../../lib/broadcast';
import { Block, ErrorNotice, LoadingStatus } from '../feedback';
import { Muted } from '../ui';
import { HomeSection, type OpenHandler } from './HomeSections';
import styles from './Schedule.module.css';

const PER_DAY = 6;

interface Slot {
  readonly anime: AnimeSummary;
  readonly time: string;
  readonly minuteOfDay: number;
}

/** Buckets airing shows into the viewer's local weekdays: the most popular few, in airing order. */
function groupByLocalDay(shows: readonly AnimeSummary[]): Slot[][] {
  const days: Slot[][] = WEEKDAYS.map(() => []);
  for (const anime of shows) {
    if (!anime.broadcast) continue;
    const { dayIndex, time, minuteOfDay } = toLocalSlot(anime.broadcast);
    days[dayIndex]?.push({ anime, time, minuteOfDay });
  }
  return days.map((slots) =>
    // sort() on copies rather than toSorted(): toSorted needs iOS 16+.
    [...slots]
      .sort((a, b) => (b.anime.members ?? 0) - (a.anime.members ?? 0))
      .slice(0, PER_DAY)
      .sort((a, b) => a.minuteOfDay - b.minuteOfDay),
  );
}

export function Schedule({ onOpen }: { readonly onOpen: OpenHandler }) {
  const { data, isPending, isError, error, refetch } = useSchedule();
  const days = useMemo(() => (data ? groupByLocalDay(data) : null), [data]);
  const today = weekdayIndex(new Date());
  const scrollerRef = useRef<HTMLDivElement>(null);

  // On narrow screens the week scrolls sideways: start on today rather than Monday.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const todayColumn = scroller?.querySelector<HTMLElement>('[aria-current="date"]');
    if (!scroller || !todayColumn || scroller.scrollWidth <= scroller.clientWidth) return;
    scroller.scrollLeft = todayColumn.offsetLeft;
  }, [days]);

  return (
    <HomeSection
      id="schedule"
      eyebrow="Schedule · 放送予定"
      title="This week’s broadcasts"
      busy={isPending}
      aside={<Muted>Times shown in your time zone · top {PER_DAY} per day</Muted>}
    >
      {isError ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} />
      ) : (
        <div ref={scrollerRef} className={styles.scroller}>
          {isPending && <LoadingStatus label="Loading schedule…" />}
          <ol className={styles.week}>
            {WEEKDAYS.map((day, i) => {
              const isToday = i === today;
              return (
                <li
                  key={day.short}
                  className={styles.day}
                  data-today={isToday || undefined}
                  aria-current={isToday ? 'date' : undefined}
                >
                  <div className={styles.dayHeader}>
                    <span className={styles.dayName}>
                      {day.short} <span className={styles.kanji}>{day.kanji}</span>
                    </span>
                    {isToday && <span className={styles.today}>Today</span>}
                  </div>
                  {days ? (
                    <ul className={styles.slots}>
                      {days[i]?.map(({ anime, time }) => (
                        <li key={anime.id}>
                          <button type="button" className={styles.slot} onClick={() => onOpen(anime.id)}>
                            <span className={styles.time}>{time}</span>
                            <span className={styles.showTitle}>{anime.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className={styles.skeleton} aria-hidden="true">
                      <Block className={styles.skelLine} />
                      <Block className={styles.skelLine} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </HomeSection>
  );
}
