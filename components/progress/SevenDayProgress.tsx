"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { snatchCounts, skillResult, type DailyProgressData } from "@/lib/dailyProgress";
import { exerciseSetups, matchedReps, outcomeTone, OUTCOME_MARKS, qualityChange, trainingDose, type ExerciseSetup, type OutcomeTone } from "@/lib/progressPresentation";
import type { AssistanceType, CalisthenicsAttempt, Exercise, Gym, HypertrophySet, MuscleGroup, MuscleRegion, SkillVariation } from "@/lib/types";
import { longDate, weekdayName } from "@/lib/time";
import { MIN_ATTEMPTS_FOR_RATE } from "@/components/ui";
import { RecoveryPlot, RepetitionPlot } from "./DailyPlots";
import styles from "./SevenDayProgress.module.css";

type Props = {
  data: DailyProgressData; attempts: CalisthenicsAttempt[]; exercises: Exercise[]; gyms: Gym[];
  variations: SkillVariation[]; assistance: AssistanceType[]; muscleGroups: MuscleGroup[]; regions: MuscleRegion[];
};
const RECOVERY = [
  { slug: "fatigue", label: "Fatigue", unit: "/10" }, { slug: "soreness", label: "Soreness", unit: "/10" },
  { slug: "readiness", label: "Readiness", unit: "/10" }, { slug: "sleep_quality", label: "Sleep quality", unit: "/10" }, { slug: "sleep_duration", label: "Sleep", unit: " h" },
];
const dateLabel = (date: string) => `${weekdayName(date).slice(0, 3)} ${Number(date.slice(8))}`;
const metric = (day: DailyProgressData["days"][number], slug: string) => day.metrics.find(m => m.metric === slug)?.value_numeric ?? null;
const toneClass: Record<OutcomeTone, string> = { all: styles.outcomeAll, partial: styles.outcomePartial, none: styles.outcomeNone, unknown: styles.outcomeUnknown };
function Missing({ children = "—" }: { children?: ReactNode }) { return <span className={styles.missing} title="Not recorded; not zero">{children}</span>; }
function setsLabel(sets: HypertrophySet[]) { return sets.map(s => `${s.sets_count} × ${s.reps ?? "?"} @ ${s.load_kg ?? "?"} kg · RIR ${s.rir ?? "?"}${s.is_drop ? " · drop" : ""}`).join("; "); }

