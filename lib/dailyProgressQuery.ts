import { safeRead, type FitnessClient } from "./supabase";
import { buildDailyProgress, sevenDates } from "./dailyProgress";
import type { DailyRecords } from "./dailyProgress";
import type { SnatchBlock, CalisthenicsAttempt, DayRecord, Session } from "./types";

/** A month can exceed the Data API's page size; never silently truncate its evidence. */
async function pages<T>(run: (client: FitnessClient, from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const data: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await safeRead<T[]>(client => run(client, offset, offset + 999));
    if (result.error) return { data: null, error: result.error };
    data.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) return { data, error: null };
  }
}

/** Bounded reads, with errors surfaced rather than rendered as missing observations. */
export async function getDailyProgress(to: string, fullLiftIds: number[]) {
  const from = sevenDates(to)[0];
  const result = await getProgressRecords(from, to);
  return { error: result.error, data: buildDailyProgress(to, result.records, fullLiftIds), attempts: result.records.attempts };
}

export async function getProgressRecords(from: string, to: string, includeHistorical = false) {
  const [sessions, days, metrics, notes] = await Promise.all([
    pages<Session>((c, a, b) => c.from("sessions").select("*").gte("session_date", from).lte("session_date", to).order("id").range(a, b)),
    pages<DayRecord>((c, a, b) => c.from("days").select("*").gte("day", from).lte("day", to).order("day").range(a, b)),
    pages<DailyRecords["metrics"][number]>((c, a, b) => c.from("daily_metrics").select("metric, metric_date, value_numeric, value_text").eq("provenance", "logged").gte("metric_date", from).lte("metric_date", to).order("metric_date").order("metric").range(a, b)),
    pages<DailyRecords["notes"][number]>((c, a, b) => c.from("context_notes").select("anchor_date, content").in("source_type", ["authored_in_app", "daily_check_in"]).gte("anchor_date", from).lte("anchor_date", to).order("created_at").order("id").range(a, b)),
  ]);
  const ids = (sessions.data ?? []).filter(s => includeHistorical || s.provenance === "logged").map(s => s.id);
  const empty = { data: [], error: null };
  const [snatch, sets, skills] = ids.length ? await Promise.all([
    pages<SnatchBlock>((c, a, b) => c.from("snatch_blocks").select("*").in("session_id", ids).order("id").range(a, b)),
    pages<DailyRecords["sets"][number]>((c, a, b) => c.from("hypertrophy_sets").select("*").in("session_id", ids).order("id").range(a, b)),
    pages<DailyRecords["skills"][number]>((c, a, b) => c.from("calisthenics_entries").select("*").in("session_id", ids).order("id").range(a, b)),
  ]) : [empty, empty, empty];
  const entryIds = (skills.data ?? []).map(s => s.id);
  // Keep `in` filters below URL-size limits even in densely recorded months.
  const attemptResults = await Promise.all(Array.from({ length: Math.ceil(entryIds.length / 100) }, (_, i) =>
    pages<CalisthenicsAttempt>((c, a, b) => c.from("calisthenics_attempts").select("*").in("entry_id", entryIds.slice(i * 100, (i + 1) * 100)).order("id").range(a, b)),
  ));
  const attempts = { data: attemptResults.flatMap(r => r.data ?? []), error: attemptResults.find(r => r.error)?.error ?? null };
  const error = [sessions, days, metrics, notes, snatch, sets, skills, attempts].find(r => r.error)?.error ?? null;
  return {
    error,
    records: { sessions: sessions.data ?? [], days: days.data ?? [], metrics: metrics.data ?? [], notes: notes.data ?? [], snatch: snatch.data ?? [], sets: sets.data ?? [], skills: skills.data ?? [], attempts: attempts.data ?? [] } satisfies DailyRecords,
  };
}
