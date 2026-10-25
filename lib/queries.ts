import { safeRead } from "./supabase";
import { londonToday } from "./time";
import type {
  AssistanceType,
  CalisthenicsEntry,
  DailyMetric,
  Exercise,
  HypertrophySet,
  LastExerciseSetting,
  LastSkillSetting,
  MuscleGroup,
  Skill,
  SkillVariation,
  DailyMetricDef,
  DayRecord,
  FailureMode,
  Gym,
  Provenance,
  Session,
  Workstream,
  SessionBlock,
  SessionSummary,
  SnatchAttempt,
  SnatchBlock,
  SnatchObjective,
  SnatchSuccessByWeight,
  SnatchSuccessBySource,
  SnatchVariation,
  SnatchTag,
  WarmupLadder,
  WeightPreset,
} from "./types";

/**
 * Server-side reads. Each returns `{ data, error }` so a page can show a setup
 * state when the migration has not been applied, rather than throwing a 500.
 */

export interface TodayData {
  /** The dimensions the check-in offers, defined as data in the database. */
  metricDefs: DailyMetricDef[];
  /** What has already been recorded for this day. */
  metrics: DailyMetric[];
  /** Null when today has no row at all, which means nothing has been said
   *  about it — distinct from a row saying it was a rest day. */
  day: DayRecord | null;
  /** Every visit on this date, oldest first. Usually one; two is legitimate. */
  sessions: Session[];
  blocks: SessionBlock[];
  snatchBlocks: SnatchBlock[];
  hypertrophySets: HypertrophySet[];
  calisthenicsEntries: CalisthenicsEntry[];
  /** The most recent logged value per metric, from before today. Shown as a
   *  reference beside each field and never filled in: a value you did not
   *  measure today is not a measurement of today. */
  lastMetricValues: (DailyMetric & { metric_date: string })[];
  /** What was lifted last time, so the form opens with an answer in it. */
  lastExerciseSettings: LastExerciseSetting[];
  lastSkillSettings: LastSkillSetting[];
  recentExerciseIds: number[];
  recentSkillVariationIds: number[];
  attempts: SnatchAttempt[];
  lastSession: SessionSummary | null;
}

export async function getReferenceData() {
  const [
    gyms, variations, presets, failureModes, tags, settings,
    muscleGroups, exercises, skills, skillVariations, assistanceTypes,
  ] = await Promise.all([
    safeRead<Gym[]>((c) =>
      c.from("gyms").select("*").eq("is_active", true).order("sort_order"),
    ),
    safeRead<SnatchVariation[]>((c) =>
      c.from("snatch_variations").select("*").eq("is_active", true).order("sort_order"),
    ),
    safeRead<WeightPreset[]>((c) =>
      c.from("snatch_weight_presets").select("*").eq("is_active", true).order("weight_kg"),
    ),
    safeRead<FailureMode[]>((c) =>
      c.from("failure_modes").select("*").eq("is_active", true).order("sort_order"),
    ),
    safeRead<SnatchTag[]>((c) =>
      c.from("snatch_tags").select("*").eq("is_active", true).order("sort_order"),
    ),
    safeRead<{ key: string; value: unknown }[]>((c) => c.from("settings").select("key, value")),
    safeRead<MuscleGroup[]>((c) =>
      c.from("muscle_groups").select("*").eq("is_active", true).order("sort_order"),
    ),
    safeRead<Exercise[]>((c) =>
      c.from("exercises").select("*").eq("is_active", true).order("sort_order"),
    ),
    safeRead<Skill[]>((c) =>
      c.from("skills").select("*").eq("is_active", true).order("sort_order"),
    ),
    safeRead<SkillVariation[]>((c) =>
      c.from("skill_variations").select("*").eq("is_active", true).order("sort_order"),
    ),
    safeRead<AssistanceType[]>((c) =>
      c.from("assistance_types").select("*").eq("is_active", true).order("sort_order"),
    ),
  ]);

  const settingsMap = new Map((settings.data ?? []).map((row) => [row.key, row.value]));

  return {
    gyms: gyms.data ?? [],
    variations: variations.data ?? [],
    presets: presets.data ?? [],
    failureModes: failureModes.data ?? [],
    tags: tags.data ?? [],
    muscleGroups: muscleGroups.data ?? [],
    exercises: exercises.data ?? [],
    skills: skills.data ?? [],
    skillVariations: skillVariations.data ?? [],
    assistanceTypes: assistanceTypes.data ?? [],
    objective: (settingsMap.get("snatch_objective") as SnatchObjective | undefined) ?? null,
    ladder: (settingsMap.get("snatch_warmup_ladder") as WarmupLadder | undefined) ?? null,
    heavyThresholdKg: (settingsMap.get("heavy_session_threshold_kg") as number | undefined) ?? null,
    error: gyms.error ?? variations.error ?? presets.error ?? settings.error,
  };
}

