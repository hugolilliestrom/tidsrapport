/**
 * Map between Supabase rows (Steg 3 schema) and AppData month slice.
 */
import type {
  AppData,
  BillingEntry,
  DayEntry,
  MonthData,
  MonthKey,
  Task,
  TimesheetSettings,
} from "@/types/timesheet";
import { createEmptyDay, createEmptyMonth } from "@/types/timesheet";

export type MonthRow = {
  month_key: string;
  name: string;
  project: string;
  work_percentage: number;
  manual_carryover_minutes: number | null;
  day_offs: Record<string, boolean> | null;
};

export type TaskRow = {
  id: string;
  month_key: string;
  date: string;
  toggl_id: string | null;
  category: string;
  description: string;
  minutes: number;
  created_at?: string;
};

export type InvoiceRow = {
  id: string;
  month_key: string;
  date: string;
  toggl_id: string | null;
  client: string;
  description: string;
  minutes: number;
  hourly_rate: number | null;
  include_in_flex: boolean;
  invoiced: boolean;
  invoiced_date: string | null;
  invoice_number: string | null;
  created_at?: string;
};

export type MonthPayload = {
  month: MonthRow;
  tasks: TaskRow[];
  invoice_items: InvoiceRow[];
};

export function monthDataToRows(
  key: MonthKey,
  month: MonthData,
  billingEntries: BillingEntry[]
): MonthPayload {
  const day_offs: Record<string, boolean> = {};
  const tasks: TaskRow[] = [];

  for (const [date, day] of Object.entries(month.days)) {
    if (day.isDayOff) day_offs[date] = true;
    for (const t of day.tasks) {
      tasks.push({
        id: t.id,
        month_key: key,
        date,
        toggl_id: t.togglId ?? null,
        category: t.category ?? "",
        description: t.description ?? "",
        minutes: t.minutes ?? 0,
      });
    }
  }

  const invoice_items: InvoiceRow[] = billingEntries
    .filter((e) => e.date.startsWith(key))
    .map((e) => ({
      id: e.id,
      month_key: key,
      date: e.date,
      toggl_id: e.togglId ?? null,
      client: e.customerProject ?? "",
      description: e.description ?? "",
      minutes: e.minutes ?? 0,
      hourly_rate: e.rate ?? null,
      include_in_flex: e.includeInFlex === true,
      invoiced: e.invoiced === true,
      invoiced_date: e.invoicedDate ?? null,
      invoice_number: e.invoiceNumber ?? null,
    }));

  // Mirror billSeparately tasks into invoice_items (stable id)
  for (const [date, day] of Object.entries(month.days)) {
    for (const t of day.tasks) {
      if (!t.billSeparately) continue;
      const invId = `bill-from-${t.id}`;
      if (invoice_items.some((i) => i.id === invId || i.id === t.id)) continue;
      invoice_items.push({
        id: invId,
        month_key: key,
        date,
        toggl_id: t.togglId ?? null,
        client: t.category ?? "",
        description: t.description ?? "",
        minutes: t.minutes ?? 0,
        hourly_rate: null,
        include_in_flex: false,
        invoiced: t.billed === true,
        invoiced_date: null,
        invoice_number: null,
      });
    }
  }

  return {
    month: {
      month_key: key,
      name: month.settings.name,
      project: month.settings.project,
      work_percentage: month.settings.employmentPercent,
      manual_carryover_minutes: month.settings.manualIncomingFlexMinutes,
      day_offs,
    },
    tasks,
    invoice_items,
  };
}

export function rowsToMonthSlice(payload: MonthPayload): {
  month: MonthData;
  billingEntries: BillingEntry[];
} {
  const { month: m, tasks, invoice_items } = payload;
  const settings: TimesheetSettings = {
    name: m.name || "Hugo Lillieström",
    project: m.project || "",
    employmentPercent: m.work_percentage || 40,
    manualIncomingFlexMinutes: m.manual_carryover_minutes,
  };

  const days: Record<string, DayEntry> = {};
  const dayOffs = m.day_offs ?? {};

  for (const [date, off] of Object.entries(dayOffs)) {
    if (!off) continue;
    days[date] = { ...createEmptyDay(date), isDayOff: true };
  }

  for (const t of tasks) {
    const date =
      typeof t.date === "string" ? t.date.slice(0, 10) : String(t.date);
    const base = days[date] ?? createEmptyDay(date);
    const task: Task = {
      id: t.id,
      togglId: t.toggl_id ?? undefined,
      category: t.category ?? "",
      description: t.description ?? "",
      minutes: t.minutes ?? 0,
      billSeparately: false,
      billed: false,
    };
    days[date] = { ...base, date, tasks: [...base.tasks, task] };
  }

  const month: MonthData = {
    monthKey: m.month_key,
    settings,
    days,
  };

  const billingEntries: BillingEntry[] = invoice_items.map((e) => ({
    id: e.id,
    togglId: e.toggl_id ?? undefined,
    date: typeof e.date === "string" ? e.date.slice(0, 10) : String(e.date),
    customerProject: e.client ?? "",
    description: e.description ?? "",
    minutes: e.minutes ?? 0,
    rate: e.hourly_rate ?? undefined,
    includeInFlex: e.include_in_flex === true,
    invoiced: e.invoiced === true,
    invoicedDate: e.invoiced_date ?? undefined,
    invoiceNumber: e.invoice_number ?? undefined,
  }));

  return { month, billingEntries };
}

export function emptyMonthPayload(key: MonthKey): MonthPayload {
  const empty = createEmptyMonth(key);
  return monthDataToRows(key, empty, []);
}

/** Merge one month + its invoice items into AppData */
export function mergeMonthIntoAppData(
  data: AppData,
  key: MonthKey,
  slice: { month: MonthData; billingEntries: BillingEntry[] }
): AppData {
  const otherBilling = data.billingEntries.filter(
    (e) => !e.date.startsWith(key)
  );
  return {
    ...data,
    defaults: {
      ...data.defaults,
      name: slice.month.settings.name,
      project: slice.month.settings.project,
      employmentPercent: slice.month.settings.employmentPercent,
    },
    months: {
      ...data.months,
      [key]: slice.month,
    },
    billingEntries: [...otherBilling, ...slice.billingEntries],
  };
}
