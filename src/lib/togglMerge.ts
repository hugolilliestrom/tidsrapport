import type { AppData, MonthKey, Task } from "@/types/timesheet";
import { createEmptyDay, createEmptyMonth } from "@/types/timesheet";
import { newId } from "@/lib/timeUtils";

export type TogglImportedTask = {
  togglId: string;
  date: string;
  category: string;
  categoryColor?: string;
  description: string;
  minutes: number;
};

export type TogglMergeResult = {
  data: AppData;
  added: number;
  updated: number;
};

/**
 * Merge Toggl entries into a month. Matching togglId updates in place;
 * new ids are appended. Categories are upserted from project names.
 */
export function mergeTogglIntoAppData(
  prev: AppData,
  monthKey: MonthKey,
  imported: TogglImportedTask[]
): TogglMergeResult {
  let added = 0;
  let updated = 0;

  const month = prev.months[monthKey]
    ? { ...prev.months[monthKey], days: { ...prev.months[monthKey].days } }
    : createEmptyMonth(monthKey);

  const categories = [...prev.categories];

  const ensureCategory = (name: string, color?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = categories.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      if (color && !existing.color) existing.color = color;
      return existing;
    }
    const cat = {
      id: newId("cat"),
      name: trimmed,
      color: color ?? "#334155",
    };
    categories.push(cat);
    return cat;
  };

  for (const row of imported) {
    const cat = ensureCategory(row.category, row.categoryColor);
    const day = month.days[row.date]
      ? { ...month.days[row.date], tasks: [...month.days[row.date].tasks] }
      : createEmptyDay(row.date);

    const idx = day.tasks.findIndex((t) => t.togglId === row.togglId);
    if (idx >= 0) {
      const prevTask = day.tasks[idx];
      day.tasks[idx] = {
        ...prevTask,
        category: cat?.name ?? row.category,
        categoryColor: cat?.color ?? row.categoryColor ?? prevTask.categoryColor,
        description: row.description,
        minutes: row.minutes,
        togglId: row.togglId,
      };
      updated += 1;
    } else {
      const task: Task = {
        id: newId("task"),
        togglId: row.togglId,
        category: cat?.name ?? row.category,
        categoryColor: cat?.color ?? row.categoryColor,
        description: row.description,
        minutes: row.minutes,
        billSeparately: false,
        billed: false,
      };
      day.tasks.push(task);
      added += 1;
    }

    month.days[row.date] = day;
  }

  return {
    data: {
      ...prev,
      categories,
      months: { ...prev.months, [monthKey]: month },
    },
    added,
    updated,
  };
}
