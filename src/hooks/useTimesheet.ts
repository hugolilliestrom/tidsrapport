"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDefaultAppData,
  createEmptyBillingEntry,
  createEmptyDay,
  createEmptyMonth,
  type AppData,
  type BillableTaskRow,
  type BillingEntry,
  type Category,
  type DayEntry,
  type MonthKey,
  type Task,
  type TimesheetSettings,
} from "@/types/timesheet";
import {
  exportBackupJson,
  importBackupJson,
  loadAppData,
  saveAppData,
} from "@/lib/timesheetStorage";
import {
  getCloudUser,
  loadFromCloud,
  saveToCloud,
} from "@/lib/cloudSync";
import { loadCloudConfig } from "@/lib/supabase";
import {
  fetchCloudStatus,
  fetchMonthFromCloud,
  saveMonthToCloud,
} from "@/lib/supabaseApi";
import { mergeMonthIntoAppData } from "@/lib/supabaseMonth";
import {
  mergeTogglIntoAppData,
  type TogglImportedTask,
} from "@/lib/togglMerge";
import { monthKey, parseMonthKey } from "@/lib/holidays";
import {
  billableTotalsByActivity,
  collectBillableTasks,
  newId,
  summarizeMonth,
} from "@/lib/timeUtils";

export type TabId = "tidsrapport" | "att-fakturera";
export type SyncStatus = "idle" | "saving" | "saved" | "error" | "local";

function ensureMonth(data: AppData, key: MonthKey) {
  if (data.months[key]) return data;
  const m = createEmptyMonth(key);
  m.settings = {
    ...data.defaults,
    manualIncomingFlexMinutes: null,
  };
  return { ...data, months: { ...data.months, [key]: m } };
}

