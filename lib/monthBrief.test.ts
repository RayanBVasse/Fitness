import { composeMonthBrief } from "./monthBrief";
import type { MonthFacts } from "./monthFacts";
import type { WeekFacts } from "./weekFacts";

/**
 * The gate, and the rules the weekly brief already keeps.
 *
 * A month-on-month figure across a reconstruction boundary compares how well
 * two months were written down. It would read as training and would not be,
 * so the brief must withhold it and say why — and must not leave the numbers
 * arranged in a way that invites the reader to compute one anyway.
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

/* eslint-disable @typescript-eslint/no-explicit-any */
const set = (over: Record<string, unknown>) =>
  ({
    date: "2026-10-20",
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

const facts = (over: Partial<WeekFacts> = {}): WeekFacts => ({
  weekStart: "2026-10-01",
  weekEnd: "2026-10-31",
  snatchBlocks: [],
  hypertrophySets: [],
  calisthenics: [],
  metrics: [],
  notes: [],
  experiments: [],
  daysWithRecords: 12,
  importedRows: 0,
  error: null,
  ...over,
});

const month = (over: Partial<MonthFacts> = {}): MonthFacts => ({
  month: "2026-10",
  label: "October 2026",
  facts: facts(),
  basis: "logged",
  previous: { month: "2026-09", label: "September 2026", basis: "logged" },
  comparable: true,
  ...over,
});

/** The same load worked in both months, on the same machine at the same gym. */
const matchedPair = [
  set({ date: "2026-10-20", reps: 4, rir: 0 }),
  set({ date: "2026-09-18", reps: 6, rir: 2 }),
];

console.log("monthBrief");

// --- the gate --------------------------------------------------------------
{
  const { text } = composeMonthBrief(
    month({
      comparable: false,
      previous: { month: "2026-09", label: "September 2026", basis: "reconstructed" },
      facts: facts({ hypertrophySets: matchedPair }),
    }),
    [],
  );
  check("the refusal is stated in full", text.includes("NOT COMPARED WITH SEPTEMBER 2026"), text);
  check(
    "and the reason is given",
    text.includes("recovered from a written source"),
    text,
  );
  check(
    "the reader is asked not to compute one",
    text.includes("Please do not compute one"),
    text,
  );
  check("no matched-load line is drawn", !text.includes("at 45 kg —"), text);
  check("the refusal is listed as a gap", text.includes("No month-on-month comparison"), text);
}

// --- a mixed month is not enough -------------------------------------------
{
  const { text } = composeMonthBrief(
    month({
      comparable: false,
      previous: { month: "2026-09", label: "September 2026", basis: "mixed" },
      facts: facts({ hypertrophySets: matchedPair }),
    }),
    [],
  );
  check(
    "partly logged does not open the gate",
    text.includes("NOT COMPARED") && !text.includes("at 45 kg —"),
    text,
  );
}

// --- two logged months do compare ------------------------------------------
{
  const { text } = composeMonthBrief(
    month({ facts: facts({ hypertrophySets: matchedPair }) }),
    [],
  );
  check("the months are set side by side", text.includes("set side by side"), text);
  check(
    "at a matched load, naming both months",
    text.includes("at 45 kg — September 2026: 6 reps × 3 · RIR 2 → October 2026: 4 reps × 3 · RIR 0"),
    text,
  );
}

// --- it may compute, it may not conclude -----------------------------------
{
  const { text } = composeMonthBrief(
    month({
      facts: facts({
        hypertrophySets: matchedPair,
        metrics: [{ metric: "soreness", label: "Soreness", unit: null, values: [2, 7, 4] }],
      }),
    }),
    [],
  );
  const verdicts = [
    /\bimprov/i, /\bdeclin/i, /\bworsen/i, /\bsuggests\b/i, /\bindicates\b/i,
    /\bdespite\b/i, /\bconsistent(ly)?\b/i, /\bgood\b/i, /\bpoor\b/i,
  ];
  const offender = verdicts.find((r) => r.test(text));
  check("no verdict words anywhere", offender === undefined, offender?.source);
  check("ranges are given, never a mean", text.includes("2–7 over 3 days"), text);
  check("and said to be judgements", text.includes("never averaged"), text);
}

// --- absence stays absence --------------------------------------------------
{
  const { text } = composeMonthBrief(
    month({ facts: facts({ daysWithRecords: 0 }) }),
    [],
  );
  check("an empty month says so", text.includes("Nothing at all is recorded"), text);
  check("and is not a month off", text.includes("not a month without training"), text);
}

{
  const { text } = composeMonthBrief(month(), []);
  check(
    "unrecorded days are named, not counted as rest",
    text.includes("not the same as days without training"),
    text,
  );
  check("October is 31 days", text.includes("of 31 days"), text);
}

if (failures > 0) {
  console.error(`\n${failures} failing check(s)`);
  process.exit(1);
}
console.log("\nmonthBrief: all checks passed");
