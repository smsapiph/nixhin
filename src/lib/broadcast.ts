import type { Broadcast } from '../../shared/api';
import { SCHEDULE_DAYS } from '../../shared/api';

export interface WeekdayInfo {
  readonly short: string;
  readonly plural: string;
  readonly kanji: string;
}

/** Monday-first, aligned with SCHEDULE_DAYS. */
export const WEEKDAYS: readonly WeekdayInfo[] = [
  { short: 'Mon', plural: 'Mondays', kanji: '月' },
  { short: 'Tue', plural: 'Tuesdays', kanji: '火' },
  { short: 'Wed', plural: 'Wednesdays', kanji: '水' },
  { short: 'Thu', plural: 'Thursdays', kanji: '木' },
  { short: 'Fri', plural: 'Fridays', kanji: '金' },
  { short: 'Sat', plural: 'Saturdays', kanji: '土' },
  { short: 'Sun', plural: 'Sundays', kanji: '日' },
];

const SHORT_TO_INDEX: Readonly<Record<string, number>> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

/** Japan has no DST, so JST is always UTC+9. */
const JST_OFFSET_HOURS = 9;

/** Monday = 0 … Sunday = 6, in the given time zone (defaults to the viewer's). */
export function weekdayIndex(date: Date, timeZone?: string): number {
  const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(date);
  return SHORT_TO_INDEX[short] ?? 0;
}

export interface LocalSlot {
  /** Monday = 0 … Sunday = 6, in the viewer's time zone. */
  readonly dayIndex: number;
  /** Localised time, e.g. "10:00 PM". */
  readonly time: string;
  /** Minutes after local midnight, for sorting within a day. */
  readonly minuteOfDay: number;
}

interface LocalOptions {
  readonly timeZone?: string;
  readonly locale?: string;
  /** Reference instant; the slot is computed for this week so DST matches today. */
  readonly now?: Date;
}

/**
 * Converts a JST broadcast slot (e.g. Saturday 23:00) into the viewer's local day and time.
 * Non-JST broadcasts are shown as-is.
 */
export function toLocalSlot(broadcast: Broadcast, options: LocalOptions = {}): LocalSlot {
  const { timeZone, locale, now = new Date() } = options;
  const dayOffset = SCHEDULE_DAYS.indexOf(broadcast.day);
  const [hours = 0, minutes = 0] = broadcast.time.split(':').map(Number);

  if (broadcast.timezone !== 'Asia/Tokyo') {
    return { dayIndex: dayOffset, time: broadcast.time, minuteOfDay: hours * 60 + minutes };
  }

  // Monday 00:00 UTC of the current week, then place the JST slot relative to it.
  const mondayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - weekdayIndex(now, 'UTC'));
  const instant = new Date(mondayUtc + ((dayOffset * 24 + hours - JST_OFFSET_HOURS) * 60 + minutes) * 60_000);

  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone })
    .formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    dayIndex: weekdayIndex(instant, timeZone),
    time: new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(instant),
    minuteOfDay: part('hour') * 60 + part('minute'),
  };
}

export function pluralLocalDay(broadcast: Broadcast): string {
  return WEEKDAYS[toLocalSlot(broadcast).dayIndex]?.plural ?? '';
}
