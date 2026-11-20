/**
 * All times as integer minutes. 100% = 40h/week = 480 min/workday.
 */

import type {
  AppData,
  BillableTaskRow,
  DayEntry,
  MonthData,
  MonthKey,
} from "@/types/timesheet";
import {
  eachDateInMonth,
  isExpectedWorkday,
  parseMonthKey,
  previousMonthKey,
  countWorkdaysInMonth,
} from "./holidays";

export const FULL_DAY_MINUTES = 480;
export const FULL_WEEK_HOURS = 40;

export function expectedDayMinutes(employmentPercent: number): number {
  return Math.round((employmentPercent / 100) * FULL_DAY_MINUTES);
}

export function expectedWeekMinutes(employmentPercent: number): number {
  return Math.round((employmentPercent / 100) * FULL_WEEK_HOURS * 60);
}

export function expectedMonthMinutes(
  year: number,
  month: number,
  employmentPercent: number,
  dayOff?: Record<string, boolean>
): number {
  return countWorkdaysInMonth(year, month, dayOff) * expectedDayMinutes(employmentPercent);
}

/**
 * Format minutes as HH:MM without wrapping past 24h.
 * 4032 → "67:12", -2750 → "-45:50", -192 → "-03:12"
 */
export function formatMinutes(mins: number, showPlus = false): string {
  if (!Number.isFinite(mins)) return "00:00";
  const neg = mins < 0;
  const abs = Math.abs(Math.round(mins));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const body = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  if (neg) return `-${body}`;
  if (showPlus && mins > 0) return `+${body}`;
  return body;
}

/**
 * Parse flexible time input → integer minutes.
 * Accepts: "1:30", "01:30", "1,5" / "1.5" (decimal hours), "45" (minutes),
 * "0800", "+/-" signs. Empty/invalid → null.
 */
export function parseTimeInput(
  raw: string,
  options?: { allowMinutesOnly?: boolean }
): number | null {
  let s = raw.trim().replace(/\s/g, "");
  if (!s) return null;

  let sign = 1;
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  }
  if (!s) return null;

  // Decimal hours: 1,5 or 1.5 → 90 minutes
  if (/^\d+[,.]\d+$/.test(s)) {
    const hours = Number(s.replace(",", "."));
    if (!Number.isFinite(hours)) return null;
    return sign * Math.round(hours * 60);
  }

  // HH:MM or H:MM
  if (s.includes(":")) {
    const [hs, ms] = s.split(":");
    if (hs === undefined || ms === undefined || ms.length === 0) return null;
    const h = Number(hs);
    const m = Number(ms);
    if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
    if (m < 0 || m > 59 || h < 0) return null;
    return sign * (h * 60 + m);
  }

  if (!/^\d+$/.test(s)) return null;

  // Digits only
  // Steg 2 default: bare number = minutes ("45" → 45).
  // Legacy clock (allowMinutesOnly: false): "8" → 08:00, "0800" → 08:00.
  const allowMinutesOnly = options?.allowMinutesOnly ?? true;

  if (allowMinutesOnly) {
    return sign * Number(s);
  }

  if (s.length <= 2) {
    const n = Number(s);
    if (n > 23) return null;
    return sign * n * 60;
  }

  if (s.length === 3) {
    const h = Number(s.slice(0, 1));
    const m = Number(s.slice(1));
    if (m > 59) return null;
    return sign * (h * 60 + m);
  }

  if (s.length === 4) {
    const h = Number(s.slice(0, 2));
    const m = Number(s.slice(2));
    if (m > 59) return null;
    return sign * (h * 60 + m);
  }

  return sign * Number(s);
}

