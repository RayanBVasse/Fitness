import { redactThirdParties, type ThirdParty } from "@/lib/coach/verify";
import { longDate } from "@/lib/time";
import {
  OUTCOME_LABELS,
  type AssistanceType,
  type CalisthenicsAttempt,
  type CalisthenicsEntry,
  type ContextNote,
  type DailyMetric,
  type DailyMetricDef,
  type DayRecord,
  type Exercise,
  type HypertrophySet,
  type Injury,
  type InjuryObservation,
  type ProvokingActivity,
  type SkillVariation,
  type SnatchAttempt,
  type SnatchBlock,
  type SnatchVariation,
} from "@/lib/types";

/**
 * The day, as facts, for pasting into an outside model.
 *
 * The coach is an LLM outside this app, so the app's job on the way out is
 * to hand over what it actually knows and nothing else. Every figure here is
 * counted from rows. Nothing is inferred, nothing is averaged across
 * provenance, and nothing unrecorded is written as a zero — a missing attempt
 * count says so, because an outside reader cannot tell the difference and
 * will otherwise read absence as evidence.
 *
 * It ends with what was NOT recorded. That section is the most useful part of
 * the document: it stops a reader concluding from silence, and it is the thing
 * a human writing the same summary always leaves out.
 *
 * Other people are replaced by their role before the text is composed, so
 * what you paste is what the Coach tool would have been allowed to read. The
 * redactor is the same one; this path does not get a weaker one just because
 * the sending is done by hand.
 */

export interface BriefInput {
  date: string;
  day: DayRecord | null;
  gymName: string | null;
  metricDefs: DailyMetricDef[];
  metrics: DailyMetric[];
  snatchBlocks: SnatchBlock[];
  snatchAttempts: SnatchAttempt[];
  hypertrophySets: HypertrophySet[];
  calisthenicsEntries: CalisthenicsEntry[];
  calisthenicsAttempts: CalisthenicsAttempt[];
  notes: ContextNote[];
  injuries: Injury[];
  bodyObservations: InjuryObservation[];
  activities: ProvokingActivity[];
  variations: SnatchVariation[];
  exercises: Exercise[];
  skillVariations: SkillVariation[];
  assistanceTypes: AssistanceType[];
  thirdParties: ThirdParty[];
}

const num = (value: number) =>
  value >= 1000 ? value.toLocaleString("en-GB") : String(value);

/**
 * A count that may not have been recorded, with its unit.
 *
 * Null is never 0, and the phrasing puts the absence after the noun —
 * "attempts not recorded" rather than "not recorded attempts" — because the
 * first reads as a fact about the record and the second as a quantity.
 */
const count = (value: number | null | undefined, unit: string) =>
  value == null ? `${unit} not recorded` : `${num(value)} ${unit}`;