export function SevenDayProgress({ data, attempts, exercises, gyms, variations, assistance, muscleGroups, regions }: Props) {
  const { days } = data;
  const loads = [...new Set(days.flatMap(d => d.snatch.map(b => b.weight_kg)).filter((v): v is number => v != null))].sort((a, b) => a - b);
  const [selected, setSelected] = useState(days.findLast(d => d.status === "Trained")?.date ?? days[6].date);
  const [loadFilter, setLoadFilter] = useState(loads.includes(45) ? "45" : "all");
  const [skillMode, setSkillMode] = useState<"quality" | "success">("quality");
  const day = days.find(d => d.date === selected) ?? days[6];
  const selectedDate = day.date;
  const activeLoad = loadFilter === "all" || !loads.includes(Number(loadFilter)) ? null : Number(loadFilter);
  const snatchLabel = activeLoad == null ? "All working loads" : `${activeLoad} kg`;
  const counts = days.map(d => snatchCounts(d.snatch.filter(b => activeLoad == null || b.weight_kg === activeLoad)));
  const maxAttempts = Math.max(1, ...counts.map(c => c.attempts));
  const selectedCounts = counts[days.indexOf(day)];
  const doses = days.map(d => trainingDose(d.sets, exercises, muscleGroups, regions));
  const selectedDose = doses[days.indexOf(day)];
  const maxDose = Math.max(1, ...doses.map(d => d.count));
  const full = snatchCounts(days.flatMap(d => d.snatch));
  const totalSets = doses.reduce((n, d) => n + d.count, 0);
  const skillEntries = days.reduce((n, d) => n + d.skills.length, 0);
  const fatigue = days.flatMap(d => metric(d, "fatigue") == null ? [] : [{ date: d.date, value: metric(d, "fatigue")! }]);
  const setups = exerciseSetups(days, exercises, gyms);
  const skills = new Map<string, { label: string; variationId: number; assistanceId: number | null }>();
  for (const d of days) for (const e of d.skills) {
    const name = variations.find(v => v.id === e.skill_variation_id)?.name ?? `Skill ${e.skill_variation_id}`;
    skills.set(`${e.skill_variation_id}-${e.assistance_id}`, { label: `${name} · ${assistance.find(a => a.id === e.assistance_id)?.name ?? "assistance unrecorded"}`, variationId: e.skill_variation_id, assistanceId: e.assistance_id });
  }
  const dateHeads = (label: string) => <tr><th scope="col">{label}</th>{days.map(d => <th scope="col" key={d.date}><button type="button" onClick={() => setSelected(d.date)} aria-pressed={d.date === selectedDate}>{weekdayName(d.date).slice(0, 3)}<span>{Number(d.date.slice(8))}</span></button></th>)}</tr>;

  return <section className={styles.dashboard} aria-label="Seven-day daily progress">
    <div className={styles.windowHeading}><div><h2>{longDate(days[0].date)} – {longDate(days[6].date)}</h2><p>Seven-day window · daily resolution · logged observations</p></div><span className={styles.badge}>{days.filter(d => d.status === "Trained").length} training days recorded</span></div>
    <div className={styles.stats}>
      <Stat label="Full snatch · working lifts" value={full.complete ? `${full.stood}/${full.attempts}` : "—"} hint={full.unknown ? `${full.unknown} incomplete blocks excluded` : full.attempts >= MIN_ATTEMPTS_FOR_RATE ? `${Math.round(full.stood / full.attempts * 100)}% stood · inspect by load below` : "Too few attempts for a rate"} />
      <Stat label="Hypertrophy dose" value={totalSets || "—"} hint={totalSets ? "sets · exercise comparisons on demand" : "No sets recorded"} />
      <Stat label="Calisthenics" value={skillEntries || "—"} hint={skillEntries ? "entries · quality and success kept separate" : "No skill entries recorded"} />
      <Stat label="Reported fatigue" value={fatigue.length > 1 ? `${fatigue[0].value} → ${fatigue.at(-1)!.value}` : fatigue.length ? `${fatigue[0].value}/10` : "—"} hint={fatigue.length ? `${dateLabel(fatigue[0].date)}${fatigue.length > 1 ? ` to ${dateLabel(fatigue.at(-1)!.date)}` : ""} · ${fatigue.length}/7 days rated` : "Unrecorded · not zero"} />
    </div>
    <div><h3 className={styles.glanceTitle}>Week at a glance</h3><div className={styles.dateScroll}><div className={styles.dateStrip}>{days.map((d, i) => <button type="button" key={d.date} onClick={() => setSelected(d.date)} aria-pressed={selectedDate === d.date} aria-controls="daily-performance"><strong>{dateLabel(d.date)}</strong><span title={doses[i].detail}>{d.status === "Trained" && doses[i].count ? doses[i].label : d.status}</span></button>)}</div></div></div>
    <section id="daily-performance" className={styles.inspector} aria-label="Selected day performance">
      <p className={styles.readout} aria-live="polite" aria-atomic="true"><strong>{dateLabel(day.date)} · {day.status}</strong><span>Snatch {snatchLabel.toLowerCase()}: {selectedCounts.complete ? `${selectedCounts.stood}/${selectedCounts.attempts} stood` : selectedCounts.unknown ? "counts incomplete" : "no observation"}{selectedCounts.unknown && selectedCounts.complete ? " *" : ""}</span><span>{selectedDose.count ? `${selectedDose.count} sets · ${selectedDose.label}` : "No hypertrophy sets recorded"}</span><span>{day.skills.length ? `${day.skills.length} skill entries` : "No skill entries recorded"}</span><span>Fatigue: {metric(day, "fatigue") == null ? "unrecorded" : `${metric(day, "fatigue")}/10`}</span></p>
      <details key={day.date} className={styles.dayDetails}><summary>Inspect performance and recovery · {dateLabel(day.date)}</summary>
        <div className={styles.inspectorGrid}>
          <div><h4>Snatch · all working loads</h4>{day.snatch.length ? loads.map(load => { const blocks = day.snatch.filter(b => b.weight_kg === load), n = snatchCounts(blocks); return blocks.length ? <p key={load}>{load} kg: {n.complete ? `${n.stood}/${n.attempts}` : "? / ?"}{n.unknown ? " * incomplete blocks" : ""} · quality {blocks.map(b => b.quality_10 ?? "?").join(", ")}/10</p> : null; }) : <Missing>No working full snatch recorded</Missing>}</div>
          <div><h4>Hypertrophy</h4>{day.sets.length ? setups.filter(s => s.byDate.has(day.date)).map(s => <p key={s.key}><strong>{s.label}</strong><br />{setsLabel(s.byDate.get(day.date)!)}</p>) : <Missing>No sets recorded</Missing>}</div>
          <div><h4>Calisthenics</h4>{day.skills.length ? day.skills.map(e => { const r = skillResult(e, attempts); return <p key={e.id}>{variations.find(v => v.id === e.skill_variation_id)?.name ?? "Skill"}: quality {e.quality_10 ?? "?"}/10 · {r.successes ?? "?"}/{r.attempts ?? "?"} successful{r.unjudged ? ` · ${r.unjudged} unjudged` : ""} · hold {e.best_hold_seconds ?? "?"} s</p>; }) : <Missing>No skill entries recorded</Missing>}</div>
          <div><h4>Recovery</h4>{RECOVERY.map(m => <p key={m.slug}>{m.label}: {metric(day, m.slug) == null ? <Missing>unrecorded</Missing> : `${metric(day, m.slug)}${m.unit}`}</p>)}</div>
        </div>
        {day.dayNotes || day.notes.length ? <div className={styles.notes}><strong>Reported context</strong>{day.dayNotes ? <p>{day.dayNotes}</p> : null}{day.notes.map((note, i) => <p key={i}>{note}</p>)}</div> : null}
        <Link className={styles.dayLink} href={`/day/${day.date}`}>Open day record →</Link>
      </details>
    </section>
    <div className={styles.panels}>
      <Panel title="1 · Snatch outcomes" subtitle="Working full lifts · length shows counted attempts">
        <label className={styles.selectLabel}>Working load<select value={activeLoad == null ? "all" : String(activeLoad)} onChange={event => setLoadFilter(event.target.value)}><option value="all">All working loads</option>{loads.map(load => <option key={load} value={load}>{load} kg</option>)}</select></label>
        <div className={styles.barRows}>{days.map((d, i) => { const c = counts[i]; return <button className={styles.barRow} type="button" key={d.date} onClick={() => setSelected(d.date)} aria-pressed={d.date === selectedDate} aria-label={`${dateLabel(d.date)}, ${snatchLabel}: ${c.complete ? `${c.stood} stood of ${c.attempts} counted attempts` : "no complete counts"}${c.unknown ? ", incomplete blocks" : ""}`}>
          <strong>{dateLabel(d.date)}</strong><span className={styles.barTrack}>{c.attempts > 0 ? <span className={styles.barStack} style={{ width: `${c.attempts / maxAttempts * 100}%` }}><span className={styles.barStood} style={{ width: `${c.stood / c.attempts * 100}%` }} /><span className={styles.barOther} style={{ width: `${(c.attempts - c.stood) / c.attempts * 100}%` }} /></span> : <span className={styles.emptyTrack}>{c.complete ? "0 attempts" : c.unknown ? "?" : "—"}</span>}</span><span className={styles.barValue}>{c.complete ? `${c.stood}/${c.attempts}` : c.unknown ? "?" : "—"}{c.unknown && c.complete ? " *" : ""}</span>
        </button>; })}</div>
        <div className={styles.legend}><span><i className={styles.stoodKey} />Stood</span><span><i className={styles.otherKey} />Other counted outcomes</span></div><p className={styles.hint}>* Incomplete blocks excluded from ratios. Warm-ups, cooldowns and reconstruction excluded.</p>
      </Panel>
      <Panel title="2 · Recovery alongside training" subtitle="Reported /10 · missing readings leave a gap">
        <RecoveryPlot days={days} selected={selectedDate} onSelect={setSelected} /><p className={styles.hint}>Reports provide context, not evidence of causation.</p>
        <details className={styles.drill}><summary>All recovery readings</summary><div className={styles.tableScroll}><table className={styles.recoveryTable}><thead>{dateHeads("Metric")}</thead><tbody>{RECOVERY.map(m => <tr key={m.slug}><th scope="row">{m.label}{m.unit === " h" ? " (h)" : ""}</th>{days.map(d => <td key={d.date}>{metric(d, m.slug) ?? <Missing />}</td>)}</tr>)}</tbody></table></div></details>
      </Panel>
      <Panel title="3 · Strength and hypertrophy dose" subtitle="Recorded sets by date · body-part emphasis">
        <div className={styles.barRows}>{days.map((d, i) => <button className={`${styles.barRow} ${styles.doseRow}`} type="button" key={d.date} onClick={() => setSelected(d.date)} aria-pressed={d.date === selectedDate} aria-label={`${dateLabel(d.date)}: ${doses[i].count ? `${doses[i].count} sets, ${doses[i].label}` : "no sets recorded"}`}><strong>{dateLabel(d.date)}</strong><span className={styles.barTrack}>{doses[i].count ? <span className={styles.barDose} style={{ width: `${doses[i].count / maxDose * 100}%` }} /> : <span className={styles.emptyTrack}>—</span>}</span><span className={styles.barValue} title={doses[i].detail}>{doses[i].count ? <>{doses[i].count}<small>{doses[i].label}</small></> : "—"}</span></button>)}</div>
        <p className={styles.hint}>Dose is context, not a progression score. Loads on different machines are not pooled.</p><details className={styles.drill}><summary>Compare a specific exercise</summary><ExerciseComparison setups={setups} days={days} selected={selectedDate} onSelect={setSelected} /></details>
      </Panel>
      <Panel title="4 · Snatch load checkpoints" subtitle="Colour describes the outcome · counts stay visible">
        {loads.length ? <div className={styles.tableScroll}><table className={styles.heatmap}><thead>{dateHeads("Load")}</thead><tbody>{loads.map(load => <tr key={load}><th scope="row">{load} kg</th>{days.map(d => { const blocks = d.snatch.filter(b => b.weight_kg === load), c = snatchCounts(blocks); const tone = outcomeTone(c.stood, c.attempts, c.unknown > 0); return <td key={d.date}>{blocks.length ? <button type="button" className={`${styles.heatCell} ${toneClass[tone]}`} onClick={() => setSelected(d.date)} aria-pressed={d.date === selectedDate} aria-label={`${dateLabel(d.date)}, ${load} kg: ${c.complete ? `${c.stood} stood of ${c.attempts} counted attempts` : "counts incomplete"}${c.unknown ? "; incomplete blocks excluded" : ""}`} title={`Quality /10: ${blocks.map(b => b.quality_10 ?? "unrecorded").join(", ")}`}><span className={styles.outcomeMark} aria-hidden>{OUTCOME_MARKS[tone]}</span><strong>{c.complete ? `${c.stood}/${c.attempts}` : "? / ?"}{c.unknown ? " *" : ""}</strong></button> : <Missing />}</td>; })}</tr>)}</tbody></table></div> : <Missing>No working-load checkpoints recorded</Missing>}
        <OutcomeLegend /><p className={styles.hint}>Colour is not a trend. 0/1 is one unsuccessful attempt. ? / * Incomplete measurement; — no observation. Inspect a day for quality ratings.</p>
      </Panel>
      <Panel title="5 · Calisthenics" subtitle="Quality and completion describe different capabilities" wide aside={<div className={styles.modeSwitch} role="group" aria-label="Colour skill cells by">{(["quality", "success"] as const).map(mode => <button type="button" key={mode} aria-pressed={mode === skillMode} onClick={() => setSkillMode(mode)}>{mode === "quality" ? "Quality" : "Success"}</button>)}</div>}>
        {skills.size ? <div className={styles.tableScroll}><table className={`${styles.heatmap} ${styles.skillTable}`}><thead>{dateHeads("Skill · same assistance")}</thead><tbody>{[...skills.entries()].map(([key, skill]) => <tr key={key}><th scope="row">{skill.label}</th>{days.map((d, i) => {
          const forSkill = (date: typeof d) => date.skills.filter(e => e.skill_variation_id === skill.variationId && e.assistance_id === skill.assistanceId);
          const entries = forSkill(d), priorDay = days.slice(0, i).findLast(previous => forSkill(previous).length > 0);
          const difference = priorDay && skill.assistanceId != null ? qualityChange(entries.map(e => e.quality_10), forSkill(priorDay).map(e => e.quality_10)) : null;
          return <td key={d.date}>{entries.length ? entries.map(e => {
            const r = skillResult(e, attempts), tone = outcomeTone(r.successes, r.attempts, (r.unjudged ?? 0) > 0);
            const qualityStyle = skillMode === "quality" && e.quality_10 != null ? { "--rating-strength": `${8 + e.quality_10 * 3.5}%` } as CSSProperties : undefined;
            return <button type="button" key={e.id} className={`${styles.heatCell} ${skillMode === "success" ? toneClass[tone] : e.quality_10 == null ? styles.outcomeUnknown : styles.qualityCell}`} style={qualityStyle} onClick={() => setSelected(d.date)} aria-pressed={d.date === selectedDate} aria-label={`${dateLabel(d.date)}, ${skill.label}: quality ${e.quality_10 ?? "unrecorded"} out of 10, ${r.successes ?? "unknown"} successes of ${r.attempts ?? "unknown"} attempts${r.unjudged ? `, ${r.unjudged} unjudged` : ""}`}>
              <strong>{skillMode === "quality" ? e.quality_10 == null ? "?" : `${e.quality_10}/10` : `${OUTCOME_MARKS[tone]} ${r.successes ?? "?"}/${r.attempts ?? "?"}`}</strong><small>{skillMode === "quality" ? `${r.successes ?? "?"}/${r.attempts ?? "?"} successful` : `quality ${e.quality_10 == null ? "?" : `${e.quality_10}/10`}`}{r.unjudged ? ` · ${r.unjudged} unjudged` : ""}</small>
              {skillMode === "quality" && difference != null && difference !== 0 && priorDay ? <span className={styles.change} title="Difference between recorded ratings, not an established trend">{difference > 0 ? "↑ +" : "↓ "}{difference} vs {dateLabel(priorDay.date)}</span> : null}
            </button>;
          }) : <Missing />}</td>;
        })}</tr>)}</tbody></table></div> : <Missing>No skill observations recorded</Missing>}
        {skillMode === "success" ? <OutcomeLegend /> : <div className={styles.legend}><span><i className={styles.qualityKey} />Purple intensity = recorded quality /10</span><span>↑ / ↓ Change in a single rating, not a trend</span></div>}
        <p className={styles.hint}>? Incomplete measurement; — no observation. Variations and assistance stay separate. A successful attempt can have low technical quality. Holds and attempt detail are in daily inspection.</p>
      </Panel>
    </div>
    <p className={styles.limitations}>Seven days describe what happened. Repeated comparable observations are needed to establish progression. Missing measurements are not zeros or declines.{data.importedSessions ? ` ${data.importedSessions} reconstructed sessions are excluded from daily comparisons.` : ""}</p>
  </section>;
}

