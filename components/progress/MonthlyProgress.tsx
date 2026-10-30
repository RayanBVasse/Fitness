"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import type { MonthlyProgressData, EvidenceKind } from "@/lib/monthlyProgress";
import { monthLabel, nextMonth, previousMonth } from "@/lib/monthDates";
import { isoWeekday, longDate, weekdayName } from "@/lib/time";
import { snatchCounts, skillResult } from "@/lib/dailyProgress";
import { exerciseSetups, matchedReps, outcomeTone, OUTCOME_MARKS } from "@/lib/progressPresentation";
import type { AssistanceType, Exercise, Gym, SkillVariation } from "@/lib/types";
import { MIN_ATTEMPTS_FOR_RATE } from "@/components/ui";
import styles from "./MonthlyProgress.module.css";

type Props = { data: MonthlyProgressData; today: string; exercises: Exercise[]; gyms: Gym[]; variations: SkillVariation[]; assistance: AssistanceType[] };
const shortDate = (date: string) => `${Number(date.slice(8))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(date.slice(5, 7)) - 1]}`;
const kindLabel: Record<EvidenceKind, string> = { logged: "App log", historical: "Historical record", mixed: "Mixed evidence", rest: "Rest", context: "Context only", none: "No record", future: "Future date" };
const kindCode: Record<EvidenceKind, string> = { logged: "LOG", historical: "HIST", mixed: "H+L", rest: "REST", context: "CTX", none: "", future: "" };
const kindClass: Record<EvidenceKind, string> = { logged: styles.logged, historical: styles.historical, mixed: styles.mixed, rest: styles.rest, context: styles.context, none: styles.noRecord, future: styles.future };
const metric = (day: MonthlyProgressData["days"][number], slug: string) => day.metrics.find(m => m.metric === slug)?.value_numeric ?? null;

