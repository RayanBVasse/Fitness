import { composeWeekBrief } from "./weekBrief";
import type { WeekFacts } from "./weekFacts";

/**
 * What the weekly brief must never do.
 *
 * Two jobs. The first is the one the daily brief has: absence stays absence,
 * a rate needs a denominator, and what is missing is named. The second is
 * particular to this file — it may compute, it may not conclude. A brief
 * that starts writing "improving" is doing the coach's job with none of the
 * coach's information, and these checks are the only thing stopping it.
 */

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}`, detail ?? "");
  }
}

const empty: WeekFacts = {
  weekStart: "2026-10-26",
  weekEnd: "2026-11-01",
  snatchBlocks: [],
  hypertrophySets: [],
  calisthenics: [],
  metrics: [],
  notes: [],
  experiments: [],
  daysWithRecords: 0,
  importedRows: 0,
  error: null,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const block = (over: Record<string, unknown>) =>
  ({
    session_date: "2026-10-27",
    weight_kg: 45,
    variation: "full",
    counts_as_full_lift: true,
    attempts: null,
    full_stand_successes: null,
    received_not_stood: null,
    is_substantiated: false,
    is_warmup: false,
    quality_10: null,
    notes: null,
    ...over,
  }) as any;

const set = (over: Record<string, unknown>) =>
  ({
    date: "2026-10-27",
    exercise: "Seated hamstring curl",
    machine: "Maxim",
    gym: "Maxim gym",
    load_kg: 45,
    reps: 6,
    sets_count: 3,
    rir: 2,
    is_drop: false,
    volume_load_kg: 810,
    notes: null,
    ...over,
  }) as any;

console.log("weekBrief");

// --- it may compute, it may not conclude -----------------------------------
{
  const { text } = composeWeekBrief(
    {
      ...empty,
      daysWithRecords: 4,
      snatchBlocks: [
        block({ attempts: 5, full_stand_successes: 4, is_substantiated: true, quality_10: 4 }),
        block({ attempts: 5, full_stand_successes: 5, is_substantiated: true, quality_10: 9 }),
      ],
      hypertrophySets: [
        set({ date: "2026-10-27", reps: 4, rir: 0, volume_load_kg: 540 }),
        set({ date: "2026-10-06", reps: 6, rir: 2 }),
      ],
    },
    [],
  );

  // A verdict in any of these words is the file doing the coach's job.
  const verdicts = [
    /\bimprov/i, /\bdeclin/i, /\bworsen/i, /\bprogress(ing|ed)\b/i,
    /\bsuggests\b/i, /\bindicates\b/i, /\bbecause\b/i, /\bdespite\b/i,
    /\bconsistent(ly)?\b/i, /\bgood\b/i, /\bpoor\b/i, /\bstrong\b/i,
  ];
  const offender = verdicts.find((r) => r.test(text));
  check("no verdict words anywhere", offender === undefined, offender?.source);

  // Arithmetic is fine and expected.
  check("the quality spread is computed", text.includes("spread 5"), text);
  const matched = text.split("\n").find((line) => line.includes("at 45 kg")) ?? "";
  check(
    "the load is not repeated three times in one line",
    matched.split("45 kg").length - 1 === 1,
    matched,
  );
  check(
    "a matched load is set beside its last reading",
    /at 45 kg — 6 Oct: 6 reps × 3 · RIR 2 → 27 Oct: 4 reps × 3 · RIR 0/.test(text),
    text,
  );
}

// --- absence stays absence -------------------------------------------------
{
  const { text } = composeWeekBrief(empty, []);
  check("an empty week says so", text.includes("Nothing at all is recorded for this week"), text);
  check("an empty week is not a week off", text.includes("not a week without training"), text);
}

// --- a partly logged week names the days it does not cover -----------------
{
  const { text } = composeWeekBrief({ ...empty, daysWithRecords: 4 }, []);
  check("the days covered are counted", text.includes("4 of 7 days hold a record"), text);
  check(
    "the rest are named as unrecorded, not as rest",
    text.includes("not the same as days without training"),
    text,
  );
}

// --- a rate needs a denominator --------------------------------------------
{
  const { text } = composeWeekBrief(
    { ...empty, daysWithRecords: 1, snatchBlocks: [block({})] },
    [],
  );
  check("an unsubstantiated block yields no rate", text.includes("there is no rate"), text);
  check("and no total either", text.includes("there is no total"), text);
  check("never a zero", !/\b0 attempts\b/.test(text), text);
  check("the missing rating is named", text.includes("No technical quality rating"), text);
}

// --- the register is the point ---------------------------------------------
{
  const { text } = composeWeekBrief(
    {
      ...empty,
      daysWithRecords: 3,
      calisthenics: [
        {
          variation: "Floating tuck",
          attempts: 9,
          successes: 8,
          longestHold: null,
          minHoldSeconds: null,
          basis: "attempt",
        },
      ],
      experiments: [
        {
          id: "e1", kind: "recommendation", title: "Hold the load",
          statement: "Stay at 40-45 kg until the catch repeats.",
          measurement: "Stand rate at 45 kg.", comparison: null, workstream: "snatch",
          status: "collecting", started_on: "2026-10-20", ended_on: null,
          outcome: null, outcome_note: null, followed: "declined",
          updated_at: "2026-10-29T00:00:00Z",
        },
        {
          id: "e2", kind: "recommendation", title: "Calisthenics first",
          statement: "Move the tuck to the start.",
          measurement: "Success rate.", comparison: null, workstream: null,
          status: "collecting", started_on: "2026-10-20", ended_on: null,
          outcome: null, outcome_note: null, followed: "not_yet",
          updated_at: "2026-10-29T00:00:00Z",
        },
      ],
    },
    [],
  );
  check("the register travels with the week", text.includes("On the register"), text);
  check("what you did about advice is stated", text.includes("decided against"), text);
  check(
    "advice with no answer yet is chased",
    text.includes("no answer yet as to whether it was followed"),
    text,
  );
}

// --- a third party never leaves --------------------------------------------
{
  const { text, redactions } = composeWeekBrief(
    {
      ...empty,
      daysWithRecords: 1,
      notes: [
        {
          id: "n1", external_source_id: "authored:1", note_type: "athlete_report",
          category: "gym_context", content: "Rob spotted me on the last set.",
          anchor_date: "2026-10-27", period_label: null, evidence_status: "user_reported",
          sensitivity: "normal", candidate_numeric: false, tags: [],
          review_status: "approved", linked_session_id: null, workstream: null,
          exercise_id: null, skill_variation_id: null,
        },
      ],
    },
    [{ alias: "Rob", role: "a trainer" }],
  );
  check("the name is gone", !text.includes("Rob"), text);
  check("the role is there instead", text.includes("a trainer"), text);
  check("the redaction is counted", redactions === 1, redactions);
}

if (failures > 0) {
  console.error(`\n${failures} failing check(s)`);
  process.exit(1);
}
console.log("\nweekBrief: all checks passed");
