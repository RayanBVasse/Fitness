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
  focus: Workstream | null;
  emphasis: string | null;
  note: string | null;
}

export type WeekdayThemes = Record<string, WeekdayTheme>;

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
] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  observation: "Observation",
  technique: "Technique",
  coaching_advice: "Coaching advice",
  question: "Question",
  experiment: "Experiment",
};

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