function ExerciseComparison({ setups, days, selected, onSelect }: { setups: ExerciseSetup[]; days: DailyProgressData["days"]; selected: string; onSelect: (date: string) => void }) {
  const [key, setKey] = useState("");
  const [load, setLoad] = useState("");
  const setup = setups.find(s => s.key === key) ?? setups.find(s => s.identified && s.byDate.size > 1) ?? setups[0];
  const loads = setup ? [...new Set([...setup.byDate.values()].flat().filter(s => !s.is_drop && s.load_kg != null && s.reps != null).map(s => s.load_kg!))].sort((a, b) => a - b) : [];
  const activeLoad = load && loads.includes(Number(load)) ? Number(load) : loads.find(value => new Set(matchedReps(setup, value).map(p => p.date)).size > 1) ?? loads.at(-1) ?? null;
  const points = matchedReps(setup, activeLoad), dates = new Set(points.map(p => p.date)).size;
  if (!setup) return <p className={styles.hint}>No exercise sets recorded in this window.</p>;
  return <div className={styles.comparison}>
    <label className={styles.selectLabel}>Exercise and recorded setup<select value={setup.key} onChange={event => { setKey(event.target.value); setLoad(""); }}>{setups.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
    {loads.length ? <label className={styles.selectLabel}>Working load<select value={activeLoad ?? ""} onChange={event => setLoad(event.target.value)}>{loads.map(value => <option key={value} value={value}>{value} kg</option>)}</select></label> : null}
    {!setup.identified ? <p className={styles.hint}>Equipment context is incomplete. A matched-setup progression plot is unavailable.</p> : dates < 2 ? <p className={styles.hint}>{dates ? "One observed date" : "No complete working sets"} at this setup and load · insufficient longitudinal data.</p> : <><p className={styles.hint}>Reps at {activeLoad} kg · each recorded working set, never averaged</p><RepetitionPlot days={days} selected={selected} onSelect={onSelect} points={points} /><p className={styles.hint}>Same exercise, gym, equipment, side, load and recorded order. RIR and other conditions still affect interpretation; no improvement verdict is computed.</p></>}
    <details className={styles.drill}><summary>Recorded sets for this setup</summary>{[...setup.byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, sets]) => <p className={styles.setRecord} key={date}><strong>{dateLabel(date)}</strong><br />{setsLabel(sets)}</p>)}</details>
  </div>;
}
function OutcomeLegend() { return <div className={styles.legend}><span><i className={styles.allKey} />✓ All successful</span><span><i className={styles.partialKey} />◐ Some successful</span><span><i className={styles.noneKey} />× None successful</span></div>; }
function Stat({ label, value, hint }: { label: string; value: ReactNode; hint: string }) { return <div className={styles.stat}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>; }
function Panel({ title, subtitle, children, wide, aside }: { title: string; subtitle: string; children: ReactNode; wide?: boolean; aside?: ReactNode }) { return <section className={`${styles.panel} ${wide ? styles.wide : ""}`}><div className={styles.panelHeading}><h3>{title}</h3>{aside}</div><p className={styles.subtitle}>{subtitle}</p>{children}</section>; }
