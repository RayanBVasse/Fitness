import assert from "node:assert/strict";
import { buildMonthlyProgress } from "./monthlyProgress";
import { monthDates, nextMonth, previousMonth, resolveMonth } from "./monthDates";
import type { DailyRecords } from "./dailyProgress";
import type { Session, SnatchBlock, HypertrophySet } from "./types";

assert.equal(monthDates("2024-02").length, 29);
assert.equal(monthDates("2025-02").length, 28);
assert.equal(monthDates("2026-10").length, 31);
assert.equal(nextMonth("2026-12"), "2027-01");
assert.equal(previousMonth("2026-01"), "2025-12");
assert.equal(resolveMonth("2026-13", "2026-10-30"), "2026-10");
assert.equal(resolveMonth("2026-11", "2026-10-30"), "2026-10");
assert.equal(resolveMonth("2026-09", "2026-10-30"), "2026-09");
const sessions = [
  { id: "hist", session_date: "2026-10-04", provenance: "historical_reconstruction" },
  { id: "log", session_date: "2026-10-26", provenance: "logged" },
  { id: "mixed", session_date: "2026-10-27", provenance: "logged" },
] as Session[];
const snatch = [
  { id: "h", session_id: "hist", variation_id: 1, provenance: "historical_reconstruction", weight_kg: 50, attempts: null, full_stand_successes: 1 },
  { id: "l", session_id: "log", variation_id: 1, provenance: "logged", weight_kg: 45, attempts: 4, full_stand_successes: 0 },
  { id: "m", session_id: "mixed", variation_id: 1, provenance: "logged", weight_kg: 45, attempts: null, full_stand_successes: 1 },
] as SnatchBlock[];
const sets = [{ id: "old-set", session_id: "mixed", sets_count: 3, provenance: "workbook_import" }, { id: "new-set", session_id: "log", sets_count: 2, provenance: "logged" }] as DailyRecords["sets"];
const records: DailyRecords = { sessions, snatch, sets, days: [{ day: "2026-10-25", status: "rest", provenance: "logged", notes: null }], skills: [], attempts: [], notes: [], metrics: [{ metric_date: "2026-10-30", metric: "fatigue", value_numeric: 0, value_text: null }] };
const month = buildMonthlyProgress("2026-10", "2026-10-30", records, [1]);
assert.equal(month.days.length, 31);
assert.equal(month.days[30].kind, "future", "unelapsed dates are not missing training");
assert.equal(month.days[2].kind, "none", "no record is not rest");
assert.equal(month.days[24].kind, "rest");
assert.equal(month.days[29].kind, "context", "metrics alone do not establish a workout or a morning-only report");
assert.equal(month.days[29].metrics[0].value_numeric, 0, "a recorded zero survives");
assert.equal(month.days[3].kind, "historical");
assert.equal(month.days[26].kind, "mixed");
assert.equal(month.counts.trainingDays, 3);
assert.equal(month.counts.snatch.stood, 0, "historical stands and incomplete logged blocks never inflate the numerator");
assert.equal(month.counts.snatch.attempts, 4);
assert.equal(month.counts.countedSnatchDays, 1);
assert.equal(month.milestones[0].stood, 1);
assert.equal(month.milestones[0].attempts, null);
assert.equal(month.counts.loggedSets, 2);
assert.equal(month.counts.historicalSets, 3);
assert.equal(month.weeks[0].historical, 1);
assert.equal(month.weeks.at(-1)!.mixed, 1);
assert.equal(month.weeks.at(-1)!.logged, 1);
assert.equal(month.weeks.at(-1)!.to, "2026-10-30");
const inherited = buildMonthlyProgress("2026-10", "2026-10-30", { ...records, sets: [...sets, { id: "default-child", session_id: "hist", sets_count: 4, provenance: "logged" } as DailyRecords["sets"][number]] }, [1]);
assert.equal(inherited.days[3].kind, "historical", "default child provenance never upgrades a historical session");
assert.equal(inherited.counts.historicalSets, 7);
assert.equal(inherited.counts.loggedSets, 2);
const past = buildMonthlyProgress("2026-09", "2026-10-30", { sessions: [], snatch: [], sets: [] as HypertrophySet[], skills: [], attempts: [], days: [], metrics: [], notes: [] }, [1]);
assert.equal(past.through, "2026-09-30");
assert.equal(past.days.some(d => d.kind === "rest" || d.kind === "future"), false);
console.log("monthlyProgress: calendar boundaries, provenance, denominators and missing observations passed");
