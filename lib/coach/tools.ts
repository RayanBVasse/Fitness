import { readClient } from "@/lib/supabase";
import { isoWeekday, londonToday, weekStart } from "@/lib/time";

/**
 * Layer A — deterministic analytics.
 *
 * Every number the Coach is allowed to say comes from here. The model has no
 * database access and cannot compute: it calls these by name and receives
 * typed results that carry their own window, row count and source split.
 *
 * Each result reports `insufficient` from a documented minimum. That judgement
 * belongs to the tool, not to the model — "is this enough data to say
 * anything?" is exactly the question a language model answers too generously.
 */

/** Below this, a rate is noise. Matches settings.analysis_guardrails. */
const MIN_N_FOR_RATE = 8;
const MIN_SESSIONS_FOR_COMPARISON = 6;

export interface ToolResult {
  tool: string;
  window: { from: string; to: string } | null;
  n: number;
  insufficient: boolean;
  /** Why, when insufficient. Shown to the model verbatim. */
  note?: string;
  data: unknown;
}

function windowFrom(days: number): { from: string; to: string } {
  const to = londonToday();
  const from = new Date(`${to}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - days);
  return { from: from.toISOString().slice(0, 10), to };
}

// ---------------------------------------------------------------------------
// snatch_success
// ---------------------------------------------------------------------------
async function snatchSuccess(args: { days?: number; load_kg?: number }): Promise<ToolResult> {
  const window = windowFrom(args.days ?? 3650);
  const db = readClient();
  let query = db
    .from("v_snatch_blocks")
    .select("weight_kg, attempts, full_stand_successes, received_not_stood, provenance")
    .eq("is_substantiated", true)
    .eq("counts_as_full_lift", true)
    .gte("session_date", window.from)
    .lte("session_date", window.to);
  if (args.load_kg !== undefined) query = query.eq("weight_kg", args.load_kg);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const byLoad = new Map<
    number,
    { attempts: number; stood: number; caught: number; imported: number; logged: number }
  >();
  for (const row of rows) {
    const load = Number(row.weight_kg);
    const entry = byLoad.get(load) ?? {
      attempts: 0,
      stood: 0,
      caught: 0,
      imported: 0,
      logged: 0,
    };
    entry.attempts += row.attempts ?? 0;
    entry.stood += row.full_stand_successes ?? 0;
    entry.caught += row.received_not_stood ?? 0;
    if (row.provenance === "logged") entry.logged += 1;
    else entry.imported += 1;
    byLoad.set(load, entry);
  }

  const loads = [...byLoad.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([load, e]) => ({
      load_kg: load,
      attempts: e.attempts,
      stood: e.stood,
      received_not_stood: e.caught,
      stand_rate_pct: e.attempts ? round1((100 * e.stood) / e.attempts) : null,
      receive_rate_pct: e.attempts
        ? round1((100 * (e.stood + e.caught)) / e.attempts)
        : null,
      blocks_imported: e.imported,
      blocks_logged: e.logged,
    }));

  const total = loads.reduce((sum, l) => sum + l.attempts, 0);
  return {
    tool: "snatch_success",
    window,
    n: total,
    insufficient: total < MIN_N_FOR_RATE,
    note:
      total < MIN_N_FOR_RATE
        ? `Only ${total} substantiated attempts in this window; ${MIN_N_FOR_RATE} is the minimum for a rate.`
        : undefined,
    data: { loads },
  };
}

// ---------------------------------------------------------------------------
// session_sequence — training days, rest days, and the gaps between them
// ---------------------------------------------------------------------------
async function sessionSequence(args: { days?: number }): Promise<ToolResult> {
  const window = windowFrom(args.days ?? 60);
  const db = readClient();

  const [sessions, days] = await Promise.all([
    db
      .from("v_session_summary")
      .select("session_date, workstreams, snatch_blocks, hypertrophy_sets, calisthenics_entries")
      .gte("session_date", window.from)
      .lte("session_date", window.to)
      .order("session_date"),
    db
      .from("days")
      .select("day, status")
      .gte("day", window.from)
      .lte("day", window.to)
      .order("day"),
  ]);
  if (sessions.error) throw new Error(sessions.error.message);
  if (days.error) throw new Error(days.error.message);

  const statusByDay = new Map((days.data ?? []).map((d) => [d.day, d.status]));
  const trained = [...new Set((sessions.data ?? []).map((s) => s.session_date))].sort();

  // Consecutive training-day runs.
  const runs: { from: string; to: string; length: number }[] = [];
  for (const date of trained) {
    const last = runs.at(-1);
    if (last && dayDiff(last.to, date) === 1) {
      last.to = date;
      last.length += 1;
    } else {
      runs.push({ from: date, to: date, length: 1 });
    }
  }

  const restDays = [...statusByDay.entries()]
    .filter(([, status]) => status === "rest")
    .map(([day]) => day);

  return {
    tool: "session_sequence",
    window,
    n: trained.length,
    insufficient: trained.length === 0,
    note:
      restDays.length === 0
        ? "No days are recorded as rest in this window. A day with no session is unlogged, which is not the same as rested."
        : undefined,
    data: {
      training_days: trained,
      rest_days: restDays,
      longest_consecutive_run: runs.reduce((max, r) => Math.max(max, r.length), 0),
      consecutive_runs: runs.filter((r) => r.length > 1),
      sessions: sessions.data ?? [],
    },
  };
}

// ---------------------------------------------------------------------------
// performance_after_recovery — the question the athlete actually asked
// ---------------------------------------------------------------------------
async function performanceAfterRecovery(args: {
  days?: number;
  load_kg?: number;
}): Promise<ToolResult> {
  const window = windowFrom(args.days ?? 3650);
  const load = args.load_kg ?? 50;
  const db = readClient();

  const { data, error } = await db
    .from("v_snatch_blocks")
    .select("session_date, weight_kg, attempts, full_stand_successes")
    .eq("is_substantiated", true)
    .eq("counts_as_full_lift", true)
    .eq("weight_kg", load)
    .gte("session_date", window.from)
    .lte("session_date", window.to)
    .order("session_date");
  if (error) throw new Error(error.message);

  const allDates = await db
    .from("v_session_summary")
    .select("session_date")
    .lte("session_date", window.to)
    .order("session_date");
  if (allDates.error) throw new Error(allDates.error.message);
  const trainingDays = [...new Set((allDates.data ?? []).map((s) => s.session_date))].sort();

  // Group the load's blocks by session, then by the gap that preceded it.
  const bySession = new Map<string, { attempts: number; stood: number }>();
  for (const row of data ?? []) {
    const entry = bySession.get(row.session_date) ?? { attempts: 0, stood: 0 };
    entry.attempts += row.attempts ?? 0;
    entry.stood += row.full_stand_successes ?? 0;
    bySession.set(row.session_date, entry);
  }

  const buckets = new Map<string, { sessions: number; attempts: number; stood: number }>();
  for (const [date, entry] of bySession) {
    const index = trainingDays.indexOf(date);
    const previous = index > 0 ? trainingDays[index - 1] : null;
    const gap = previous ? dayDiff(previous, date) : null;
    const key =
      gap === null ? "unknown" : gap <= 1 ? "back_to_back" : gap === 2 ? "one_day_gap" : "two_plus_day_gap";
    const bucket = buckets.get(key) ?? { sessions: 0, attempts: 0, stood: 0 };
    bucket.sessions += 1;
    bucket.attempts += entry.attempts;
    bucket.stood += entry.stood;
    buckets.set(key, bucket);
  }

  const rows = [...buckets.entries()].map(([gap, b]) => ({
    preceding_gap: gap,
    sessions: b.sessions,
    attempts: b.attempts,
    stood: b.stood,
    stand_rate_pct: b.attempts ? round1((100 * b.stood) / b.attempts) : null,
  }));

  const comparable = rows.filter((r) => r.sessions >= 2).length;
  return {
    tool: "performance_after_recovery",
    window,
    n: bySession.size,
    insufficient: bySession.size < MIN_SESSIONS_FOR_COMPARISON || comparable < 2,
    note:
      bySession.size < MIN_SESSIONS_FOR_COMPARISON || comparable < 2
        ? `${bySession.size} substantiated sessions at ${load} kg across ${comparable} comparable recovery buckets. Comparing recovery intervals needs at least ${MIN_SESSIONS_FOR_COMPARISON} sessions spread over 2 buckets, so this cannot support a conclusion.`
        : undefined,
    data: { load_kg: load, by_preceding_gap: rows },
  };
}

// ---------------------------------------------------------------------------
// day_context — everything known about one day
// ---------------------------------------------------------------------------
async function dayContext(args: { date: string }): Promise<ToolResult> {
  const db = readClient();
  const [day, sessions, metrics, snatch, notes] = await Promise.all([
    db.from("days").select("*").eq("day", args.date).maybeSingle(),
    db.from("v_session_summary").select("*").eq("session_date", args.date),
    db
      .from("daily_metrics")
      .select("metric, value_numeric, value_text, provenance")
      .eq("metric_date", args.date),
    db
      .from("v_snatch_blocks")
      .select("weight_kg, attempts, full_stand_successes, received_not_stood, quality_10, notes")
      .eq("session_date", args.date),
    db
      .from("context_notes")
      .select("external_source_id, note_type, evidence_status, content")
      .eq("anchor_date", args.date)
      .eq("review_status", "approved"),
  ]);

  const found =
    (sessions.data?.length ?? 0) +
    (metrics.data?.length ?? 0) +
    (snatch.data?.length ?? 0) +
    (notes.data?.length ?? 0);

  return {
    tool: "day_context",
    window: { from: args.date, to: args.date },
    n: found,
    insufficient: found === 0,
    note:
      found === 0 ? `Nothing is recorded for ${args.date}. That is not evidence of a rest day.` : undefined,
    data: {
      date: args.date,
      status: day.data?.status ?? "no record",
      sessions: sessions.data ?? [],
      snatch_blocks: snatch.data ?? [],
      journal: metrics.data ?? [],
      approved_notes: notes.data ?? [],
    },
  };
}

// ---------------------------------------------------------------------------
// journal_series — one metric over time
// ---------------------------------------------------------------------------
async function journalSeries(args: { metric: string; days?: number }): Promise<ToolResult> {
  const window = windowFrom(args.days ?? 90);
  const db = readClient();
  const { data, error } = await db
    .from("daily_metrics")
    .select("metric_date, value_numeric, value_text, provenance")
    .eq("metric", args.metric)
    .gte("metric_date", window.from)
    .lte("metric_date", window.to)
    .order("metric_date");
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const numeric = rows.filter((r) => r.value_numeric !== null);
  return {
    tool: "journal_series",
    window,
    n: rows.length,
    insufficient: numeric.length < 3,
    note:
      numeric.length < 3
        ? `${numeric.length} numeric readings of ${args.metric} in this window. Too few for a trend.`
        : undefined,
    data: {
      metric: args.metric,
      readings: rows,
      mean: numeric.length
        ? round1(numeric.reduce((s, r) => s + Number(r.value_numeric), 0) / numeric.length)
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// exercise_progress — machine identity preserved
// ---------------------------------------------------------------------------
async function exerciseProgress(args: { exercise: string; days?: number }): Promise<ToolResult> {
  const window = windowFrom(args.days ?? 365);
  const db = readClient();

  const exercise = await db
    .from("exercises")
    .select("id, name, slug")
    .or(`slug.eq.${args.exercise},name.ilike.${args.exercise}`)
    .maybeSingle();
  if (!exercise.data) {
    return {
      tool: "exercise_progress",
      window,
      n: 0,
      insufficient: true,
      note: `No exercise matches "${args.exercise}".`,
      data: null,
    };
  }

  const [{ data, error }, gymRows] = await Promise.all([
    db
      .from("hypertrophy_sets")
      // One string literal, not a concatenation: the client parses this at
      // type level to know the row shape, and cannot read an expression.
      .select(
        "id, parent_set_id, load_kg, reps, sets_count, is_drop, side, rir, machine_label, notes, order_vs_snatch, provenance, volume_load_kg, session_id, sessions(session_date, gym_id)",
      )
      .eq("exercise_id", exercise.data.id),
    db.from("gyms").select("id, name"),
  ]);
  if (error) throw new Error(error.message);
  const gymName = new Map((gymRows.data ?? []).map((g) => [g.id, g.name as string]));

  const rows = (data ?? [])
    .map((r) => {
      const session = r.sessions as unknown as { session_date: string; gym_id: number | null };
      return {
        date: session?.session_date,
        // The name, not the id. A bare integer is not something an answer can
        // be written from.
        gym: session?.gym_id == null ? null : (gymName.get(session.gym_id) ?? null),
        // Which station, where it was recorded. Two triceps extensions in one
        // gym can be a cable and a plate machine, and the loads on them have
        // nothing to say to each other.
        machine: r.machine_label ?? null,
        load_kg: r.load_kg === null ? null : Number(r.load_kg),
        reps: r.reps,
        sets: r.sets_count,
        volume_load_kg: r.volume_load_kg === null ? null : Number(r.volume_load_kg),
        rir: r.rir ?? null,
        // A drop is not a working set at that load. It is included because
        // leaving it out hid half of what a heavy set actually involved, and
        // labelled because counting it as a working set would overstate what
        // was lifted fresh.
        is_drop: Boolean(r.is_drop),
        dropped_from: r.parent_set_id ?? null,
        set_id: r.id,
        // Unilateral work: a left and a right are two sets, not one set twice.
        side: r.side ?? null,
        order_vs_snatch: r.order_vs_snatch ?? null,
        notes: r.notes ?? null,
        // Logged here, or reconstructed from conversation. The two are not
        // the same kind of fact and must not be averaged together.
        provenance: r.provenance ?? null,
      };
    })
    .filter((r) => r.date && r.date >= window.from && r.date <= window.to)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));

  // Working sets only decide whether there is enough here. One heavy set and
  // the drop off the end of it is one set, not two.
  const working = rows.filter((r) => !r.is_drop).length;

  return {
    tool: "exercise_progress",
    window,
    n: rows.length,
    insufficient: working < 2,
    note:
      rows.length < 2
        ? `${working} working sets of ${exercise.data.name} in this window.`
        : "Every set of this exercise, with what it was done on. Compare loads " +
          "only within the same gym AND the same machine: two sets in one gym " +
          "can be on different stations, and a null machine means the station " +
          "was not recorded, not that it was the same one. `machine` is the " +
          "athlete's own words — cable, rope, seated, which handle — and is " +
          "the finest detail available about what a load was lifted on. " +
          "`is_drop` sets hang off `dropped_from` and are not working sets at " +
          "that load; count them separately or not at all. RIR is an estimate, " +
          "not a measurement, and `provenance` says which rows were logged here " +
          "and which were reconstructed.",
    data: { exercise: exercise.data.name, working_sets: working, sets: rows },
  };
}

// ---------------------------------------------------------------------------
// approved_notes — narrative, clearly marked as such
// ---------------------------------------------------------------------------
async function approvedNotes(args: {
  from?: string;
  to?: string;
  search?: string;
  workstream?: string;
}): Promise<ToolResult> {
  const db = readClient();
  let query = db
    .from("context_notes")
    .select(
      "external_source_id, anchor_date, period_label, note_type, category, evidence_status, workstream, tags, content",
    )
    .eq("review_status", "approved")
    .order("anchor_date", { ascending: false })
    .limit(40);
  if (args.from) query = query.gte("anchor_date", args.from);
  if (args.to) query = query.lte("anchor_date", args.to);
  if (args.search) query = query.ilike("content", `%${args.search}%`);
  if (args.workstream) query = query.eq("workstream", args.workstream);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  return {
    tool: "approved_notes",
    window: args.from && args.to ? { from: args.from, to: args.to } : null,
    n: rows.length,
    insufficient: rows.length === 0,
    note:
      rows.length === 0
        ? "No approved notes match. Notes stay invisible until reviewed and approved, so this may mean unreviewed rather than non-existent."
        : "These are reports and interpretations, not measurements. Attribute them as such.",
    data: { notes: rows },
  };
}

// ---------------------------------------------------------------------------
// weekly_plan — the stated intention beside what actually happened
// ---------------------------------------------------------------------------
async function weeklyPlan(args: { days?: number }): Promise<ToolResult> {
  const window = windowFrom(args.days ?? 56);
  const db = readClient();

  const [themesRow, sessions] = await Promise.all([
    db.from("settings").select("value").eq("key", "weekday_themes").maybeSingle(),
    db
      .from("v_session_summary")
      .select("session_date, workstreams")
      .gte("session_date", window.from)
      .lte("session_date", window.to),
  ]);
  if (sessions.error) throw new Error(sessions.error.message);

  const themes = (themesRow.data?.value ?? {}) as Record<
    string,
    { name: string; focus: string | null; emphasis: string | null; region?: string | null }
  >;

  const byWeekday = new Map<number, { dates: string[]; withFocus: number }>();
  for (const session of sessions.data ?? []) {
    const dow = isoWeekday(session.session_date);
    const entry = byWeekday.get(dow) ?? { dates: [], withFocus: 0 };
    if (!entry.dates.includes(session.session_date)) entry.dates.push(session.session_date);
    const focus = themes[String(dow)]?.focus;
    if (focus && (session.workstreams ?? []).includes(focus)) entry.withFocus += 1;
    byWeekday.set(dow, entry);
  }

  const rows = Object.entries(themes).map(([dow, theme]) => {
    const actual = byWeekday.get(Number(dow)) ?? { dates: [], withFocus: 0 };
    return {
      iso_weekday: Number(dow),
      theme: theme.name,
      intended_focus: theme.focus,
      // The hypertrophy half of the day. A weekday has two intentions and
      // only the workstream one is counted below; this is stated, not
      // measured, and must not be reported as adherence.
      intended_region: theme.region ?? null,
      emphasis: theme.emphasis,
      sessions_on_that_weekday: actual.dates.length,
      sessions_matching_focus: theme.focus ? actual.withFocus : null,
    };
  });

  const total = rows.reduce((sum, r) => sum + r.sessions_on_that_weekday, 0);
  return {
    tool: "weekly_plan",
    window,
    n: total,
    insufficient: total < 4,
    note:
      "These are stated intentions, not obligations. A week that departs from them is a question, not a failing — training to how the body turns up on the day is the athlete's stated preference. Weekdays with no theme have no stated intention, which is different from having no plan.",
    data: { themes: rows },
  };
}

// ---------------------------------------------------------------------------
// snatch_detail — every lift, with what it was taken on
// ---------------------------------------------------------------------------
async function snatchDetail(args: { days?: number; load_kg?: number }): Promise<ToolResult> {
  const window = windowFrom(args.days ?? 365);
  const db = readClient();

  let query = db
    .from("v_snatch_blocks")
    .select(
      "id, session_date, gym_name, variation, counts_as_full_lift, weight_kg, attempts, full_stand_successes, received_not_stood, dropped, quality_10, straps, failure_mode, is_warmup, is_cooldown, notes, provenance, record_precision",
    )
    .gte("session_date", window.from)
    .lte("session_date", window.to);
  if (args.load_kg !== undefined) query = query.eq("weight_kg", args.load_kg);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const blocks = data ?? [];

  // The lifts themselves, where they were recorded one at a time. Imported
  // history has none and keeps its block totals instead.
  const attemptRows = blocks.length
    ? await db
        .from("snatch_attempts")
        .select("block_id, ordinal, outcome, quality_10, failure_mode_id, notes")
        .in(
          "block_id",
          blocks.map((b) => b.id as string),
        )
        .order("ordinal")
    : { data: [], error: null };
  if (attemptRows.error) throw new Error(attemptRows.error.message);

  const byBlock = new Map<string, typeof attemptRows.data>();
  for (const a of attemptRows.data ?? []) {
    const list = byBlock.get(a.block_id as string) ?? [];
    list.push(a);
    byBlock.set(a.block_id as string, list);
  }

  const rows = blocks
    .map((b) => {
      const lifts = byBlock.get(b.id as string) ?? [];
      return {
        date: b.session_date,
        gym: b.gym_name ?? null,
        load_kg: b.weight_kg === null ? null : Number(b.weight_kg),
        variation: b.variation,
        counts_as_full_lift: b.counts_as_full_lift,
        straps: b.straps,
        is_warmup: b.is_warmup,
        is_cooldown: b.is_cooldown,
        block_quality_10: b.quality_10 ?? null,
        block_failure_mode: b.failure_mode ?? null,
        notes: b.notes ?? null,
        provenance: b.provenance,
        basis: lifts.length > 0 ? "attempt" : b.record_precision,
        attempts: lifts.length > 0 ? lifts.length : (b.attempts ?? null),
        stood:
          lifts.length > 0
            ? lifts.filter((a) => a.outcome === "stood").length
            : (b.full_stand_successes ?? null),
        received_not_stood:
          lifts.length > 0
            ? lifts.filter((a) => a.outcome === "received_not_stood").length
            : (b.received_not_stood ?? null),
        lifts: lifts.map((a) => ({
          ordinal: a.ordinal,
          outcome: a.outcome,
          quality_10: a.quality_10 ?? null,
          notes: a.notes ?? null,
        })),
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const counted = rows.filter((r) => r.counts_as_full_lift && !r.is_warmup);
  return {
    tool: "snatch_detail",
    window,
    n: rows.length,
    insufficient: rows.length === 0,
    note:
      rows.length === 0
        ? "No snatch blocks in this window."
        : "Every block, warm-ups and pulls included, so filter before counting. " +
          "`counts_as_full_lift` false is not a snatch and never belongs in a " +
          "success rate; `is_warmup` is working-set tonnage only if you say it " +
          "is. `basis` 'attempt' means the lifts are listed individually; " +
          "anything else is a block total reconstructed from conversation, with " +
          "`lifts` empty. Quality is a judgement of how the lift looked and is " +
          "independent of whether it was stood.",
    data: {
      blocks: rows,
      working_full_lift_blocks: counted.length,
    },
  };
}

// ---------------------------------------------------------------------------
// skill_progress — calisthenics, per variation, never pooled
// ---------------------------------------------------------------------------
async function skillProgress(args: { skill?: string; days?: number }): Promise<ToolResult> {
  const window = windowFrom(args.days ?? 365);
  const db = readClient();

  const [entryRows, variationRows, assistanceRows] = await Promise.all([
    db
      .from("calisthenics_entries")
      .select(
        "id, skill_variation_id, attempts, successful_attempts, best_hold_seconds, total_hold_seconds, controlled_ascent, controlled_descent, assistance_id, quality_10, notes, provenance, record_precision, sessions(session_date)",
      ),
    db
      .from("skill_variations")
      .select("id, slug, name, skill_id, difficulty, min_hold_seconds, requires_no_kick, requires_controlled_ascent, requires_controlled_descent, criteria_notes, skills(slug, name)"),
    db.from("assistance_types").select("id, name"),
  ]);
  if (entryRows.error) throw new Error(entryRows.error.message);
  if (variationRows.error) throw new Error(variationRows.error.message);

  const variation = new Map(
    (variationRows.data ?? []).map((v) => [
      v.id as number,
      v as unknown as {
        id: number;
        slug: string;
        name: string;
        difficulty: number | null;
        min_hold_seconds: number | null;
        requires_no_kick: boolean;
        requires_controlled_ascent: boolean;
        requires_controlled_descent: boolean;
        criteria_notes: string | null;
        skills: { slug: string; name: string } | null;
      },
    ]),
  );
  const assistance = new Map(
    (assistanceRows.data ?? []).map((a) => [a.id as number, a.name as string]),
  );

  const entries = (entryRows.data ?? [])
    .map((e) => {
      const session = e.sessions as unknown as { session_date: string } | null;
      return { ...e, date: session?.session_date ?? null };
    })
    .filter((e) => e.date && e.date >= window.from && e.date <= window.to)
    .filter((e) => {
      if (!args.skill) return true;
      const v = variation.get(e.skill_variation_id as number);
      const needle = args.skill.toLowerCase();
      return (
        v?.name.toLowerCase().includes(needle) ||
        v?.slug.includes(needle) ||
        v?.skills?.name.toLowerCase().includes(needle) ||
        v?.skills?.slug.includes(needle)
      );
    });

  const attemptRows = entries.length
    ? await db
        .from("calisthenics_attempts")
        .select(
          "entry_id, ordinal, succeeded, hold_seconds, controlled_ascent, controlled_descent, negative_seconds, notes",
        )
        .in(
          "entry_id",
          entries.map((e) => e.id as string),
        )
        .order("ordinal")
    : { data: [], error: null };
  if (attemptRows.error) throw new Error(attemptRows.error.message);

  const byEntry = new Map<string, typeof attemptRows.data>();
  for (const a of attemptRows.data ?? []) {
    const list = byEntry.get(a.entry_id as string) ?? [];
    list.push(a);
    byEntry.set(a.entry_id as string, list);
  }

  const rows = entries
    .map((e) => {
      const v = variation.get(e.skill_variation_id as number);
      const lifts = byEntry.get(e.id as string) ?? [];
      const holds = lifts
        .filter((a) => a.succeeded && a.hold_seconds != null)
        .map((a) => Number(a.hold_seconds));
      return {
        date: e.date,
        skill: v?.skills?.name ?? null,
        variation: v?.name ?? null,
        // Ranked within its own skill only. A level 3 handstand and a level 3
        // back lever have nothing in common.
        difficulty: v?.difficulty ?? null,
        success_criteria: {
          min_hold_seconds: v?.min_hold_seconds ?? null,
          requires_no_kick: v?.requires_no_kick ?? null,
          requires_controlled_ascent: v?.requires_controlled_ascent ?? null,
          requires_controlled_descent: v?.requires_controlled_descent ?? null,
          notes: v?.criteria_notes ?? null,
        },
        assistance: e.assistance_id == null ? null : (assistance.get(e.assistance_id) ?? null),
        quality_10: e.quality_10 ?? null,
        notes: e.notes ?? null,
        provenance: e.provenance,
        basis: lifts.length > 0 ? "attempt" : e.record_precision,
        attempts: lifts.length > 0 ? lifts.length : (e.attempts ?? null),
        successes:
          lifts.length > 0
            ? lifts.filter((a) => a.succeeded).length
            : (e.successful_attempts ?? null),
        best_hold_seconds:
          holds.length > 0
            ? Math.max(...holds)
            : e.best_hold_seconds === null
              ? null
              : Number(e.best_hold_seconds),
        total_hold_seconds:
          holds.length > 0
            ? round1(holds.reduce((t, h) => t + h, 0))
            : e.total_hold_seconds === null
              ? null
              : Number(e.total_hold_seconds),
        // Counts exist only where attempts were recorded one at a time. The
        // old booleans said "at least one", which is not a number.
        controlled_ascents: lifts.length > 0 ? lifts.filter((a) => a.controlled_ascent).length : null,
        controlled_descents:
          lifts.length > 0 ? lifts.filter((a) => a.controlled_descent).length : null,
        controlled_ascent_reported: lifts.length > 0 ? null : (e.controlled_ascent ?? null),
        controlled_descent_reported: lifts.length > 0 ? null : (e.controlled_descent ?? null),
        negative_seconds: lifts.length > 0
          ? round1(lifts.reduce((t, a) => t + Number(a.negative_seconds ?? 0), 0)) || null
          : null,
        attempts_detail: lifts.map((a) => ({
          ordinal: a.ordinal,
          succeeded: a.succeeded,
          hold_seconds: a.hold_seconds === null ? null : Number(a.hold_seconds),
          controlled_ascent: a.controlled_ascent,
          controlled_descent: a.controlled_descent,
          negative_seconds: a.negative_seconds === null ? null : Number(a.negative_seconds),
          notes: a.notes ?? null,
        })),
      };
    })
    .sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? -1 : 1));

  return {
    tool: "skill_progress",
    window,
    n: rows.length,
    insufficient: rows.length === 0,
    note:
      rows.length === 0
        ? args.skill
          ? `No calisthenics entries match "${args.skill}" in this window.`
          : "No calisthenics entries in this window."
        : "One row per entry, never pooled across variations: a banded handstand " +
          "push-up and a freestanding one are different capabilities that share " +
          "a name, and a combined success rate over them means nothing. " +
          "`difficulty` ranks within one skill only. `success_criteria` is what " +
          "the variation defines a success as; whether an attempt met it was the " +
          "athlete's judgement, not a check. `basis` 'attempt' means the " +
          "attempts are listed; anything else is a block total with " +
          "`attempts_detail` empty and the controlled counts unavailable — the " +
          "reported booleans there mean 'at least one', not a count.",
    data: { entries: rows },
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
type Executor = (args: Record<string, never>) => Promise<ToolResult>;

export const TOOLS: Record<string, { schema: AnthropicTool; run: Executor }> = {
  snatch_success: {
    schema: {
      name: "snatch_success",
      description:
        "Stand rate and receive rate per load, from substantiated blocks only. Use for any question about how the snatch is going.",
      input_schema: {
        type: "object",
        properties: {
          days: { type: "number", description: "Look back this many days. Omit for all time." },
          load_kg: { type: "number", description: "Restrict to one load, e.g. 50." },
        },
        required: [],
        additionalProperties: false,
      },
    },
    run: snatchSuccess as unknown as Executor,
  },
  session_sequence: {
    schema: {
      name: "session_sequence",
      description:
        "Training days, recorded rest days and consecutive-day runs. Use for questions about frequency, load accumulation or recovery.",
      input_schema: {
        type: "object",
        properties: { days: { type: "number" } },
        required: [],
        additionalProperties: false,
      },
    },
    run: sessionSequence as unknown as Executor,
  },
  performance_after_recovery: {
    schema: {
      name: "performance_after_recovery",
      description:
        "Stand rate at a load, split by the gap that preceded each session. Use for 'does rest help' questions.",
      input_schema: {
        type: "object",
        properties: { days: { type: "number" }, load_kg: { type: "number" } },
        required: [],
        additionalProperties: false,
      },
    },
    run: performanceAfterRecovery as unknown as Executor,
  },
  day_context: {
    schema: {
      name: "day_context",
      description:
        "Everything recorded for one date: status, sessions, snatch blocks, journal entries and approved notes.",
      input_schema: {
        type: "object",
        properties: { date: { type: "string", description: "YYYY-MM-DD" } },
        required: ["date"],
        additionalProperties: false,
      },
    },
    run: dayContext as unknown as Executor,
  },
  journal_series: {
    schema: {
      name: "journal_series",
      description:
        "One journal metric over time, e.g. sleep_quality, readiness, soreness, fatigue, stress, mood, bodyweight.",
      input_schema: {
        type: "object",
        properties: { metric: { type: "string" }, days: { type: "number" } },
        required: ["metric"],
        additionalProperties: false,
      },
    },
    run: journalSeries as unknown as Executor,
  },
  exercise_progress: {
    schema: {
      name: "exercise_progress",
      description: "Load and reps for one exercise over time, grouped by gym.",
      input_schema: {
        type: "object",
        properties: { exercise: { type: "string" }, days: { type: "number" } },
        required: ["exercise"],
        additionalProperties: false,
      },
    },
    run: exerciseProgress as unknown as Executor,
  },
  weekly_plan: {
    schema: {
      name: "weekly_plan",
      description:
        "The athlete's stated weekday themes (Massive Mondays, Technique Tuesdays, Workhorse Wednesdays, Form Fridays) beside how many sessions on each weekday actually included the intended focus.",
      input_schema: {
        type: "object",
        properties: { days: { type: "number" } },
        required: [],
        additionalProperties: false,
      },
    },
    run: weeklyPlan as unknown as Executor,
  },
  snatch_detail: {
    schema: {
      name: "snatch_detail",
      description:
        "Every snatch block and, where recorded, every individual lift: load, variation, straps, warm-up, technical quality, failure mode and notes. Use when the question is about what a session actually involved rather than a rate.",
      input_schema: {
        type: "object",
        properties: {
          days: { type: "number", description: "Look back this many days. Default 365." },
          load_kg: { type: "number", description: "Restrict to one load, e.g. 50." },
        },
        required: [],
        additionalProperties: false,
      },
    },
    run: snatchDetail as unknown as Executor,
  },
  skill_progress: {
    schema: {
      name: "skill_progress",
      description:
        "Calisthenics per variation: attempts, successes, holds, controlled reps, negatives, assistance, quality and the variation's own success criteria. Never pools variations. Use for any question about a skill.",
      input_schema: {
        type: "object",
        properties: {
          skill: {
            type: "string",
            description: "Skill or variation name, e.g. 'handstand' or 'back lever'. Omit for all.",
          },
          days: { type: "number", description: "Look back this many days. Default 365." },
        },
        required: [],
        additionalProperties: false,
      },
    },
    run: skillProgress as unknown as Executor,
  },
  approved_notes: {
    schema: {
      name: "approved_notes",
      description:
        "Approved narrative notes — athlete reports and prior coaching hypotheses. Never measurements.",
      input_schema: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          search: { type: "string" },
          workstream: { type: "string", enum: ["snatch", "calisthenics", "hypertrophy"] },
        },
        required: [],
        additionalProperties: false,
      },
    },
    run: approvedNotes as unknown as Executor,
  },
};

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required: string[];
    additionalProperties: boolean;
  };
}

export function toolSchemas(): AnthropicTool[] {
  return Object.values(TOOLS).map((t) => t.schema);
}

export async function runTool(name: string, args: unknown): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.run((args ?? {}) as Record<string, never>);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function dayDiff(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000,
  );
}

export { weekStart };
