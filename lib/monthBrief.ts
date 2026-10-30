import { redactThirdParties, type ThirdParty } from "@/lib/coach/verify";
import {
  EXPERIMENT_KIND_LABELS,
  EXPERIMENT_OUTCOME_LABELS,
  EXPERIMENT_STATUS_LABELS,
  FOLLOWED_LABELS,
} from "@/lib/types";
import type { MonthFacts } from "@/lib/monthFacts";
import type { WeekSet } from "@/lib/weekFacts";

/**
 * A month, as facts, for pasting into an outside model.
 *
 * It keeps the weekly brief's rule — it may compute, it may not conclude —
 * and adds one of its own: it will not compare this month with the one
 * before unless that month was logged as it happened.
 *
 * That gate is the whole reason this file is separate. Most of the history
 * here is reconstruction recovered from chat threads, and setting October's
 * volume beside August's would compare how well two months were written
 * down. The difference would read as training and would not be. So the
 * comparison is withheld and the reason given, which is the more useful
 * thing to hand a coach anyway.
 *
 * Expect little from it until there are two logged months to put together.
 * That is a fact about the record, not a fault in the brief.
 */

const num = (value: number) =>
  value >= 1000 ? value.toLocaleString("en-GB") : String(Math.round(value * 10) / 10);

const BASIS_WORDS: Record<MonthFacts["basis"], string> = {
  logged: "logged as it happened",
  reconstructed: "recovered from a written source",
  mixed: "partly logged, partly recovered from a written source",
  nothing: "nothing recorded",
};

