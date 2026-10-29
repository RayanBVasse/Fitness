/** Mirrors the `fitness` schema. Hand-written; see supabase/migrations. */

export type Workstream = "snatch" | "calisthenics" | "hypertrophy";

/**
 * Per-attempt outcome. `received_not_stood` is neither a success nor a miss —
 * it is the bar caught overhead and never stood up, which is the distinction
 * the whole 50 kg history turns on.
 */
export type SnatchOutcome = "stood" | "received_not_stood" | "missed" | "aborted";

export type Provenance = "logged" | "workbook_import" | "historical_reconstruction";

/**
 * A day is not a session. `unlogged` is a row that exists to carry notes while
 * asserting nothing about training; the absence of a row asserts nothing at all.
 */
export type DayStatus = "trained" | "rest" | "unlogged";

export interface DailyMetricDef {
  slug: string;
  label: string;
  grouping: string;
  kind: "scale" | "number" | "text";
  min_value: number | null;
  max_value: number | null;
  step: number | null;
  unit: string | null;
  in_quick_mode: boolean;
  help: string | null;
  sort_order: number;
  /** Quick chips for a text dimension; empty for most. */
  suggested_values: string[];
}

export interface DailyMetric {
  metric: string;
  value_numeric: number | null;
  value_text: string | null;
}

export interface DayRecord {
  day: string;
  status: DayStatus;
  notes: string | null;
  provenance: Provenance;
}
export type RecordPrecision = "attempt" | "block" | "qualitative";

