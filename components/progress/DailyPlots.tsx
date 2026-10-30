import type { DailyProgressData } from "@/lib/dailyProgress";
import { weekdayName } from "@/lib/time";
import styles from "./SevenDayProgress.module.css";

type Day = DailyProgressData["days"][number];
type Props = { days: Day[]; selected: string; onSelect: (date: string) => void };
const xAt = (i: number) => 36 + i * 50;
const yAt = (value: number, max: number) => 145 - value / max * 125;

function DateTargets({ days, selected, onSelect }: Props) {
  return <>{days.map((day, i) => <g key={day.date} role="button" tabIndex={0} aria-label={`Inspect ${day.date}`} aria-pressed={day.date === selected} className={styles.plotTarget}
    onClick={() => onSelect(day.date)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(day.date); } }}>
    <rect x={xAt(i) - 22} y={12} width={44} height={170} rx={5} className={day.date === selected ? styles.plotSelected : styles.plotHitArea} />
    <text x={xAt(i)} y={166} textAnchor="middle">{weekdayName(day.date).slice(0, 3)}</text><text x={xAt(i)} y={181} textAnchor="middle">{Number(day.date.slice(8))}</text>
  </g>)}</>;
}

export function RecoveryPlot({ days, selected, onSelect }: Props) {
  const series = [{ slug: "fatigue", label: "Fatigue", className: styles.fatigueLine }, { slug: "readiness", label: "Readiness", className: styles.readinessLine }];
  const metric = (day: Day, slug: string) => day.metrics.find(m => m.metric === slug)?.value_numeric ?? null;
  return <>
    <svg className={styles.plot} viewBox="0 0 372 194" role="group" aria-label="Daily fatigue and readiness, reported out of ten">
      {[0, 5, 10].map(v => <g key={v}><path d={`M20 ${yAt(v, 10)}H360`} className={styles.plotGrid} /><text x={12} y={yAt(v, 10) + 4} textAnchor="end">{v}</text></g>)}
      <DateTargets days={days} selected={selected} onSelect={onSelect} />
      {series.map(s => {
        // Missing dates break the line instead of inventing intermediate readings.
        const segments = days.slice(1).flatMap((day, i) => { const a = metric(days[i], s.slug), b = metric(day, s.slug); return a == null || b == null ? [] : [`M${xAt(i)} ${yAt(a, 10)}L${xAt(i + 1)} ${yAt(b, 10)}`]; });
        return <g key={s.slug} className={s.className} pointerEvents="none"><path d={segments.join(" ")} fill="none" stroke="currentColor" strokeWidth={2} />{days.map((day, i) => { const value = metric(day, s.slug); return value == null ? null : <circle key={day.date} cx={xAt(i)} cy={yAt(value, 10)} r={3.5} fill="currentColor"><title>{day.date}: {s.label} {value}/10</title></circle>; })}</g>;
      })}
    </svg>
    <div className={styles.legend}><span><i className={styles.fatigueKey} />Fatigue · solid</span><span><i className={styles.readinessKey} />Readiness · dashed</span></div>
  </>;
}

export function RepetitionPlot({ days, selected, onSelect, points }: Props & { points: { date: string; reps: number; sets: number; rir: number | null }[] }) {
  const max = Math.max(1, ...points.map(p => p.reps)) + 2;
  return <svg className={styles.plot} viewBox="0 0 372 194" role="group" aria-label="Repetitions per recorded working set at the selected equipment and load">
    {[0, Math.ceil(max / 2), max].map(v => <g key={v}><path d={`M20 ${yAt(v, max)}H360`} className={styles.plotGrid} /><text x={12} y={yAt(v, max) + 4} textAnchor="end">{v}</text></g>)}
    <DateTargets days={days} selected={selected} onSelect={onSelect} />
    {days.flatMap((day, i) => { const rows = points.filter(p => p.date === day.date); return rows.map((p, j) => <circle key={`${day.date}-${j}`} className={styles.repsDot} cx={xAt(i) + (j - (rows.length - 1) / 2) * Math.min(5, 18 / Math.max(1, rows.length - 1))} cy={yAt(p.reps, max)} r={4} pointerEvents="none"><title>{day.date}: {p.sets} sets × {p.reps} reps; RIR {p.rir ?? "unrecorded"}</title></circle>); })}
  </svg>;
}
