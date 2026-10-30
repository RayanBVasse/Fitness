import assert from "node:assert/strict";
import { buildDailyProgress, sevenDates, snatchCounts, skillResult, type DailyRecords } from "./dailyProgress";
import type { SnatchBlock, Session, CalisthenicsEntry, CalisthenicsAttempt } from "./types";

const block = (overrides: Partial<SnatchBlock> = {}) => ({ id: "b", session_id: "s", variation_id: 1, weight_kg: 45, attempts: 4, full_stand_successes: 0, provenance: "logged", is_warmup: false, is_cooldown: false, ...overrides } as SnatchBlock);
const session = (overrides: Partial<Session> = {}) => ({ id: "s", session_date: "2026-10-29", provenance: "logged", ...overrides } as Session);
const blank: DailyRecords = { sessions: [], days: [], snatch: [], sets: [], skills: [], attempts: [], metrics: [], notes: [] };

assert.deepEqual(sevenDates("2026-10-30"), ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
assert.equal(sevenDates("2027-01-03")[0], "2026-12-28");
assert.equal(new Set(sevenDates("2026-10-27")).size, 7, "DST does not duplicate or skip a date");
assert.deepEqual(snatchCounts([block(), block({ attempts: null, full_stand_successes: 3 })]), { attempts: 4, stood: 0, complete: 1, unknown: 1 }, "genuine zero stays zero; partial blocks do not inflate numerator");
assert.equal(snatchCounts([block({ attempts: 1, full_stand_successes: 2 })]).unknown, 1, "invalid counts do not produce impossible rates");
const data = buildDailyProgress("2026-10-30", { ...blank, sessions: [session(), session({ id: "old", provenance: "historical_reconstruction" })], snatch: [block(), block({ is_warmup: true }), block({ is_cooldown: true }), block({ variation_id: 2 }), block({ session_id: "old" })], days: [{ day: "2026-10-25", status: "rest", notes: null, provenance: "logged" }], metrics: [{ metric_date: "2026-10-28", metric: "fatigue", value_numeric: 0, value_text: null }] }, [1]);
assert.equal(data.days.length, 7);
assert.equal(data.days[0].status, "No log");
assert.equal(data.days[1].status, "Rest");
assert.equal(data.days[4].status, "Context only");
assert.equal(data.days[4].metrics[0].value_numeric, 0);
assert.equal(data.days[5].snatch.length, 1, "warmups, cooldowns, other variations and imports excluded");
assert.equal(data.days[6].status, "Not yet logged");
assert.equal(data.days[0].metrics.length, 0, "missing fatigue stays absent");
assert.equal(data.importedSessions, 1);
const entry = { id: "e", attempts: 99, successful_attempts: 99 } as CalisthenicsEntry;
assert.deepEqual(skillResult(entry, [{ entry_id: "e", succeeded: null }, { entry_id: "e", succeeded: true }] as CalisthenicsAttempt[]), { attempts: 2, successes: 1, unjudged: 1 }, "per-attempt records take precedence and preserve unjudged attempts");
assert.deepEqual(skillResult({ ...entry, attempts: null, successful_attempts: null }, []), { attempts: null, successes: null, unjudged: null });
console.log("dailyProgress: all measurement and date-window checks passed");
