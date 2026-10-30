import type { CalisthenicsAttempt, CalisthenicsEntry, DailyMetric, DayRecord, HypertrophySet, Provenance, Session, SnatchBlock } from "./types";

export function sevenDates(to: string): string[] {
  return Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${to}T12:00:00Z`) - (6 - i) * 86400000).toISOString().slice(0, 10));
}

export interface DailyRecords {
  sessions: Session[];
  days: DayRecord[];
  snatch: SnatchBlock[];
  sets: (HypertrophySet & { provenance?: Provenance })[];
  skills: (CalisthenicsEntry & { provenance?: Provenance })[];
  attempts: CalisthenicsAttempt[];
  metrics: (DailyMetric & { metric_date: string })[];
  notes: { anchor_date: string | null; content: string }[];
}

/** Unknown outcomes stay unknown, including when another block at this load is complete. */
export function snatchCounts(blocks: SnatchBlock[]) {
  const complete = blocks.filter(b => b.attempts != null && b.full_stand_successes != null && b.attempts >= 0 && b.full_stand_successes >= 0 && b.full_stand_successes <= b.attempts);
  return {
    attempts: complete.reduce((n, b) => n + Number(b.attempts), 0),
    stood: complete.reduce((n, b) => n + Number(b.full_stand_successes), 0),
    complete: complete.length,
    unknown: blocks.length - complete.length,
  };
}

export function skillResult(entry: CalisthenicsEntry, attempts: CalisthenicsAttempt[]) {
  const rows = attempts.filter(a => a.entry_id === entry.id);
  return rows.length ? {
    attempts: rows.length,
    successes: rows.filter(a => a.succeeded === true).length,
    unjudged: rows.filter(a => a.succeeded == null).length,
  } : { attempts: entry.attempts, successes: entry.successful_attempts, unjudged: null };
}

export function buildDailyProgress(to: string, records: DailyRecords, fullLiftIds: number[]) {
  return buildProgressDays(sevenDates(to), records, fullLiftIds);
}

/** The same logged-observation rules for daily and calendar-month inspection. */
export function buildProgressDays(dates: string[], records: DailyRecords, fullLiftIds: number[]) {
  const to = dates.at(-1)!;
  const loggedSessions = records.sessions.filter(s => s.provenance === "logged");
  const importedSessions = records.sessions.filter(s => s.provenance !== "logged").length;
  return {
    importedSessions,
    days: dates.map(date => {
      const sessions = loggedSessions.filter(s => s.session_date === date);
      const ids = new Set(sessions.map(s => s.id));
      const allSnatch = records.snatch.filter(b => ids.has(b.session_id) && b.provenance === "logged");
      const snatch = allSnatch.filter(b => !b.is_warmup && !b.is_cooldown && fullLiftIds.includes(b.variation_id));
      const sets = records.sets.filter(s => ids.has(s.session_id) && (!s.provenance || s.provenance === "logged"));
      const skills = records.skills.filter(s => ids.has(s.session_id) && (!s.provenance || s.provenance === "logged"));
      const day = records.days.find(d => d.day === date && d.provenance === "logged");
      const metrics = records.metrics.filter(m => m.metric_date === date);
      const notes = records.notes.filter(n => n.anchor_date === date).map(n => n.content);
      const hasTraining = allSnatch.length + sets.length + skills.length > 0;
      const status = hasTraining || day?.status === "trained" ? "Trained" : day?.status === "rest" ? "Rest" : metrics.length || notes.length || day ? "Context only" : sessions.length ? "Session only" : date === to ? "Not yet logged" : "No log";
      return { date, status, sessions, snatch, sets, skills, metrics, notes, dayNotes: day?.notes ?? null, counts: snatchCounts(snatch) };
    }),
  };
}

export type DailyProgressData = ReturnType<typeof buildDailyProgress>;
