import { composeDayBrief, type BriefInput } from "./brief";

/**
 * What the brief must never do.
 *
 * The brief is the one document that leaves this app for an outside model, so
 * every rule about not turning absence into a zero has to hold here or it
 * holds nowhere. These check the readings that would mislead a coach:
 * a missing count shown as 0, a rate computed from an unsubstantiated block,
 * an empty day described as a complete one, a third party's name surviving.
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

const empty: BriefInput = {
  date: "2026-10-27",
  day: null,
  gymName: null,
  metricDefs: [],
  metrics: [],
  snatchBlocks: [],
  snatchAttempts: [],
  hypertrophySets: [],
  calisthenicsEntries: [],
  calisthenicsAttempts: [],
  notes: [],
  injuries: [],
  bodyObservations: [],
  activities: [],
  variations: [],
  exercises: [],
  skillVariations: [],
  assistanceTypes: [],
  thirdParties: [],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const block = (over: Record<string, unknown>) =>
  ({
    id: "b1",
    session_id: "s1",
    session_block_id: null,
    variation_id: 1,
    weight_kg: 45,
    sets_count: null,
    reps_per_set: null,
    attempts: null,
    full_stand_successes: null,
    received_not_stood: null,
    dropped: null,
    received_total: null,
    quality_10: null,
    rpe_10: null,
    straps: null,
    failure_mode_id: null,
    is_warmup: false,
    is_cooldown: false,
    notes: null,
    logged_at: null,
    provenance: "logged",
    record_precision: "attempt",
    record_quality: null,
    is_substantiated: false,
    ...over,
  }) as any;

const lift = (ordinal: number, outcome: string) =>
  ({ id: `a${ordinal}`, block_id: "b1", ordinal, outcome, quality_10: null, rpe_10: null, failure_mode_id: null, notes: null, logged_at: "" }) as any;

console.log("brief");

// --- an empty day is not a complete day ------------------------------------
{
  const { text } = composeDayBrief(empty);
  check("an empty day says so explicitly", text.includes("Nothing at all is recorded for this day"), text);
  check("an empty day is not called a rest day", text.includes("not a rest day"), text);
  check(
    "an empty day never claims nothing is missing",
    !text.includes("Nothing notable missing"),
    text,
  );
}

// --- a rest day is itself, not an empty record -----------------------------
{
  const { text } = composeDayBrief({
    ...empty,
    day: { day: "2026-10-27", status: "rest", notes: null, provenance: "logged" },
  });
  check("a rest day is named as one", text.includes("marked as a rest day"), text);
}

// --- a missing count is never a zero ---------------------------------------
{
  const { text } = composeDayBrief({
    ...empty,
    variations: [{ id: 1, slug: "full", name: "Full snatch", counts_as_full_lift: true, sort_order: 1, is_active: true }],
    snatchBlocks: [block({ attempts: null, full_stand_successes: null })],
  });
  check("an absent attempt count reads 'not recorded'", text.includes("attempts not recorded"), text);
  check(
    "no total is claimed when no block was counted",
    text.includes("not a total of zero"),
    text,
  );
  check("an absent count is never printed as 0", !/\b0 attempts\b/.test(text), text);
  check("an unsubstantiated block yields no rate", text.includes("there is no rate"), text);
  check("the gap is listed", text.includes("outside every rate"), text);
}

// --- attempt rows outrank the block counters --------------------------------
{
  const { text } = composeDayBrief({
    ...empty,
    variations: [{ id: 1, slug: "full", name: "Full snatch", counts_as_full_lift: true, sort_order: 1, is_active: true }],
    // The counters disagree with the rows on purpose: the rows must win, and
    // the basis must be named so a reader knows which they are reading.
    snatchBlocks: [block({ attempts: 99, full_stand_successes: 99, is_substantiated: true })],
    snatchAttempts: [lift(1, "stood"), lift(2, "missed"), lift(3, "stood")],
  });
  check("per-lift rows are used over the counters", text.includes("3 attempts, 2 stood"), text);
  check("the basis is named", text.includes("per lift"), text);
  check("the order of the lifts is given", text.includes("Stood → Missed → Stood"), text);
  check("the rate comes from the rows", text.includes("2/3"), text);
}

// --- the gaps the coach actually hit ---------------------------------------
{
  const { text } = composeDayBrief({
    ...empty,
    skillVariations: [
      { id: 7, skill_id: 1, slug: "floating-tuck", name: "Floating tuck", difficulty: 3, min_hold_seconds: null, requires_no_kick: false, requires_controlled_ascent: false, requires_controlled_descent: false, criteria_notes: null, sort_order: 1 } as any,
    ],
    exercises: [{ id: 3, slug: "face-pull", name: "Face pull", muscle_group_id: 1, is_unilateral: false, sort_order: 1 } as any],
    calisthenicsEntries: [
      { id: "e1", session_id: "s1", skill_variation_id: 7, sets_count: null, reps_per_set: null, attempts: null, successful_attempts: null, best_hold_seconds: null, total_hold_seconds: null, controlled_ascent: null, controlled_descent: null, assistance_id: null, quality_10: 8, notes: null, logged_at: null },
    ],
    hypertrophySets: [
      { id: "h1", session_id: "s1", exercise_id: 3, machine_label: "cable", load_kg: 20, reps: 12, sets_count: 3, side: "both", order_vs_snatch: "after_snatch", parent_set_id: null, is_drop: false, notes: null, volume_load_kg: 720, logged_at: null, rir: null },
    ],
  });
  check(
    "a skill with no attempt count is flagged",
    text.includes("No attempt count for Floating tuck"),
    text,
  );
  check("missing RIR is flagged", text.includes("have no RIR"), text);
  check("the machine is carried through", text.includes("cable"), text);
  check("volume load is stated with its caveat", text.includes("not muscle gained"), text);
}

// --- a third party never leaves --------------------------------------------
{
  const { text, redactions } = composeDayBrief({
    ...empty,
    notes: [
      {
        id: "n1",
        external_source_id: "authored:1",
        note_type: "athlete_report",
        category: "gym_context",
        content: "Rob spotted me on the last set.",
        anchor_date: "2026-10-27",
        period_label: null,
        evidence_status: "user_reported",
        sensitivity: "normal",
        candidate_numeric: false,
        tags: [],
        review_status: "approved",
        linked_session_id: null,
        workstream: null,
      },
    ],
    thirdParties: [{ alias: "Rob", role: "a trainer" }],
  });
  check("the name is gone", !text.includes("Rob"), text);
  check("the role is there instead", text.includes("a trainer"), text);
  check("the redaction is counted", redactions === 1, redactions);
  check("notes are labelled as reports", text.includes("Not measurements"), text);
}

// --- the body ---------------------------------------------------------------
{
  const knee = { id: 1, slug: "right_knee", label: "Right knee", body_region: "knee", side: "right", detail: null, onset_date: null, resolved_date: null, is_active: true, notes: null } as any;
  const obs = (over: Record<string, unknown>) =>
    ({
      id: "o1", injury_id: 1, session_id: null, obs_date: "2026-10-27", pain_free: false,
      pain_during_0_10: null, pain_after_0_10: null, pain_next_morning_0_10: null,
      provoking_activity_id: null, exercise_id: null, load_kg: null,
      change_vs_previous: "unknown", notes: null, provenance: "logged", ...over,
    }) as any;

  // A day checked and found clear is a record, not a silence.
  const free = composeDayBrief({
    ...empty,
    injuries: [knee],
    bodyObservations: [obs({ pain_free: true })],
  });
  check("a pain-free day is stated as checked", free.text.includes("checked, no pain"), free.text);
  check(
    "a pain-free day counts as something recorded",
    !free.text.includes("Nothing at all is recorded"),
    free.text,
  );

  const sore = composeDayBrief({
    ...empty,
    injuries: [knee],
    activities: [{ id: 3, slug: "lunges", name: "Lunges", sort_order: 20 }],
    bodyObservations: [obs({ pain_during_0_10: 4, provoking_activity_id: 3 })],
  });
  check("the severity is given", sore.text.includes("4/10 during"), sore.text);
  check("what brought it on is named", sore.text.includes("brought on by Lunges"), sore.text);
  check(
    "an unanswered next morning says so rather than reading as nil",
    sore.text.includes("next morning not yet recorded"),
    sore.text,
  );
  check("no cause is attributed", sore.text.includes("never a diagnosis"), sore.text);

  // A reading from the day before is not today's. The day also holds a set,
  // so the gap list is reached: on a wholly empty day the blanket "nothing
  // at all is recorded" supersedes it, which is the more useful statement.
  const stale = composeDayBrief({
    ...empty,
    injuries: [knee],
    exercises: [{ id: 3, slug: "face-pull", name: "Face pull", muscle_group_id: 1, is_unilateral: false, sort_order: 1 } as any],
    hypertrophySets: [
      { id: "h1", session_id: "s1", exercise_id: 3, machine_label: null, load_kg: 20, reps: 12, sets_count: 3, side: "both", order_vs_snatch: "after_snatch", parent_set_id: null, is_drop: false, notes: null, volume_load_kg: 720, logged_at: null, rir: 2 } as any,
    ],
    bodyObservations: [obs({ obs_date: "2026-10-26", pain_during_0_10: 9 })],
  });
  check(
    "yesterday's reading is not reported as today's",
    !stale.text.includes("9/10"),
    stale.text,
  );
  check(
    "a trained day with no body reading is flagged",
    stale.text.includes("No body reading today"),
    stale.text,
  );
}

// --- a review of the day is not part of the day's facts ---------------------
{
  const { text } = composeDayBrief({
    ...empty,
    notes: [
      {
        id: "n2",
        external_source_id: "daily_review:2026-10-27",
        note_type: "assistant_review",
        category: "coaching_advice",
        content: "Prioritise repeatable snatches at 40-45 kg.",
        anchor_date: "2026-10-27",
        period_label: null,
        evidence_status: "external_assistant_interpretation",
        sensitivity: "normal",
        candidate_numeric: false,
        tags: ["review"],
        review_status: "approved",
        linked_session_id: null,
        workstream: null,
      },
    ],
  });
  check(
    "yesterday's review is not fed back as fact",
    !text.includes("Prioritise repeatable"),
    text,
  );
}

if (failures > 0) {
  console.error(`\n${failures} failing check(s)`);
  process.exit(1);
}
console.log("\nbrief: all checks passed");
