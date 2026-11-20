/**
 * Steg 2-verifiering: arbetsdagar 2026 + formatMinutes + parseTimeInput + flexkedja.
 * Kör: npx tsx scripts/verify-step2.ts
 */
import {
  countWorkdaysInMonth,
  easterSunday,
  isExpectedWorkday,
  monthKey,
} from "../src/lib/holidays";
import {
  expectedDayMinutes,
  formatMinutes,
  parseTimeInput,
  summarizeMonth,
  getTotalFlexMinutes,
} from "../src/lib/timeUtils";
import {
  createDefaultAppData,
  createEmptyDay,
  createEmptyMonth,
  type AppData,
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

function checkMonth(
  label: string,
  year: number,
  month: number,
  expectDays: number,
  expectFmt: string
) {
  const days = countWorkdaysInMonth(year, month);
  const mins = days * expectedDayMinutes(40);
  const fmt = formatMinutes(mins);
  assert(
    days === expectDays && fmt === expectFmt,
    `${label}: ${days} arbetsdagar = ${fmt} (förväntat ${expectDays} / ${expectFmt})`
  );
}

console.log("=== formatMinutes ===");
assert(formatMinutes(4032) === "67:12", '4032 → "67:12"');
assert(formatMinutes(-2750) === "-45:50", '-2750 → "-45:50"');
assert(formatMinutes(-192) === "-03:12", '-192 → "-03:12"');
assert(formatMinutes(192) === "03:12", '192 → "03:12"');

console.log("\n=== parseTimeInput ===");
assert(parseTimeInput("1:30") === 90, "1:30 → 90");
assert(parseTimeInput("01:30") === 90, "01:30 → 90");
assert(parseTimeInput("1,5") === 90, "1,5 → 90");
assert(parseTimeInput("1.5") === 90, "1.5 → 90");
assert(parseTimeInput("45") === 45, "45 → 45");

console.log("\n=== Påsk 2026 (Meeus/Jones/Butcher) ===");
const e26 = easterSunday(2026);
assert(
  e26.month === 4 && e26.day === 5,
  `Påskdagen 2026 = ${e26.month}-${e26.day} (förväntat 4-5)`
);
assert(expectedDayMinutes(40) === 192, "40% → 192 min/dag");
assert(expectedDayMinutes(100) === 480, "100% → 480 min/dag");

console.log("\n=== Arbetsdagar 2026 @ 40% ===");
checkMonth("Maj 2026", 2026, 5, 19, "60:48");
checkMonth("Juni 2026", 2026, 6, 21, "67:12");
checkMonth("Augusti 2026", 2026, 8, 21, "67:12");
checkMonth("September 2026", 2026, 9, 22, "70:24");

// Manuell ledig dag minskar arbetsdagar
const mayWithOff = countWorkdaysInMonth(2026, 5, { "2026-05-04": true });
assert(
  mayWithOff === 18,
  `Maj 2026 med manuell ledig 4 maj = ${mayWithOff} (förväntat 18)`
);
assert(
  !isExpectedWorkday("2026-05-04", true),
  "Manuell ledig dag → ej förväntad arbetsdag"
);
assert(
  !isExpectedWorkday("2026-05-01", false),
  "1 maj 2026 (röddag) → ej förväntad arbetsdag"
);

console.log("\n=== Flexkedja ===");
const data: AppData = createDefaultAppData();
const janKey = monthKey(2026, 1);
const febKey = monthKey(2026, 2);

const jan = createEmptyMonth(janKey);
jan.settings.employmentPercent = 40;
jan.settings.manualIncomingFlexMinutes = -2750; // -45:50
// Logga 0 arbetad tid → månadsflex = −förväntat
data.months[janKey] = jan;

const feb = createEmptyMonth(febKey);
feb.settings.employmentPercent = 40;
feb.settings.manualIncomingFlexMinutes = null; // auto från januari
data.months[febKey] = feb;

const janSum = summarizeMonth(data, janKey);
const febSum = summarizeMonth(data, febKey);

assert(
  janSum.incomingFlex === -2750,
  `Jan ingående = ${formatMinutes(janSum.incomingFlex)} (förväntat -45:50)`
);
assert(
  febSum.incomingFlex === janSum.totalFlex,
  `Feb ingående (${formatMinutes(febSum.incomingFlex)}) = Jan total (${formatMinutes(janSum.totalFlex)})`
);

// Ändra januari: lägg till arbetad tid → Feb ingående ska uppdateras
const task: Task = {
  id: "t1",
  category: "Projekt",
  description: "Test",
  minutes: 192 * 5, // 5 arbetsdagar × 03:12
  billSeparately: false,
  billed: false,
};
const day = createEmptyDay("2026-01-05");
day.tasks = [task];
jan.days["2026-01-05"] = day;

const janAfter = summarizeMonth(data, janKey);
const febAfter = summarizeMonth(data, febKey);
assert(
  febAfter.incomingFlex === janAfter.totalFlex,
  `Efter Jan-ändring: Feb ingående (${formatMinutes(febAfter.incomingFlex)}) = Jan total (${formatMinutes(janAfter.totalFlex)})`
);
assert(
  febAfter.incomingFlex !== febSum.incomingFlex,
  `Flexkedjan propagerade ändring (delta ${formatMinutes(febAfter.incomingFlex - febSum.incomingFlex, true)})`
);

assert(
  getTotalFlexMinutes(data, febKey) === febAfter.totalFlex,
  `getTotalFlexMinutes stämmer för feb`
);

console.log(
  process.exitCode
    ? "\n❌ Steg 2-verifiering misslyckades"
    : "\n✅ Steg 2-verifiering godkänd"
);
