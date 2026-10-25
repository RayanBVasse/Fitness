import Link from "next/link";
import { Card } from "@/components/ui";
import { longDate, weekdayName } from "@/lib/time";
import { WORKSTREAM_LABELS } from "@/lib/types";
import type { SessionDigest } from "@/lib/queries";

/**
 * History as a scannable record rather than a stack of cards.
 *
 * Three things drove the layout:
 *   - Every imported session carries the same provenance sentence. Repeated 79
 *     times it is noise, so it is stated once at the top.
 *   - Only 7 of 79 sessions recorded a gym, so "gym not recorded" is omitted
 *     rather than printed on the other 72.
 *   - The number that makes a session worth remembering is the heaviest load
 *     stood, so it is the one figure set large on each row.
 *
 * The month strip is a single hue in three steps, by the heaviest load touched.
 * Two steps were useless here: 47.5 kg appears in almost every snatch session,
 * so a "heavy = 47.5 kg+" rule painted nearly every day the same. The break
 * that carries information is 50 kg, the load actually being contested.
 * Disciplines are text chips, never colour alone.
 */

/** Steps for the month strip, in kilograms. */
const WORKING_KG = 47.5;
const CONTESTED_KG = 50;

type Props = {
  sessions: SessionDigest[];
  /** Dates explicitly marked as rest, as opposed to simply never logged. */
  restDays: string[];
  reconstructedCount: number;
  heavyThresholdKg?: number | null;
};