export function MonthlyProgress({ data, today, exercises, gyms, variations, assistance }: Props) {
  const { days, counts } = data;
  const [selection, setSelection] = useState(days.findLast(d => d.kind === "logged" || d.kind === "mixed")?.date ?? days.findLast(d => d.kind !== "none" && d.kind !== "future")?.date ?? data.from);
  const [tab, setTab] = useState<"Snatch" | "Hypertrophy" | "Calisthenics">("Snatch");
  const [skillMode, setSkillMode] = useState<"quality" | "success">("quality");
  const [allRecovery, setAllRecovery] = useState(false);
  const day = days.find(d => d.date === selection) ?? days[0];
  const loggedBlocks = days.flatMap(d => d.snatch);
  const loads = [...new Set(loggedBlocks.map(b => b.weight_kg).filter((n): n is number => n != null))].sort((a, b) => a - b);
  const maxCoverage = Math.max(1, ...data.weeks.map(w => w.logged + w.historical + w.mixed));
  const recoveryDays = days.filter(d => d.date <= data.through).slice(allRecovery ? 0 : -7);
  const skills = new Map<string, { name: string; variation: number; assistance: number | null }>();
  for (const d of days) for (const e of d.skills) skills.set(`${e.skill_variation_id}-${e.assistance_id}`, { name: `${variations.find(v => v.id === e.skill_variation_id)?.name ?? `Skill ${e.skill_variation_id}`} · ${assistance.find(a => a.id === e.assistance_id)?.name ?? "assistance unrecorded"}`, variation: e.skill_variation_id, assistance: e.assistance_id });
  const skillDates = days.filter(d => d.skills.length > 0);
  return <section className={styles.review} aria-label="Monthly performance review">
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Monthly performance review</p><h2>{data.label}</h2><p className={styles.subtle}>Through {weekdayName(data.through)} {shortDate(data.through)} · {data.partial ? "partial month" : "calendar month"} · 3 workstreams + recovery</p></div>
      <span className={styles.badge}>{counts.trainingDays === 0 ? "NO TRAINING RECORDS" : data.provisional ? "PROVISIONAL" : "RECORDED EVIDENCE"}</span>
    </header>
    <nav className={styles.monthNav} aria-label="Select calendar month">
      <Link href={`/progress?period=month&month=${previousMonth(data.month)}`} aria-label={`View ${monthLabel(previousMonth(data.month))}`}>← Previous</Link>
      <form action="/progress"><input type="hidden" name="period" value="month" /><label>Month<input type="month" name="month" min="1900-01" max={today.slice(0, 7)} defaultValue={data.month} key={data.month} required /></label><button type="submit">View</button></form>
      {nextMonth(data.month) <= today.slice(0, 7) ? <Link href={`/progress?period=month&month=${nextMonth(data.month)}`}>Next →</Link> : <span className={styles.subtle}>Current month</span>}
    </nav>
    <div className={styles.stats}>
      <Stat label="Recorded training days" value={counts.trainingDays} hint={`${counts.loggedDays} app logged · ${counts.historicalDays} historical${counts.mixedDays ? ` · ${counts.mixedDays} mixed` : ""}`} />
      <Stat label="Snatch stands" value={counts.snatch.complete ? `${counts.snatch.stood}/${counts.snatch.attempts}` : "—"} hint={`${counts.snatch.attempts >= MIN_ATTEMPTS_FOR_RATE ? `${Math.round(counts.snatch.stood / counts.snatch.attempts * 100)}% · ` : ""}logged complete counts only${counts.snatch.unknown ? ` · ${counts.snatch.unknown} incomplete blocks excluded` : ""}`} />
      <Stat label="Hypertrophy" value={counts.loggedSets || "—"} hint={`directly logged sets${counts.historicalSets ? ` + ${counts.historicalSets} historical sets` : ""}`} />
      <Stat label="Calisthenics" value={counts.loggedSkills + counts.historicalSkills || "—"} hint={`${counts.loggedSkills} logged · ${counts.historicalSkills} historical entries · mixed precision possible`} />
    </div>
    <div className={styles.topGrid}>
      <Card title="Training calendar" subtitle="Tap a date to inspect its evidence.">
        <div className={styles.calendar} role="group" aria-label={`${data.label} training calendar`}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <span className={styles.weekday} key={d}>{d.slice(0, 1)}</span>)}
          {Array.from({ length: isoWeekday(data.from) - 1 }, (_, i) => <span key={`blank-${i}`} aria-hidden />)}
          {days.map(d => <button type="button" key={d.date} disabled={d.kind === "future"} className={`${styles.calendarDay} ${kindClass[d.kind]}`} onClick={() => setSelection(d.date)} aria-pressed={day.date === d.date} aria-controls="monthly-day-inspection" aria-label={`${longDate(d.date)}: ${kindLabel[d.kind]}`}><strong>{Number(d.date.slice(8))}</strong><small>{kindCode[d.kind]}</small></button>)}
        </div>
        <div className={styles.legend}><span><i className={styles.logKey} />App log</span><span><i className={styles.historyKey} />Historical</span><span><i className={styles.mixedKey} />Mixed</span><span>CTX · context only</span><span>Blank · no record</span></div>
        <div id="monthly-day-inspection" className={styles.inspection} aria-live="polite">
          <strong>{weekdayName(day.date).slice(0, 3)} {shortDate(day.date)} · {kindLabel[day.kind]}</strong>
          <p>{day.counts.complete ? `${day.counts.stood}/${day.counts.attempts} working full snatches stood. ` : day.snatch.length ? "Snatch counts incomplete. " : "No logged working snatch counts. "}{day.sets.length ? `${day.sets.reduce((n, s) => n + s.sets_count, 0)} logged sets. ` : ""}{day.historicalSets ? `${day.historicalSets} historical sets. ` : ""}{day.skills.length ? `${day.skills.length} logged skill entries. ` : ""}{day.historicalSkills ? `${day.historicalSkills} historical skill entries. ` : ""}Fatigue: {metric(day, "fatigue") == null ? "unrecorded" : `${metric(day, "fatigue")}/10`}.</p>
          {data.milestones.filter(m => m.date === day.date).map((m, i) => <p key={i}>Historical: {m.stood} stood at {m.weight ?? "unknown"} kg; attempts {m.attempts ?? "unknown"}.</p>)}
          {day.dayNotes || day.notes.length ? <details key={day.date}><summary>Reported context</summary>{day.dayNotes ? <p>{day.dayNotes}</p> : null}{day.notes.map((n, i) => <p key={i}>{n}</p>)}</details> : null}
          <Link href={`/day/${day.date}`}>Open day evidence →</Link>
        </div>
      </Card>
      <Card title="Monthly recording coverage" subtitle="Sessions with training records, separated by evidence source">
        <div className={styles.coverage}>{data.weeks.map(w => <div className={styles.coverageColumn} key={w.from}><strong>{w.logged + w.historical + w.mixed}</strong><div className={styles.coverageTrack} aria-label={`${shortDate(w.from)} to ${shortDate(w.to)}: ${w.logged} app logged, ${w.historical} historical, ${w.mixed} mixed sessions`}><div className={styles.coverageStack} style={{ height: `${(w.logged + w.historical + w.mixed) / maxCoverage * 100}%` }}>{w.historical ? <span className={styles.historyFill} style={{ flex: w.historical }} /> : null}{w.mixed ? <span className={styles.mixedFill} style={{ flex: w.mixed }} /> : null}{w.logged ? <span className={styles.logFill} style={{ flex: w.logged }} /> : null}</div></div><small>{Number(w.from.slice(8))}–{Number(w.to.slice(8))}</small></div>)}</div>
        <div className={styles.legend}><span><i className={styles.logKey} />App log</span><span><i className={styles.historyKey} />Historical</span><span><i className={styles.mixedKey} />Mixed</span></div>
        <p className={styles.subtle}>These bars describe recording coverage. Changes in detail or source must not be read as changes in training frequency.</p>
        <div className={styles.warning}><strong>Coverage limitation</strong><p>{counts.countedSnatchDays} of {counts.snatchDates} recorded working-snatch dates have directly logged complete attempt/stand counts. Reliability below describes those observations, not every day of the month. Days without a record are unknown, not rest.</p></div>
      </Card>
    </div>
    <Card title="Progress by workstream" subtitle="Choose what you want to assess." aside={<div className={styles.tabs} role="group" aria-label="Monthly workstream">{(["Snatch", "Hypertrophy", "Calisthenics"] as const).map(t => <button type="button" key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}</div>}>
      {tab === "Snatch" ? <div className={styles.workstream}>
        <h4>Full-snatch reliability by load</h4><p className={styles.subtle}>{data.countedFrom && data.countedTo ? `${shortDate(data.countedFrom)}–${shortDate(data.countedTo)} only · ` : ""}successful full stands / documented attempts · working lifts</p>
        {loads.length ? loads.map(load => { const c = snatchCounts(loggedBlocks.filter(b => b.weight_kg === load)); return <div className={styles.reliabilityRow} key={load}><strong>{load} kg</strong><span className={styles.barTrack}>{c.attempts > 0 ? <span className={styles.barStack}><span className={styles.stood} style={{ width: `${c.stood / c.attempts * 100}%` }} /><span className={styles.other} style={{ width: `${(c.attempts - c.stood) / c.attempts * 100}%` }} /></span> : <span className={styles.subtle}>Incomplete counts</span>}</span><strong>{c.complete ? `${c.stood}/${c.attempts}` : "? / ?"}{c.unknown ? " *" : ""}</strong></div>; }) : <p className={styles.subtle}>No directly logged working-lift observations in this month.</p>}
        <div className={styles.legend}><span><i className={styles.logKey} />Full stand</span><span><i className={styles.otherKey} />Other counted outcome</span></div>
        <p className={styles.subtle}>Each bar is normalised within its load; counts provide the sample size. * Incomplete blocks excluded. Warm-ups and cooldowns are excluded.</p>
        {data.milestones.length ? <details className={styles.milestones}><summary>Other milestones · {data.milestones.length} historical observations</summary><p className={styles.subtle}>Retained as historical evidence, separate from logged reliability. Unknown attempts never become a denominator.</p>{data.milestones.map((m, i) => <button key={i} type="button" onClick={() => setSelection(m.date)}>{shortDate(m.date)} · {m.weight ?? "?"} kg · {m.stood} stood · attempts {m.attempts ?? "unknown"}</button>)}</details> : null}
      </div> : tab === "Hypertrophy" ? <div className={styles.workstream}>
        <h4>Training dose · directly logged sets</h4>{data.weeks.map(w => { const n = days.filter(d => d.date >= w.from && d.date <= w.to).reduce((sum, d) => sum + d.sets.reduce((a, s) => a + s.sets_count, 0), 0); return <p className={styles.doseWeek} key={w.from}><strong>{shortDate(w.from)}–{shortDate(w.to)}</strong><span>{n || "—"} sets recorded</span></p>; })}
        <p className={styles.subtle}>{counts.historicalSets} historical sets remain separate. Set dose and cross-machine tonnage do not establish progression.</p>
        <MonthlyExercise data={data} exercises={exercises} gyms={gyms} onSelect={setSelection} />
      </div> : <div className={styles.workstream}>
        <div className={styles.heading}><h4>Skill checkpoints · directly logged observations</h4><div className={styles.tabs} role="group" aria-label="Monthly skill measure"><button type="button" aria-pressed={skillMode === "quality"} onClick={() => setSkillMode("quality")}>Quality</button><button type="button" aria-pressed={skillMode === "success"} onClick={() => setSkillMode("success")}>Success</button></div></div>
        {skills.size ? <div className={styles.scroll}><table className={styles.skillTable}><thead><tr><th scope="col">Skill · assistance</th>{skillDates.map(d => <th scope="col" key={d.date}>{shortDate(d.date)}</th>)}</tr></thead><tbody>{[...skills].map(([key, s]) => <tr key={key}><th scope="row">{s.name}</th>{skillDates.map(d => <td key={d.date}>{d.skills.filter(e => e.skill_variation_id === s.variation && e.assistance_id === s.assistance).map(e => { const result = skillResult(e, data.attempts), tone = outcomeTone(result.successes, result.attempts, (result.unjudged ?? 0) > 0); const colour = skillMode === "quality" ? e.quality_10 == null ? styles.neutral : styles.quality : tone === "all" ? styles.success : tone === "partial" ? styles.partialSuccess : tone === "none" ? styles.noSuccess : styles.neutral; return <button type="button" key={e.id} onClick={() => setSelection(d.date)} className={`${styles.skillCell} ${colour}`} style={{ "--rating": `${8 + (e.quality_10 ?? 0) * 3.5}%` } as CSSProperties}><strong>{skillMode === "quality" ? e.quality_10 == null ? "?" : `${e.quality_10}/10` : `${OUTCOME_MARKS[tone]} ${result.successes ?? "?"}/${result.attempts ?? "?"}`}</strong><small>{skillMode === "quality" ? `${result.successes ?? "?"}/${result.attempts ?? "?"} successful` : `quality ${e.quality_10 ?? "?"}/10`}{result.unjudged ? ` · ${result.unjudged} unjudged` : ""}</small></button>; })}</td>)}</tr>)}</tbody></table></div> : <p className={styles.subtle}>No directly logged skill checkpoints.</p>}
        <p className={styles.subtle}>Only logged observation dates are listed; missing dates are not interpolated. ? Missing measurement. Purple = recorded quality; ✓ all, ◐ some and × no successful attempts. Unknown or unjudged outcomes stay neutral. {counts.historicalSkills} historical entries remain separate.</p>
      </div>}
    </Card>
    <Card title="Recovery trajectory" subtitle={`${shortDate(recoveryDays[0]?.date ?? data.from)}–${shortDate(data.through)} · reported scores /10`} aside={<button className={styles.textButton} type="button" aria-pressed={allRecovery} onClick={() => setAllRecovery(!allRecovery)}>{allRecovery ? "Latest 7 days" : "All month"}</button>}>
      <div className={styles.scroll}><table className={styles.recovery}><thead><tr><th scope="col">Metric</th>{recoveryDays.map(d => <th scope="col" key={d.date}><button type="button" onClick={() => setSelection(d.date)} aria-pressed={day.date === d.date}>{weekdayName(d.date).slice(0, 3)}<br />{shortDate(d.date)}</button></th>)}</tr></thead><tbody>{[{ slug: "fatigue", label: "Fatigue" }, { slug: "readiness", label: "Readiness" }, { slug: "soreness", label: "Soreness" }].map(m => <tr key={m.slug}><th scope="row">{m.label}</th>{recoveryDays.map(d => { const v = metric(d, m.slug); return <td key={d.date}><button type="button" onClick={() => setSelection(d.date)} className={styles.recoveryCell} aria-pressed={day.date === d.date}>{v ?? "—"}{m.slug === "fatigue" && v != null ? <span className={styles.fatigueMeter} style={{ width: `${v * 10}%` }} /> : null}</button></td>; })}</tr>)}</tbody></table></div>
      <p className={styles.subtle}>Missing readings remain unrecorded, not zero. Scores are reports; timing is not inferred. Select a date to inspect performance alongside recovery.</p>
    </Card>
    <p className={styles.footnote}>Historical milestones remain visible. Rates require documented denominators. Month-to-month progression requires matched exercise or skill conditions and compatible recording coverage; this review does not compute a blended trend.</p>
  </section>;
}