export interface Gym {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface SnatchVariation {
  id: number;
  slug: string;
  name: string;
  counts_as_full_lift: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface WeightPreset {
  weight_kg: number;
  sort_order: number;
  is_active: boolean;
}

export interface FailureMode {
  id: number;
  slug: string;
  name: string;
  implies_received: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface SnatchTag {
  id: number;
  slug: string;
  name: string;
  kind: "observation" | "cue";
  sort_order: number;
  is_active: boolean;
}

/** settings.weekday_themes, keyed by ISO weekday as a string ("1" = Monday). */
export interface WeekdayTheme {
  name: string;
  /** The workstream the day is judged on, where it has one. */
  focus: Workstream | null;
  /** The muscle region the hypertrophy picker opens on. A day has two
   *  intentions — Tuesday is snatch technique and back and triceps — and one
   *  `focus` cannot hold both. */
  region?: string | null;
  emphasis: string | null;
  note: string | null;
}

export type WeekdayThemes = Record<string, WeekdayTheme>;

/**
 * A training region: the muscle groups you train together on a day. One level
 * above a muscle group, stored in settings so a change of split is an edit
 * rather than a deploy.
 */
export interface MuscleRegion {
  slug: string;
  name: string;
  /** muscle_group slugs. */
  groups: string[];
}

export type ExperimentStatus = "proposed" | "collecting" | "concluded" | "abandoned";
export type ExperimentOutcome = "supported" | "not_supported" | "inconclusive";

/**
 * A hypothesis being tracked, rather than one mentioned once.
 *
 * `measurement` is written before the evidence arrives, so the measure cannot
 * be chosen afterwards to fit what happened. `comparison` is what counts as a
 * comparable observation — the field always left out, and the reason a thing
 * can be "tested" for a month and settle nothing.
 *
 * `outcome` is written by a person who read the evidence. Nothing computes it.
 */
export type ExperimentKind = "hypothesis" | "recommendation";
export type FollowedThrough = "not_yet" | "followed" | "partly" | "declined";

export interface Experiment {
  id: string;
  /** What is being tested, or what you were told to do. */
  kind: ExperimentKind;
  title: string;
  statement: string;
  measurement: string;
  comparison: string | null;
  workstream: Workstream | null;
  status: ExperimentStatus;
  started_on: string | null;
  ended_on: string | null;
  outcome: ExperimentOutcome | null;
  outcome_note: string | null;
  /** Advice only: what you did about it. Null on a hypothesis. */
  followed: FollowedThrough | null;
  updated_at: string;
}

export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  proposed: "Proposed",
  collecting: "Collecting evidence",
  concluded: "Concluded",
  abandoned: "Abandoned",
};

/**
 * The same three verdicts, said the way each kind means them.
 *
 * A recommendation is not "supported" — it was followed and helped, or it
 * was followed and did not. One enum, because the distinction is in the
 * wording and not in the fact.
 */
export const EXPERIMENT_OUTCOME_LABELS: Record<
  ExperimentKind,
  Record<ExperimentOutcome, string>
> = {
  hypothesis: {
    supported: "Supported",
    not_supported: "Not supported",
    // The commonest honest answer in training, and a result in its own right.
    inconclusive: "Inconclusive",
  },
  recommendation: {
    supported: "It helped",
    not_supported: "It did not help",
    inconclusive: "Could not tell",
  },
};

export const EXPERIMENT_KIND_LABELS: Record<ExperimentKind, string> = {
  hypothesis: "Hypothesis",
  recommendation: "Recommendation",
};

/** What the long field is called, which depends on what the row is. */
export const EXPERIMENT_STATEMENT_LABELS: Record<ExperimentKind, string> = {
  hypothesis: "Hypothesis",
  recommendation: "The advice",
};

export const FOLLOWED_LABELS: Record<FollowedThrough, string> = {
  not_yet: "Not yet",
  followed: "Followed it",
  partly: "Partly",
  // A decision, not a failure, and more informative than agreeing and
  // forgetting.
  declined: "Decided against",
};

export type NoteReviewStatus = "pending" | "approved" | "rejected";

export interface ContextNote {
  id: string;
  external_source_id: string;
  note_type: string;
  category: string;
  content: string;
  anchor_date: string | null;
  period_label: string | null;
  evidence_status: string;
  sensitivity: string;
  candidate_numeric: boolean;
  tags: string[];
  review_status: NoteReviewStatus;
  linked_session_id: string | null;
  workstream: Workstream | null;
  /** What the note is about. At most one is set; both null is a day's note. */
  exercise_id: number | null;
  skill_variation_id: number | null;
}

/**
 * A review of a day or a week, written by a coach outside this app and pasted
 * in. A `context_notes` row like any other narrative, but kept out of the
 * notes list and given its own `note_type`, because it is not the athlete's
 * report and must never be read back as one.
 *
 * Keyed by period: `anchor_date` for a day, `period_label` for the Monday of
 * a week. One per period, so a corrected review replaces its predecessor.
 */
export interface CoachReview {
  id: string;
  content: string;
  anchor_date: string | null;
  period_label: string | null;
  updated_at: string;
}

/**
 * What a note is about, as opposed to who said it. `note_type` carries the
 * second: an athlete report and an assistant hypothesis are different kinds
 * of claim and must never be blended, which is why they are separate fields.
 */
export const NOTE_CATEGORIES = [
  "observation",
  "technique",
  "coaching_advice",
  "question",
  "experiment",
  "nutrition",
  "gym_context",
  "sleep",
] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  observation: "Anything else",
  technique: "Technique",
  coaching_advice: "Coaching advice",
  question: "Question",
  experiment: "Experiment",
  nutrition: "Food",
  gym_context: "The gym",
  sleep: "Sleep",
};

/**
 * The ground a day is worth covering, in the order it is worth covering it.
 *
 * These were four text fields in the check-in before 0015 folded them into
 * notes. Folding them removed the boxes and the prompting with them — and a
 * prompt is most of what they were for, since a day you were not asked about
 * food is a day with nothing written about food, which is not the same as a
 * day you ate nothing worth mentioning.
 *
 * The same list every day is what makes days comparable. Covering all of it
 * is not the point; knowing what you left out is.
 */
export const DAY_NOTE_CATEGORIES: NoteCategory[] = [
  "observation",
  "nutrition",
  "gym_context",
  "sleep",
  "question",
];

/** What a note written inside a workstream is about. */
export const WORKSTREAM_NOTE_CATEGORIES: NoteCategory[] = [
  "observation",
  "technique",
  "coaching_advice",
  "question",
  "experiment",
];

export interface MuscleGroup {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
}

export interface Exercise {
  id: number;
  slug: string;
  name: string;
  muscle_group_id: number | null;
  is_unilateral: boolean;
  sort_order: number;
}

export interface Skill {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
}

export interface SkillVariation {
  id: number;
  skill_id: number;
  slug: string;
  name: string;
  /** Rank within the parent skill, 1 = easiest. Never compared across skills. */
  difficulty: number | null;
  min_hold_seconds: number | null;
  requires_no_kick: boolean;
  requires_controlled_ascent: boolean;
  requires_controlled_descent: boolean;
  criteria_notes: string | null;
  sort_order: number;
}

export interface AssistanceType {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
}

export interface HypertrophySet {
  id: string;
  session_id: string;
  exercise_id: number;
  machine_label: string | null;
  load_kg: number | null;
  reps: number | null;
  sets_count: number;
  side: BodySide;
  order_vs_snatch: SnatchOrder;
  parent_set_id: string | null;
  is_drop: boolean;
  notes: string | null;
  volume_load_kg: number | null;
  logged_at: string | null;
  /** Reps in reserve: how many more were left. A report, not a measurement. */
  rir: number | null;
}

/**
 * One attempt at a skill. The counters on screen add and remove these rows;
 * attempts, successes, holds and control counts are all read back off them,
 * so no two figures about one entry can disagree.
 */
export interface CalisthenicsAttempt {
  id: string;
  entry_id: string;
  ordinal: number;
  /** null = recorded but never judged, which is not the same as a failure. */
  succeeded: boolean | null;
  hold_seconds: number | null;
  controlled_ascent: boolean | null;
  controlled_descent: boolean | null;
  negative_seconds: number | null;
  notes: string | null;
}

export interface CalisthenicsEntry {
  id: string;
  session_id: string;
  skill_variation_id: number;
  sets_count: number | null;
  reps_per_set: number | null;
  attempts: number | null;
  successful_attempts: number | null;
  best_hold_seconds: number | null;
  total_hold_seconds: number | null;
  controlled_ascent: boolean | null;
  controlled_descent: boolean | null;
  assistance_id: number | null;
  quality_10: number | null;
  notes: string | null;
  logged_at: string | null;
}

/** What you lifted last time, per (gym, exercise). Drop sets excluded. */
export interface LastExerciseSetting {
  gym_id: number | null;
  exercise_id: number;
  load_kg: number | null;
  reps: number | null;
  sets_count: number | null;
  machine_label: string | null;
  last_used_on: string;
}

export interface LastSkillSetting {
  skill_variation_id: number;
  assistance_id: number | null;
  best_hold_seconds: number | null;
  sets_count: number | null;
  last_used_on: string;
}

export interface RecentlyUsed {
  last_used_on: string;
  times_logged: number;
}

export type BodySide = "both" | "left" | "right";
export type SnatchOrder = "before_snatch" | "after_snatch" | "standalone" | "unknown";

export interface Session {
  id: string;
  session_date: string;
  gym_id: number | null;
  gym_custom_label: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  provenance: Provenance;
}

export interface SessionBlock {
  id: string;
  session_id: string;
  workstream: Workstream;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  sort_order: number;
  notes: string | null;
}

export interface SnatchBlock {
  id: string;
  session_id: string;
  session_block_id: string | null;
  variation_id: number;
  weight_kg: number | null;
  sets_count: number | null;
  reps_per_set: number | null;
  attempts: number | null;
  full_stand_successes: number | null;
  received_not_stood: number | null;
  dropped: number | null;
  /** Generated: stood + received_not_stood. Drops overlap this, by design. */
  received_total: number | null;
  quality_10: number | null;
  rpe_10: number | null;
  straps: boolean | null;
  failure_mode_id: number | null;
  is_warmup: boolean;
  is_cooldown: boolean;
  notes: string | null;
  logged_at: string | null;
  provenance: Provenance;
  record_precision: RecordPrecision;
  record_quality: string | null;
  /** Generated: both attempts and stands present. Gates every success rate. */
  is_substantiated: boolean;
}

export interface SnatchAttempt {
  id: string;
  block_id: string;
  ordinal: number;
  outcome: SnatchOutcome;
  quality_10: number | null;
  rpe_10: number | null;
  failure_mode_id: number | null;
  notes: string | null;
  logged_at: string;
}

export interface SessionSummary {
  id: string;
  session_date: string;
  gym: string | null;
  started_at: string | null;
  ended_at: string | null;
  workstreams: Workstream[] | null;
  snatch_blocks: number;
  hypertrophy_sets: number;
  calisthenics_entries: number;
  notes: string | null;
  provenance: Provenance;
}

export interface SnatchSuccessByWeight {
  weight_kg: number;
  blocks: number;
  attempts: number;
  stood: number;
  received_not_stood: number;
  received: number;
  stand_rate_pct: number | null;
  receive_rate_pct: number | null;
}

export interface SnatchSuccessBySource extends SnatchSuccessByWeight {
  source: "imported" | "logged";
}

/**
 * settings.snatch_objective. The current rate is deliberately absent: it is
 * computed from the rows, because a stored figure cannot stay honest as the
 * data behind it changes.
 */
export interface SnatchObjective {
  primary_load_kg: number;
  primary_target_stand_rate_pct: number;
  primary_sessions_per_week: number;
  secondary_load_kg: number;
  secondary_goal: string;
  statement: string;
}

/** settings.snatch_warmup_ladder */
export interface WarmupLadder {
  derived_from: string;
  warmup: { weight_kg: number; reps: number }[];
  working: number[];
  cooldown: { weight_kg: number; reps: number }[];
}

export const WORKSTREAM_LABELS: Record<Workstream, string> = {
  snatch: "Snatch",
  calisthenics: "Calisthenics",
  hypertrophy: "Hypertrophy",
};

export const OUTCOME_LABELS: Record<SnatchOutcome, string> = {
  stood: "Stood",
  received_not_stood: "Caught, no stand",
  missed: "Missed",
  aborted: "Aborted",
};
