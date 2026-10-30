"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { snatchCounts, skillResult, type DailyProgressData } from "@/lib/dailyProgress";
import type { AssistanceType, CalisthenicsAttempt, Exercise, Gym, HypertrophySet, SkillVariation } from "@/lib/types";
import { longDate, weekdayName } from "@/lib/time";
import { MIN_ATTEMPTS_FOR_RATE } from "@/components/ui";
import styles from "./SevenDayProgress.module.css";

type Props = {
  data: DailyProgressData;
  attempts: CalisthenicsAttempt[];
  exercises: Exercise[];
  gyms: Gym[];
  variations: SkillVariation[];
  assistance: AssistanceType[];
};

const RECOVERY = [
  { slug: "fatigue", label: "Fatigue", unit: "/10" },
  { slug: "soreness", label: "Soreness", unit: "/10" },
  { slug: "readiness", label: "Readiness", unit: "/10" },
  { slug: "sleep_quality", label: "Sleep quality", unit: "/10" },
  { slug: "sleep_duration", label: "Sleep", unit: " h" },
];

function dateLabel(date: string) { return `${weekdayName(date).slice(0, 3)} ${Number(date.slice(8))}`; }
function Missing({ children = "—" }: { children?: ReactNode }) { return <span className={styles.missing} title="Not recorded; not zero">{children}</span>; }
function setsLabel(sets: HypertrophySet[]) {
  return sets.map(s => `${s.sets_count} × ${s.reps ?? "?"} @ ${s.load_kg ?? "?"} kg${s.rir == null ? " · RIR ?" : ` · RIR ${s.rir}`}${s.is_drop ? " · drop" : ""}`).join("; ");
}

