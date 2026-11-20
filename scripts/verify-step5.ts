/**
 * Steg 5: includeInFlex=false får inte påverka flex; billSeparately listor.
 * Kör: npm run verify:step5
 */
import { monthKey } from "../src/lib/holidays";
import {
  collectBillableTasks,
  formatMinutes,
  summarizeMonth,
} from "../src/lib/timeUtils";
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

const base = summarizeMonth(data, key);
const expected = base.expected;

// Separat-markerad uppgift räknas fortfarande som arbetad tid (flex)
const day = createEmptyDay("2026-05-04");
const task: Task = {
  id: "t1",
  category: "Projekt",
  description: "Separat jobb",
  minutes: 192,
  billSeparately: true,
  billed: false,
};
day.tasks = [task];
data.months[key].days["2026-05-04"] = day;

const withTask = summarizeMonth(data, key);
assert(
  withTask.worked === 192,
  `arbetat med separat-uppgift = ${formatMinutes(withTask.worked)}`
);
assert(
  collectBillableTasks(data).length === 1,
  "Att fakturera innehåller 1 uppgift"
);

// BillingEntry med includeInFlex=false får INTE påverka flex
data.billingEntries = [
  createEmptyBillingEntry({
    id: "b1",
    date: "2026-05-10",
    customerProject: "Kund A",
    description: "Extra",
    minutes: 480,
    includeInFlex: false,
    invoiced: false,
  }),
];
const withEntryFalse = summarizeMonth(data, key);
assert(
  withEntryFalse.worked === withTask.worked,
  `includeInFlex=false: arbetat oförändrat (${formatMinutes(withEntryFalse.worked)})`
);
assert(
  withEntryFalse.monthFlex === withTask.monthFlex,
  `includeInFlex=false: månadsflex oförändrad (${formatMinutes(withEntryFalse.monthFlex, true)})`
);
assert(
  collectBillableTasks(data).length === 2,
  "Att fakturera: uppgift + billing entry"
);

// includeInFlex=true SKA läggas till arbetat/flex
data.billingEntries[0].includeInFlex = true;
const withEntryTrue = summarizeMonth(data, key);
assert(
  withEntryTrue.worked === withTask.worked + 480,
  `includeInFlex=true: arbetat = ${formatMinutes(withEntryTrue.worked)}`
);
assert(
  withEntryTrue.monthFlex === withTask.monthFlex + 480,
  `includeInFlex=true: flex ökade med 08:00`
);

assert(expected === 19 * 192, `bas-mål maj 2026 = ${formatMinutes(expected)}`);

console.log(
  process.exitCode
    ? "\n❌ Steg 5-verifiering misslyckades"
    : "\n✅ Steg 5-verifiering godkänd"
);
