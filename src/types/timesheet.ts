/**
 * Steg 1 — domäntyper för tidsrapport, flextid, uppgifter och separat fakturering.
 */

/** Månadsnyckel: YYYY-MM */
export type MonthKey = string;

/** Inställningar per månad (eller app-default) */
export interface TimesheetSettings {
  /** Visningsnamn — default Hugo Lillieström */
  name: string;
  project: string;
  /** Sysselsättningsgrad i procent — default 40 */
  employmentPercent: number;
  /** null = auto från föregående månads total flex */
  manualIncomingFlexMinutes: number | null;
}

/** En uppgift på en dag — tid som heltal minuter */
export interface Task {
  id: string;
  /** Valfritt Toggl-id vid import */
  togglId?: string;
  /** Kategori / projekt */
  category: string;
  categoryColor?: string;
  description: string;
  /** Tid i hela minuter */
  minutes: number;
  /**
   * Markerad att faktureras separat (UI-lista Att fakturera).
   * Komplement till BillingEntry — behålls för nuvarande vy.
   */
  billSeparately: boolean;
  /** Om den separata posten är markerad som fakturerad */
  billed: boolean;
}

export interface DayEntry {
  date: string;
  /** Manuell ledig dag */
  isDayOff: boolean;
  tasks: Task[];
}

export interface MonthData {
  /** YYYY-MM */
  monthKey: MonthKey;
  settings: TimesheetSettings;
  days: Record<string, DayEntry>;
}

/**
 * Separat faktureringspost (egen från dagsuppgifter).
 * includeInFlex default false — räknas inte in i flextid om false.
 */
export interface BillingEntry {
  id: string;
  togglId?: string;
  date: string;
  /** Kund / projekt */
  customerProject: string;
  description: string;
  minutes: number;
  rate?: number;
  amount?: number;
  /** Default false */
  includeInFlex: boolean;
  invoiced: boolean;
  invoicedDate?: string;
  invoiceNumber?: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface AppData {
  defaults: TimesheetSettings;
  months: Record<MonthKey, MonthData>;
  categories: Category[];
  /** Separata faktureringsposter (Steg 1-modell) */
  billingEntries: BillingEntry[];
}

/** Flat rad för listan Att fakturera (uppgift eller BillingEntry) */
export interface BillableTaskRow {
  /** task-id eller billing-entry-id */
  taskId: string;
  source: "task" | "billing";
  date: string;
  category: string;
  categoryColor?: string;
  description: string;
  minutes: number;
  billed: boolean;
  monthKey: MonthKey;
}

export const DEFAULT_NAME = "Hugo Lillieström";
export const DEFAULT_EMPLOYMENT_PERCENT = 40;

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-projekt", name: "Projekt", color: "#2563eb" },
  { id: "cat-admin", name: "Administration", color: "#64748b" },
  { id: "cat-mote", name: "Möte", color: "#0d9488" },
  { id: "cat-utbildning", name: "Utbildning", color: "#ca8a04" },
];

export function createDefaultSettings(
  overrides?: Partial<TimesheetSettings>
): TimesheetSettings {
  return {
    name: DEFAULT_NAME,
    project: "",
    employmentPercent: DEFAULT_EMPLOYMENT_PERCENT,
    manualIncomingFlexMinutes: null,
    ...overrides,
  };
}

export function createEmptyMonth(monthKey: MonthKey): MonthData {
  return {
    monthKey,
    settings: createDefaultSettings(),
    days: {},
  };
}

export function createEmptyDay(date: string): DayEntry {
  return {
    date,
    isDayOff: false,
    tasks: [],
  };
}

export function createEmptyBillingEntry(
  overrides?: Partial<BillingEntry>
): BillingEntry {
  return {
    id: overrides?.id ?? "",
    date: overrides?.date ?? "",
    customerProject: overrides?.customerProject ?? "",
    description: overrides?.description ?? "",
    minutes: overrides?.minutes ?? 0,
    includeInFlex: overrides?.includeInFlex ?? false,
    invoiced: overrides?.invoiced ?? false,
    togglId: overrides?.togglId,
    rate: overrides?.rate,
    amount: overrides?.amount,
    invoicedDate: overrides?.invoicedDate,
    invoiceNumber: overrides?.invoiceNumber,
  };
}

export function createDefaultAppData(): AppData {
  return {
    defaults: createDefaultSettings(),
    months: {},
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    billingEntries: [],
  };
}
