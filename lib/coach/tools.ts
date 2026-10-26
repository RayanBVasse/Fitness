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

  const { data, error } = await db
    .from("hypertrophy_sets")
    .select("load_kg, reps, sets_count, is_drop, session_id, sessions(session_date, gym_id)")
    .eq("exercise_id", exercise.data.id)
    .eq("is_drop", false);
  if (error) throw new Error(error.message);

  const rows = (data ?? [])
    .map((r) => {
      const session = r.sessions as unknown as { session_date: string; gym_id: number | null };
      return {
        date: session?.session_date,
        gym_id: session?.gym_id ?? null,
        load_kg: r.load_kg === null ? null : Number(r.load_kg),
        reps: r.reps,
        sets: r.sets_count,
      };
    })
    .filter((r) => r.date && r.date >= window.from && r.date <= window.to)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));

  return {
    tool: "exercise_progress",
    window,
    n: rows.length,
    insufficient: rows.length < 2,
    note:
      rows.length < 2
        ? `${rows.length} sets of ${exercise.data.name} in this window.`
        : "Loads are grouped by gym: the same exercise on a different machine is not comparable.",
    data: { exercise: exercise.data.name, sets: rows },
  };
}

// ---------------------------------------------------------------------------
// approved_notes — narrative, clearly marked as such
// ---------------------------------------------------------------------------
async function approvedNotes(args: { from?: string; to?: string; search?: string }): Promise<ToolResult> {
  const db = readClient();
  let query = db
    .from("context_notes")
    .select("external_source_id, anchor_date, period_label, note_type, category, evidence_status, content")
    .eq("review_status", "approved")
    .order("anchor_date", { ascending: false })
    .limit(40);
  if (args.from) query = query.gte("anchor_date", args.from);
  if (args.to) query = query.lte("anchor_date", args.to);
  if (args.search) query = query.ilike("content", `%${args.search}%`);

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
    { name: string; focus: string | null; emphasis: string | null }
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
    properties: Record<string, { type: string; description?: string }>;
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
