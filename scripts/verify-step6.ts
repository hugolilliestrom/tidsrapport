/**
 * Steg 6: exceljs-export månad/alla med tidsrapport + Att fakturera.
 * Kör: npm run verify:step6
 */
import { writeFileSync } from "node:fs";
import { monthKey } from "../src/lib/holidays";
import {
  buildAllWorkbook,
  buildMonthWorkbook,
} from "../src/lib/excelExport";
import {
  createDefaultAppData,
  createEmptyBillingEntry,
  createEmptyDay,
  createEmptyMonth,
  type Task,
} from "../src/types/timesheet";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

const key = monthKey(2026, 5);
const data = createDefaultAppData();
data.months[key] = createEmptyMonth(key);
data.months[key].settings.employmentPercent = 40;
data.months[key].settings.name = "Hugo Lillieström";

const day = createEmptyDay("2026-05-04");
const task: Task = {
  id: "t1",
  category: "Projekt",
  description: "Demo",
  minutes: 192,
  billSeparately: true,
  billed: false,
};
day.tasks = [task];
data.months[key].days["2026-05-04"] = day;
data.billingEntries = [
  createEmptyBillingEntry({
    id: "b1",
    date: "2026-05-12",
    customerProject: "Kund",
    description: "Separat jobb",
    minutes: 60,
    includeInFlex: false,
    invoiced: false,
  }),
];

async function main() {
  const monthWb = buildMonthWorkbook(data, key);
  const monthNames = monthWb.worksheets.map((s) => s.name);
  assert(
    monthNames.some((n) => /maj/i.test(n)),
    `månadsblad finns: ${monthNames.join(", ")}`
  );
  assert(
    monthNames.includes("Att fakturera"),
    "fakturablad 'Att fakturera' i månadsexport"
  );

  const allWb = buildAllWorkbook(data);
  assert(
    allWb.worksheets.some((s) => s.name === "Att fakturera"),
    "fakturablad i alla-export"
  );
  assert(allWb.worksheets.length >= 2, `alla-export har ${allWb.worksheets.length} blad`);

  const buf = Buffer.from(await monthWb.xlsx.writeBuffer());
  assert(buf.byteLength > 1000, `xlsx-storlek ${buf.byteLength} bytes`);
  // ZIP/xlsx magic
  assert(buf[0] === 0x50 && buf[1] === 0x4b, "giltig xlsx (PK zip)");

  writeFileSync("/tmp/tidsrapport-verify-step6.xlsx", buf);
  console.log("Wrote /tmp/tidsrapport-verify-step6.xlsx");

  console.log(
    process.exitCode
      ? "\n❌ Steg 6-verifiering misslyckades"
      : "\n✅ Steg 6-verifiering godkänd"
  );
}

void main();
