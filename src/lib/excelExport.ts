import ExcelJS from "exceljs";
import type { AppData, MonthKey } from "@/types/timesheet";
import {
  WEEKDAY_NAMES_SV,
  eachDateInMonth,
  formatMonthLabelSv,
  getHoliday,
  getISOWeek,
  getWeekday,
  parseMonthKey,
} from "./holidays";
import {
  collectBillableTasks,
  dayFlexMinutes,
  dayWorkedMinutes,
  expectedDayMinutes,
  formatMinutes,
  summarizeMonth,
} from "./timeUtils";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const GRAY_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8E8E8" },
};
const HOLIDAY_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFCE8E8" },
};
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F5F9" },
};
const BOLD: Partial<ExcelJS.Font> = { bold: true };
const THIN: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: "FFCBD5E1" },
};
const BORDERS: Partial<ExcelJS.Borders> = {
  top: THIN,
  left: THIN,
  bottom: THIN,
  right: THIN,
};

function applyBorders(cell: ExcelJS.Cell) {
  cell.border = BORDERS;
}

async function workbookToBlob(wb: ExcelJS.Workbook): Promise<Blob> {
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function ensureMonthView(data: AppData, key: MonthKey) {
  return (
    data.months[key] ?? {
      monthKey: key,
      settings: { ...data.defaults, manualIncomingFlexMinutes: null },
      days: {},
    }
  );
}

function addMonthSheet(wb: ExcelJS.Workbook, data: AppData, key: MonthKey) {
  const { year, month } = parseMonthKey(key);
  const monthData = ensureMonthView(data, key);
  const summary = summarizeMonth(
    { ...data, months: { ...data.months, [key]: monthData } },
    key
  );
  const label = formatMonthLabelSv(year, month);
  const dayTarget = expectedDayMinutes(monthData.settings.employmentPercent);

  const sheetName = `${label.charAt(0).toUpperCase()}${label.slice(1)}`.slice(
    0,
    31
  );
  const ws = wb.addWorksheet(sheetName, {
    properties: { defaultRowHeight: 18 },
  });

  ws.columns = [
    { key: "date", width: 12 },
    { key: "weekday", width: 14 },
    { key: "project", width: 18 },
    { key: "description", width: 40 },
    { key: "time", width: 10 },
    { key: "worked", width: 12 },
    { key: "flex", width: 12 },
    { key: "week", width: 12 },
    { key: "bill", width: 12 },
  ];

  ws.mergeCells("A1:I1");
  ws.getCell("A1").value = "Tidsrapport";
  ws.getCell("A1").font = { bold: true, size: 16 };

  ws.mergeCells("A2:I2");
  ws.getCell("A2").value = `${label} — ${monthData.settings.name}`;

  ws.getCell("A3").value = "Projekt";
  ws.getCell("A3").font = BOLD;
  ws.getCell("B3").value = monthData.settings.project || "—";

  ws.getCell("A4").value = "Sysselsättningsgrad %";
  ws.getCell("A4").font = BOLD;
  ws.getCell("B4").value = monthData.settings.employmentPercent;

  ws.getCell("C4").value = "Ordinarie tid/dag";
  ws.getCell("C4").font = BOLD;
  ws.getCell("D4").value = formatMinutes(dayTarget);

  ws.getCell("E4").value = "Förväntad tid";
  ws.getCell("E4").font = BOLD;
  ws.getCell("F4").value = formatMinutes(summary.expected);

  ws.getCell("A5").value = "Ingående flex";
  ws.getCell("A5").font = BOLD;
  ws.getCell("B5").value = formatMinutes(summary.incomingFlex, true);
  ws.getCell("C5").value = "Månadens flex";
  ws.getCell("C5").font = BOLD;
  ws.getCell("D5").value = formatMinutes(summary.monthFlex, true);
  ws.getCell("E5").value = "Total flex";
  ws.getCell("E5").font = BOLD;
  ws.getCell("F5").value = formatMinutes(summary.totalFlex, true);

  const headerRow = 7;
  [
    "Datum",
    "Veckodag",
    "Projekt",
    "Beskrivning",
    "Tid",
    "Arbetade timmar",
    "Flextid",
    "Vecka",
    "Separat faktura",
  ].forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = BOLD;
    cell.fill = HEADER_FILL;
    applyBorders(cell);
  });

  const weekFirst = new Map<string, string>();
  const weekWorked = new Map<string, number>();
  const dates = eachDateInMonth(year, month);

  for (const date of dates) {
    const day = monthData.days[date];
    const worked = dayWorkedMinutes(day);
    const iso = getISOWeek(date);
    const wk = `W${iso}`;
    if (!weekFirst.has(wk)) weekFirst.set(wk, date);
    weekWorked.set(wk, (weekWorked.get(wk) || 0) + worked);
  }

  let row = headerRow + 1;
  for (const date of dates) {
    const day = monthData.days[date];
    const holiday = getHoliday(date);
    const worked = dayWorkedMinutes(day);
    const flex = dayFlexMinutes(
      date,
      day,
      monthData.settings.employmentPercent
    );
    const wd = getWeekday(date);
    const iso = getISOWeek(date);
    const wk = `W${iso}`;
    const isFirst = weekFirst.get(wk) === date;
    const weekend = wd === 0 || wd === 6;
    const holidayStyle = !!(
      holiday &&
      (holiday.isRedDay || holiday.isWorkFreeEve)
    );
    const tasks = day?.tasks?.length ? day.tasks : [null];

    tasks.forEach((task, idx) => {
      const values: (string | number)[] = [
        idx === 0 ? date : "",
        idx === 0
          ? holiday
            ? `${WEEKDAY_NAMES_SV[wd]} (${holiday.name})`
            : WEEKDAY_NAMES_SV[wd]
          : "",
        task?.category ?? "",
        task?.description ?? "",
        task ? formatMinutes(task.minutes) : "",
        idx === 0 ? formatMinutes(worked) : "",
        idx === 0 ? formatMinutes(flex, true) : "",
        idx === 0 && isFirst
          ? `V${iso} (${formatMinutes(weekWorked.get(wk) || 0)})`
          : "",
        task?.billSeparately ? (task.billed ? "Fakturerad" : "Ja") : "",
      ];

      values.forEach((v, i) => {
        const cell = ws.getCell(row, i + 1);
        cell.value = v;
        applyBorders(cell);
        cell.alignment = { vertical: "top", wrapText: i === 3 };
        if (weekend || day?.isDayOff) cell.fill = GRAY_FILL;
        else if (holidayStyle) cell.fill = HOLIDAY_FILL;
      });
      row++;
    });
  }

  row += 1;
  ws.getCell(row, 1).value = "Från tidigare månad";
  ws.getCell(row, 1).font = BOLD;
  ws.getCell(row, 2).value = formatMinutes(summary.incomingFlex, true);
  ws.getCell(row, 3).value = "Totalt arbetat";
  ws.getCell(row, 3).font = BOLD;
  ws.getCell(row, 4).value = formatMinutes(summary.worked);

  row += 1;
  ws.getCell(row, 1).value = "Månadens flex";
  ws.getCell(row, 1).font = BOLD;
  ws.getCell(row, 2).value = formatMinutes(summary.monthFlex, true);
  ws.getCell(row, 3).value = "Total flex";
  ws.getCell(row, 3).font = BOLD;
  ws.getCell(row, 4).value = formatMinutes(summary.totalFlex, true);
}