export function useTimesheet() {
  const [data, setData] = useState<AppData>(createDefaultAppData);
  const [isLoaded, setIsLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const skipSave = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<TabId>("tidsrapport");

  const key = monthKey(year, month);

  const bootstrap = useCallback(async () => {
    skipSave.current = true;
    const n = new Date();
    const nowKey = monthKey(n.getFullYear(), n.getMonth() + 1);
    let next = ensureMonth(loadAppData(), nowKey);
    await loadCloudConfig();

    // Steg 3: service-role API (månad/tasks/invoice_items)
    const status = await fetchCloudStatus();
    if (status.configured) {
      const remote = await fetchMonthFromCloud(nowKey);
      if (remote.ok && remote.slice) {
        next = mergeMonthIntoAppData(next, nowKey, remote.slice);
        setSyncStatus("saved");
      } else {
        // Push local month up if cloud empty / first run
        const month = next.months[nowKey];
        if (month) {
          const saved = await saveMonthToCloud(
            nowKey,
            month,
            next.billingEntries
          );
          setSyncStatus(saved.ok ? "saved" : "error");
        }
      }
    } else {
      // Fallback: magic-link blob sync (om anon-nyckel finns)
      const user = await getCloudUser();
      if (user) {
        const cloud = await loadFromCloud();
        if (cloud) {
          next = ensureMonth(cloud, nowKey);
          setSyncStatus("saved");
        } else {
          await saveToCloud(next);
          setSyncStatus("saved");
        }
      } else {
        setSyncStatus("local");
      }
    }

    setData(next);
    saveAppData(next);
    setIsLoaded(true);
    skipSave.current = false;
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  /** Ladda månad från Supabase när man byter månad (bara om rad finns) */
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    void (async () => {
      const status = await fetchCloudStatus();
      if (!status.configured || cancelled) return;
      const res = await fetch(`/api/months/${key}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as {
        exists?: boolean;
        slice?: Parameters<typeof mergeMonthIntoAppData>[2];
      };
      if (!j.exists || !j.slice || cancelled) return;
      skipSave.current = true;
      setData((prev) => mergeMonthIntoAppData(prev, key, j.slice!));
      skipSave.current = false;
    })();
    return () => {
      cancelled = true;
    };
  }, [key, isLoaded]);

  /** Anropa efter login/logout */
  const reloadFromCloud = useCallback(async () => {
    await bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!isLoaded || skipSave.current) return;
    saveAppData(data);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => {
        const status = await fetchCloudStatus();
        if (status.configured) {
          const month = data.months[key];
          if (!month) {
            setSyncStatus("local");
            return;
          }
          setSyncStatus("saving");
          const saved = await saveMonthToCloud(
            key,
            month,
            data.billingEntries
          );
          setSyncStatus(saved.ok ? "saved" : "error");
          return;
        }
        const user = await getCloudUser();
        if (!user) {
          setSyncStatus("local");
          return;
        }
        setSyncStatus("saving");
        const ok = await saveToCloud(data);
        setSyncStatus(ok ? "saved" : "error");
      })();
    }, 600);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, isLoaded, key]);

  const update = useCallback((fn: (prev: AppData) => AppData) => {
    setData(fn);
  }, []);

  const withMonth = useCallback(
    (
      fn: (
        month: ReturnType<typeof createEmptyMonth>,
        data: AppData
      ) => AppData
    ) => {
      update((prev) => {
        const next = ensureMonth(prev, key);
        return fn(next.months[key], next);
      });
    },
    [key, update]
  );

  const summary = useMemo(() => {
    if (!isLoaded) return null;
    const ensured = ensureMonth(data, key);
    return summarizeMonth(ensured, key);
  }, [data, key, isLoaded]);

  const currentMonth = data.months[key];
  const settings: TimesheetSettings = currentMonth?.settings ?? {
    ...data.defaults,
    manualIncomingFlexMinutes: null,
  };

  const setSettings = useCallback(
    (patch: Partial<TimesheetSettings>) => {
      withMonth((m, prev) => {
        const settings = { ...m.settings, ...patch };
        const defaults = {
          ...prev.defaults,
          name: settings.name,
          project: settings.project,
          employmentPercent: settings.employmentPercent,
        };
        return {
          ...prev,
          defaults,
          months: {
            ...prev.months,
            [key]: { ...m, settings },
          },
        };
      });
    },
    [key, withMonth]
  );

  const shiftMonth = useCallback(
    (delta: number) => {
      setMonth((m) => {
        let next = m + delta;
        let y = year;
        if (next < 1) {
          next = 12;
          y -= 1;
        } else if (next > 12) {
          next = 1;
          y += 1;
        }
        setYear(y);
        return next;
      });
    },
    [year]
  );

  const setMonthKey = useCallback((mk: string) => {
    const { year: y, month: m } = parseMonthKey(mk);
    if (y && m) {
      setYear(y);
      setMonth(m);
    }
  }, []);

  const patchDay = useCallback(
    (date: string, patch: Partial<DayEntry> | ((d: DayEntry) => DayEntry)) => {
      withMonth((m, prev) => {
        const base = m.days[date] ?? createEmptyDay(date);
        const next =
          typeof patch === "function" ? patch(base) : { ...base, ...patch };
        return {
          ...prev,
          months: {
            ...prev.months,
            [key]: { ...m, days: { ...m.days, [date]: next } },
          },
        };
      });
    },
    [key, withMonth]
  );

  const toggleDayOff = useCallback(
    (date: string) => {
      patchDay(date, (d) => ({ ...d, isDayOff: !d.isDayOff }));
    },
    [patchDay]
  );

  const addTask = useCallback(
    (date: string, task?: Partial<Task>) => {
      patchDay(date, (d) => ({
        ...d,
        tasks: [
          ...d.tasks,
          {
            id: newId("task"),
            category: task?.category ?? "",
            categoryColor: task?.categoryColor,
            description: task?.description ?? "",
            minutes: task?.minutes ?? 0,
            billSeparately: task?.billSeparately ?? false,
            billed: task?.billed ?? false,
          },
        ],
      }));
    },
    [patchDay]
  );

  const updateTask = useCallback(
    (date: string, taskId: string, patch: Partial<Task>) => {
      patchDay(date, (d) => ({
        ...d,
        tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
      }));
    },
    [patchDay]
  );

  /** Uppdatera uppgift oavsett vilken månad den ligger i */
  const updateTaskGlobal = useCallback(
    (monthKeyStr: MonthKey, date: string, taskId: string, patch: Partial<Task>) => {
      update((prev) => {
        const m = prev.months[monthKeyStr];
        if (!m) return prev;
        const day = m.days[date];
        if (!day) return prev;
        return {
          ...prev,
          months: {
            ...prev.months,
            [monthKeyStr]: {
              ...m,
              days: {
                ...m.days,
                [date]: {
                  ...day,
                  tasks: day.tasks.map((t) =>
                    t.id === taskId ? { ...t, ...patch } : t
                  ),
                },
              },
            },
          },
        };
      });
    },
    [update]
  );

  const updateBillingEntry = useCallback(
    (id: string, patch: Partial<BillingEntry>) => {
      update((prev) => ({
        ...prev,
        billingEntries: prev.billingEntries.map((e) =>
          e.id === id ? { ...e, ...patch } : e
        ),
      }));
    },
    [update]
  );

  /** Markera fakturerad / ofakturerad för uppgift eller BillingEntry */
  const toggleBillableBilled = useCallback(
    (row: BillableTaskRow) => {
      if (row.source === "billing") {
        updateBillingEntry(row.taskId, {
          invoiced: !row.billed,
          invoicedDate: !row.billed
            ? new Date().toISOString().slice(0, 10)
            : undefined,
        });
      } else {
        updateTaskGlobal(row.monthKey, row.date, row.taskId, {
          billed: !row.billed,
        });
      }
    },
    [updateBillingEntry, updateTaskGlobal]
  );

  const addBillingEntry = useCallback(
    (partial?: Partial<BillingEntry>) => {
      const entry = createEmptyBillingEntry({
        ...partial,
        id: newId("bill"),
        date: partial?.date ?? `${key}-01`,
        includeInFlex: partial?.includeInFlex ?? false,
      });
      update((prev) => ({
        ...prev,
        billingEntries: [...prev.billingEntries, entry],
      }));
      return entry;
    },
    [key, update]
  );

  const removeTask = useCallback(
    (date: string, taskId: string) => {
      patchDay(date, (d) => ({
        ...d,
        tasks: d.tasks.filter((t) => t.id !== taskId),
      }));
    },
    [patchDay]
  );

  const upsertCategory = useCallback(
    (name: string, color?: string): Category => {
      const trimmed = name.trim();
      const existing = data.categories.find(
        (c) => c.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) return existing;
      const cat: Category = {
        id: newId("cat"),
        name: trimmed,
        color: color ?? "#334155",
      };
      update((prev) => {
        if (
          prev.categories.some(
            (c) => c.name.toLowerCase() === trimmed.toLowerCase()
          )
        ) {
          return prev;
        }
        return { ...prev, categories: [...prev.categories, cat] };
      });
      return cat;
    },
    [data.categories, update]
  );

  const billableRows = useMemo(
    () => (isLoaded ? collectBillableTasks(data) : []),
    [data, isLoaded]
  );

  const billableByActivity = useMemo(
    () => billableTotalsByActivity(billableRows),
    [billableRows]
  );

  const replaceAll = useCallback((next: AppData) => {
    setData(next);
  }, []);

  const exportBackup = useCallback(() => exportBackupJson(data), [data]);
  const importBackup = useCallback(async (file: File) => {
    const next = await importBackupJson(file);
    setData(next);
  }, []);

  /** Manuell Toggl-hämtning för aktuell månad (knapp — inga auto-anrop). */
  const importTogglMonth = useCallback(async (): Promise<{
    ok: boolean;
    added?: number;
    updated?: number;
    imported?: number;
    apiCalls?: number;
    clientFilter?: string | null;
    error?: string;
  }> => {
    try {
      const res = await fetch(
        `/api/toggl/import?month=${encodeURIComponent(key)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as {
        error?: string;
        tasks?: TogglImportedTask[];
        imported?: number;
        apiCalls?: number;
        clientFilter?: string | null;
      };
      if (!res.ok) {
        return { ok: false, error: json.error || `HTTP ${res.status}` };
      }
      const tasks = json.tasks ?? [];
      let added = 0;
      let updated = 0;
      setData((prev) => {
        const merged = mergeTogglIntoAppData(prev, key, tasks);
        added = merged.added;
        updated = merged.updated;
        return merged.data;
      });
      return {
        ok: true,
        added,
        updated,
        imported: json.imported ?? tasks.length,
        apiCalls: json.apiCalls,
        clientFilter: json.clientFilter ?? null,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Kunde inte hämta Toggl",
      };
    }
  }, [key]);

  return {
    data,
    isLoaded,
    syncStatus,
    reloadFromCloud,
    year,
    month,
    key,
    tab,
    setTab,
    settings,
    summary,
    currentMonth,
    billableRows,
    billableByActivity,
    shiftMonth,
    setMonthKey,
    setSettings,
    patchDay,
    toggleDayOff,
    addTask,
    updateTask,
    updateTaskGlobal,
    updateBillingEntry,
    toggleBillableBilled,
    addBillingEntry,
    removeTask,
    upsertCategory,
    replaceAll,
    exportBackup,
    importBackup,
    importTogglMonth,
  };
}
