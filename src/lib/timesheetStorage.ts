import {
  createDefaultAppData,
  createDefaultSettings,
  createEmptyMonth,
  type AppData,
  type BillingEntry,
  type Category,
  type DayEntry,
  type MonthData,
  type MonthKey,
  type Task,
  type TimesheetSettings,
  DEFAULT_CATEGORIES,
} from "@/types/timesheet";

export const STORAGE_KEY = "tidsrapport-v2";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sanitizeSettings(raw: unknown): TimesheetSettings {
  const d = createDefaultSettings();
  if (!isObject(raw)) return d;
  return {
    name: typeof raw.name === "string" ? raw.name : d.name,
    project: typeof raw.project === "string" ? raw.project : d.project,
    employmentPercent:
      typeof raw.employmentPercent === "number"
        ? raw.employmentPercent
        : d.employmentPercent,
    manualIncomingFlexMinutes:
      typeof raw.manualIncomingFlexMinutes === "number"
        ? raw.manualIncomingFlexMinutes
        : null,
  };
}

function sanitizeTask(raw: unknown, i: number): Task | null {
  if (!isObject(raw)) return null;
  return {
    id: typeof raw.id === "string" ? raw.id : `task-${i}`,
    togglId: typeof raw.togglId === "string" ? raw.togglId : undefined,
    category: typeof raw.category === "string" ? raw.category : "",
    categoryColor:
      typeof raw.categoryColor === "string" ? raw.categoryColor : undefined,
    description: typeof raw.description === "string" ? raw.description : "",
    minutes: typeof raw.minutes === "number" ? raw.minutes : 0,
    billSeparately: !!raw.billSeparately,
    billed: !!raw.billed,
  };
}

function sanitizeBillingEntry(raw: unknown, i: number): BillingEntry | null {
  if (!isObject(raw)) return null;
  return {
    id: typeof raw.id === "string" ? raw.id : `bill-${i}`,
    togglId: typeof raw.togglId === "string" ? raw.togglId : undefined,
    date: typeof raw.date === "string" ? raw.date : "",
    customerProject:
      typeof raw.customerProject === "string" ? raw.customerProject : "",
    description: typeof raw.description === "string" ? raw.description : "",
    minutes: typeof raw.minutes === "number" ? raw.minutes : 0,
    rate: typeof raw.rate === "number" ? raw.rate : undefined,
    amount: typeof raw.amount === "number" ? raw.amount : undefined,
    includeInFlex: raw.includeInFlex === true,
    invoiced: !!raw.invoiced,
    invoicedDate:
      typeof raw.invoicedDate === "string" ? raw.invoicedDate : undefined,
    invoiceNumber:
      typeof raw.invoiceNumber === "string" ? raw.invoiceNumber : undefined,
  };
}

function sanitizeDay(date: string, raw: unknown): DayEntry | null {
  if (!isObject(raw)) return null;
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks
        .map((t, i) => sanitizeTask(t, i))
        .filter((t): t is Task => !!t)
    : [];
  return {
    date: typeof raw.date === "string" ? raw.date : date,
    isDayOff: !!raw.isDayOff,
    tasks,
  };
}

function sanitizeMonth(key: MonthKey, raw: unknown): MonthData {
  if (!isObject(raw)) return createEmptyMonth(key);
  const days: Record<string, DayEntry> = {};
  if (isObject(raw.days)) {
    for (const [d, v] of Object.entries(raw.days)) {
      const day = sanitizeDay(d, v);
      if (day) days[d] = day;
    }
  }
  return {
    monthKey: typeof raw.monthKey === "string" ? raw.monthKey : key,
    settings: sanitizeSettings(raw.settings),
    days,
  };
}

export function sanitizeAppData(raw: unknown): AppData {
  const defaults = createDefaultAppData();
  if (!isObject(raw)) return defaults;

  const categories: Category[] = Array.isArray(raw.categories)
    ? raw.categories.filter(isObject).map((c, i) => ({
        id: typeof c.id === "string" ? c.id : `cat-${i}`,
        name: typeof c.name === "string" ? c.name : `Kategori ${i + 1}`,
        color: typeof c.color === "string" ? c.color : "#64748b",
      }))
    : DEFAULT_CATEGORIES.map((c) => ({ ...c }));

  const months: Record<MonthKey, MonthData> = {};
  if (isObject(raw.months)) {
    for (const [k, v] of Object.entries(raw.months)) {
      months[k] = sanitizeMonth(k, v);
    }
  }

  const billingEntries: BillingEntry[] = Array.isArray(raw.billingEntries)
    ? raw.billingEntries
        .map((e, i) => sanitizeBillingEntry(e, i))
        .filter((e): e is BillingEntry => !!e)
    : [];

  return {
    defaults: sanitizeSettings(raw.defaults),
    months,
    categories,
    billingEntries,
  };
}

export function loadAppData(): AppData {
  if (typeof window === "undefined") return createDefaultAppData();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultAppData();
    return sanitizeAppData(JSON.parse(raw));
  } catch {
    return createDefaultAppData();
  }
}

export function saveAppData(data: AppData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota
  }
}

export function exportBackupJson(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tidsrapport-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBackupJson(file: File): Promise<AppData> {
  const text = await file.text();
  return sanitizeAppData(JSON.parse(text));
}