/**
 * Fakturablad: separat-markerade uppgifter + BillingEntry.
 * monthFilter: om satt, bara poster i den månaden (YYYY-MM).
 */
function addBillableSheet(
  wb: ExcelJS.Workbook,
  data: AppData,
  monthFilter?: MonthKey
) {
  const ws = wb.addWorksheet("Att fakturera");
  ws.columns = [
    { key: "date", width: 12 },
    { key: "source", width: 12 },
    { key: "project", width: 22 },
    { key: "description", width: 40 },
    { key: "time", width: 10 },
    { key: "flex", width: 14 },
    { key: "status", width: 16 },
  ];

  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = monthFilter
    ? `Att fakturera — ${monthFilter}`
    : "Att fakturera — alla månader";
  ws.getCell("A1").font = { bold: true, size: 14 };

  const headers = [
    "Datum",
    "Källa",
    "Projekt / Kund",
    "Beskrivning",
    "Tid",
    "I flex",
    "Status",
  ];
  headers.forEach((h, i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = h;
    cell.font = BOLD;
    cell.fill = HEADER_FILL;
    applyBorders(cell);
  });

  let rows = collectBillableTasks(data);
  if (monthFilter) {
    rows = rows.filter((e) => e.monthKey === monthFilter || e.date.startsWith(monthFilter));
  }

  // includeInFlex-info för billing entries
  const flexById = new Map(
    data.billingEntries.map((e) => [e.id, e.includeInFlex])
  );

  let totalOpen = 0;
  let totalAll = 0;
  rows.forEach((e, idx) => {
    const r = idx + 4;
    const inFlex =
      e.source === "task"
        ? "Ja (uppgift)"
        : flexById.get(e.taskId)
          ? "Ja"
          : "Nej";
    if (!e.billed) totalOpen += e.minutes;
    totalAll += e.minutes;
    const vals = [
      e.date,
      e.source === "billing" ? "Faktureringspost" : "Uppgift",
      e.category,
      e.description,
      formatMinutes(e.minutes),
      inFlex,
      e.billed ? "Fakturerad" : "Ska faktureras",
    ];
    vals.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v;
      applyBorders(cell);
      cell.alignment = { wrapText: true, vertical: "top" };
    });
  });

  const footer = rows.length + 5;
  ws.getCell(footer, 1).value = "Totalt";
  ws.getCell(footer, 1).font = BOLD;
  ws.getCell(footer, 5).value = formatMinutes(totalAll);
  ws.getCell(footer, 5).font = BOLD;
  ws.getCell(footer + 1, 1).value = "Ofakturerat";
  ws.getCell(footer + 1, 1).font = BOLD;
  ws.getCell(footer + 1, 5).value = formatMinutes(totalOpen);
  ws.getCell(footer + 1, 5).font = BOLD;
}

/** Bygg workbook (för UI-download och verifiering) */
export function buildMonthWorkbook(
  data: AppData,
  key: MonthKey
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const month = ensureMonthView(data, key);
  wb.creator = month.settings.name;
  wb.created = new Date();
  addMonthSheet(wb, data, key);
  addBillableSheet(wb, data, key);
  return wb;
}

export function buildAllWorkbook(data: AppData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = data.defaults.name;
  wb.created = new Date();

  const months = new Set<string>(Object.keys(data.months));
  const now = new Date();
  months.add(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );

  for (const mk of Array.from(months).sort()) {
    addMonthSheet(wb, data, mk);
  }
  addBillableSheet(wb, data);
  return wb;
}

export async function exportMonthExcel(
  data: AppData,
  key: MonthKey
): Promise<void> {
  const wb = buildMonthWorkbook(data, key);
  const blob = await workbookToBlob(wb);
  downloadBlob(blob, `tidsrapport-${key}.xlsx`);
}

export async function exportAllExcel(data: AppData): Promise<void> {
  const wb = buildAllWorkbook(data);
  const blob = await workbookToBlob(wb);
  downloadBlob(
    blob,
    `tidsrapport-alla-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
