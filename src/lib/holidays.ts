/**
 * Exact local Swedish holiday / red-day calculator for any year.
 * No external APIs. Easter via Meeus/Jones/Butcher anonymous Gregorian algorithm.
 */

export interface HolidayInfo {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  /** Red day (helgdag) */
  isRedDay: boolean;
  /** Work-free eve with 0 expected hours (midsommarafton, julafton, nyårsafton) */
  isWorkFreeEve: boolean;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseDateKey(date: string): {
  year: number;
  month: number;
  day: number;
} {
  const [y, m, d] = date.split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** Meeus/Jones/Butcher anonymous Gregorian algorithm → Easter Sunday */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addDays(
  year: number,
  month: number,
  day: number,
  delta: number
): { year: number; month: number; day: number } {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

function dateFromParts(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** ISO-8601 week number (1–53) */
export function getISOWeek(date: string | Date): number {
  const d =
    typeof date === "string"
      ? (() => {
          const { year, month, day } = parseDateKey(date);
          return dateFromParts(year, month, day);
        })()
      : new Date(
          Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
        );

  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
}

/** ISO week-year (may differ from calendar year near Jan/Dec) */
export function getISOWeekYear(date: string): number {
  const { year, month, day } = parseDateKey(date);
  const d = dateFromParts(year, month, day);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

/** 0 = Sunday … 6 = Saturday */
export function getWeekday(date: string): number {
  const { year, month, day } = parseDateKey(date);
  return dateFromParts(year, month, day).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const wd = getWeekday(date);
  return wd === 0 || wd === 6;
}

export const WEEKDAY_NAMES_SV = [
  "söndag",
  "måndag",
  "tisdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lördag",
] as const;

export const WEEKDAY_SHORT_SV = [
  "sön",
  "mån",
  "tis",
  "ons",
  "tor",
  "fre",
  "lör",
] as const;

/** Midsummer Day = Saturday between June 20–26 */
function midsummerDay(year: number): { month: number; day: number } {
  for (let day = 20; day <= 26; day++) {
    const d = dateFromParts(year, 6, day);
    if (d.getUTCDay() === 6) return { month: 6, day };
  }
  return { month: 6, day: 20 };
}

/** All Saints' Day = Saturday between Oct 31 – Nov 6 */
function allSaintsDay(year: number): { month: number; day: number } {
  const oct31 = dateFromParts(year, 10, 31);
  if (oct31.getUTCDay() === 6) return { month: 10, day: 31 };
  for (let day = 1; day <= 6; day++) {
    const d = dateFromParts(year, 11, day);
    if (d.getUTCDay() === 6) return { month: 11, day };
  }
  return { month: 11, day: 1 };
}

/** All Swedish holidays / work-free eves for a year, keyed by YYYY-MM-DD */
export function getSwedishHolidays(
  year: number
): Record<string, HolidayInfo> {
  const map: Record<string, HolidayInfo> = {};

  const add = (
    y: number,
    m: number,
    d: number,
    name: string,
    isRedDay: boolean,
    isWorkFreeEve: boolean
  ) => {
    const date = toDateKey(y, m, d);
    map[date] = { date, name, isRedDay, isWorkFreeEve };
  };

  // Fixed red days
  add(year, 1, 1, "Nyårsdagen", true, false);
  add(year, 1, 6, "Trettondedag jul", true, false);
  add(year, 5, 1, "Första maj", true, false);
  add(year, 6, 6, "Nationaldagen", true, false);
  add(year, 12, 25, "Juldagen", true, false);
  add(year, 12, 26, "Annandag jul", true, false);

  // Work-free eves (0 expected hours)
  add(year, 12, 24, "Julafton", false, true);
  add(year, 12, 31, "Nyårsafton", false, true);

  // Movable via Easter
  const easter = easterSunday(year);
  const goodFriday = addDays(year, easter.month, easter.day, -2);
  const easterMonday = addDays(year, easter.month, easter.day, 1);
  const ascension = addDays(year, easter.month, easter.day, 39);
  const pentecost = addDays(year, easter.month, easter.day, 49);

  add(
    goodFriday.year,
    goodFriday.month,
    goodFriday.day,
    "Långfredagen",
    true,
    false
  );
  add(year, easter.month, easter.day, "Påskdagen", true, false);
  add(
    easterMonday.year,
    easterMonday.month,
    easterMonday.day,
    "Annandag påsk",
    true,
    false
  );
  add(
    ascension.year,
    ascension.month,
    ascension.day,
    "Kristi himmelsfärdsdag",
    true,
    false
  );
  add(
    pentecost.year,
    pentecost.month,
    pentecost.day,
    "Pingstdagen",
    true,
    false
  );

  const ms = midsummerDay(year);
  const msEve = addDays(year, ms.month, ms.day, -1);
  add(
    msEve.year,
    msEve.month,
    msEve.day,
    "Midsommarafton",
    false,
    true
  );
  add(year, ms.month, ms.day, "Midsommardagen", true, false);

  const as = allSaintsDay(year);
  add(year, as.month, as.day, "Alla helgons dag", true, false);

  return map;
}

const holidayCache = new Map<number, Record<string, HolidayInfo>>();

export function getHoliday(date: string): HolidayInfo | null {
  const { year } = parseDateKey(date);
  let map = holidayCache.get(year);
  if (!map) {
    map = getSwedishHolidays(year);
    holidayCache.set(year, map);
  }
  return map[date] ?? null;
}

export function isNonWorkingHoliday(date: string): boolean {
  const h = getHoliday(date);
  return !!h && (h.isRedDay || h.isWorkFreeEve);
}

/**
 * Ordinary workday for expected-hours:
 * Mon–Fri, not red day, not work-free eve, not manually off.
 */
export function isExpectedWorkday(
  date: string,
  isManualOff: boolean
): boolean {
  if (isManualOff) return false;
  if (isWeekend(date)) return false;
  if (isNonWorkingHoliday(date)) return false;
  return true;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function eachDateInMonth(year: number, month: number): string[] {
  const n = daysInMonth(year, month);
  const out: string[] = [];
  for (let d = 1; d <= n; d++) out.push(toDateKey(year, month, d));
  return out;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

export function previousMonthKey(key: string): string {
  const { year, month } = parseMonthKey(key);
  if (month === 1) return monthKey(year - 1, 12);
  return monthKey(year, month - 1);
}

export function nextMonthKey(key: string): string {
  const { year, month } = parseMonthKey(key);
  if (month === 12) return monthKey(year + 1, 1);
  return monthKey(year, month + 1);
}

export function formatMonthLabelSv(year: number, month: number): string {
  const names = [
    "januari",
    "februari",
    "mars",
    "april",
    "maj",
    "juni",
    "juli",
    "augusti",
    "september",
    "oktober",
    "november",
    "december",
  ];
  return `${names[month - 1]} ${year}`;
}

/** Count Mon–Fri excluding holidays/eves and optional per-day off map */
export function countWorkdaysInMonth(
  year: number,
  month: number,
  dayOff?: Record<string, boolean>
): number {
  let n = 0;
  for (const date of eachDateInMonth(year, month)) {
    if (isExpectedWorkday(date, !!dayOff?.[date])) n++;
  }
  return n;
}