export async function getToday(date = londonToday()): Promise<TodayData & { error: string | null }> {
  const sessionResult = await safeRead<Session[]>((c) =>
    c.from("sessions").select("*").eq("session_date", date).order("created_at", { ascending: true }),
  );

  const sessions = sessionResult.data ?? [];

  const dayResult = await safeRead<DayRecord[]>((c) =>
    c.from("days").select("*").eq("day", date).limit(1),
  );
  const day = dayResult.data?.[0] ?? null;

  const [defsResult, metricsResult] = await Promise.all([
    safeRead<DailyMetricDef[]>((c) =>
      c.from("daily_metric_defs").select("*").eq("is_active", true).order("sort_order"),
    ),
    safeRead<DailyMetric[]>((c) =>
      c
        .from("daily_metrics")
        .select("metric, value_numeric, value_text")
        .eq("metric_date", date)
        .eq("provenance", "logged"),
    ),
  ]);
  const metricDefs = defsResult.data ?? [];
  const metrics = metricsResult.data ?? [];

  const lastSessionResult = await safeRead<SessionSummary[]>((c) =>
    c
      .from("v_session_summary")
      .select("*")
      .lt("session_date", date)
      .order("session_date", { ascending: false })
      .limit(1),
  );

  if (sessions.length === 0) {
    return {
      day,
      metricDefs,
      metrics,
      sessions: [],
      blocks: [],
      hypertrophySets: [],
      calisthenicsEntries: [],
      lastMetricValues: [],
      lastExerciseSettings: [],
      lastSkillSettings: [],
      recentExerciseIds: [],
      recentSkillVariationIds: [],
      snatchBlocks: [],
      attempts: [],
      lastSession: lastSessionResult.data?.[0] ?? null,
      error: sessionResult.error,
    };
  }

  const sessionIds = sessions.map((s) => s.id);
  const [
    blocks, snatchBlocks, hypertrophySets, calisthenicsEntries,
    priorMetrics, lastExercise, lastSkill, recentExercises, recentSkills,
  ] = await Promise.all([
    safeRead<SessionBlock[]>((c) =>
      c.from("session_blocks").select("*").in("session_id", sessionIds).order("sort_order"),
    ),
    safeRead<SnatchBlock[]>((c) =>
      c
        .from("snatch_blocks")
        .select("*")
        .in("session_id", sessionIds)
        .order("logged_at", { ascending: true }),
    ),
    safeRead<HypertrophySet[]>((c) =>
      c.from("hypertrophy_sets").select("*").in("session_id", sessionIds).order("created_at"),
    ),
    safeRead<CalisthenicsEntry[]>((c) =>
      c.from("calisthenics_entries").select("*").in("session_id", sessionIds).order("created_at"),
    ),
    safeRead<(DailyMetric & { metric_date: string })[]>((c) =>
      c
        .from("daily_metrics")
        .select("metric, value_numeric, value_text, metric_date")
        .eq("provenance", "logged")
        .lt("metric_date", date)
        .order("metric_date", { ascending: false })
        .limit(400),
    ),
    safeRead<LastExerciseSetting[]>((c) => c.from("v_last_exercise_setting").select("*")),
    safeRead<LastSkillSetting[]>((c) => c.from("v_last_skill_setting").select("*")),
    safeRead<{ exercise_id: number }[]>((c) =>
      c.from("v_recent_exercises").select("exercise_id").limit(12),
    ),
    safeRead<{ skill_variation_id: number }[]>((c) =>
      c.from("v_recent_skills").select("skill_variation_id").limit(12),
    ),
  ]);

  const blockIds = (snatchBlocks.data ?? []).map((b) => b.id);
  const attempts = blockIds.length
    ? await safeRead<SnatchAttempt[]>((c) =>
        c.from("snatch_attempts").select("*").in("block_id", blockIds).order("ordinal"),
      )
    : { data: [], error: null };

  return {
    day,
    metricDefs,
    metrics,
    sessions,
    blocks: blocks.data ?? [],
    snatchBlocks: snatchBlocks.data ?? [],
    hypertrophySets: hypertrophySets.data ?? [],
    calisthenicsEntries: calisthenicsEntries.data ?? [],
    lastMetricValues: dedupeByMetric(priorMetrics.data ?? []),
    lastExerciseSettings: lastExercise.data ?? [],
    lastSkillSettings: lastSkill.data ?? [],
    recentExerciseIds: (recentExercises.data ?? []).map((r) => r.exercise_id),
    recentSkillVariationIds: (recentSkills.data ?? []).map((r) => r.skill_variation_id),
    attempts: attempts.data ?? [],
    lastSession: lastSessionResult.data?.[0] ?? null,
    error: sessionResult.error ?? blocks.error ?? snatchBlocks.error,
  };
}

