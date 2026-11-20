"use client";

import { useMemo, useState } from "react";
import type { BillableTaskRow } from "@/types/timesheet";
import { formatMinutes } from "@/lib/timeUtils";

interface BillableListProps {
  rows: BillableTaskRow[];
  byActivity: {
    category: string;
    color?: string;
    minutes: number;
    count: number;
  }[];
  onToggleBilled: (row: BillableTaskRow) => void;
  onAddEntry?: () => void;
}

type Filter = "all" | "open" | "billed";

export function BillableList({
  rows,
  byActivity,
  onToggleBilled,
  onAddEntry,
}: BillableListProps) {
  const [filter, setFilter] = useState<Filter>("open");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "open") return rows.filter((r) => !r.billed);
    if (filter === "billed") return rows.filter((r) => r.billed);
    return rows;
  }, [rows, filter]);

  const activityFiltered = useMemo(() => {
    const map = new Map<string, BillableTaskRow[]>();
    for (const r of filtered) {
      const key = r.category || "Övrigt";
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .map(([category, items]) => {
        const meta = byActivity.find((a) => a.category === category);
        return {
          category,
          color: meta?.color,
          minutes: items.reduce((s, i) => s + i.minutes, 0),
          count: items.length,
          items,
        };
      })
      .sort((a, b) => b.minutes - a.minutes);
  }, [filtered, byActivity]);

  const totalOpen = rows
    .filter((r) => !r.billed)
    .reduce((s, r) => s + r.minutes, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
            Att fakturera
          </h2>
          <p className="text-sm text-slate-500">
            Separat-markerade uppgifter + faktureringsposter. Poster med{" "}
            <span className="font-medium">includeInFlex = false</span> påverkar
            inte flextiden.
          </p>
        </div>
        {onAddEntry && (
          <button
            type="button"
            onClick={onAddEntry}
            className="text-sm px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800"
          >
            Ny faktureringspost
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["open", "Att fakturera"],
            ["billed", "Fakturerade"],
            ["all", "Alla"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`text-sm px-3 py-1.5 rounded-md border ${
              filter === id
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-sm text-slate-500 tabular-nums">
          Ofakturerat:{" "}
          <strong className="text-slate-800">{formatMinutes(totalOpen)}</strong>
        </span>
      </div>

      {activityFiltered.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-md bg-white p-8 text-center text-slate-500 text-sm space-y-2">
          <p>
            Inga poster ännu. Bocka i &quot;Separat&quot; på en uppgift, eller
            skapa en faktureringspost.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activityFiltered.map((group) => {
            const open = expanded === group.category;
            return (
              <div
                key={group.category}
                className="border border-slate-200 rounded-md bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpanded(open ? null : group.category)
                  }
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: group.color ?? "#94a3b8" }}
                  />
                  <span className="font-medium text-slate-900 flex-1">
                    {group.category}
                  </span>
                  <span className="text-xs text-slate-500">
                    {group.count} st
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {formatMinutes(group.minutes)}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-slate-100">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-slate-500 text-xs">
                        <tr>
                          <th className="px-4 py-2 font-medium">Datum</th>
                          <th className="px-4 py-2 font-medium">Beskrivning</th>
                          <th className="px-4 py-2 font-medium tabular-nums">
                            Tid
                          </th>
                          <th className="px-4 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item) => (
                          <tr
                            key={`${item.source}-${item.date}-${item.taskId}`}
                            className="border-t border-slate-50"
                          >
                            <td className="px-4 py-2 tabular-nums whitespace-nowrap">
                              {item.date}
                              {item.source === "billing" && (
                                <span className="ml-1.5 text-[10px] text-slate-400">
                                  post
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-slate-600">
                              {item.description || "—"}
                            </td>
                            <td className="px-4 py-2 tabular-nums">
                              {formatMinutes(item.minutes)}
                            </td>
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                onClick={() => onToggleBilled(item)}
                                className={
                                  item.billed
                                    ? "text-xs font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200"
                                    : "text-xs font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200"
                                }
                              >
                                {item.billed ? "Fakturerad" : "Ska faktureras"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
