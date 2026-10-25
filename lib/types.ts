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

/** settings.snatch_objective */
export interface SnatchObjective {
  primary_load_kg: number;
  primary_target_stand_rate_pct: number;
  primary_current_stand_rate_pct: number;
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
