import { redactThirdParties, type ThirdParty } from "@/lib/coach/verify";
import { longDate } from "@/lib/time";
import {
  EXPERIMENT_KIND_LABELS,
  EXPERIMENT_OUTCOME_LABELS,
  EXPERIMENT_STATUS_LABELS,
  FOLLOWED_LABELS,
} from "@/lib/types";
import type { WeekFacts, WeekSet } from "@/lib/weekFacts";

/**
 * A week, as facts, for pasting into an outside model.
 *
 * Not seven daily briefs. A day's brief is a list of what happened; a week's
 * is the spreads and the changes — what a load did against the last time it
 * was worked, how wide the quality ratings sat, how many of the attempts
 * came off. Those are the things a day cannot show and a week can.
 *
 * THE RULE THIS FILE KEEPS: it may compute, it may not conclude.
 *
 * "45 kg: 4, 7, 9 then 7, 7 — the spread narrowed from 5 points to 0" is
 * arithmetic, and belongs here. "45 kg is becoming consistent" is a reading
 * of nine subjective ratings, and belongs to whoever is doing the reading.
 * The moment this file starts writing the second kind it stops being the
 * input to a coach and starts competing with one, without access to how the
 * week actually felt.
 *
 * So: no "improving", no "declining", no "suggests", no "despite". Numbers,
 * differences between numbers, and what was not recorded.
 */

const num = (value: number) =>
  value >= 1000 ? value.toLocaleString("en-GB") : String(Math.round(value * 10) / 10);