export interface SessionDigest {
  id: string;
  date: string;
  gym: string | null;
  workstreams: Workstream[];
  provenance: Provenance;
  notes: string | null;
  /** Heaviest load stood in the session. The number the session is judged on. */
  heaviestStoodKg: number | null;
  /** Heaviest load attempted, shown when nothing was stood. */
  heaviestAttemptedKg: number | null;
  snatchAttempts: number;
  snatchStood: number;
  snatchReceivedNotStood: number;
  hypertrophySets: number;
  volumeLoadKg: number;
  calisthenicsEntries: number;
  bestHoldSeconds: number | null;
}

export interface HistoryData {
  sessions: SessionDigest[];
  /** Dates explicitly marked as rest. A date absent from both this and the
   *  session list was simply never logged, which is not the same thing. */
  restDays: string[];
  reconstructedCount: number;
  error: string | null;
}

/**
 * One digest per session, with the snatch, hypertrophy and calisthenics rows
 * folded in. The whole history is a few hundred rows, so it is aggregated here
 * rather than in another view: the shape of the summary is still changing, and
 * a view would have to be migrated every time it does.
 */
export async function getHistory(): Promise<HistoryData> {
  const [sessions, snatch, hypertrophy, calisthenics, rest] = await Promise.all([
    safeRead<SessionSummary[]>((c) =>
      c.from("v_session_summary").select("*").order("session_date", { ascending: false }),
    ),
    safeRead<
      {
        session_id: string;
        weight_kg: number | null;
        attempts: number | null;
        full_stand_successes: number | null;
        received_not_stood: number | null;
        counts_as_full_lift: boolean;
      }[]
    >((c) =>
      c
        .from("v_snatch_blocks")
        .select(
          "session_id, weight_kg, attempts, full_stand_successes, received_not_stood, counts_as_full_lift",
        ),
    ),
    safeRead<{ session_id: string; volume_load_kg: number | null }[]>((c) =>
      c.from("hypertrophy_sets").select("session_id, volume_load_kg"),
    ),
    safeRead<{ session_id: string; best_hold_seconds: number | null }[]>((c) =>
      c.from("calisthenics_entries").select("session_id, best_hold_seconds"),
    ),
    safeRead<{ day: string }[]>((c) =>
      c.from("days").select("day").eq("status", "rest").order("day", { ascending: false }),
    ),
  ]);

  const error = sessions.error ?? snatch.error ?? hypertrophy.error ?? calisthenics.error;
  if (!sessions.data) return { sessions: [], restDays: [], reconstructedCount: 0, error };

  const digests = new Map<string, SessionDigest>(
    sessions.data.map((s) => [
      s.id,
      {
        id: s.id,
        date: s.session_date,
        gym: s.gym,
        workstreams: s.workstreams ?? [],
        provenance: s.provenance,
        notes: s.notes,
        heaviestStoodKg: null,
        heaviestAttemptedKg: null,
        snatchAttempts: 0,
        snatchStood: 0,
        snatchReceivedNotStood: 0,
        hypertrophySets: 0,
        volumeLoadKg: 0,
        calisthenicsEntries: 0,
        bestHoldSeconds: null,
      },
    ]),
  );

  for (const block of snatch.data ?? []) {
    const digest = digests.get(block.session_id);
    // Pulls and bottom stands are not full lifts and never count towards a
    // session's heaviest stood load.
    if (!digest || !block.counts_as_full_lift) continue;
    const weight = block.weight_kg === null ? null : Number(block.weight_kg);
    digest.snatchAttempts += block.attempts ?? 0;
    digest.snatchStood += block.full_stand_successes ?? 0;
    digest.snatchReceivedNotStood += block.received_not_stood ?? 0;
    if (weight !== null) {
      digest.heaviestAttemptedKg = Math.max(digest.heaviestAttemptedKg ?? 0, weight);
      if ((block.full_stand_successes ?? 0) > 0) {
        digest.heaviestStoodKg = Math.max(digest.heaviestStoodKg ?? 0, weight);
      }
    }
  }

  for (const set of hypertrophy.data ?? []) {
    const digest = digests.get(set.session_id);
    if (!digest) continue;
    digest.hypertrophySets += 1;
    digest.volumeLoadKg += Number(set.volume_load_kg ?? 0);
  }

  for (const entry of calisthenics.data ?? []) {
    const digest = digests.get(entry.session_id);
    if (!digest) continue;
    digest.calisthenicsEntries += 1;
    const hold = entry.best_hold_seconds === null ? null : Number(entry.best_hold_seconds);
    if (hold !== null) {
      digest.bestHoldSeconds = Math.max(digest.bestHoldSeconds ?? 0, hold);
    }
  }

  const list = [...digests.values()];
  return {
    sessions: list,
    restDays: (rest.data ?? []).map((r) => r.day),
    reconstructedCount: list.filter((s) => s.provenance !== "logged").length,
    error,
  };
}

