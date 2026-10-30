import assert from "node:assert/strict";
import { exerciseSetups, matchedReps, outcomeTone, qualityChange, trainingDose } from "./progressPresentation";
import { buildDailyProgress, type DailyRecords } from "./dailyProgress";
import type { Exercise, HypertrophySet, Session } from "./types";

assert.equal(outcomeTone(6, 6), "all");
assert.equal(outcomeTone(3, 6), "partial");
assert.equal(outcomeTone(0, 1), "none");
assert.equal(outcomeTone(0, 3, true), "unknown", "unjudged attempts must not be coloured as failures");
assert.equal(outcomeTone(0, 0), "unknown", "no attempts establish no outcome");
assert.equal(outcomeTone(null, 3), "unknown");
assert.equal(outcomeTone(4, 3), "unknown");
assert.equal(qualityChange([8], [7]), 1);
assert.equal(qualityChange([8, 4], [7]), null, "never average ratings to invent an improvement marker");
assert.equal(qualityChange([null], [7]), null);

const sessions = [
  { id: "mon", session_date: "2026-10-26", provenance: "logged", gym_id: 1 },
  { id: "thu", session_date: "2026-10-29", provenance: "logged", gym_id: 1 },
] as Session[];
const base = { exercise_id: 1, session_id: "mon", machine_label: "A", load_kg: 40, reps: 8, sets_count: 2, side: "both", order_vs_snatch: "after_snatch", is_drop: false, rir: null } as HypertrophySet;
const records: DailyRecords = { sessions, days: [], snatch: [], skills: [], attempts: [], notes: [], metrics: [], sets: [base, { ...base, session_id: "thu", reps: 10 }, { ...base, session_id: "thu", machine_label: "B" }, { ...base, side: "left" }, { ...base, order_vs_snatch: "before_snatch" }, { ...base, machine_label: null }, { ...base, is_drop: true }, { ...base, load_kg: 45 }, { ...base, reps: null }] };
const days = buildDailyProgress("2026-10-30", records, []).days;
const exercises = [{ id: 1, name: "Leg press", muscle_group_id: 1 }] as Exercise[];
const setups = exerciseSetups(days, exercises, []);
assert.equal(setups.length, 5, "machine, side and order must remain separate");
const setup = setups.find(s => s.label.includes(" · A · both · after snatch"))!;
assert.deepEqual(matchedReps(setup, 40).map(p => p.reps), [8, 10], "only the matched load and working sets with reps are plotted");
assert.equal(matchedReps(setups.find(s => !s.identified), 40).length, 0, "unknown equipment cannot establish a matched series");
assert.equal(trainingDose([base, { ...base, sets_count: 3 }], exercises, [], []).count, 5, "dose counts sets_count, not database rows");
console.log("progressPresentation: outcome colours and comparison boundaries passed");