export function composeWeekBrief(
  facts: WeekFacts,
  thirdParties: ThirdParty[],
): { text: string; redactions: number } {
  const lines: string[] = [];
  const missing: string[] = [];

  lines.push(`# Training facts — week of ${longDate(facts.weekStart)}`);
  lines.push("");
  lines.push(
    `${longDate(facts.weekStart)} to ${longDate(facts.weekEnd)}. Counted from rows logged ` +
      `that week; nothing is estimated and nothing below is a conclusion.`,
  );
  lines.push("");

  // --- coverage ------------------------------------------------------------
  lines.push("## Coverage");
  lines.push(
    facts.daysWithRecords === 0
      ? "No day of this week holds a record of any kind."
      : `${facts.daysWithRecords} of 7 days hold a record. The other ` +
        `${7 - facts.daysWithRecords} are days nobody wrote anything about, which is not ` +
        `the same as days without training.`,
  );
  if (facts.importedRows > 0) {
    lines.push(
      `${facts.importedRows} reconstructed row${facts.importedRows === 1 ? "" : "s"} in this ` +
        `week ${facts.importedRows === 1 ? "is" : "are"} left out of everything below.`,
    );
  }
  lines.push("");

  // --- snatch --------------------------------------------------------------
  lines.push("## Snatch");
  const full = facts.snatchBlocks.filter((b) => b.counts_as_full_lift && !b.is_warmup);
  if (full.length === 0) {
    lines.push("No full lifts logged this week.");
  } else {
    const byLoad = new Map<number, typeof full>();
    for (const b of full) {
      const load = Number(b.weight_kg ?? 0);
      byLoad.set(load, [...(byLoad.get(load) ?? []), b]);
    }

    let attemptsTotal = 0;
    let stoodTotal = 0;
    let counted = 0;
    for (const [load, blocks] of [...byLoad.entries()].sort((a, b) => a[0] - b[0])) {
      const substantiated = blocks.filter((b) => b.is_substantiated);
      const attempts = substantiated.reduce((t, b) => t + Number(b.attempts ?? 0), 0);
      const stood = substantiated.reduce(
        (t, b) => t + Number(b.full_stand_successes ?? 0),
        0,
      );
      const quality = blocks
        .map((b) => b.quality_10)
        .filter((q): q is number => q != null);

      lines.push(
        `- ${load || "load not recorded"} kg — ${blocks.length} block${
          blocks.length === 1 ? "" : "s"
        }` +
          (substantiated.length > 0
            ? `, ${attempts} attempts, ${stood} stood`
            : `, no block recorded both attempts and stands, so there is no rate`) +
          (quality.length > 0
            ? ` · technical quality ${quality.join(", ")}` +
              (quality.length > 1
                ? ` (spread ${Math.max(...quality) - Math.min(...quality)})`
                : "")
            : " · not rated"),
      );

      attemptsTotal += attempts;
      stoodTotal += stood;
      counted += substantiated.length;
      if (quality.length === 0) {
        missing.push(`No technical quality rating at ${load} kg this week.`);
      }
      if (substantiated.length < blocks.length) {
        missing.push(
          `${blocks.length - substantiated.length} block(s) at ${load} kg recorded no ` +
            `attempt or stand count and are outside every figure above.`,
        );
      }
    }

    lines.push("");
    lines.push(
      counted === 0
        ? "Totals: no block recorded both attempts and stands, so there is no total."
        : `Totals: ${attemptsTotal} attempts, ${stoodTotal} stood across ${counted} ` +
          `substantiated block${counted === 1 ? "" : "s"}.`,
    );
    for (const b of full) {
      if (b.notes) lines.push(`  note (${b.weight_kg ?? "?"} kg): ${b.notes}`);
    }
  }
  lines.push("");

  // --- hypertrophy ---------------------------------------------------------
  lines.push("## Hypertrophy");
  const thisWeek = facts.hypertrophySets.filter((s) => s.date >= facts.weekStart);
  const earlier = facts.hypertrophySets.filter((s) => s.date < facts.weekStart);
  if (thisWeek.length === 0) {
    lines.push("No sets logged this week.");
  } else {
    const sets = thisWeek.reduce((t, s) => t + (s.is_drop ? 0 : s.sets_count), 0);
    const volume = thisWeek.reduce((t, s) => t + s.volume_load_kg, 0);
    lines.push(`${sets} sets, volume load ${num(volume)} kg.`);
    lines.push("");

    const setups = new Map<string, WeekSet[]>();
    for (const s of thisWeek) {
      const key = `${s.exercise}|${s.machine?.toLowerCase() ?? ""}|${s.gym ?? ""}`;
      setups.set(key, [...(setups.get(key) ?? []), s]);
    }

    for (const rows of setups.values()) {
      const first = rows[0];
      const where = [first.machine, first.gym].filter(Boolean).join(" · ");
      lines.push(`- ${first.exercise}${where ? ` · ${where}` : " · machine not recorded"}`);
      for (const s of rows) {
        lines.push(`  ${shortDate(s.date)}: ${describe(s)}`);
        if (s.notes) lines.push(`    note: ${s.notes}`);
      }

      // The reading a single week cannot give: the same load on the same
      // setup, the last time before this week that it was worked.
      for (const s of rows) {
        if (s.is_drop || s.load_kg == null) continue;
        const previous = earlier
          .filter(
            (p) =>
              !p.is_drop &&
              p.load_kg === s.load_kg &&
              p.exercise === s.exercise &&
              (p.machine?.toLowerCase() ?? "") === (s.machine?.toLowerCase() ?? "") &&
              (p.gym ?? "") === (s.gym ?? ""),
          )
          .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
        if (!previous) continue;
        lines.push(
          `  at ${s.load_kg} kg — ${shortDate(previous.date)}: ${describe(previous, false)}` +
            ` → ${shortDate(s.date)}: ${describe(s, false)}`,
        );
      }
    }

    const withoutRir = thisWeek.filter((s) => s.rir == null).length;
    if (withoutRir > 0) {
      missing.push(
        `${withoutRir} of ${thisWeek.length} hypertrophy entries ` +
          `${withoutRir === 1 ? "carries" : "carry"} no RIR, so effort at ` +
          `${withoutRir === 1 ? "that load is" : "those loads are"} unknown.`,
      );
    }
    lines.push("");
    lines.push(
      "Loads are comparable only within one exercise on one machine at one gym; nothing " +
        "above is added across those.",
    );
  }
  lines.push("");

  // --- calisthenics --------------------------------------------------------
  lines.push("## Calisthenics");
  if (facts.calisthenics.length === 0) {
    lines.push("No skill work logged this week.");
  } else {
    for (const s of facts.calisthenics) {
      const parts = [
        s.attempts == null ? "attempts not recorded" : `${s.attempts} attempts`,
        s.successes == null ? "successes not recorded" : `${s.successes} successful`,
        s.longestHold == null
          ? s.minHoldSeconds != null
            ? "no hold timed"
            : null
          : `longest hold ${s.longestHold}s` +
            (s.minHoldSeconds != null ? ` against a ${s.minHoldSeconds}s bar` : ""),
        s.basis === "summary" ? "from block totals" : null,
      ].filter(Boolean);
      lines.push(`- ${s.variation} — ${parts.join(" · ")}`);
      if (s.attempts == null) {
        missing.push(`No attempt count for ${s.variation}, so it carries no rate.`);
      }
    }
  }
  lines.push("");

  // --- how the week felt ---------------------------------------------------
  lines.push("## How you reported feeling");
  if (facts.metrics.length === 0) {
    lines.push("No check-in answered this week.");
    missing.push("The check-in was not answered on any day of this week.");
  } else {
    for (const m of facts.metrics) {
      const low = Math.min(...m.values);
      const high = Math.max(...m.values);
      // A unit that only repeats the label says nothing: "Steps 4,312 steps".
      const unit =
        m.unit && m.unit.toLowerCase() !== m.label.toLowerCase() ? ` ${m.unit}` : "";
      lines.push(
        `- ${m.label}: ${low === high ? num(low) : `${num(low)}–${num(high)}`}${unit} ` +
          `over ${m.values.length} day${m.values.length === 1 ? "" : "s"}` +
          (m.values.length > 1 ? ` (${m.values.map(num).join(", ")})` : ""),
      );
    }
    lines.push("");
    lines.push("Reported, not measured. These are single daily judgements, not an average.");
  }
  lines.push("");

  // --- what you said -------------------------------------------------------
  const authored = facts.notes.filter((n) => n.note_type !== "assistant_review");
  if (authored.length > 0) {
    lines.push("## Your notes");
    lines.push("Reported by the athlete. Not measurements.");
    for (const n of authored) {
      const where = n.workstream ? `${n.workstream}/${n.category}` : n.category;
      lines.push(
        `- ${n.anchor_date ? shortDate(n.anchor_date) : "undated"} (${where.replace(/_/g, " ")}) ` +
          n.content.replace(/\n+/g, " "),
      );
    }
    lines.push("");
  }

  // --- the register --------------------------------------------------------
  //
  // The reason this brief is worth more than seven daily ones: what you were
  // told last time, and what you did about it.
  const live = facts.experiments.filter(
    (e) => e.status === "collecting" || e.status === "proposed",
  );
  const closed = facts.experiments.filter(
    (e) => e.ended_on != null && e.ended_on >= facts.weekStart && e.ended_on <= facts.weekEnd,
  );
  if (live.length > 0 || closed.length > 0) {
    lines.push("## On the register");
    for (const e of [...live, ...closed]) {
      const bits = [
        EXPERIMENT_KIND_LABELS[e.kind],
        EXPERIMENT_STATUS_LABELS[e.status].toLowerCase(),
        e.kind === "recommendation"
          ? FOLLOWED_LABELS[e.followed ?? "not_yet"].toLowerCase()
          : null,
        e.outcome ? EXPERIMENT_OUTCOME_LABELS[e.kind][e.outcome].toLowerCase() : null,
      ].filter(Boolean);
      lines.push(`- ${e.title} — ${bits.join(" · ")}`);
      lines.push(`  ${e.statement}`);
      lines.push(`  would settle it: ${e.measurement}`);
      if (e.comparison) lines.push(`  comparable: ${e.comparison}`);
      if (e.outcome_note) lines.push(`  note: ${e.outcome_note}`);
    }
    lines.push("");
    const unanswered = live.filter(
      (e) => e.kind === "recommendation" && (e.followed ?? "not_yet") === "not_yet",
    );
    if (unanswered.length > 0) {
      missing.push(
        `${unanswered.length} recommendation${unanswered.length === 1 ? "" : "s"} on the ` +
          `register ${unanswered.length === 1 ? "has" : "have"} no answer yet as to whether ` +
          `it was followed.`,
      );
    }
  }

  // --- the gaps ------------------------------------------------------------
  const anything =
    facts.snatchBlocks.length > 0 ||
    thisWeek.length > 0 ||
    facts.calisthenics.length > 0 ||
    facts.metrics.length > 0 ||
    authored.length > 0;

  lines.push("## Not recorded");
  if (!anything) {
    lines.push(
      "Nothing at all is recorded for this week: no training, no check-in, no notes. This " +
        "is an empty record, not a week without training.",
    );
  } else if (missing.length === 0) {
    lines.push("Nothing notable missing from the records above.");
  } else {
    lines.push("Absence of a figure below is not a zero. Please do not read it as one.");
    for (const gap of [...new Set(missing)]) lines.push(`- ${gap}`);
  }

  const { text, count } = redactThirdParties(
    lines.join("\n"),
    thirdParties.length > 0 ? thirdParties : undefined,
  );
  return { text, redactions: count };
}