export function newId(prefix = "id"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── New timesheet model (Steg 1 types) ─────────────────────────────────────

export function dayTaskMinutes(day: DayEntry | undefined): number {
  if (!day) return 0;
  return day.tasks.reduce((s, t) => s + (t.minutes || 0), 0);
}

export function dayWorkedMinutes(day: DayEntry | undefined): number {
  return dayTaskMinutes(day);
}

export function dayExpectedMinutes(
  date: string,
  employmentPercent: number,
  isDayOff: boolean
): number {
  if (!isExpectedWorkday(date, isDayOff)) return 0;
  return expectedDayMinutes(employmentPercent);
}

export function dayFlexMinutes(
  date: string,
  day: DayEntry | undefined,
  employmentPercent: number
): number {
  const expected = dayExpectedMinutes(
    date,
    employmentPercent,
    day?.isDayOff ?? false
  );
  return dayWorkedMinutes(day) - expected;
}

/**
 * Arbetad tid som räknas mot flex: dagsuppgifter + BillingEntry där
 * includeInFlex === true. Entry med includeInFlex=false påverkar inte flex.
 */
export function getMonthWorkedMinutes(
  month: MonthData,
  billingEntries: AppData["billingEntries"] = []
): number {
  const { year, month: m } = parseMonthKey(month.monthKey);
  let worked = 0;
  for (const date of eachDateInMonth(year, m)) {
    worked += dayWorkedMinutes(month.days[date]);
  }
  const prefix = month.monthKey; // YYYY-MM
  for (const e of billingEntries) {
    if (!e.includeInFlex) continue;
    if (!e.date.startsWith(prefix)) continue;
    worked += e.minutes || 0;
  }
  return worked;
}

/** Uppgifter (billSeparately) + BillingEntry → Att fakturera */
export function collectBillableTasks(data: AppData): BillableTaskRow[] {
  const rows: BillableTaskRow[] = [];
  for (const [monthKey, month] of Object.entries(data.months)) {
    for (const day of Object.values(month.days)) {
      for (const t of day.tasks) {
        if (!t.billSeparately) continue;
        rows.push({
          taskId: t.id,
          source: "task",
          date: day.date,
          category: t.category || "Övrigt",
          categoryColor: t.categoryColor,
          description: t.description,
          minutes: t.minutes || 0,
          billed: t.billed,
          monthKey,
        });
      }
    }
  }
  for (const e of data.billingEntries) {
    const mk = e.date.slice(0, 7) as MonthKey;
    rows.push({
      taskId: e.id,
      source: "billing",
      date: e.date,
      category: e.customerProject || "Övrigt",
      description: e.description,
      minutes: e.minutes || 0,
      billed: e.invoiced,
      monthKey: mk,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** Summera separat-fakturerade uppgifter per aktivitet/projekt */
export function billableTotalsByActivity(
  rows: BillableTaskRow[]
): { category: string; color?: string; minutes: number; count: number }[] {
  const map = new Map<
    string,
    { category: string; color?: string; minutes: number; count: number }
  >();
  for (const r of rows) {
    const key = r.category || "Övrigt";
    const cur = map.get(key) ?? {
      category: key,
      color: r.categoryColor,
      minutes: 0,
      count: 0,
    };
    cur.minutes += r.minutes;
    cur.count += 1;
    if (!cur.color && r.categoryColor) cur.color = r.categoryColor;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.minutes - a.minutes);
}

export function getMonthExpectedMinutes(month: MonthData): number {
  const { year, month: m } = parseMonthKey(month.monthKey);
  const pct = month.settings.employmentPercent;
  const dayOff: Record<string, boolean> = {};
  for (const [date, day] of Object.entries(month.days)) {
    if (day.isDayOff) dayOff[date] = true;
  }
  return expectedMonthMinutes(year, m, pct, dayOff);
}

/** Månadens flex = arbetat − förväntat (billingEntries optional för includeInFlex) */
export function getMonthFlexMinutes(
  month: MonthData,
  billingEntries: AppData["billingEntries"] = []
): number {
  return (
    getMonthWorkedMinutes(month, billingEntries) -
    getMonthExpectedMinutes(month)
  );
}

/**
 * Ingående flex: manuellt saldo om satt, annars föregående månads Total flex.
 * Ändringar i tidigare månader propagerar automatiskt.
 */
export function resolveIncomingFlex(
  data: AppData,
  key: MonthKey,
  depth = 0
): number {
  if (depth > 120) return 0;

  const month = data.months[key];

  // Per-month manual override wins when not null
  if (month && month.settings.manualIncomingFlexMinutes != null) {
    return month.settings.manualIncomingFlexMinutes;
  }

  const prevKey = previousMonthKey(key);
  const prev = data.months[prevKey];
  if (!prev && !hasAnyMonthDataBefore(data, key)) {
    // No history — use global manual if set, else 0
    return data.defaults.manualIncomingFlexMinutes ?? 0;
  }

  const prevIncoming = resolveIncomingFlex(data, prevKey, depth + 1);
  // Månad som inte finns i lagring bidrar 0 till kedjan (skapas vid första edit)
  const prevMonthFlex = prev
    ? getMonthFlexMinutes(prev, data.billingEntries)
    : 0;
  return prevIncoming + prevMonthFlex;
}

function hasAnyMonthDataBefore(data: AppData, key: MonthKey): boolean {
  return Object.keys(data.months).some((k) => k < key);
}

export function getTotalFlexMinutes(data: AppData, key: MonthKey): number {
  const incoming = resolveIncomingFlex(data, key);
  const month = data.months[key];
  const monthFlex = month
    ? getMonthFlexMinutes(month, data.billingEntries)
    : 0;
  return incoming + monthFlex;
}

export interface MonthFlexSummary {
  monthKey: MonthKey;
  workdays: number;
  expected: number;
  worked: number;
  monthFlex: number;
  incomingFlex: number;
  totalFlex: number;
}

export function summarizeMonth(
  data: AppData,
  key: MonthKey
): MonthFlexSummary {
  const { year, month: m } = parseMonthKey(key);
  const month = data.months[key];
  const pct =
    month?.settings.employmentPercent ?? data.defaults.employmentPercent;
  const dayOff: Record<string, boolean> = {};
  if (month) {
    for (const [date, day] of Object.entries(month.days)) {
      if (day.isDayOff) dayOff[date] = true;
    }
  }
  const workdays = countWorkdaysInMonth(year, m, dayOff);
  const expected = workdays * expectedDayMinutes(pct);
  const worked = month
    ? getMonthWorkedMinutes(month, data.billingEntries)
    : 0;
  const monthFlex = worked - expected;
  const incomingFlex = resolveIncomingFlex(data, key);
  return {
    monthKey: key,
    workdays,
    expected,
    worked,
    monthFlex,
    incomingFlex,
    totalFlex: incomingFlex + monthFlex,
  };
}