/** Rows arrive newest first, so the first of each metric is the latest. */
function dedupeByMetric<T extends { metric: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.metric)) return false;
    seen.add(row.metric);
    return true;
  });
}

export interface DayDetail {
  date: string;
  day: DayRecord | null;
  sessions: Session[];
  /** Counts per session, so an empty one can be offered for deletion. */
  loggedCounts: Record<string, number>;
  metricDefs: DailyMetricDef[];
  metrics: DailyMetric[];
  lastMetricValues: (DailyMetric & { metric_date: string })[];
  error: string | null;
}

/** Everything attached to one calendar day, for the day editor. */
export async function getDayDetail(date: string): Promise<DayDetail> {
  const [dayResult, sessionResult, defsResult, metricsResult, priorResult] = await Promise.all([
    safeRead<DayRecord[]>((c) => c.from("days").select("*").eq("day", date).limit(1)),
    safeRead<Session[]>((c) =>
      c.from("sessions").select("*").eq("session_date", date).order("created_at"),
    ),
    safeRead<DailyMetricDef[]>((c) =>
      c.from("daily_metric_defs").select("*").eq("is_active", true).order("sort_order"),
    ),
    safeRead<DailyMetric[]>((c) =>
      c
        .from("daily_metrics")
        .select("metric, value_numeric, value_text")
        .eq("metric_date", date)
        .eq("provenance", "logged"),
    ),
    safeRead<(DailyMetric & { metric_date: string })[]>((c) =>
      c
        .from("daily_metrics")
        .select("metric, value_numeric, value_text, metric_date")
        .eq("provenance", "logged")
        .lt("metric_date", date)
        .order("metric_date", { ascending: false })
        .limit(400),
    ),
  ]);

  const sessions = sessionResult.data ?? [];
  const ids = sessions.map((s) => s.id);
  const loggedCounts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));

  if (ids.length) {
    const [snatch, hypertrophy, calisthenics] = await Promise.all([
      safeRead<{ session_id: string }[]>((c) =>
        c.from("snatch_blocks").select("session_id").in("session_id", ids),
      ),
      safeRead<{ session_id: string }[]>((c) =>
        c.from("hypertrophy_sets").select("session_id").in("session_id", ids),
      ),
      safeRead<{ session_id: string }[]>((c) =>
        c.from("calisthenics_entries").select("session_id").in("session_id", ids),
      ),
    ]);
    for (const row of [...(snatch.data ?? []), ...(hypertrophy.data ?? []), ...(calisthenics.data ?? [])]) {
      loggedCounts[row.session_id] = (loggedCounts[row.session_id] ?? 0) + 1;
    }
  }

  return {
    date,
    day: dayResult.data?.[0] ?? null,
    sessions,
    loggedCounts,
    metricDefs: defsResult.data ?? [],
    metrics: metricsResult.data ?? [],
    lastMetricValues: dedupeByMetric(priorResult.data ?? []),
    error: sessionResult.error ?? defsResult.error,
  };
}

export async function getSnatchSuccessByWeight() {
  return safeRead<SnatchSuccessByWeight[]>((c) =>
    c.from("v_snatch_success_by_weight").select("*").order("weight_kg"),
  );
}

/**
 * Imported history and newly logged training, kept apart. Averaging them would
 * dilute every new session into ten months of reconstruction.
 */
export async function getSnatchSuccessBySource() {
  return safeRead<SnatchSuccessBySource[]>((c) =>
    c.from("v_snatch_success_by_source").select("*").order("weight_kg"),
  );
}

export async function getRecentSessions(limit = 30) {
  return safeRead<SessionSummary[]>((c) =>
    c.from("v_session_summary").select("*").order("session_date", { ascending: false }).limit(limit),
  );
}

/**
 * The most recent block at a given load, used to prefill straps and variation
 * so a repeat weight does not have to be re-specified.
 */
export async function getLastBlockAtWeight(weightKg: number) {
  return safeRead<SnatchBlock[]>((c) =>
    c
      .from("snatch_blocks")
      .select("*")
      .eq("weight_kg", weightKg)
      .order("logged_at", { ascending: false })
      .limit(1),
  );
}