function MonthlyExercise({ data, exercises, gyms, onSelect }: { data: MonthlyProgressData; exercises: Exercise[]; gyms: Gym[]; onSelect: (date: string) => void }) {
  const setups = exerciseSetups(data.days, exercises, gyms);
  const [key, setKey] = useState(""); const [weight, setWeight] = useState("");
  const setup = setups.find(s => s.key === key) ?? setups.find(s => s.identified && s.byDate.size > 1) ?? setups[0];
  const loads = setup ? [...new Set([...setup.byDate.values()].flat().filter(s => !s.is_drop && s.load_kg != null && s.reps != null).map(s => s.load_kg!))].sort((a, b) => a - b) : [];
  const load = weight && loads.includes(Number(weight)) ? Number(weight) : loads.find(n => new Set(matchedReps(setup, n).map(p => p.date)).size > 1) ?? loads.at(-1) ?? null;
  const points = matchedReps(setup, load), countDates = new Set(points.map(p => p.date)).size;
  if (!setup) return <p className={styles.subtle}>No logged exercise records available for comparison.</p>;
  const max = Math.max(1, ...points.map(p => p.reps)) + 2;
  const span = Math.max(1, data.days.length - 1);
  return <details className={styles.milestones}><summary>Compare a specific exercise</summary>
    <label className={styles.select}>Exercise and equipment<select value={setup.key} onChange={e => { setKey(e.target.value); setWeight(""); }}>{setups.map(s => <option value={s.key} key={s.key}>{s.label}</option>)}</select></label>
    {loads.length ? <label className={styles.select}>Matched working load<select value={load ?? ""} onChange={e => setWeight(e.target.value)}>{loads.map(n => <option value={n} key={n}>{n} kg</option>)}</select></label> : null}
    {!setup.identified ? <p className={styles.subtle}>Equipment context incomplete · comparability unverified.</p> : countDates < 2 ? <p className={styles.subtle}>Fewer than two observed dates at this setup and load · insufficient longitudinal data.</p> : <><p className={styles.subtle}>Reps at {load} kg · individual recorded working sets, never averaged</p><svg className={styles.repPlot} viewBox="0 0 620 190" role="img" aria-label={`Recorded repetitions at ${load} kg across ${countDates} dates. Full values follow below.`}>{[0, Math.ceil(max / 2), max].map(v => <g key={v}><path d={`M34 ${150 - v / max * 125}H600`} /><text x={22} y={154 - v / max * 125}>{v}</text></g>)}{points.map((p, i) => <circle key={i} cx={40 + (Number(p.date.slice(8)) - 1) / span * 550 + (i % 3 - 1) * 3} cy={150 - p.reps / max * 125} r={4}><title>{p.date}: {p.sets} × {p.reps} reps; RIR {p.rir ?? "unrecorded"}</title></circle>)}<text x={35} y={180}>{shortDate(data.from)}</text><text x={550} y={180}>{shortDate(data.days.at(-1)!.date)}</text></svg></>}
    <p className={styles.subtle}>Exercise, gym, equipment, side, load and recorded order stay separate. Drop sets are excluded from the plot; RIR still affects interpretation.</p>
    <details><summary>Recorded sets for this setup</summary>{[...setup.byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, sets]) => <p className={styles.setRecord} key={date}><button type="button" onClick={() => onSelect(date)}>{shortDate(date)}</button> · {sets.map(s => `${s.sets_count} × ${s.reps ?? "?"} @ ${s.load_kg ?? "?"} kg · RIR ${s.rir ?? "?"}${s.is_drop ? " · drop" : ""}`).join("; ")}</p>)}</details>
  </details>;
}
function Stat({ label, value, hint }: { label: string; value: ReactNode; hint: string }) { return <div className={styles.stat}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>; }
function Card({ title, subtitle, aside, children }: { title: string; subtitle: string; aside?: ReactNode; children: ReactNode }) { return <section className={styles.card}><div className={styles.heading}><div><h3>{title}</h3><p className={styles.subtle}>{subtitle}</p></div>{aside}</div>{children}</section>; }
