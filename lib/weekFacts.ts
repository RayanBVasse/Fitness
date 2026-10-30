import { safeRead } from "./supabase";
import { getExperiments, getReferenceData } from "./queries";
import type {
  ContextNote,
  DailyMetricDef,
  Experiment,
  Provenance,
} from "./types";

/**
 * One week of logged training, for the weekly brief.
 *
 * A separate read rather than a slice of getProgress, which only ever looks
 * back from today: a brief is written about a particular week, and usually
 * the one that has just finished rather than the one in progress.
 *
 * Hypertrophy reaches four weeks further back than everything else. That is
 * the only way a load worked this week can be set beside the last time it
 * was worked, which is the reading a single week of sets cannot give.
 *
 * Reconstruction is excluded throughout and counted, exactly as the charts
 * exclude it. A week's brief is about what you logged that week.
 */

export interface WeekSnatchBlock {
  session_date: string;
  weight_kg: number | null;
  variation: string;
  counts_as_full_lift: boolean;
  attempts: number | null;
  full_stand_successes: number | null;
  received_not_stood: number | null;
  is_substantiated: boolean;
  is_warmup: boolean;
  quality_10: number | null;
  notes: string | null;
}

export interface WeekSet {
  date: string;
  exercise: string;
  machine: string | null;
  gym: string | null;
  load_kg: number | null;
  reps: number | null;
  sets_count: number;
  rir: number | null;
  is_drop: boolean;
  volume_load_kg: number;
  notes: string | null;
}

export interface WeekSkill {
  variation: string;
  attempts: number | null;
  successes: number | null;
  longestHold: number | null;
  /** The bar this variation's holds are measured against, where it is one. */
  minHoldSeconds: number | null;
  basis: "attempt" | "summary";
}

export interface WeekFacts {
  weekStart: string;
  weekEnd: string;
  snatchBlocks: WeekSnatchBlock[];
  /** This week's sets, and the four weeks before it, so a load can match. */
  hypertrophySets: WeekSet[];
  calisthenics: WeekSkill[];
  metrics: { metric: string; label: string; unit: string | null; values: number[] }[];
  notes: ContextNote[];
  experiments: Experiment[];
  /** Days in the week holding any record at all. */
  daysWithRecords: number;
  /** Rows in the week left out as reconstruction, so the omission is named. */
  importedRows: number;
  error: string | null;
}

/** Shift an ISO date by whole days, in UTC so no clock change can move it. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
}

/**
 * The same read over any range.
 *
 * A week and a month differ only in where the window starts and how far
 * back the hypertrophy history reaches, so they share this rather than
 * keeping two copies of the same nine queries in step with each other.
 */
