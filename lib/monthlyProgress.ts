import { buildProgressDays, snatchCounts, type DailyRecords } from "./dailyProgress";
import { monthDates, monthEnd, monthLabel, monthStart } from "./monthDates";
import { weekStart } from "./time";

export type EvidenceKind = "logged" | "historical" | "mixed" | "rest" | "context" | "none" | "future";

export function buildMonthlyProgress(month: string, today: string, records: DailyRecords, fullLiftIds: number[]) {
  const dates = monthDates(month), through = monthEnd(month) < today ? monthEnd(month) : today;
  const logged = buildProgressDays(dates, records, fullLiftIds);
  const sessionById = new Map(records.sessions.map(s => [s.id, s]));
  const trainingRows = [...records.snatch, ...records.sets, ...records.skills];
  const source = (row: typeof trainingRows[number]) => {
    const sessionSource = sessionById.get(row.session_id)?.provenance;
    // A default child-row value cannot upgrade a reconstructed session to an app log.
    if (sessionSource && sessionSource !== "logged") return sessionSource;
    return row.provenance ?? sessionSource ?? "historical_reconstruction";
  };
  const days = logged.days.map(day => {
    const sessions = records.sessions.filter(s => s.session_date === day.date);
    const ids = new Set(sessions.map(s => s.id));
    const rows = trainingRows.filter(r => ids.has(r.session_id));
    const dayRecord = records.days.find(d => d.day === day.date);
    const hasLogged = rows.some(r => source(r) === "logged") || (dayRecord?.status === "trained" && dayRecord.provenance === "logged");
    const hasHistorical = rows.some(r => source(r) !== "logged") || (dayRecord?.status === "trained" && dayRecord.provenance !== "logged");
    const kind: EvidenceKind = day.date > through ? "future" : hasLogged && hasHistorical ? "mixed" : hasLogged ? "logged" : hasHistorical ? "historical" : dayRecord?.status === "rest" ? "rest" : day.metrics.length || day.notes.length || dayRecord || sessions.length ? "context" : "none";
    return { ...day, kind, historicalSets: records.sets.filter(s => ids.has(s.session_id) && source(s) !== "logged").reduce((n, s) => n + s.sets_count, 0), historicalSkills: records.skills.filter(s => ids.has(s.session_id) && source(s) !== "logged").length };
  });
  const weeks = [...new Set(dates.filter(d => d <= through).map(weekStart))].map(week => {
    const inWeek = dates.filter(d => weekStart(d) === week && d <= through);
    const counts = { logged: 0, historical: 0, mixed: 0 };
    for (const session of records.sessions.filter(s => inWeek.includes(s.session_date))) {
      const rows = trainingRows.filter(r => r.session_id === session.id);
      if (!rows.length) continue;
      const hasLogged = rows.some(r => source(r) === "logged"), hasHistorical = rows.some(r => source(r) !== "logged");
      counts[hasLogged && hasHistorical ? "mixed" : hasLogged ? "logged" : "historical"]++;
    }
    return { from: inWeek[0], to: inWeek.at(-1)!, ...counts };
  });
  const historicalSnatch = records.snatch.filter(b => source(b) !== "logged" && fullLiftIds.includes(b.variation_id) && !b.is_warmup && !b.is_cooldown);
  const milestones = historicalSnatch.filter(b => (b.full_stand_successes ?? 0) > 0).map(b => ({ date: sessionById.get(b.session_id)?.session_date ?? "", weight: b.weight_kg, stood: b.full_stand_successes!, attempts: b.attempts, source: source(b) })).sort((a, b) => a.date.localeCompare(b.date));
  const countedDays = days.filter(d => d.counts.complete > 0 && d.counts.attempts > 0);
  const trainingDays = days.filter(d => ["logged", "historical", "mixed"].includes(d.kind));
  const snatchDates = new Set(records.snatch.filter(b => fullLiftIds.includes(b.variation_id) && !b.is_warmup && !b.is_cooldown).map(b => sessionById.get(b.session_id)?.session_date).filter(Boolean));
  return {
    month, label: monthLabel(month), from: monthStart(month), through, partial: through < monthEnd(month), days, weeks, milestones,
    counts: {
      trainingDays: trainingDays.length,
      loggedDays: days.filter(d => d.kind === "logged").length,
      historicalDays: days.filter(d => d.kind === "historical").length,
      mixedDays: days.filter(d => d.kind === "mixed").length,
      countedSnatchDays: countedDays.length,
      snatchDates: snatchDates.size,
      snatch: snatchCounts(days.flatMap(d => d.snatch)),
      loggedSets: days.reduce((n, d) => n + d.sets.reduce((t, s) => t + s.sets_count, 0), 0),
      historicalSets: days.reduce((n, d) => n + d.historicalSets, 0),
      loggedSkills: days.reduce((n, d) => n + d.skills.length, 0),
      historicalSkills: days.reduce((n, d) => n + d.historicalSkills, 0),
    },
    attempts: records.attempts,
    provisional: through < monthEnd(month) || days.some(d => d.kind === "historical" || d.kind === "mixed") || snatchDates.size > countedDays.length,
    countedFrom: countedDays[0]?.date ?? null,
    countedTo: countedDays.at(-1)?.date ?? null,
  };
}
export type MonthlyProgressData = ReturnType<typeof buildMonthlyProgress>;