export function SevenDayProgress({ data, attempts, exercises, gyms, variations, assistance }: Props) {
  const { days } = data;
  const [selected, setSelected] = useState(days.findLast(d => d.status === "Trained")?.date ?? days[6].date);
  const day = days.find(d => d.date === selected)!;
  const full = snatchCounts(days.flatMap(d => d.snatch));
  const totalSets = days.reduce((n, d) => n + d.sets.reduce((s, r) => s + r.sets_count, 0), 0);
  const skillEntries = days.reduce((n, d) => n + d.skills.length, 0);
  const fatigue = days.flatMap(d => {
    const value = d.metrics.find(m => m.metric === "fatigue")?.value_numeric;
    return value == null ? [] : [{ date: d.date, value }];
  });
  const maxAttempts = Math.max(1, ...days.map(d => d.counts.attempts));
  const loads = [...new Set(days.flatMap(d => d.snatch.map(b => b.weight_kg)).filter((v): v is number => v != null))].sort((a, b) => a - b);
  const setups = new Map<string, { label: string; byDate: Map<string, HypertrophySet[]>; identified: boolean }>();
  for (const d of days) for (const set of d.sets) {
    const session = d.sessions.find(s => s.id === set.session_id);
    const gym = session?.gym_id != null ? gyms.find(g => g.id === session.gym_id)?.name ?? `Gym ${session.gym_id}` : session?.gym_custom_label;
    const key = JSON.stringify([set.exercise_id, session?.gym_id, session?.gym_custom_label, set.machine_label, set.side]);
    const setup = setups.get(key) ?? {
      label: `${exercises.find(e => e.id === set.exercise_id)?.name ?? `Exercise ${set.exercise_id}`} · ${gym ?? "gym unrecorded"} · ${set.machine_label ?? "equipment unrecorded"} · ${set.side}`,
      byDate: new Map<string, HypertrophySet[]>(), identified: Boolean(gym && set.machine_label),
    };
    setup.byDate.set(d.date, [...(setup.byDate.get(d.date) ?? []), set]);
    setups.set(key, setup);
  }
  const skills = new Map<string, { label: string; variationId: number; assistanceId: number | null }>();
  for (const d of days) for (const entry of d.skills) {
    const label = variations.find(v => v.id === entry.skill_variation_id)?.name ?? `Skill ${entry.skill_variation_id}`;
    skills.set(`${entry.skill_variation_id}-${entry.assistance_id}`, {
      label: `${label} · ${assistance.find(a => a.id === entry.assistance_id)?.name ?? "assistance unrecorded"}`,
      variationId: entry.skill_variation_id, assistanceId: entry.assistance_id,
    });
  }
  const dateHeads = <tr><th scope="col">Observation</th>{days.map(d => <th scope="col" key={d.date} className={d.date === selected ? styles.selectedCell : undefined}><button type="button" onClick={() => setSelected(d.date)} aria-pressed={d.date === selected}>{dateLabel(d.date)}</button></th>)}</tr>;
  const cellClass = (date: string) => date === selected ? styles.selectedCell : undefined;

  return <section className={styles.dashboard} aria-label="Seven-day daily progress">
    <div className={styles.windowHeading}>
      <div><h2>{longDate(days[0].date)} – {longDate(days[6].date)}</h2><p>Seven-day window · daily resolution · logged observations</p></div>
      <span className={styles.badge}>{days.filter(d => d.status === "Trained").length} training days recorded</span>
    </div>
    <div className={styles.stats}>
      <Stat label="Full snatch · working lifts" value={full.complete ? `${full.stood}/${full.attempts}` : "—"} hint={full.unknown ? `${full.unknown} blocks have incomplete counts` : full.attempts >= MIN_ATTEMPTS_FOR_RATE ? `${Math.round(full.stood / full.attempts * 100)}% stood · counts below by load` : "Too few attempts for a rate"} />
      <Stat label="Hypertrophy dose" value={totalSets || "—"} hint={totalSets ? "recorded sets · performance below" : "No sets recorded"} />
      <Stat label="Calisthenics" value={skillEntries || "—"} hint={skillEntries ? "skill entries · quality below" : "No skill entries recorded"} />
      <Stat label="Reported fatigue" value={fatigue.length > 1 ? `${fatigue[0].value} → ${fatigue.at(-1)!.value}` : fatigue.length ? `${fatigue[0].value}/10` : "—"} hint={fatigue.length ? `${dateLabel(fatigue[0].date)}${fatigue.length > 1 ? ` to ${dateLabel(fatigue.at(-1)!.date)}` : ""} · ${fatigue.length}/7 days rated` : "Unrecorded · not zero"} />
    </div>

    <div><h3 className={styles.glanceTitle}>Week at a glance</h3><p className={styles.hint}>Select a date to inspect all four workstreams together.</p>
      <div className={styles.dateScroll}><div className={styles.dateStrip}>{days.map(d => <button type="button" key={d.date} onClick={() => setSelected(d.date)} aria-pressed={selected === d.date} aria-controls="daily-performance" className={selected === d.date ? styles.dateSelected : undefined}>
        <strong>{dateLabel(d.date)}</strong><span>{d.status}</span>
      </button>)}</div></div>
    </div>

    <section id="daily-performance" className={styles.inspector} aria-label="Selected day performance" aria-live="polite" aria-atomic="true">
      <div className={styles.windowHeading}><h3>{dateLabel(day.date)} · {day.status}</h3><Link href={`/day/${day.date}`}>Open day record →</Link></div>
      <div className={styles.inspectorGrid}>
        <div><h4>Snatch</h4>{day.snatch.length ? <><p>{day.counts.complete ? `${day.counts.stood}/${day.counts.attempts} stood in counted working lifts` : "Attempts / outcomes incomplete"}{day.counts.unknown ? ` · ${day.counts.unknown} incomplete blocks` : ""}</p>{loads.map(load => { const blocks = day.snatch.filter(b => b.weight_kg === load); const n = snatchCounts(blocks); return blocks.length ? <p key={load}>{load} kg: {n.complete ? `${n.stood}/${n.attempts}` : "counts ?"} · quality {blocks.map(b => b.quality_10 ?? "?").join(", ")}/10{n.unknown ? " · incomplete counts" : ""}</p> : null; })}</> : <Missing>No working full snatch recorded</Missing>}</div>
        <div><h4>Hypertrophy</h4>{day.sets.length ? [...setups.entries()].filter(([, s]) => s.byDate.has(day.date)).map(([key, s]) => <p key={key}><strong>{s.label}</strong><br />{setsLabel(s.byDate.get(day.date)!)}</p>) : <Missing>No sets recorded</Missing>}</div>
        <div><h4>Calisthenics</h4>{day.skills.length ? day.skills.map(e => { const r = skillResult(e, attempts); return <p key={e.id}>{variations.find(v => v.id === e.skill_variation_id)?.name ?? "Skill"}: quality {e.quality_10 ?? "?"}/10 · {r.successes ?? "?"}/{r.attempts ?? "?"} successful{r.unjudged ? ` · ${r.unjudged} unjudged` : ""} · hold {e.best_hold_seconds ?? "?"} s</p>; }) : <Missing>No skill entries recorded</Missing>}</div>
        <div><h4>Recovery</h4>{RECOVERY.map(m => { const v = day.metrics.find(r => r.metric === m.slug)?.value_numeric; return <p key={m.slug}>{m.label}: {v == null ? <Missing>unrecorded</Missing> : `${v}${m.unit}`}</p>; })}</div>
      </div>
      {day.dayNotes || day.notes.length ? <div className={styles.notes}><strong>Reported context</strong>{day.dayNotes ? <p>{day.dayNotes}</p> : null}{day.notes.map((n, i) => <p key={i}>{n}</p>)}</div> : <p className={styles.hint}>No daily context notes recorded.</p>}
    </section>

    <div className={styles.panels}>
      <Panel title="1 · Snatch outcomes" subtitle="Working full snatch only · solid = stood · striped = other counted outcomes">
        <div className={styles.barChart}>{days.map(d => <button type="button" key={d.date} className={d.date === selected ? styles.barSelected : undefined} onClick={() => setSelected(d.date)} aria-pressed={d.date === selected} aria-label={`${dateLabel(d.date)}: ${d.counts.complete ? `${d.counts.stood} stood of ${d.counts.attempts} counted attempts` : "no complete counts"}${d.counts.unknown ? ", incomplete blocks" : ""}`}>
          <span className={styles.barCount}>{d.counts.complete ? `${d.counts.stood}/${d.counts.attempts}` : "—"}{d.counts.unknown ? " *" : ""}</span>
          <span className={styles.barTrack}>{d.counts.complete && d.counts.attempts > 0 ? <span className={styles.bar} style={{ height: `${d.counts.attempts / maxAttempts * 100}%` }}><span className={styles.barOther} style={{ height: `${(d.counts.attempts - d.counts.stood) / d.counts.attempts * 100}%` }} /><span className={styles.barStood} style={{ height: `${d.counts.stood / d.counts.attempts * 100}%` }} /></span> : <span className={styles.noBar}>{d.counts.complete ? "0" : d.counts.unknown ? "?" : "—"}</span>}</span>
          <strong>{dateLabel(d.date)}</strong>
        </button>)}</div>
        <p className={styles.hint}>Height shows counted attempts (maximum {maxAttempts === 1 && !full.attempts ? "not available" : maxAttempts}). * Incomplete blocks excluded from the ratio. Warm-ups, cooldowns and reconstructed history excluded.</p>
      </Panel>
      <Panel title="2 · Recovery alongside performance" subtitle="Reported scores /10; sleep duration in hours">
        <div className={styles.tableScroll}><table><thead>{dateHeads}</thead><tbody>{RECOVERY.map(m => <tr key={m.slug}><th scope="row">{m.label}{m.unit === " h" ? " (h)" : ""}</th>{days.map(d => { const v = d.metrics.find(r => r.metric === m.slug)?.value_numeric; return <td key={d.date} className={cellClass(d.date)}>{v == null ? <Missing /> : v}</td>; })}</tr>)}</tbody></table></div>
        <p className={styles.hint}>— Unrecorded, never zero. The selected column aligns with the day above. These reports provide context, not evidence of causation.</p>
      </Panel>
      <Panel title="3 · Exercise performance" subtitle="Sets × reps @ load · repetitions in reserve (RIR) · each setup kept separate" wide>
        {setups.size ? <div className={styles.tableScroll}><table className={styles.performanceTable}><thead>{dateHeads}</thead><tbody>{[...setups.entries()].map(([key, s]) => <tr key={key}><th scope="row">{s.label}<span className={styles.evidence}>{!s.identified ? "Equipment context incomplete · comparability unverified" : s.byDate.size < 2 ? "One observed date · insufficient longitudinal data" : `${s.byDate.size} observed dates · compare like-for-like sets`}</span></th>{days.map(d => <td key={d.date} className={cellClass(d.date)}>{s.byDate.has(d.date) ? s.byDate.get(d.date)!.map((r, i) => <span className={styles.setLine} key={i}>{setsLabel([r])}</span>) : <Missing />}</td>)}</tr>)}</tbody></table></div> : <p className={styles.hint}>No exercise sets recorded in these seven days.</p>}
        <p className={styles.hint}>? Missing load, reps or RIR. Drop sets are labelled; left and right sides stay separate. Set counts describe dose. Loads across different machines or gyms do not establish progression.</p>
      </Panel>
      <Panel title="4 · Snatch load checkpoints" subtitle="Successful stands / counted attempts, by date · quality ratings shown individually" wide>
        {loads.length ? <div className={styles.tableScroll}><table><thead>{dateHeads}</thead><tbody>{loads.map(load => <tr key={load}><th scope="row">{load} kg</th>{days.map(d => { const blocks = d.snatch.filter(b => b.weight_kg === load); const c = snatchCounts(blocks); return <td key={d.date} className={cellClass(d.date)}>{blocks.length ? <><strong>{c.complete ? `${c.stood}/${c.attempts}` : "? / ?"}{c.unknown ? " *" : ""}</strong><span className={styles.evidence}>quality {blocks.map(b => b.quality_10 ?? "?").join(", ")}/10</span></> : <Missing />}</td>; })}</tr>)}</tbody></table></div> : <p className={styles.hint}>No working-load checkpoints recorded.</p>}
        <p className={styles.hint}>Read technical consistency at the same load. Ratings are judgements, never averaged. A single date cannot establish a trend; small counts remain counts.</p>
      </Panel>
      <Panel title="5 · Calisthenics skill quality" subtitle="Quality /10 · successful attempts / attempts · timed holds in seconds" wide>
        {skills.size ? <div className={styles.tableScroll}><table><thead>{dateHeads}</thead><tbody>{[...skills.entries()].map(([key, s]) => <tr key={key}><th scope="row">{s.label}</th>{days.map(d => { const entries = d.skills.filter(e => e.skill_variation_id === s.variationId && e.assistance_id === s.assistanceId); return <td key={d.date} className={cellClass(d.date)}>{entries.length ? entries.map(e => { const r = skillResult(e, attempts); return <div key={e.id}><strong>{e.quality_10 == null ? <Missing>quality ?</Missing> : `${e.quality_10}/10`}</strong><span className={styles.evidence}>{r.successes ?? "?"}/{r.attempts ?? "?"} successful{r.unjudged ? ` · ${r.unjudged} unjudged` : ""}<br />hold {e.best_hold_seconds == null ? "?" : `${e.best_hold_seconds} s`}</span></div>; }) : <Missing />}</td>; })}</tr>)}</tbody></table></div> : <p className={styles.hint}>No skill observations recorded.</p>}
        <p className={styles.hint}>Variations and assistance stay separate. Quality, success counts and hold duration describe different capabilities. Missing ratings and unjudged attempts are not failures.</p>
      </Panel>
    </div>
    <p className={styles.limitations}>Reading this window: — no observation · ? incomplete measurement · 0 a recorded zero. Seven days describe what happened; repeated comparable observations are needed to establish progression.{data.importedSessions ? ` ${data.importedSessions} reconstructed sessions in this window are excluded from daily comparisons.` : ""}</p>
  </section>;
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return <div className={styles.stat}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}
function Panel({ title, subtitle, children, wide }: { title: string; subtitle: string; children: ReactNode; wide?: boolean }) {
  return <section className={`${styles.panel} ${wide ? styles.wide : ""}`}><h3>{title}</h3><p className={styles.subtitle}>{subtitle}</p>{children}</section>;
}