/**
 * "45 kg × 6 × 3 · RIR 2", with every missing part named rather than filled.
 *
 * `withLoad` is false where the load is already in the line — a comparison
 * at a matched load otherwise prints the weight three times in one sentence.
 */
function describe(s: WeekSet, withLoad = true): string {
  const missing: string[] = [];
  const sets = s.sets_count > 1 ? ` × ${s.sets_count}` : "";
  let head: string;

  if (!withLoad) {
    head = s.reps == null ? `${s.sets_count} sets` : `${s.reps} reps${sets}`;
    if (s.reps == null) missing.push("reps not recorded");
  } else if (s.load_kg != null && s.reps != null) {
    head = `${s.load_kg} kg × ${s.reps}${sets}`;
  } else if (s.load_kg != null) {
    head = `${s.load_kg} kg${sets}`;
    missing.push("reps not recorded");
  } else if (s.reps != null) {
    head = `${s.reps} reps${sets}`;
    missing.push("load not recorded");
  } else {
    head = `${s.sets_count} set${s.sets_count === 1 ? "" : "s"}`;
    missing.push("load and reps not recorded");
  }

  const rir = s.rir == null ? "" : ` · RIR ${s.rir}`;
  const drop = s.is_drop ? " · drop" : "";
  return `${head}${rir}${drop}${missing.length > 0 ? ` · ${missing.join(", ")}` : ""}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? m}`;
}
