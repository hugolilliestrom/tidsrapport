/**
 * Steg 3-verifiering: localStorage-sanitize + KPI-summering för layout.
 * Kör: npm run verify:step3
 */
import { monthKey } from "../src/lib/holidays";
import { formatMinutes, summarizeMonth } from "../src/lib/timeUtils";
import {
  createDefaultAppData,
  createEmptyMonth,
} from "../src/types/timesheet";
import { sanitizeAppData } from "../src/lib/timesheetStorage";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

console.log("=== Sanitize / hydration-shape ===");
const raw = {
  defaults: { name: "Hugo Lillieström", employmentPercent: 40 },
  months: {},
  categories: [],
  // billingEntries saknas → ska bli []
};
const cleaned = sanitizeAppData(raw);
assert(cleaned.defaults.name === "Hugo Lillieström", "default name");
assert(cleaned.defaults.employmentPercent === 40, "default 40%");
assert(Array.isArray(cleaned.billingEntries), "billingEntries array");
assert(cleaned.billingEntries.length === 0, "billingEntries tom");

console.log("\n=== KPI summary (maj 2026 @ 40%) ===");
const key = monthKey(2026, 5);
const data = createDefaultAppData();
data.months[key] = createEmptyMonth(key);
data.months[key].settings.employmentPercent = 40;
const sum = summarizeMonth(data, key);
assert(sum.workdays === 19, `arbetsdagar = ${sum.workdays}`);
assert(sum.expected === 19 * 192, `mål = ${formatMinutes(sum.expected)}`);
assert(sum.worked === 0, "arbetat = 0");
assert(sum.monthFlex === -sum.expected, "månadens flex = −mål");
assert(
  typeof sum.incomingFlex === "number" && typeof sum.totalFlex === "number",
  `ingående/total flex: ${formatMinutes(sum.incomingFlex, true)} / ${formatMinutes(sum.totalFlex, true)}`
);

console.log(
  process.exitCode
    ? "\n❌ Steg 3-verifiering misslyckades"
    : "\n✅ Steg 3-verifiering godkänd"
);