export async function getRangeFacts(
  weekStart: string,
  weekEnd: string,
  matchFrom: string,
): Promise<WeekFacts> {

  const [blocks, sets, entries, metricRows, defs, noteRows, experiments, reference, attemptRows] =
    await Promise.all([
      safeRead<(WeekSnatchBlock & { provenance: Provenance })[]>((c) =>
        c
          .from("v_snatch_blocks")
          .select(
            "session_date, weight_kg, variation, counts_as_full_lift, attempts, full_stand_successes, received_not_stood, is_substantiated, is_warmup, quality_10, notes, provenance",
          )
          .gte("session_date", weekStart)
          .lte("session_date", weekEnd),
      ),
      safeRead<
        {
          exercise_id: number;
          machine_label: string | null;
          load_kg: number | null;
          reps: number | null;
          sets_count: number;
          rir: number | null;
          is_drop: boolean;
          volume_load_kg: number | null;
          notes: string | null;
          provenance: Provenance;
          sessions: unknown;
        }[]
      >((c) =>
        c
          .from("hypertrophy_sets")
          .select(
            "exercise_id, machine_label, load_kg, reps, sets_count, rir, is_drop, volume_load_kg, notes, provenance, sessions(session_date, gym_id)",
          ),
      ),
      safeRead<
        {
          id: string;
          skill_variation_id: number;
          attempts: number | null;
          successful_attempts: number | null;
          best_hold_seconds: number | null;
          provenance: Provenance;
          sessions: unknown;
        }[]
      >((c) =>
        c
          .from("calisthenics_entries")
          .select(
            "id, skill_variation_id, attempts, successful_attempts, best_hold_seconds, provenance, sessions(session_date)",
          ),
      ),
      safeRead<{ metric: string; metric_date: string; value_numeric: number | null }[]>((c) =>
        c
          .from("daily_metrics")
          .select("metric, metric_date, value_numeric")
          .eq("provenance", "logged")
          .gte("metric_date", weekStart)
          .lte("metric_date", weekEnd),
      ),
      // Active only, the same filter the check-in uses: a dimension 0015
      // retired should not reappear in a brief.
      safeRead<DailyMetricDef[]>((c) =>
        c.from("daily_metric_defs").select("*").eq("is_active", true).order("sort_order"),
      ),
      safeRead<ContextNote[]>((c) =>
        c
          .from("context_notes")
          .select<string, ContextNote>("*")
          .gte("anchor_date", weekStart)
          .lte("anchor_date", weekEnd)
          .in("source_type", ["authored_in_app", "daily_check_in"])
          .order("anchor_date"),
      ),
      getExperiments(),
      getReferenceData(),
      safeRead<{ entry_id: string; succeeded: boolean | null; hold_seconds: number | null }[]>(
        (c) => c.from("calisthenics_attempts").select("entry_id, succeeded, hold_seconds"),
      ),
    ]);

  const exerciseName = new Map(reference.exercises.map((e) => [e.id, e.name]));
  const gymName = new Map(reference.gyms.map((g) => [g.id, g.name]));
  const variations = new Map(reference.skillVariations.map((v) => [v.id, v]));

  const days = new Set<string>();
  let importedRows = 0;

  const snatchBlocks = (blocks.data ?? []).filter((b) => {
    if (b.provenance !== "logged") {
      importedRows += 1;
      return false;
    }
    days.add(b.session_date);
    return true;
  });

  const hypertrophySets = (sets.data ?? [])
    .map((row) => {
      const session = row.sessions as unknown as {
        session_date: string;
        gym_id: number | null;
      } | null;
      return { row, date: session?.session_date ?? null, gymId: session?.gym_id ?? null };
    })
    .filter(({ row, date }) => {
      if (!date || date < matchFrom || date > weekEnd) return false;
      if (row.provenance !== "logged") {
        // Only the week's own reconstruction is named; the four weeks of
        // history behind it are read for matching and nothing else.
        if (date >= weekStart) importedRows += 1;
        return false;
      }
      if (date >= weekStart) days.add(date);
      return true;
    })
    .map(({ row, date, gymId }) => ({
      date: date as string,
      exercise: exerciseName.get(row.exercise_id) ?? "Exercise",
      machine: row.machine_label?.trim() || null,
      gym: gymId == null ? null : (gymName.get(gymId) ?? null),
      load_kg: row.load_kg == null ? null : Number(row.load_kg),
      reps: row.reps,
      sets_count: row.sets_count,
      rir: row.rir,
      is_drop: row.is_drop,
      volume_load_kg: Number(row.volume_load_kg ?? 0),
      notes: row.notes,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const calisthenics = (entries.data ?? [])
    .map((e) => ({
      e,
      date: (e.sessions as unknown as { session_date: string } | null)?.session_date ?? null,
    }))
    .filter(({ e, date }) => {
      if (!date || date < weekStart || date > weekEnd) return false;
      if (e.provenance !== "logged") {
        importedRows += 1;
        return false;
      }
      days.add(date);
      return true;
    })
    .map(({ e }) => {
      const rows = (attemptRows.data ?? []).filter((a) => a.entry_id === e.id);
      const holds = rows.map((a) => a.hold_seconds).filter((h): h is number => h != null);
      const v = variations.get(e.skill_variation_id);
      return {
        variation: v?.name ?? "Skill",
        attempts: rows.length > 0 ? rows.length : e.attempts,
        successes:
          rows.length > 0 ? rows.filter((a) => a.succeeded).length : e.successful_attempts,
        longestHold:
          holds.length > 0
            ? Math.max(...holds)
            : e.best_hold_seconds == null
              ? null
              : Number(e.best_hold_seconds),
        minHoldSeconds: v?.min_hold_seconds == null ? null : Number(v.min_hold_seconds),
        basis: rows.length > 0 ? ("attempt" as const) : ("summary" as const),
      };
    });

  const metrics = (defs.data ?? [])
    .filter((d) => d.kind !== "text")
    .map((d) => ({
      metric: d.slug,
      label: d.label,
      unit: d.unit,
      values: (metricRows.data ?? [])
        .filter((r) => r.metric === d.slug && r.value_numeric != null)
        .map((r) => Number(r.value_numeric)),
    }))
    .filter((m) => m.values.length > 0);

  // A day you only answered the check-in on is still a day with a record.
  for (const r of metricRows.data ?? []) days.add(r.metric_date);

  return {
    weekStart,
    weekEnd,
    snatchBlocks,
    hypertrophySets,
    calisthenics,
    metrics,
    notes: noteRows.data ?? [],
    experiments,
    daysWithRecords: days.size,
    importedRows,
    error: blocks.error ?? sets.error ?? entries.error,
  };
}

/** One ISO week, Monday to Sunday, with four weeks of history behind it. */
export async function getWeekFacts(weekStart: string): Promise<WeekFacts> {
  return getRangeFacts(weekStart, addDays(weekStart, 6), addDays(weekStart, -28));
}
