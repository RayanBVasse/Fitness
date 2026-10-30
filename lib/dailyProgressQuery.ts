import { safeRead } from "./supabase";
import { buildDailyProgress, sevenDates } from "./dailyProgress";
import type { DailyRecords } from "./dailyProgress";
import type { SnatchBlock, HypertrophySet, CalisthenicsEntry, CalisthenicsAttempt, DayRecord, Session } from "./types";

/** Bounded reads, with errors surfaced rather than rendered as missing observations. */
export async function getDailyProgress(to: string, fullLiftIds: number[]) {
  const from = sevenDates(to)[0];
  const [sessions, days, metrics, notes] = await Promise.all([
    safeRead<Session[]>(c => c.from("sessions").select("*").gte("session_date", from).lte("session_date", to)),
    safeRead<DayRecord[]>(c => c.from("days").select("*").gte("day", from).lte("day", to)),
    safeRead<DailyRecords["metrics"]>(c => c.from("daily_metrics").select("metric, metric_date, value_numeric, value_text").eq("provenance", "logged").gte("metric_date", from).lte("metric_date", to)),
    safeRead<DailyRecords["notes"]>(c => c.from("context_notes").select("anchor_date, content").in("source_type", ["authored_in_app", "daily_check_in"]).gte("anchor_date", from).lte("anchor_date", to).order("created_at")),
  ]);
  const ids = (sessions.data ?? []).filter(s => s.provenance === "logged").map(s => s.id);
  const empty = { data: [], error: null };
  const [snatch, sets, skills] = ids.length ? await Promise.all([
    safeRead<SnatchBlock[]>(c => c.from("snatch_blocks").select("*").in("session_id", ids).order("logged_at")),
    safeRead<HypertrophySet[]>(c => c.from("hypertrophy_sets").select("*").in("session_id", ids).order("created_at")),
    safeRead<CalisthenicsEntry[]>(c => c.from("calisthenics_entries").select("*").in("session_id", ids).order("created_at")),
  ]) : [empty, empty, empty];
  const entryIds = (skills.data ?? []).map(s => s.id);
  const attempts = entryIds.length ? await safeRead<CalisthenicsAttempt[]>(c => c.from("calisthenics_attempts").select("*").in("entry_id", entryIds).order("ordinal")) : empty;
  const error = [sessions, days, metrics, notes, snatch, sets, skills, attempts].find(r => r.error)?.error ?? null;
  return {
    error,
    data: buildDailyProgress(to, { sessions: sessions.data ?? [], days: days.data ?? [], metrics: metrics.data ?? [], notes: notes.data ?? [], snatch: snatch.data ?? [], sets: sets.data ?? [], skills: skills.data ?? [], attempts: attempts.data ?? [] }, fullLiftIds),
    attempts: attempts.data ?? [],
  };
}
