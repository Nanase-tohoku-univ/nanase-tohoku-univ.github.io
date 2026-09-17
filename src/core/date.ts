/** Calendar date in local time, formatted YYYY-MM-DD. */
export type YMD = string;

const MS_PER_DAY = 86_400_000;

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toYMD(d: Date): YMD {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseYMD(s: YMD): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`invalid date: ${s}`);
  return { y: +m[1], m: +m[2], d: +m[3] };
}

export function isValidYMD(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseYMD(s);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function dayNumber(s: YMD): number {
  const { y, m, d } = parseYMD(s);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: YMD, to: YMD): number {
  return dayNumber(to) - dayNumber(from);
}

export function addDays(s: YMD, n: number): YMD {
  const { y, m, d } = parseYMD(s);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Local midnight at the start of the given date. */
export function startOfDay(s: YMD): Date {
  const { y, m, d } = parseYMD(s);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

/** Time left until local midnight of `target`, split into d/h/m/s (clamped at zero). */
export function remainingUntil(now: Date, target: YMD): Remaining {
  const totalMs = Math.max(0, startOfDay(target).getTime() - now.getTime());
  const totalSec = Math.floor(totalMs / 1000);
  return {
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
    totalMs,
  };
}

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function formatJa(s: YMD, withWeekday = true): string {
  const { y, m, d } = parseYMD(s);
  const w = WEEKDAYS_JA[new Date(y, m - 1, d).getDay()];
  return withWeekday ? `${y}年${m}月${d}日(${w})` : `${y}年${m}月${d}日`;
}

/**
 * Current time. `?date=YYYY-MM-DD` shifts the calendar date while keeping the
 * real time of day, so any day can be previewed.
 */
export function now(search: string = typeof location !== 'undefined' ? location.search : ''): Date {
  const real = new Date();
  const override = new URLSearchParams(search).get('date');
  if (override && isValidYMD(override)) {
    const { y, m, d } = parseYMD(override);
    return new Date(y, m - 1, d, real.getHours(), real.getMinutes(), real.getSeconds());
  }
  return real;
}