export function composeMonthBrief(
  m: MonthFacts,
  thirdParties: ThirdParty[],
): { text: string; redactions: number } {
  const f = m.facts;
  const lines: string[] = [];
  const missing: string[] = [];

  const days = daysIn(m.month);
  const thisMonth = f.hypertrophySets.filter((s) => s.date >= f.weekStart);
  const earlier = f.hypertrophySets.filter((s) => s.date < f.weekStart);

  lines.push(`# Training facts — ${m.label}`);
  lines.push("");
  lines.push(
    "Counted from rows logged that month. Nothing is estimated and nothing below is a " +
      "conclusion.",
  );
  lines.push("");

  /* ---- coverage and the gate ------------------------------------------ */
  lines.push("## Coverage");
  lines.push(
    f.daysWithRecords === 0
      ? `No day of ${m.label} holds a record of any kind.`
      : `${f.daysWithRecords} of ${days} days hold a record — ${BASIS_WORDS[m.basis]}. ` +
        `The other ${days - f.daysWithRecords} are days nobody wrote anything about, which ` +
        `is not the same as days without training.`,
  );
  if (f.importedRows > 0) {
    lines.push(
      `${f.importedRows} reconstructed row${f.importedRows === 1 ? "" : "s"} in this month ` +
        `${f.importedRows === 1 ? "is" : "are"} left out of every figure below.`,
    );
  }
  lines.push("");
  lines.push(
    m.comparable
      ? `${m.previous.label} was ${BASIS_WORDS[m.previous.basis]}, so the two months are set ` +
        `side by side below at matched loads.`
      : `NOT COMPARED WITH ${m.previous.label.toUpperCase()}. That month was ` +
        `${BASIS_WORDS[m.previous.basis]}, and a month-on-month difference across that ` +
        `boundary would describe how well two months were written down rather than how they ` +
        `were trained. Please do not compute one from the figures below.`,
  );
  if (!m.comparable) {
    missing.push(
      `No month-on-month comparison: ${m.previous.label} was ${BASIS_WORDS[m.previous.basis]}.`,
    );
  }
  lines.push("");

  /* ---- snatch ---------------------------------------------------------- */
  lines.push("## Snatch");
  const full = f.snatchBlocks.filter((b) => b.counts_as_full_lift && !b.is_warmup);
  if (full.length === 0) {
    lines.push("No full lifts logged this month.");
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
      const stood = substantiated.reduce((t, b) => t + Number(b.full_stand_successes ?? 0), 0);
      const quality = blocks.map((b) => b.quality_10).filter((q): q is number => q != null);

      lines.push(
        `- ${load || "load not recorded"} kg — ${blocks.length} block${
          blocks.length === 1 ? "" : "s"
        }` +
          (substantiated.length > 0
            ? `, ${attempts} attempts, ${stood} stood`
            : ", no block recorded both attempts and stands, so there is no rate") +
          (quality.length > 0
            ? ` · quality ${Math.min(...quality)}–${Math.max(...quality)} over ${
                quality.length
              } rated block${quality.length === 1 ? "" : "s"}`
            : " · not rated"),
      );

      attemptsTotal += attempts;
      stoodTotal += stood;
      counted += substantiated.length;
      if (quality.length === 0) {
        missing.push(`No technical quality rating at ${load} kg this month.`);
      }
    }

    lines.push("");
    lines.push(
      counted === 0
        ? "Totals: no block recorded both attempts and stands, so there is no total."
        : `Totals: ${attemptsTotal} attempts, ${stoodTotal} stood across ${counted} ` +
          `substantiated block${counted === 1 ? "" : "s"}.`,
    );
  }
  lines.push("");

  /* ---- hypertrophy ----------------------------------------------------- */
  lines.push("## Hypertrophy");
  if (thisMonth.length === 0) {
    lines.push("No sets logged this month.");
  } else {
    const sets = thisMonth.reduce((t, s) => t + (s.is_drop ? 0 : s.sets_count), 0);
    const volume = thisMonth.reduce((t, s) => t + s.volume_load_kg, 0);
    lines.push(`${sets} sets, volume load ${num(volume)} kg.`);
    lines.push("");

    const byExercise = new Map<string, WeekSet[]>();
    for (const s of thisMonth) {
      const key = `${s.exercise}|${s.machine?.toLowerCase() ?? ""}|${s.gym ?? ""}`;
      byExercise.set(key, [...(byExercise.get(key) ?? []), s]);
    }

    for (const rows of byExercise.values()) {
      const first = rows[0];
      const where = [first.machine, first.gym].filter(Boolean).join(" · ");
      const loads = [...new Set(rows.map((s) => s.load_kg).filter((l): l is number => l != null))];
      const monthSets = rows.reduce((t, s) => t + (s.is_drop ? 0 : s.sets_count), 0);
      lines.push(
        `- ${first.exercise}${where ? ` · ${where}` : " · machine not recorded"} — ` +
          `${monthSets} sets` +
          (loads.length > 0 ? ` at ${loads.sort((a, b) => a - b).join(", ")} kg` : ""),
      );

      // Matched loads, and only where last month can carry the weight of a
      // comparison.
      if (!m.comparable) continue;
      for (const load of loads) {
        const now = rows
          .filter((s) => !s.is_drop && s.load_kg === load)
          .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
        const before = earlier
          .filter(
            (p) =>
              !p.is_drop &&
              p.load_kg === load &&
              p.exercise === first.exercise &&
              (p.machine?.toLowerCase() ?? "") === (first.machine?.toLowerCase() ?? "") &&
              (p.gym ?? "") === (first.gym ?? ""),
          )
          .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
        if (!now || !before) continue;
        lines.push(
          `  at ${load} kg — ${m.previous.label}: ${describe(before)} → ${m.label}: ${describe(now)}`,
        );
      }
    }

    const withoutRir = thisMonth.filter((s) => s.rir == null).length;
    if (withoutRir > 0) {
      missing.push(
        `${withoutRir} of ${thisMonth.length} hypertrophy entries ` +
          `${withoutRir === 1 ? "carries" : "carry"} no RIR.`,
      );
    }
    lines.push("");
    lines.push(
      "Loads are comparable only within one exercise on one machine at one gym; nothing " +
        "above is added across those.",
    );
  }
  lines.push("");

  /* ---- calisthenics ---------------------------------------------------- */
  lines.push("## Calisthenics");
  if (f.calisthenics.length === 0) {
    lines.push("No skill work logged this month.");
  } else {
    for (const s of f.calisthenics) {
      const parts = [
        s.attempts == null ? "attempts not recorded" : `${s.attempts} attempts`,
        s.successes == null ? "successes not recorded" : `${s.successes} successful`,
        s.longestHold == null
          ? s.minHoldSeconds != null
            ? "no hold timed"
            : null
          : `longest hold ${s.longestHold}s` +
            (s.minHoldSeconds != null ? ` against a ${s.minHoldSeconds}s bar` : ""),
      ].filter(Boolean);
      lines.push(`- ${s.variation} — ${parts.join(" · ")}`);
    }
  }
  lines.push("");

  /* ---- how the month felt ---------------------------------------------- */
  lines.push("## How you reported feeling");
  if (f.metrics.length === 0) {
    lines.push("The check-in was not answered on any day of this month.");
    missing.push("No check-in answered this month.");
  } else {
    for (const metric of f.metrics) {
      const low = Math.min(...metric.values);
      const high = Math.max(...metric.values);
      const unit =
        metric.unit && metric.unit.toLowerCase() !== metric.label.toLowerCase()
          ? ` ${metric.unit}`
          : "";
      lines.push(
        `- ${metric.label}: ${low === high ? num(low) : `${num(low)}–${num(high)}`}${unit} ` +
          `over ${metric.values.length} day${metric.values.length === 1 ? "" : "s"}`,
      );
    }
    lines.push("");
    lines.push("Reported, not measured, and never averaged across the month.");
  }
  lines.push("");

  /* ---- the register ----------------------------------------------------- */
  const live = f.experiments.filter(
    (e) => e.status === "collecting" || e.status === "proposed",
  );
  const closed = f.experiments.filter(
    (e) => e.ended_on != null && e.ended_on >= f.weekStart && e.ended_on <= f.weekEnd,
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
      if (e.outcome_note) lines.push(`  note: ${e.outcome_note}`);
    }
    lines.push("");
  }

  /* ---- the gaps --------------------------------------------------------- */
  const anything =
    f.snatchBlocks.length > 0 ||
    thisMonth.length > 0 ||
    f.calisthenics.length > 0 ||
    f.metrics.length > 0;

  lines.push("## Not recorded");
  if (!anything) {
    lines.push(
      `Nothing at all is recorded for ${m.label}: no training, no check-in, no notes. This ` +
        "is an empty record, not a month without training.",
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

/** Reps and effort, without the load: it is already in the line. */
function describe(s: WeekSet): string {
  const sets = s.sets_count > 1 ? ` × ${s.sets_count}` : "";
  const head = s.reps == null ? `${s.sets_count} sets` : `${s.reps} reps${sets}`;
  const rir = s.rir == null ? " · RIR not recorded" : ` · RIR ${s.rir}`;
  return `${head}${rir}`;
}

function daysIn(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
