"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileJson,
  FileSpreadsheet,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
} from "lucide-react";
import { exportAllExcel, exportMonthExcel } from "@/lib/excelExport";
import { useTimesheet } from "@/hooks/useTimesheet";
import {
  WEEKDAY_SHORT_SV,
  eachDateInMonth,
  formatMonthLabelSv,
  getHoliday,
  getISOWeek,
  getISOWeekYear,
  getWeekday,
  isWeekend,
  toDateKey,
} from "@/lib/holidays";
import {
  dayFlexMinutes,
  dayWorkedMinutes,
  expectedDayMinutes,
  expectedWeekMinutes,
  formatMinutes,
} from "@/lib/timeUtils";
import { TimeInput } from "./TimeInput";
import { BillableList } from "./BillableList";
import { CloudAuth } from "./CloudAuth";
import type { Task } from "@/types/timesheet";

export function TimesheetApp() {
  const api = useTimesheet();
  const importRef = useRef<HTMLInputElement>(null);
  /** Datum vars uppgiftsrader är utfällda */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [togglConfigured, setTogglConfigured] = useState(false);
  const [togglBusy, setTogglBusy] = useState(false);
  const [togglMsg, setTogglMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/toggl/status", { cache: "no-store" });
        const j = (await res.json()) as { configured?: boolean };
        setTogglConfigured(!!j.configured);
      } catch {
        setTogglConfigured(false);
      }
    })();
  }, []);

  const dates = useMemo(
    () => eachDateInMonth(api.year, api.month),
    [api.year, api.month]
  );

  // Expandera idag + dagar med uppgifter när månad laddas
  useEffect(() => {
    if (!api.isLoaded) return;
    const today = toDateKey(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      new Date().getDate()
    );
    setExpanded((prev) => {
      const next = { ...prev };
      for (const date of dates) {
        const hasTasks = (api.currentMonth?.days[date]?.tasks.length ?? 0) > 0;
        if (next[date] === undefined && (hasTasks || date === today)) {
          next[date] = true;
        }
      }
      return next;
    });
  }, [api.isLoaded, api.year, api.month, dates, api.currentMonth]);

  const toggleExpand = (date: string) => {
    setExpanded((prev) => ({ ...prev, [date]: !prev[date] }));
  };

  const dayRows = useMemo(() => {
    if (!api.isLoaded) return [];
    const month = api.currentMonth;
    const pct = api.settings.employmentPercent;
    return dates.map((date) => {
      const day = month?.days[date];
      const holiday = getHoliday(date);
      const worked = dayWorkedMinutes(day);
      const flex = dayFlexMinutes(date, day, pct);
      const wd = getWeekday(date);
      return {
        date,
        day,
        holiday,
        worked,
        flex,
        weekdayLabel: WEEKDAY_SHORT_SV[wd],
        isWeekend: isWeekend(date),
        isHolidayStyle: !!(
          holiday &&
          (holiday.isRedDay || holiday.isWorkFreeEve)
        ),
        isoWeek: getISOWeek(date),
        isoWeekYear: getISOWeekYear(date),
      };
    });
  }, [api.isLoaded, api.currentMonth, api.settings.employmentPercent, dates]);

  const weekFirst = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of dayRows) {
      const wk = `${r.isoWeekYear}-W${r.isoWeek}`;
      if (!map.has(wk)) map.set(wk, r.date);
    }
    return map;
  }, [dayRows]);

  const weekTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of dayRows) {
      const wk = `${r.isoWeekYear}-W${r.isoWeek}`;
      map.set(wk, (map.get(wk) ?? 0) + r.worked);
    }
    return map;
  }, [dayRows]);

  const weeks = useMemo(() => {
    const map = new Map<
      string,
      { isoWeek: number; worked: number; expected: number; flex: number }
    >();
    for (const r of dayRows) {
      const wk = `${r.isoWeekYear}-W${r.isoWeek}`;
      let w = map.get(wk);
      if (!w) {
        w = { isoWeek: r.isoWeek, worked: 0, expected: 0, flex: 0 };
        map.set(wk, w);
      }
      w.worked += r.worked;
      w.expected += r.worked - r.flex;
      w.flex += r.flex;
    }
    return Array.from(map.values());
  }, [dayRows]);

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, { minutes: number; color: string }>();
    const month = api.currentMonth;
    if (!month) return [];
    for (const day of Object.values(month.days)) {
      for (const t of day.tasks) {
        const name = t.category || "Övrigt";
        const color =
          t.categoryColor ??
          api.data.categories.find((c) => c.name === name)?.color ??
          "#64748b";
        const cur = totals.get(name) ?? { minutes: 0, color };
        cur.minutes += t.minutes;
        totals.set(name, cur);
      }
    }
    return Array.from(totals.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [api.currentMonth, api.data.categories]);

  if (!api.isLoaded || !api.summary) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Laddar…
      </div>
    );
  }

  const { settings, summary, year, month, key, tab } = api;
  const dayTarget = expectedDayMinutes(settings.employmentPercent);
  const weekTarget = expectedWeekMinutes(settings.employmentPercent);
  const progress =
    summary.expected > 0
      ? Math.min(100, (summary.worked / summary.expected) * 100)
      : 0;
  const remaining = Math.max(0, summary.expected - summary.worked);
  const incomingLocked = settings.manualIncomingFlexMinutes == null;
  const billableCount = api.billableRows.filter((r) => !r.billed).length;

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
              Tidsrapport
            </h1>
            <span className="text-sm text-slate-500 hidden sm:inline">
              {settings.name}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
          <CloudAuth
            syncStatus={api.syncStatus}
            onAuthChanged={() => void api.reloadFromCloud()}
          />
          <nav className="flex gap-1 p-1 rounded-lg bg-slate-100">
            <button
              type="button"
              onClick={() => api.setTab("tidsrapport")}
              className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                tab === "tidsrapport"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tidsrapport
            </button>
            <button
              type="button"
              onClick={() => api.setTab("att-fakturera")}
              className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                tab === "att-fakturera"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Fakturering
              {billableCount > 0 && (
                <span className="ml-1.5 text-xs tabular-nums text-amber-700">
                  ({billableCount})
                </span>
              )}
            </button>
          </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => api.shiftMonth(-1)}
              className="p-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
              aria-label="Föregående månad"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="min-w-[11rem] text-center text-base font-semibold capitalize tabular-nums">
              {formatMonthLabelSv(year, month)}
            </div>
            <button
              type="button"
              onClick={() => api.shiftMonth(1)}
              className="p-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
              aria-label="Nästa månad"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <input
              type="month"
              value={key}
              onChange={(e) => api.setMonthKey(e.target.value)}
              className="ml-2 text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white tabular-nums"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {togglConfigured && (
              <button
                type="button"
                disabled={togglBusy || !api.isLoaded}
                onClick={() => {
                  void (async () => {
                    setTogglBusy(true);
                    setTogglMsg(null);
                    const res = await api.importTogglMonth();
                    setTogglBusy(false);
                    if (!res.ok) {
                      setTogglMsg(res.error || "Toggl-fel");
                      return;
                    }
                    setTogglMsg(
                      `Toggl: ${res.imported ?? 0} poster (${res.added ?? 0} nya, ${res.updated ?? 0} uppdaterade · ${res.apiCalls ?? "?"} anrop)`
                    );
                  })();
                }}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                title="Hämtar endast när du klickar (sparar Toggl-kvot)"
              >
                <RefreshCw
                  className={`w-4 h-4 ${togglBusy ? "animate-spin" : ""}`}
                />
                {togglBusy ? "Hämtar…" : "Hämta från Toggl"}
              </button>
            )}
            <button
              type="button"
              onClick={() => exportMonthExcel(api.data, key)}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportera månad
            </button>
            <button
              type="button"
              onClick={() => exportAllExcel(api.data)}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
            >
              <Download className="w-4 h-4" />
              Exportera alla
            </button>
            <button
              type="button"
              onClick={() => api.exportBackup()}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
            >
              <FileJson className="w-4 h-4" />
              Exportera JSON
            </button>
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="text-sm px-3 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
            >
              Importera JSON
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  await api.importBackup(file);
                } catch {
                  alert("Kunde inte läsa backup-filen.");
                }
                e.target.value = "";
              }}
            />
          </div>
        </div>
        {togglMsg && (
          <p className="text-xs text-slate-500 -mt-2">{togglMsg}</p>
        )}

        {tab === "att-fakturera" ? (
          <BillableList
            rows={api.billableRows}
            byActivity={api.billableByActivity}
            onToggleBilled={api.toggleBillableBilled}
            onAddEntry={() =>
              api.addBillingEntry({
                date: `${api.key}-01`,
                customerProject: api.settings.project || "",
                includeInFlex: false,
              })
            }
          />
        ) : (
          <>
            <section className="border border-slate-200 rounded-md bg-white p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <label className="block text-xs text-slate-500 space-y-1">
                <span>Namn</span>
                <input
                  value={settings.name}
                  onChange={(e) => api.setSettings({ name: e.target.value })}
                  className="field"
                />
              </label>
              <label className="block text-xs text-slate-500 space-y-1">
                <span>Avdelning / Projekt</span>
                <input
                  value={settings.project}
                  onChange={(e) => api.setSettings({ project: e.target.value })}
                  className="field"
                  placeholder="Valfritt"
                />
              </label>
              <label className="block text-xs text-slate-500 space-y-1">
                <span>Sysselsättningsgrad (%)</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={settings.employmentPercent}
                  onChange={(e) =>
                    api.setSettings({
                      employmentPercent: Math.max(
                        1,
                        Math.min(100, Number(e.target.value) || 0)
                      ),
                    })
                  }
                  className="field tabular-nums"
                />
                <span className="text-xs text-slate-500 tabular-nums">
                  = {formatMinutes(weekTarget)}/v • {formatMinutes(dayTarget)}
                  /dag
                </span>
              </label>
              <div className="block text-xs text-slate-500 space-y-1">
                <span>Ingående flex</span>
                <div className="flex items-center gap-2">
                  {incomingLocked ? (
                    <div className="field flex-1 tabular-nums text-slate-700 py-2">
                      Auto · {formatMinutes(summary.incomingFlex, true)}
                    </div>
                  ) : (
                    <TimeInput
                      valueMinutes={settings.manualIncomingFlexMinutes}
                      allowMinutesOnly
                      onChange={(m) =>
                        api.setSettings({
                          manualIncomingFlexMinutes: m ?? 0,
                        })
                      }
                    />
                  )}
                  <button
                    type="button"
                    title={
                      incomingLocked
                        ? "Lås upp för manuellt startsald"
                        : "Lås (auto från föregående månad)"
                    }
                    onClick={() => {
                      if (incomingLocked) {
                        api.setSettings({
                          manualIncomingFlexMinutes: summary.incomingFlex,
                        });
                      } else {
                        api.setSettings({ manualIncomingFlexMinutes: null });
                      }
                    }}
                    className="p-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
                  >
                    {incomingLocked ? (
                      <Lock className="w-4 h-4 text-slate-600" />
                    ) : (
                      <Unlock className="w-4 h-4 text-amber-700" />
                    )}
                  </button>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Kpi label="Arbetsdagar" value={String(summary.workdays)} />
              <Kpi label="Månadsmål" value={formatMinutes(summary.expected)} />
              <div className="border border-slate-200 rounded-md bg-white px-3 py-3 col-span-2 lg:col-span-1">
                <div className="text-xs text-slate-500">Arbetat</div>
                <div className="text-xl font-semibold tabular-nums">
                  {formatMinutes(summary.worked)}
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-slate-800 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-slate-500 tabular-nums">
                  Kvar: {formatMinutes(remaining)}
                </div>
              </div>
              <Kpi
                label="Månadens flex"
                value={formatMinutes(summary.monthFlex, true)}
                accent={summary.monthFlex}
              />
              <Kpi
                label="Total flex"
                value={formatMinutes(summary.totalFlex, true)}
                accent={summary.totalFlex}
              />
            </section>

            <section className="border border-slate-200 rounded-md bg-white p-4 space-y-3">
              <h2 className="text-sm font-semibold text-slate-800">
                Veckor & kategorier
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {weeks.map((w) => (
                  <div
                    key={w.isoWeek}
                    className="border border-slate-100 rounded-md px-3 py-2 bg-slate-50/50"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold tabular-nums text-sm">
                        V{w.isoWeek}
                      </span>
                      <span
                        className={`text-sm tabular-nums font-medium ${
                          w.flex >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {formatMinutes(w.flex, true)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      {formatMinutes(w.worked)} / {formatMinutes(w.expected)}
                    </div>
                  </div>
                ))}
              </div>
              {categoryTotals.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {categoryTotals.map((c) => (
                    <span
                      key={c.name}
                      className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-slate-200 bg-white"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: c.color }}
                      />
                      {c.name}
                      <span className="tabular-nums text-slate-500">
                        {formatMinutes(c.minutes)}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Dagstabell — uppgiftsbaserad (ingen Start/Slut/Rast) */}
            <section className="border border-slate-200 rounded-md bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[920px]">
                  <thead className="bg-slate-50 text-slate-600 text-left">
                    <tr>
                      <th className="px-2 py-2 font-medium w-10" />
                      <th className="px-2 py-2 font-medium w-14">Datum</th>
                      <th className="px-2 py-2 font-medium w-28">Veckodag</th>
                      <th className="px-2 py-2 font-medium w-36">Projekt</th>
                      <th className="px-2 py-2 font-medium min-w-[220px]">
                        Beskrivning
                      </th>
                      <th className="px-2 py-2 font-medium w-24">Tid</th>
                      <th className="px-2 py-2 font-medium w-20">Arbetat</th>
                      <th className="px-2 py-2 font-medium w-20">Flex</th>
                      <th className="px-2 py-2 font-medium w-28">Vecka</th>
                      <th className="px-2 py-2 font-medium w-24">Ledig</th>
                      <th className="px-2 py-2 font-medium w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {dayRows.map((r) => {
                      const wk = `${r.isoWeekYear}-W${r.isoWeek}`;
                      const isFirst = weekFirst.get(wk) === r.date;
                      const wt = weekTotals.get(wk) ?? 0;
                      const rowBg = r.isWeekend
                        ? "bg-slate-100/80"
                        : r.isHolidayStyle
                          ? "bg-rose-50/70"
                          : "bg-white";
                      const tasks = r.day?.tasks ?? [];
                      const isOpen = !!expanded[r.date];

                      return (
                        <DayBlock
                          key={r.date}
                          date={r.date}
                          rowBg={rowBg}
                          dayNum={r.date.slice(8)}
                          weekdayLabel={r.weekdayLabel}
                          holidayName={r.holiday?.name ?? null}
                          isDayOff={r.day?.isDayOff ?? false}
                          worked={r.worked}
                          flex={r.flex}
                          isFirstOfWeek={isFirst}
                          isoWeek={r.isoWeek}
                          weekWorked={wt}
                          tasks={tasks}
                          expanded={isOpen}
                          categories={api.data.categories}
                          onToggleExpand={() => toggleExpand(r.date)}
                          onAddTask={() => {
                            api.addTask(r.date);
                            setExpanded((p) => ({ ...p, [r.date]: true }));
                          }}
                          onUpdateTask={(id, patch) =>
                            api.updateTask(r.date, id, patch)
                          }
                          onRemoveTask={(id) => api.removeTask(r.date, id)}
                          onUpsertCategory={api.upsertCategory}
                          onToggleOff={() => api.toggleDayOff(r.date)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <footer className="border border-slate-200 rounded-md bg-white px-4 py-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <span className="text-slate-500">Från tidigare månad </span>
                <span className="font-semibold tabular-nums">
                  {formatMinutes(summary.incomingFlex, true)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Totalt arbetat </span>
                <span className="font-semibold tabular-nums">
                  {formatMinutes(summary.worked)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Månadens flex </span>
                <span
                  className={`font-semibold tabular-nums ${
                    summary.monthFlex >= 0
                      ? "text-emerald-700"
                      : "text-rose-700"
                  }`}
                >
                  {formatMinutes(summary.monthFlex, true)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Total flex </span>
                <span
                  className={`font-semibold tabular-nums ${
                    summary.totalFlex >= 0
                      ? "text-emerald-700"
                      : "text-rose-700"
                  }`}
                >
                  {formatMinutes(summary.totalFlex, true)}
                </span>
              </div>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: number;
}) {
  const color =
    accent === undefined
      ? "text-slate-900"
      : accent >= 0
        ? "text-emerald-700"
        : "text-rose-700";
  return (
    <div className="border border-slate-200 rounded-md bg-white px-3 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function DayBlock({
  date,
  rowBg,
  dayNum,
  weekdayLabel,
  holidayName,
  isDayOff,
  worked,
  flex,
  isFirstOfWeek,
  isoWeek,
  weekWorked,
  tasks,
  expanded,
  categories,
  onToggleExpand,
  onAddTask,
  onUpdateTask,
  onRemoveTask,
  onUpsertCategory,
  onToggleOff,
}: {
  date: string;
  rowBg: string;
  dayNum: string;
  weekdayLabel: string;
  holidayName: string | null;
  isDayOff: boolean;
  worked: number;
  flex: number;
  isFirstOfWeek: boolean;
  isoWeek: number;
  weekWorked: number;
  tasks: Task[];
  expanded: boolean;
  categories: import("@/types/timesheet").Category[];
  onToggleExpand: () => void;
  onAddTask: () => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onRemoveTask: (id: string) => void;
  onUpsertCategory: (
    name: string,
    color?: string
  ) => import("@/types/timesheet").Category;
  onToggleOff: () => void;
}) {
  return (
    <>
      <tr className={`border-t border-slate-100 ${rowBg}`}>
        <td className="px-1 py-2">
          <button
            type="button"
            aria-label={expanded ? "Fäll in uppgifter" : "Visa uppgifter"}
            aria-expanded={expanded}
            onClick={onToggleExpand}
            className="p-1 rounded hover:bg-slate-200/60 text-slate-500"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                expanded ? "" : "-rotate-90"
              }`}
            />
          </button>
        </td>
        <td className="px-2 py-2 tabular-nums font-medium">{dayNum}</td>
        <td className="px-2 py-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="capitalize">{weekdayLabel}</span>
            {holidayName && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                {holidayName}
              </span>
            )}
            {isDayOff && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                Ledig
              </span>
            )}
            {tasks.length > 0 && (
              <span className="text-[10px] text-slate-400 tabular-nums">
                {tasks.length} uppg.
              </span>
            )}
          </div>
        </td>
        <td colSpan={3} className="px-2 py-2 text-xs text-slate-400">
          {!expanded && tasks.length > 0
            ? tasks
                .map((t) => t.category || t.description || "Uppgift")
                .filter(Boolean)
                .slice(0, 3)
                .join(" · ")
            : null}
        </td>
        <td className="px-2 py-2 tabular-nums font-medium">
          {formatMinutes(worked)}
        </td>
        <td
          className={`px-2 py-2 tabular-nums font-medium ${
            flex >= 0 ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {formatMinutes(flex, true)}
        </td>
        <td className="px-2 py-2 tabular-nums text-slate-600 whitespace-nowrap">
          {isFirstOfWeek ? (
            <span>
              V{isoWeek}{" "}
              <span className="text-slate-400">
                ({formatMinutes(weekWorked)})
              </span>
            </span>
          ) : null}
        </td>
        <td className="px-2 py-2">
          <button
            type="button"
            title="Manuell ledig / arbetsfri dag"
            onClick={onToggleOff}
            className={`text-[10px] px-1.5 py-1 rounded border ${
              isDayOff
                ? "bg-slate-800 text-white border-slate-800"
                : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            Ledig
          </button>
        </td>
        <td className="px-1 py-2">
          <button
            type="button"
            aria-label="Lägg till uppgift"
            onClick={onAddTask}
            className="p-1 text-slate-400 hover:text-slate-800"
          >
            <Plus className="w-4 h-4" />
          </button>
        </td>
      </tr>

      {expanded &&
        tasks.map((task) => (
          <TaskRow
            key={task.id}
            date={date}
            rowBg={rowBg}
            task={task}
            categories={categories}
            onUpdateTask={onUpdateTask}
            onRemoveTask={onRemoveTask}
            onUpsertCategory={onUpsertCategory}
            onAddTask={onAddTask}
          />
        ))}

      {expanded && tasks.length === 0 && (
        <tr className={`border-t border-slate-50 ${rowBg}`}>
          <td />
          <td colSpan={9} className="px-2 py-2">
            <button
              type="button"
              onClick={onAddTask}
              className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Lägg till uppgift (Projekt · Beskrivning · Tid)
            </button>
          </td>
          <td />
        </tr>
      )}
    </>
  );
}

function TaskRow({
  date,
  rowBg,
  task,
  categories,
  onUpdateTask,
  onRemoveTask,
  onUpsertCategory,
  onAddTask,
}: {
  date: string;
  rowBg: string;
  task: Task;
  categories: import("@/types/timesheet").Category[];
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onRemoveTask: (id: string) => void;
  onUpsertCategory: (
    name: string,
    color?: string
  ) => import("@/types/timesheet").Category;
  onAddTask: () => void;
}) {
  const color =
    task.categoryColor ??
    categories.find((c) => c.name === task.category)?.color ??
    "#94a3b8";

  return (
    <tr className={`border-t border-slate-50 ${rowBg} align-top`}>
      <td />
      <td />
      <td className="px-2 py-1.5 text-[10px] text-slate-400 pt-2.5">Uppgift</td>
      <td className="px-1 py-1.5">
        <div className="relative">
          <span
            className="absolute left-2 top-2.5 w-2.5 h-2.5 rounded-full"
            style={{ background: color }}
          />
          <input
            list={`cats-${date}-${task.id}`}
            value={task.category}
            placeholder="Projekt"
            onChange={(e) => {
              const name = e.target.value;
              const existing = categories.find(
                (c) => c.name.toLowerCase() === name.toLowerCase()
              );
              onUpdateTask(task.id, {
                category: name,
                categoryColor: existing?.color,
              });
            }}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (!name) return;
              const existing = categories.find(
                (c) => c.name.toLowerCase() === name.toLowerCase()
              );
              if (!existing) {
                const created = onUpsertCategory(name);
                onUpdateTask(task.id, {
                  category: created.name,
                  categoryColor: created.color,
                });
              }
            }}
            className="w-full text-sm border border-slate-200 rounded pl-6 pr-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400/40"
          />
          <datalist id={`cats-${date}-${task.id}`}>
            {categories.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>
      </td>
      <td className="px-1 py-1.5">
        <textarea
          value={task.description}
          placeholder="Beskrivning"
          rows={2}
          onChange={(e) =>
            onUpdateTask(task.id, { description: e.target.value })
          }
          className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white resize-y min-h-[2.75rem] focus:outline-none focus:ring-2 focus:ring-slate-400/40"
        />
      </td>
      <td className="px-1 py-1.5">
        <TimeInput
          valueMinutes={task.minutes || null}
          allowMinutesOnly
          aria-label="Tid"
          onChange={(m) => onUpdateTask(task.id, { minutes: m ?? 0 })}
        />
      </td>
      <td colSpan={2} className="px-1 py-1.5">
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={task.billSeparately}
            onChange={(e) =>
              onUpdateTask(task.id, {
                billSeparately: e.target.checked,
                billed: e.target.checked ? task.billed : false,
              })
            }
          />
          Separat
        </label>
      </td>
      <td />
      <td />
      <td className="px-1 py-1.5">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Ta bort"
            onClick={() => onRemoveTask(task.id)}
            className="p-1 text-slate-400 hover:text-rose-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Lägg till uppgift"
            onClick={onAddTask}
            className="p-1 text-slate-400 hover:text-slate-800"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