export function HistoryList({ sessions, restDays, reconstructedCount }: Props) {
  const months = groupByMonth(sessions);
  const rested = new Set(restDays);
  const first = sessions.at(-1);
  const last = sessions.at(0);

  return (
    <div className="space-y-4 pt-5">
      <header>
        <h1 className="text-2xl font-bold leading-tight">History</h1>
        {first && last ? (
          <p className="text-sm text-text-dim">
            {sessions.length} sessions · {shortDate(first.date)} – {shortDate(last.date)}
          </p>
        ) : null}
      </header>

      {reconstructedCount > 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border px-3 py-2 text-[12px] leading-snug text-text-dim">
          <span className="font-semibold">{reconstructedCount} of these are reconstructed</span>{" "}
          from earlier records. Times of day were not captured, and most gym locations are
          unknown. Counts are shown only where the source recorded them.
        </p>
      ) : null}

      {months.map(({ key, label, days, entries }) => {
        const monthRest = [...rested].filter((d) => d.startsWith(key)).length;
        const monthHeaviest = maxOf(entries.map((s) => s.heaviestStoodKg));
        const monthAttempts = sum(entries.map((s) => s.snatchAttempts));
        const monthStood = sum(entries.map((s) => s.snatchStood));
        // Day -> intensity step, from the heaviest load touched that day.
        const byDay = new Map<number, number>();
        for (const session of entries) {
          const day = Number(session.date.slice(8, 10));
          const load = session.heaviestStoodKg ?? session.heaviestAttemptedKg ?? 0;
          byDay.set(day, Math.max(byDay.get(day) ?? 0, load));
        }

        return (
          <Card key={key} className="!p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold">{label}</h2>
              <div className="tnum text-[11px] text-text-faint">
                {entries.length} session{entries.length === 1 ? "" : "s"}
                {monthRest > 0 ? ` · ${monthRest} rest` : ""}
                {monthHeaviest !== null ? ` · best ${trim(monthHeaviest)} kg` : ""}
                {monthAttempts > 0 ? ` · ${monthStood}/${monthAttempts} stood` : ""}
              </div>
            </div>

            {/* One cell per calendar day: where the training actually fell. */}
            <div className="flex gap-[2px]" role="img" aria-label={`Training days in ${label}`}>
              {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                const load = byDay.get(day);
                const isRest = load === undefined && rested.has(`${key}-${pad(day)}`);
                return (
                  // Every day is reachable, including ones with nothing on
                  // them: an unrecorded rest day has no row anywhere else.
                  <Link
                    key={day}
                    href={`/day/${key}-${pad(day)}`}
                    title={`${day} ${label} — ${isRest ? "rest day (recorded)" : describeDay(load)}`}
                    className="flex h-5 flex-1 items-center justify-center rounded-[2px]"
                    style={{ background: stepFor(load) }}
                  >
                    {/* A recorded rest day is marked, not coloured: an unlogged
                        day and a rest day must not look like the same thing. */}
                    {isRest ? (
                      <span
                        aria-hidden
                        className="block h-[2px] w-1/2 rounded-full"
                        style={{ background: "var(--text-faint)" }}
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-faint">
              <LegendSwatch background={stepFor(CONTESTED_KG)} label={`${trim(CONTESTED_KG)} kg+`} />
              <LegendSwatch background={stepFor(WORKING_KG)} label={`${trim(WORKING_KG)} kg`} />
              <LegendSwatch background={stepFor(1)} label="lighter" />
              <LegendSwatch background={stepFor(undefined)} label="not logged" />
              <span className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className="flex h-2 w-2 items-center justify-center rounded-[2px]"
                  style={{ background: stepFor(undefined) }}
                >
                  <span className="block h-[1px] w-1/2" style={{ background: "var(--text-faint)" }} />
                </span>
                rest
              </span>
            </div>

            <ul className="mt-3 divide-y divide-border">
              {entries.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function SessionRow({ session }: { session: SessionDigest }) {
  const headline = headlineFor(session);
  const detail = detailFor(session);
  return (
    <li className="py-2.5">
      <Link href={`/day/${session.date}`} className="flex items-center gap-3">
      <div className="w-9 shrink-0 text-center">
        <div className="text-[10px] uppercase tracking-wide text-text-faint">
          {weekdayName(session.date).slice(0, 3)}
        </div>
        <div className="tnum text-lg font-semibold leading-none">{session.date.slice(8, 10)}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          {session.workstreams.length ? (
            session.workstreams.map((w) => <Chip key={w} label={WORKSTREAM_LABELS[w]} />)
          ) : (
            // Dates recovered from a readiness or context note, with no
            // training attached. Kept, because a rest day is data too.
            <span className="text-[11px] text-text-faint">Note only — no training logged</span>
          )}
          {session.gym ? <Chip label={session.gym} muted /> : null}
        </div>
        {detail ? (
          <div className="tnum mt-0.5 truncate text-[11px] text-text-dim">{detail}</div>
        ) : null}
      </div>

      <div className="shrink-0 text-right">
        <div className="tnum text-base font-semibold leading-none">{headline.value}</div>
        <div className="text-[10px] text-text-faint">{headline.label}</div>
      </div>
      </Link>
    </li>
  );
}

function Chip({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <span
      className="rounded px-1.5 py-[1px] text-[10px] font-semibold"
      style={{
        background: "var(--surface-2)",
        color: muted ? "var(--text-faint)" : "var(--text-dim)",
      }}
    >
      {label}
    </span>
  );
}

function LegendSwatch({ background, label }: { background: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-[2px]" style={{ background }} aria-hidden />
      {label}
    </span>
  );
}

/** One hue, light to dark, by the heaviest load touched that day. */
function stepFor(load: number | undefined): string {
  if (load === undefined) return "var(--surface-2)";
  if (load >= CONTESTED_KG) return "var(--accent)";
  if (load >= WORKING_KG) return "color-mix(in oklab, var(--accent) 62%, var(--surface-2))";
  return "color-mix(in oklab, var(--accent) 30%, var(--surface-2))";
}

function describeDay(load: number | undefined): string {
  if (load === undefined) return "rest";
  if (load === 0) return "trained, no snatch load recorded";
  return `heaviest ${trim(load)} kg`;
}

/** The one figure the session is judged on, by whichever discipline dominated. */
function headlineFor(session: SessionDigest): { value: string; label: string } {
  if (session.heaviestStoodKg !== null) {
    return { value: `${trim(session.heaviestStoodKg)} kg`, label: "stood" };
  }
  if (session.heaviestAttemptedKg !== null) {
    return { value: `${trim(session.heaviestAttemptedKg)} kg`, label: "attempted" };
  }
  if (session.volumeLoadKg > 0) {
    return { value: `${Math.round(session.volumeLoadKg).toLocaleString("en-GB")}`, label: "kg volume" };
  }
  if (session.bestHoldSeconds !== null) {
    return { value: `${trim(session.bestHoldSeconds)}s`, label: "best hold" };
  }
  return { value: "—", label: "" };
}

function detailFor(session: SessionDigest): string {
  const parts: string[] = [];
  if (session.snatchAttempts > 0) {
    const caught = session.snatchReceivedNotStood;
    parts.push(
      `${session.snatchStood}/${session.snatchAttempts} stood` +
        (caught > 0 ? `, ${caught} caught` : ""),
    );
  }
  if (session.hypertrophySets > 0) {
    parts.push(`${session.hypertrophySets} set${session.hypertrophySets === 1 ? "" : "s"}`);
  }
  if (session.calisthenicsEntries > 0) {
    parts.push(
      `${session.calisthenicsEntries} skill ${session.calisthenicsEntries === 1 ? "entry" : "entries"}`,
    );
  }
  // The promotion note is identical on every imported session; the banner says
  // it once. Anything else is a real note and worth showing.
  const note = session.notes?.startsWith("Created by backfill promotion") ? null : session.notes;
  if (note) parts.push(note);
  // Empty is better than "no counts recorded" on dozens of rows: the headline
  // already says the load was attempted rather than stood.
  return parts.join(" · ");
}

function groupByMonth(sessions: SessionDigest[]) {
  const months = new Map<string, SessionDigest[]>();
  for (const session of sessions) {
    const key = session.date.slice(0, 7);
    const bucket = months.get(key);
    if (bucket) bucket.push(session);
    else months.set(key, [session]);
  }
  return [...months.entries()].map(([key, entries]) => {
    const [year, month] = key.split("-").map(Number);
    return {
      key,
      label: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(
        new Date(Date.UTC(year, month - 1, 1)),
      ),
      days: new Date(Date.UTC(year, month, 0)).getUTCDate(),
      entries,
    };
  });
}

function shortDate(iso: string): string {
  return longDate(iso).replace(/(\d+) (\w+) (\d+)/, "$1 $2 $3");
}

function sum(values: number[]): number {
  return values.reduce<number>((total, value) => total + value, 0);
}

function maxOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? Math.max(...present) : null;
}

function pad(day: number): string {
  return String(day).padStart(2, "0");
}

function trim(value: number): string {
  return String(Number(value));
}