export function composeDayBrief(input: BriefInput): { text: string; redactions: number } {
  const lines: string[] = [];
  const missing: string[] = [];

  const name = <T extends { id: number; name: string }>(rows: T[], id: number | null) =>
    (id == null ? null : rows.find((r) => r.id === id)?.name) ?? null;

  lines.push(`# Training facts — ${longDate(input.date)}`);
  lines.push("");
  lines.push(
    `Recorded in the Fitness Observatory. Counts come from rows; nothing here is estimated.`,
  );
  if (input.gymName) lines.push(`Gym: ${input.gymName}`);
  if (input.day?.status === "rest") {
    lines.push(`The day is recorded as a rest day.`);
  }
  lines.push("");

  // --- check-in ------------------------------------------------------------
  const scales = input.metricDefs.filter((d) => d.kind !== "text");
  const recorded = scales
    .map((def) => {
      const row = input.metrics.find((m) => m.metric === def.slug);
      const value = row?.value_numeric ?? null;
      return value == null
        ? null
        : `${def.label} ${value}${def.max_value ? `/${def.max_value}` : (def.unit ?? "")}`;
    })
    .filter((v): v is string => v !== null);
  const unrecordedScales = scales
    .filter((def) => (input.metrics.find((m) => m.metric === def.slug)?.value_numeric ?? null) == null)
    .map((def) => def.label);

  lines.push("## Check-in");
  lines.push(recorded.length > 0 ? recorded.join(" · ") : "Nothing recorded.");
  if (unrecordedScales.length > 0) {
    missing.push(`Check-in not completed for: ${unrecordedScales.join(", ")}.`);
  }
  lines.push("");

  // --- snatch --------------------------------------------------------------
  lines.push("## Snatch");
  if (input.snatchBlocks.length === 0) {
    lines.push("No snatch blocks recorded.");
  } else {
    let attemptTotal = 0;
    let stoodTotal = 0;
    let substantiatedAttempts = 0;
    let substantiatedStood = 0;
    // Blocks that contributed a number, and blocks that could not. A total
    // over the second group is what turns "unknown" into "none".
    let counted = 0;
    let uncounted = 0;

    for (const block of input.snatchBlocks) {
      const lifts = input.snatchAttempts
        .filter((a) => a.block_id === block.id)
        .sort((a, b) => a.ordinal - b.ordinal);
      // Attempt rows are the source of truth where they exist; the block
      // counters are a trigger-kept summary of them. An imported block has no
      // rows and keeps its own totals, and the basis is named either way.
      const basis = lifts.length > 0 ? "per lift" : "block total";
      const attempts = lifts.length > 0 ? lifts.length : block.attempts;
      const stood =
        lifts.length > 0
          ? lifts.filter((a) => a.outcome === "stood").length
          : block.full_stand_successes;
      const caught =
        lifts.length > 0
          ? lifts.filter((a) => a.outcome === "received_not_stood").length
          : block.received_not_stood;

      const label = name(input.variations, block.variation_id) ?? "Snatch";
      const load = block.weight_kg == null ? "load not recorded" : `${block.weight_kg} kg`;
      const flags = [
        block.is_warmup ? "warm-up" : null,
        block.is_cooldown ? "cool-down" : null,
        block.straps ? "straps" : null,
        block.provenance !== "logged" ? block.provenance.replace(/_/g, " ") : null,
      ].filter(Boolean);

      lines.push(
        `- ${label} ${load} — ${count(attempts, "attempts")}, ${count(stood, "stood")}, ` +
          `${count(caught, "caught")}, ${count(block.dropped, "dropped")}` +
          `${block.quality_10 == null ? "" : ` · technical quality ${block.quality_10}/10`}` +
          `${flags.length > 0 ? ` · ${flags.join(", ")}` : ""} · ${basis}`,
      );
      if (lifts.length > 0) {
        lines.push(
          `  order: ${lifts.map((a) => OUTCOME_LABELS[a.outcome] ?? a.outcome).join(" → ")}`,
        );
      }
      if (block.notes) lines.push(`  note: ${block.notes}`);

      if (attempts == null) uncounted += 1;
      else {
        counted += 1;
        attemptTotal += attempts;
      }
      if (stood != null) stoodTotal += stood;
      if (block.is_substantiated && attempts != null && stood != null) {
        substantiatedAttempts += attempts;
        substantiatedStood += stood;
      }
      if (attempts == null || stood == null) {
        missing.push(
          `A ${label} block at ${load} has no ${attempts == null ? "attempt count" : "stand count"}, so it is outside every rate.`,
        );
      }
      if (block.quality_10 == null && block.provenance === "logged") {
        missing.push(`No technical quality rating for the ${label} at ${load}.`);
      }
    }

    lines.push("");
    lines.push(
      (counted === 0
        ? `Totals: no block records an attempt count, so there is no total — not a total of zero.`
        : `Totals: ${num(attemptTotal)} attempts, ${num(stoodTotal)} stood, over ` +
          `${counted} of ${input.snatchBlocks.length} blocks` +
          (uncounted > 0
            ? `; ${uncounted} block${uncounted === 1 ? "" : "s"} recorded no counts and ` +
              `${uncounted === 1 ? "is" : "are"} outside that total.`
            : ".")) +
        " " +
        (substantiatedAttempts > 0
          ? `Substantiated blocks only: ${substantiatedStood}/${substantiatedAttempts}` +
            ` (${Math.round((1000 * substantiatedStood) / substantiatedAttempts) / 10}%).`
          : `No block recorded both attempts and stands, so there is no rate.`),
    );
    const warmups = input.snatchBlocks.filter((b) => b.is_warmup).length;
    if (warmups === 0) {
      missing.push(
        "No block is flagged as warm-up, so working and warm-up tonnage cannot be separated.",
      );
    }
  }
  lines.push("");

  // --- hypertrophy ---------------------------------------------------------
  lines.push("## Hypertrophy");
  if (input.hypertrophySets.length === 0) {
    lines.push("No sets recorded.");
  } else {
    let sets = 0;
    let volume = 0;
    let withoutRir = 0;

    for (const set of input.hypertrophySets) {
      const label = name(input.exercises, set.exercise_id) ?? "Exercise";
      const detail = [
        `${set.sets_count} × ${set.reps ?? "reps not recorded"}`,
        set.load_kg == null ? "load not recorded" : `${set.load_kg} kg`,
        set.rir == null ? null : `RIR ${set.rir}`,
        set.machine_label,
        set.side === "both" ? null : set.side,
        set.is_drop ? "drop set" : null,
        set.order_vs_snatch === "unknown" ? null : set.order_vs_snatch.replace(/_/g, " "),
      ].filter(Boolean);
      lines.push(`- ${label} — ${detail.join(" · ")}`);
      if (set.notes) lines.push(`  note: ${set.notes}`);

      sets += set.sets_count;
      volume += set.volume_load_kg ?? 0;
      if (set.rir == null) withoutRir += 1;
    }

    lines.push("");
    lines.push(
      `Totals: ${num(sets)} sets, volume load ${num(Math.round(volume))} kg. ` +
        `Volume load is weight × reps summed — work done, not muscle gained, and not ` +
        `comparable across different machines.`,
    );
    if (withoutRir > 0) {
      missing.push(
        `${withoutRir} of ${input.hypertrophySets.length} hypertrophy entries have no RIR, so effort at those loads is unknown.`,
      );
    }
  }
  lines.push("");

  // --- calisthenics --------------------------------------------------------
  lines.push("## Calisthenics");
  if (input.calisthenicsEntries.length === 0) {
    lines.push("No skill work recorded.");
  } else {
    for (const entry of input.calisthenicsEntries) {
      const tries = input.calisthenicsAttempts
        .filter((a) => a.entry_id === entry.id)
        .sort((a, b) => a.ordinal - b.ordinal);
      const basis = tries.length > 0 ? "per attempt" : "block total";
      const attempts = tries.length > 0 ? tries.length : entry.attempts;
      // A recorded-but-unjudged attempt is not a failure, so it is counted
      // separately rather than folded into either side.
      const judged = tries.filter((a) => a.succeeded !== null);
      const successes =
        tries.length > 0 ? judged.filter((a) => a.succeeded).length : entry.successful_attempts;
      const unjudged = tries.length - judged.length;
      const holds = tries.map((a) => a.hold_seconds).filter((h): h is number => h != null);
      const bestHold = holds.length > 0 ? Math.max(...holds) : entry.best_hold_seconds;

      const label = name(input.skillVariations, entry.skill_variation_id) ?? "Skill";
      const detail = [
        count(attempts, "attempts"),
        count(successes, "successful"),
        unjudged > 0 ? `${unjudged} recorded but not judged` : null,
        bestHold == null ? "no hold recorded" : `longest hold ${bestHold}s`,
        entry.quality_10 == null ? null : `quality ${entry.quality_10}/10`,
        name(input.assistanceTypes, entry.assistance_id),
      ].filter(Boolean);
      lines.push(`- ${label} — ${detail.join(" · ")} · ${basis}`);
      if (entry.notes) lines.push(`  note: ${entry.notes}`);

      if (attempts == null) {
        missing.push(`No attempt count for ${label}, so its success rate cannot be computed.`);
      }
    }
  }
  lines.push("");

  // --- the body ------------------------------------------------------------
  const sameDay = input.bodyObservations.filter((o) => o.obs_date === input.date);
  lines.push("## Body");
  if (sameDay.length === 0) {
    lines.push("No reading taken for any tracked site.");
    if (input.injuries.some((i) => i.is_active)) {
      missing.push(
        "No body reading today. Nobody was asked, which is not the same as nothing to report.",
      );
    }
  } else {
    for (const o of sameDay) {
      const site = input.injuries.find((i) => i.id === o.injury_id)?.label ?? "Site";
      if (o.pain_free) {
        lines.push(`- ${site} — checked, no pain. Recorded, not assumed.`);
        continue;
      }
      const parts = [
        o.pain_during_0_10 == null ? null : `${o.pain_during_0_10}/10 during`,
        o.pain_after_0_10 == null ? null : `${o.pain_after_0_10}/10 after`,
        o.pain_next_morning_0_10 == null
          ? "next morning not yet recorded"
          : `${o.pain_next_morning_0_10}/10 next morning`,
        o.provoking_activity_id == null
          ? null
          : `brought on by ${
              input.activities.find((a) => a.id === o.provoking_activity_id)?.name ?? "something"
            }`,
      ].filter(Boolean);
      lines.push(`- ${site} — ${parts.join(" · ")}`);
      if (o.notes) lines.push(`  note: ${o.notes}`);
    }
    lines.push("");
    lines.push(
      "Reported by the athlete about a tracked site. A pattern, never a diagnosis, and no cause is attributed.",
    );
  }
  lines.push("");

  // --- what you said -------------------------------------------------------
  const authored = input.notes.filter((n) => n.note_type !== "assistant_review");
  if (authored.length > 0) {
    lines.push("## Your notes");
    lines.push("Reported by the athlete. Not measurements.");
    for (const note of authored) {
      const where = note.workstream ? `${note.workstream}/${note.category}` : note.category;
      lines.push(`- (${where.replace(/_/g, " ")}) ${note.content.replace(/\n+/g, " ")}`);
    }
    lines.push("");
  }

  // --- the gaps ------------------------------------------------------------
  const anythingRecorded =
    recorded.length > 0 ||
    input.snatchBlocks.length > 0 ||
    input.hypertrophySets.length > 0 ||
    input.calisthenicsEntries.length > 0 ||
    sameDay.length > 0 ||
    authored.length > 0;

  lines.push("## Not recorded");
  if (!anythingRecorded) {
    // An empty day and a complete one must not read the same. Saying
    // "nothing missing" here would describe a day nobody logged as a day
    // with nothing in it, which is the one reading this section exists to
    // prevent.
    lines.push(
      input.day?.status === "rest"
        ? "This day is marked as a rest day and holds nothing else — no check-in, no training, no notes."
        : "Nothing at all is recorded for this day: no check-in, no training, no notes. " +
            "This is an empty record, not a rest day and not a day without training.",
    );
  } else if (missing.length === 0) {
    lines.push("Nothing notable missing from the records above.");
  } else {
    lines.push("Absence of a figure below is not a zero. Please do not read it as one.");
    for (const gap of [...new Set(missing)]) lines.push(`- ${gap}`);
  }

  return redactBrief(lines.join("\n"), input.thirdParties);
}

function redactBrief(text: string, people: ThirdParty[]) {
  const { text: redacted, count: redactions } = redactThirdParties(
    text,
    people.length > 0 ? people : undefined,
  );
  return { text: redacted, redactions };
}
