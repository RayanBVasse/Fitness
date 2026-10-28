import { safeRead } from "./supabase";
import { londonToday } from "./time";
import type { ThirdParty } from "./coach/verify";
import type {
  AssistanceType,
  BodySide,
  CalisthenicsAttempt,
  CalisthenicsEntry,
  CoachReview,
  DailyMetric,
  Exercise,
  HypertrophySet,
  LastExerciseSetting,
  LastSkillSetting,
  ContextNote,
  MuscleGroup,
  MuscleRegion,
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
  WeekdayThemes,
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
  calisthenicsAttempts: CalisthenicsAttempt[];
  /** Every lift of the day, in order. The block counters are a trigger-kept
   *  summary of these, so they are the detail behind every snatch figure. */
  snatchAttempts: SnatchAttempt[];
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
  /** Notes anchored to this day, both the day's own and each workstream's. */
  notes: ContextNote[];
  /** The coach's review of this day, pasted in from outside. */
  review: CoachReview | null;
}

export async function getReferenceData() {
  const [
    gyms, variations, presets, failureModes, tags, settings,
    muscleGroups, exercises, skills, skillVariations, assistanceTypes,
    thirdParties,
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
    // The redaction list. Longest alias first, so "Miss T" is replaced before
    // a bare "T" could be — the redactor relies on that order.
    safeRead<ThirdParty[]>((c) =>
      c.from("third_parties").select("alias, role").eq("is_active", true),
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
    thirdParties: [...(thirdParties.data ?? [])].sort(
      (a, b) => b.alias.length - a.alias.length,
    ),
    objective: (settingsMap.get("snatch_objective") as SnatchObjective | undefined) ?? null,
    ladder: (settingsMap.get("snatch_warmup_ladder") as WarmupLadder | undefined) ?? null,
    weekdayThemes: (settingsMap.get("weekday_themes") as WeekdayThemes | undefined) ?? {},
    muscleRegions: (settingsMap.get("muscle_regions") as MuscleRegion[] | undefined) ?? [],
    heavyThresholdKg: (settingsMap.get("heavy_session_threshold_kg") as number | undefined) ?? null,
    error: gyms.error ?? variations.error ?? presets.error ?? settings.error,
  };
}

/**
 * The one review for a period, if one has been pasted.
 *
 * Keyed on the external id rather than the date columns, because that is the
 * unique constraint the write path upserts on — reading it the same way means
 * the screen cannot show two reviews where the database allows only one.
 */
async function readReview(scope: "day" | "week", key: string): Promise<CoachReview | null> {
  const result = await safeRead<CoachReview[]>((c) =>
    c
      .from("context_notes")
      .select<string, CoachReview>("id, content, anchor_date, period_label, updated_at")
      .eq("external_source_id", `${scope === "week" ? "weekly" : "daily"}_review:${key}`)
      .limit(1),
  );
  return result.data?.[0] ?? null;
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

  const notesResult = await safeRead<ContextNote[]>((c) =>
    c
      .from("context_notes")
      .select<string, ContextNote>("*")
      .eq("anchor_date", date)
      // Notes written here, and the check-in text that 0015 folded in. The
      // imported pack is excluded: it belongs to the review screen, not to a
      // day's working surface. Leaving the folded rows out would have left
      // them saved and invisible, which is the failure the fold existed to
      // avoid.
      .in("source_type", ["authored_in_app", "daily_check_in"])
      .order("created_at", { ascending: true }),
  );

  const review = await readReview("day", date);

  if (sessions.length === 0) {
    return {
      day,
      metricDefs,
      metrics,
      notes: notesResult.data ?? [],
      review,
      calisthenicsAttempts: [],
      snatchAttempts: [],
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

  // These two read the rows behind every snatch and calisthenics figure, so
  // they have to run AFTER the blocks and entries they filter by. They were
  // written above that destructure and threw a ReferenceError on every
  // request; safeRead caught it and returned an empty list, so the attempts
  // simply never appeared and nothing said why. Their errors are surfaced
  // below for the same reason.
  const snatchAttemptsResult = await safeRead<SnatchAttempt[]>((c) =>
    c
      .from("snatch_attempts")
      .select<string, SnatchAttempt>("*")
      .in(
        "block_id",
        (snatchBlocks.data ?? []).map((b) => b.id),
      )
      .order("ordinal"),
  );

  const attemptsResult = await safeRead<CalisthenicsAttempt[]>((c) =>
    c
      .from("calisthenics_attempts")
      .select<string, CalisthenicsAttempt>("*")
      .in(
        "entry_id",
        (calisthenicsEntries.data ?? []).map((e) => e.id),
      )
      .order("ordinal"),
  );

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
    notes: notesResult.data ?? [],
    review,
    sessions,
    blocks: blocks.data ?? [],
    snatchBlocks: snatchBlocks.data ?? [],
    hypertrophySets: hypertrophySets.data ?? [],
    calisthenicsEntries: calisthenicsEntries.data ?? [],
    calisthenicsAttempts: attemptsResult.data ?? [],
    snatchAttempts: snatchAttemptsResult.data ?? [],
    lastMetricValues: dedupeByMetric(priorMetrics.data ?? []),
    lastExerciseSettings: lastExercise.data ?? [],
    lastSkillSettings: lastSkill.data ?? [],
    recentExerciseIds: (recentExercises.data ?? []).map((r) => r.exercise_id),
    recentSkillVariationIds: (recentSkills.data ?? []).map((r) => r.skill_variation_id),
    attempts: attempts.data ?? [],
    lastSession: lastSessionResult.data?.[0] ?? null,
    error:
      sessionResult.error ??
      blocks.error ??
      snatchBlocks.error ??
      snatchAttemptsResult.error ??
      attemptsResult.error,
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

export interface NotesData {
  notes: ContextNote[];
  counts: { pending: number; approved: number; rejected: number };
  months: string[];
  noteTypes: string[];
  error: string | null;
}

/**
 * The review queue. Notes stay invisible to the Coach until approved, so this
 * is the consent gate rather than a tidying exercise.
 */
export async function getContextNotes(filters: {
  status?: string;
  month?: string;
  noteType?: string;
}): Promise<NotesData> {
  const [listResult, allResult] = await Promise.all([
    safeRead<ContextNote[]>((c) => {
      let q = c
        .from("context_notes")
        .select(
          "id, external_source_id, note_type, category, content, anchor_date, period_label, evidence_status, sensitivity, candidate_numeric, tags, review_status, linked_session_id, workstream",
        )
        .order("anchor_date", { ascending: false, nullsFirst: false })
        .limit(200);
      if (filters.status && filters.status !== "all") q = q.eq("review_status", filters.status);
      if (filters.noteType) q = q.eq("note_type", filters.noteType);
      if (filters.month) {
        q = q.gte("anchor_date", `${filters.month}-01`).lte("anchor_date", `${filters.month}-31`);
      }
      return q;
    }),
    safeRead<{ review_status: string; note_type: string; anchor_date: string | null }[]>((c) =>
      c.from("context_notes").select("review_status, note_type, anchor_date"),
    ),
  ]);

  const all = allResult.data ?? [];
  return {
    notes: listResult.data ?? [],
    counts: {
      pending: all.filter((n) => n.review_status === "pending").length,
      approved: all.filter((n) => n.review_status === "approved").length,
      rejected: all.filter((n) => n.review_status === "rejected").length,
    },
    months: [...new Set(all.map((n) => n.anchor_date?.slice(0, 7)).filter(Boolean) as string[])].sort().reverse(),
    noteTypes: [...new Set(all.map((n) => n.note_type))].sort(),
    error: listResult.error ?? allResult.error,
  };
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
  /** The session's own records, so a past day can be read and corrected
   *  rather than merely counted. */
  blocks: SessionBlock[];
  snatchBlocks: SnatchBlock[];
  snatchAttempts: SnatchAttempt[];
  hypertrophySets: HypertrophySet[];
  calisthenicsEntries: CalisthenicsEntry[];
  calisthenicsAttempts: CalisthenicsAttempt[];
  notes: ContextNote[];
  review: CoachReview | null;
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

  let blocks: SessionBlock[] = [];
  let snatchBlocks: SnatchBlock[] = [];
  let snatchAttempts: SnatchAttempt[] = [];
  let hypertrophySets: HypertrophySet[] = [];
  let calisthenicsEntries: CalisthenicsEntry[] = [];
  let calisthenicsAttempts: CalisthenicsAttempt[] = [];

  if (ids.length) {
    const [blockRows, snatch, hypertrophy, calisthenics] = await Promise.all([
      safeRead<SessionBlock[]>((c) =>
        c.from("session_blocks").select("*").in("session_id", ids).order("sort_order"),
      ),
      safeRead<SnatchBlock[]>((c) =>
        c.from("snatch_blocks").select("*").in("session_id", ids).order("logged_at"),
      ),
      safeRead<HypertrophySet[]>((c) =>
        c.from("hypertrophy_sets").select("*").in("session_id", ids).order("created_at"),
      ),
      safeRead<CalisthenicsEntry[]>((c) =>
        c.from("calisthenics_entries").select("*").in("session_id", ids).order("created_at"),
      ),
    ]);
    blocks = blockRows.data ?? [];
    snatchBlocks = snatch.data ?? [];
    hypertrophySets = hypertrophy.data ?? [];
    calisthenicsEntries = calisthenics.data ?? [];

    // After the rows they filter by, never before: reading these from above
    // the fetch is what made the attempts silently vanish on Today.
    const [snatchAttemptRows, calisthenicsAttemptRows] = await Promise.all([
      safeRead<SnatchAttempt[]>((c) =>
        c
          .from("snatch_attempts")
          .select<string, SnatchAttempt>("*")
          .in("block_id", snatchBlocks.map((b) => b.id))
          .order("ordinal"),
      ),
      safeRead<CalisthenicsAttempt[]>((c) =>
        c
          .from("calisthenics_attempts")
          .select<string, CalisthenicsAttempt>("*")
          .in("entry_id", calisthenicsEntries.map((e) => e.id))
          .order("ordinal"),
      ),
    ]);
    snatchAttempts = snatchAttemptRows.data ?? [];
    calisthenicsAttempts = calisthenicsAttemptRows.data ?? [];

    for (const row of [...snatchBlocks, ...hypertrophySets, ...calisthenicsEntries]) {
      loggedCounts[row.session_id] = (loggedCounts[row.session_id] ?? 0) + 1;
    }
  }

  const notesResult = await safeRead<ContextNote[]>((c) =>
    c
      .from("context_notes")
      .select<string, ContextNote>("*")
      .eq("anchor_date", date)
      .in("source_type", ["authored_in_app", "daily_check_in"])
      .order("created_at", { ascending: true }),
  );

  return {
    date,
    day: dayResult.data?.[0] ?? null,
    sessions,
    loggedCounts,
    metricDefs: defsResult.data ?? [],
    metrics: metricsResult.data ?? [],
    lastMetricValues: dedupeByMetric(priorResult.data ?? []),
    blocks,
    snatchBlocks,
    snatchAttempts,
    hypertrophySets,
    calisthenicsEntries,
    calisthenicsAttempts,
    notes: notesResult.data ?? [],
    review: await readReview("day", date),
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

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/** One ISO week of one thing. `week` is the Monday. */
export interface WeekPoint {
  week: string;
  value: number;
}

/**
 * How much there is behind a window's figures.
 *
 * Carried beside every panel because the same chart drawn over seven days and
 * over a year looks identical and means something entirely different. A rate
 * from two attempts and one from two hundred are both "a rate"; only the n
 * says which you are reading.
 */
export interface ProgressCounts {
  /** Days with any record at all. Not days trained: a day may hold a note. */
  daysWithRecords: number;
  /** Weekly buckets that hold something. Below three, nothing is a trend. */
  weeksWithRecords: number;
  snatchBlocks: number;
  snatchAttempts: number;
  hypertrophySets: number;
  calisthenicsEntries: number;
  calisthenicsAttempts: number;
}

/** One logged row, as the drill-down reads it. */
export interface SetEntry {
  date: string;
  load: number | null;
  reps: number | null;
  setsCount: number;
  rir: number | null;
  volume: number;
  isDrop: boolean;
  side: BodySide;
}

/** One exercise on one machine at one gym — the only comparable unit. */
export interface Setup {
  /** Machine and gym as recorded. Null where neither was noted. */
  machine: string | null;
  gym: string | null;
  sets: number;
  entries: SetEntry[];
}

export interface ExerciseDetail {
  exerciseId: number;
  exercise: string;
  group: string;
  sets: number;
  setups: Setup[];
}

export interface ProgressData {
  /** The window asked for. `from` is 1970 for "all", which is not a date. */
  from: string;
  to: string;
  /** The length of the window in days, null for all of it. */
  days: number | null;
  /** The earliest record actually found, so "all" can name a real start. */
  coveredFrom: string | null;
  counts: ProgressCounts;
  /** Stand rate per week at each load, substantiated full lifts only. */
  snatchByLoad: { load_kg: number; points: { week: string; attempts: number; stood: number }[] }[];
  /** Bar lifted per week, working and warm-up kept apart. */
  snatchTonnage: { week: string; working: number; warmup: number }[];
  /**
   * Technical quality per load, as the ratings themselves.
   *
   * Every rated block is kept as its own number rather than reduced to a mean
   * or a median. Quality is a 1–10 judgement recorded two or three times a
   * week at a given load; the middle of three opinions is not a measurement,
   * and a line through it reads as a trend the data cannot carry. The spread
   * IS the finding — whether 45 kg is becoming consistently smooth is a
   * question about the spread closing, which an average hides.
   */
  snatchQuality: {
    load_kg: number;
    /** Logged full lifts at this load in the window. */
    blocks: number;
    /** How many of them carry a rating. The rest are not zeros. */
    rated: number;
    points: { week: string; qualities: number[] }[];
  }[];
  /** Rated blocks left out as reconstruction, so the omission can be named. */
  snatchQualityImported: number;
  /** Sets per week per muscle group. */
  setsByGroup: { week: string; groups: Record<string, number> }[];
  /**
   * Every exercise worked in the window, split by where it was worked.
   *
   * A setup is one exercise on one machine at one gym. Loads are not
   * comparable across those: 45 kg on a cable and 45 kg on a plate-loaded
   * machine are different resistances wearing the same number, so pooling
   * them would turn a change of equipment into progress. Nothing here is
   * summed across setups for that reason.
   */
  hypertrophyDetail: ExerciseDetail[];
  /** Volume load per week, in kg. */
  volumeByWeek: WeekPoint[];
  /** Per variation over the whole window. Never pooled across variations. */
  skills: {
    variation: string;
    skill: string;
    difficulty: number | null;
    attempts: number;
    successes: number;
    bestHoldSeconds: number | null;
    entries: number;
    basis: "attempt" | "mixed" | "summary";
  }[];
  /**
   * Weekly coach reviews touching this window, newest first, plus an empty
   * slot for the current week so there is always somewhere to paste one.
   * `period_label` is the Monday.
   */
  weeklyReviews: { week: string; review: CoachReview | null }[];
  error: string | null;
}

/**
 * Everything the Progress screen counts, for one window.
 *
 * Aggregated here rather than in views, for the reason getHistory gives: the
 * shape of these summaries is still moving, and a view would need a migration
 * every time it does. A season of training is a few thousand rows.
 *
 * Weeks are ISO weeks starting Monday, matching fitness.week_start, so a week
 * here and a week in the database are the same week.
 */
export async function getProgress(days: number | null): Promise<ProgressData> {
  const to = londonToday();
  // Days rather than weeks, because the windows worth looking at are not all
  // whole weeks: a week of training and six months of it are both questions
  // worth asking, and 26.1 weeks is not a period anybody thinks in.
  const from = days
    ? new Date(Date.parse(to) - days * 86400000).toISOString().slice(0, 10)
    : "1970-01-01";

  const [snatchWeekly, snatchBlocks, sets, exercises, groups, entries, variations, skills, gyms] =
    await Promise.all([
      safeRead<{ week_start: string; weight_kg: number; attempts: number; stood: number }[]>((c) =>
        c
          .from("v_snatch_weekly")
          .select("week_start, weight_kg, attempts, stood")
          .gte("week_start", from)
          .order("week_start"),
      ),
      safeRead<
        {
          session_date: string;
          weight_kg: number;
          attempts: number;
          is_warmup: boolean;
          quality_10: number | null;
          counts_as_full_lift: boolean;
          provenance: Provenance;
        }[]
      >((c) =>
        c
          .from("v_snatch_blocks")
          .select(
            "session_date, weight_kg, attempts, is_warmup, quality_10, counts_as_full_lift, provenance",
          )
          .gte("session_date", from)
          .lte("session_date", to),
      ),
      // `sessions` is typed as an array by the client, which cannot know a
      // to-one embed returns an object; it is cast at the point of use, as
      // the rest of this file does.
      // Drop sets are read too, and filtered where they do not belong, rather
      // than excluded at the query. They are real work: leaving them out of
      // the drill-down entirely would show an exercise session that never
      // happened as you performed it.
      safeRead<
        {
          exercise_id: number;
          volume_load_kg: number | null;
          is_drop: boolean;
          load_kg: number | null;
          reps: number | null;
          sets_count: number;
          rir: number | null;
          machine_label: string | null;
          side: BodySide;
          sessions: unknown;
        }[]
      >((c) =>
        c
          .from("hypertrophy_sets")
          .select(
            "exercise_id, volume_load_kg, is_drop, load_kg, reps, sets_count, rir, machine_label, side, sessions(session_date, gym_id)",
          ),
      ),
      safeRead<Exercise[]>((c) => c.from("exercises").select("*")),
      safeRead<MuscleGroup[]>((c) => c.from("muscle_groups").select("*").order("sort_order")),
      safeRead<
        {
          id: string;
          skill_variation_id: number;
          attempts: number | null;
          successful_attempts: number | null;
          best_hold_seconds: number | null;
          sessions: unknown;
        }[]
      >((c) =>
        c
          .from("calisthenics_entries")
          .select(
            "id, skill_variation_id, attempts, successful_attempts, best_hold_seconds, sessions(session_date)",
          ),
      ),
      safeRead<SkillVariation[]>((c) => c.from("skill_variations").select("*")),
      safeRead<Skill[]>((c) => c.from("skills").select("*")),
      safeRead<Gym[]>((c) => c.from("gyms").select("id, name")),
    ]);

  // --- snatch: stand rate per week, per load -------------------------------
  const byLoad = new Map<number, { week: string; attempts: number; stood: number }[]>();
  for (const row of snatchWeekly.data ?? []) {
    const load = Number(row.weight_kg);
    const list = byLoad.get(load) ?? [];
    list.push({ week: row.week_start, attempts: row.attempts ?? 0, stood: row.stood ?? 0 });
    byLoad.set(load, list);
  }

  // --- snatch: tonnage per week, warm-up kept apart ------------------------
  const tonnage = new Map<string, { working: number; warmup: number }>();
  for (const b of snatchBlocks.data ?? []) {
    const week = weekStartOf(b.session_date);
    const entry = tonnage.get(week) ?? { working: 0, warmup: 0 };
    const kg = Number(b.weight_kg ?? 0) * Number(b.attempts ?? 0);
    if (b.is_warmup) entry.warmup += kg;
    else entry.working += kg;
    tonnage.set(week, entry);
  }

  // --- snatch: technical quality per load ----------------------------------
  //
  // Full lifts only: a power snatch and a full snatch at 45 kg are different
  // movements that share a weight, and one quality figure across them would
  // describe neither. Logged only: a rating reconstructed from a sentence in
  // August and one tapped after the lift are not the same claim, and this app
  // never averages the two. Warm-ups are out — a warm-up is performed
  // differently, and its loads would stretch the light end of every chart.
  const quality = new Map<number, Map<string, number[]>>();
  const qualityBlocks = new Map<number, number>();
  let snatchQualityImported = 0;
  for (const b of snatchBlocks.data ?? []) {
    if (!b.counts_as_full_lift || b.is_warmup) continue;
    if (b.provenance !== "logged") {
      if (b.quality_10 != null) snatchQualityImported += 1;
      continue;
    }
    const load = Number(b.weight_kg);
    if (!Number.isFinite(load)) continue;
    qualityBlocks.set(load, (qualityBlocks.get(load) ?? 0) + 1);
    if (b.quality_10 == null) continue;
    const weeks = quality.get(load) ?? new Map<string, number[]>();
    const week = weekStartOf(b.session_date);
    weeks.set(week, [...(weeks.get(week) ?? []), Number(b.quality_10)]);
    quality.set(load, weeks);
  }

  // --- hypertrophy: sets and volume per week -------------------------------
  const groupOf = new Map(
    (exercises.data ?? []).map((e) => [e.id, e.muscle_group_id as number | null]),
  );
  const groupName = new Map((groups.data ?? []).map((g) => [g.id, g.slug]));
  const perWeek = new Map<string, { groups: Record<string, number>; volume: number }>();
  for (const row of sets.data ?? []) {
    // Drops were excluded at the query before this read widened; the filter
    // moves here so the weekly set count and volume stay what they were.
    if (row.is_drop) continue;
    const date = (row.sessions as unknown as { session_date: string } | null)?.session_date;
    if (!date || date < from || date > to) continue;
    const week = weekStartOf(date);
    const entry = perWeek.get(week) ?? { groups: {}, volume: 0 };
    const slug = groupName.get(groupOf.get(row.exercise_id) ?? -1) ?? "unassigned";
    entry.groups[slug] = (entry.groups[slug] ?? 0) + 1;
    entry.volume += Number(row.volume_load_kg ?? 0);
    perWeek.set(week, entry);
  }

  // --- hypertrophy: every exercise, split by where it was worked -----------
  //
  // The unit is the setup — exercise × machine × gym — because that is the
  // only thing a load means the same on. Machine labels are free text, so
  // they are matched on case and surrounding space only: "Cable" and "cable"
  // are one setup, "cable" and "cable crossover" are two. Guessing harder
  // than that would merge machines that are genuinely different, which is
  // the error this split exists to prevent.
  const exerciseName = new Map((exercises.data ?? []).map((e) => [e.id, e.name]));
  const gymName = new Map((gyms.data ?? []).map((g) => [g.id, g.name]));
  const detail = new Map<number, Map<string, Setup>>();
  for (const row of sets.data ?? []) {
    const session = row.sessions as unknown as {
      session_date: string;
      gym_id: number | null;
    } | null;
    const date = session?.session_date;
    if (!date || date < from || date > to) continue;

    const machine = row.machine_label?.trim() || null;
    const gym = session.gym_id == null ? null : (gymName.get(session.gym_id) ?? null);
    const key = `${machine?.toLowerCase() ?? ""}|${gym ?? ""}`;

    const setups = detail.get(row.exercise_id) ?? new Map<string, Setup>();
    const setup = setups.get(key) ?? { machine, gym, sets: 0, entries: [] };
    setup.sets += row.is_drop ? 0 : row.sets_count;
    setup.entries.push({
      date,
      load: row.load_kg == null ? null : Number(row.load_kg),
      reps: row.reps,
      setsCount: row.sets_count,
      rir: row.rir,
      volume: Number(row.volume_load_kg ?? 0),
      isDrop: row.is_drop,
      side: row.side,
    });
    setups.set(key, setup);
    detail.set(row.exercise_id, setups);
  }

  // --- calisthenics: per variation, never pooled ---------------------------
  const inWindow = (entries.data ?? []).filter((e) => {
    const date = (e.sessions as unknown as { session_date: string } | null)?.session_date;
    return date && date >= from && date <= to;
  });
  const attemptRows = inWindow.length
    ? await safeRead<
        { entry_id: string; succeeded: boolean | null; hold_seconds: number | null }[]
      >((c) =>
        c
          .from("calisthenics_attempts")
          .select("entry_id, succeeded, hold_seconds")
          .in(
            "entry_id",
            inWindow.map((e) => e.id),
          ),
      )
    : { data: [], error: null };

  const variationName = new Map((variations.data ?? []).map((v) => [v.id, v]));
  const skillName = new Map((skills.data ?? []).map((k) => [k.id, k.name]));
  const perVariation = new Map<
    number,
    { attempts: number; successes: number; best: number | null; entries: number; rows: number }
  >();
  for (const entry of inWindow) {
    const rows = (attemptRows.data ?? []).filter((a) => a.entry_id === entry.id);
    const acc = perVariation.get(entry.skill_variation_id) ?? {
      attempts: 0,
      successes: 0,
      best: null,
      entries: 0,
      rows: 0,
    };
    acc.entries += 1;
    if (rows.length > 0) {
      acc.rows += 1;
      acc.attempts += rows.length;
      acc.successes += rows.filter((a) => a.succeeded).length;
      // Any recorded hold, not only a successful one. The seconds are the
      // measurement; the success is the verdict against the variation's
      // minimum. An 8 s L-sit against a 10 s bar is a miss and is still the
      // longest hold of that session.
      for (const r of rows) {
        const hold = r.hold_seconds == null ? null : Number(r.hold_seconds);
        if (hold !== null && (acc.best === null || hold > acc.best)) acc.best = hold;
      }
    } else {
      acc.attempts += entry.attempts ?? 0;
      acc.successes += entry.successful_attempts ?? 0;
      const hold = entry.best_hold_seconds == null ? null : Number(entry.best_hold_seconds);
      if (hold !== null && (acc.best === null || hold > acc.best)) acc.best = hold;
    }
    perVariation.set(entry.skill_variation_id, acc);
  }

  // --- how much is behind all of it ----------------------------------------
  //
  // Derived from the aggregates above rather than counted separately, so the
  // n beside a chart is the n of that chart. A second pass over the rows
  // could disagree with what was drawn, and the whole point of an n is that
  // it describes the figure it sits next to.
  const dates = new Set<string>();
  for (const b of snatchBlocks.data ?? []) dates.add(b.session_date);
  for (const row of sets.data ?? []) {
    const date = (row.sessions as unknown as { session_date: string } | null)?.session_date;
    if (date && date >= from && date <= to) dates.add(date);
  }
  for (const e of inWindow) {
    const date = (e.sessions as unknown as { session_date: string } | null)?.session_date;
    if (date) dates.add(date);
  }

  const snatchAttemptTotal = [...byLoad.values()]
    .flat()
    .reduce((total, point) => total + point.attempts, 0);
  const hypertrophySetTotal = [...perWeek.values()].reduce(
    (total, week) => total + Object.values(week.groups).reduce((a, b) => a + b, 0),
    0,
  );
  const skillAttemptTotal = [...perVariation.values()].reduce((t, v) => t + v.attempts, 0);

  const counts: ProgressCounts = {
    daysWithRecords: dates.size,
    weeksWithRecords: new Set([
      ...tonnage.keys(),
      ...perWeek.keys(),
      ...[...byLoad.values()].flat().map((p) => p.week),
    ]).size,
    snatchBlocks: (snatchBlocks.data ?? []).length,
    snatchAttempts: snatchAttemptTotal,
    hypertrophySets: hypertrophySetTotal,
    calisthenicsEntries: inWindow.length,
    calisthenicsAttempts: skillAttemptTotal,
  };

  // Weekly reviews are listed by week, not by what was trained: a week with
  // a review and no training is still a week someone wrote about, and a week
  // with training and no review should show its empty slot.
  const weeklyResult = await safeRead<CoachReview[]>((c) =>
    c
      .from("context_notes")
      .select<string, CoachReview>("id, content, anchor_date, period_label, updated_at")
      .eq("note_type", "assistant_review")
      .not("period_label", "is", null)
      .gte("period_label", from)
      .order("period_label", { ascending: false }),
  );
  const reviewed = weeklyResult.data ?? [];
  const thisWeek = weekStartOf(to);
  const weeklyReviews = [
    ...new Set([thisWeek, ...reviewed.map((r) => r.period_label as string)]),
  ]
    .sort((a, b) => (a < b ? 1 : -1))
    .map((week) => ({
      week,
      review: reviewed.find((r) => r.period_label === week) ?? null,
    }));

  return {
    from,
    to,
    days,
    coveredFrom: dates.size > 0 ? [...dates].sort()[0] : null,
    counts,
    snatchByLoad: [...byLoad.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([load_kg, points]) => ({ load_kg, points })),
    snatchTonnage: [...tonnage.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([week, v]) => ({ week, ...v })),
    snatchQuality: [...quality.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([load_kg, weeks]) => ({
        load_kg,
        blocks: qualityBlocks.get(load_kg) ?? 0,
        rated: [...weeks.values()].reduce((total, list) => total + list.length, 0),
        points: [...weeks.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([week, qualities]) => ({ week, qualities })),
      })),
    snatchQualityImported,
    setsByGroup: [...perWeek.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([week, v]) => ({ week, groups: v.groups })),
    hypertrophyDetail: [...detail.entries()]
      .map(([exerciseId, setups]) => {
        const list = [...setups.values()].map((s) => ({
          ...s,
          // Newest first: the question asked of this screen is almost always
          // about the last session against the one before it.
          entries: [...s.entries].sort((a, b) => (a.date < b.date ? 1 : -1)),
        }));
        return {
          exerciseId,
          exercise: exerciseName.get(exerciseId) ?? "Exercise",
          group: groupName.get(groupOf.get(exerciseId) ?? -1) ?? "unassigned",
          sets: list.reduce((total, s) => total + s.sets, 0),
          setups: list.sort((a, b) => b.sets - a.sets),
        };
      })
      .sort((a, b) => b.sets - a.sets),
    volumeByWeek: [...perWeek.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([week, v]) => ({ week, value: v.volume })),
    skills: [...perVariation.entries()]
      .map(([id, v]) => {
        const variation = variationName.get(id);
        return {
          variation: variation?.name ?? "Skill",
          skill: skillName.get(variation?.skill_id ?? -1) ?? "",
          difficulty: variation?.difficulty ?? null,
          attempts: v.attempts,
          successes: v.successes,
          bestHoldSeconds: v.best,
          entries: v.entries,
          basis:
            v.rows === v.entries ? ("attempt" as const)
            : v.rows === 0 ? ("summary" as const)
            : ("mixed" as const),
        };
      })
      .sort((a, b) => b.attempts - a.attempts),
    weeklyReviews,
    error: snatchWeekly.error ?? sets.error ?? entries.error,
  };
}

/** Monday of the ISO week, matching fitness.week_start. */
function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const iso = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - iso);
  return d.toISOString().slice(0, 10);
}
