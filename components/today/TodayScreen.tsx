"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { SnatchLogger } from "@/components/today/SnatchLogger";
import { DailyCheckIn } from "@/components/today/DailyCheckIn";
import { HypertrophyLogger } from "@/components/today/HypertrophyLogger";
import { CalisthenicsLogger } from "@/components/today/CalisthenicsLogger";
import { DayNotes } from "@/components/today/DayNotes";
import { DayPerformance } from "@/components/today/DayPerformance";
import { Card, Chip, Pill, SectionTitle, wsColour } from "@/components/ui";
import { isoWeekday, londonTime, longDate, weekdayName, daysBetween } from "@/lib/time";
import {
  WORKSTREAM_LABELS,
  type AssistanceType,
  type CalisthenicsEntry,
  type ContextNote,
  type Exercise,
  type Gym,
  type HypertrophySet,
  type LastExerciseSetting,
  type LastSkillSetting,
  type MuscleGroup,
  type MuscleRegion,
  type Skill,
  type SkillVariation,
  type Session,
  type SessionBlock,
  type SessionSummary,
  type SnatchBlock,
  type SnatchObjective,
  type DailyMetric,
  type DailyMetricDef,
  type DayRecord,
  type SnatchVariation,
  type WeekdayThemes,
  type WarmupLadder,
  type WeightPreset,
  type Workstream,
} from "@/lib/types";

type Props = {
  date: string;
  day: DayRecord | null;
  metricDefs: DailyMetricDef[];
  metrics: DailyMetric[];
  lastMetricValues: (DailyMetric & { metric_date: string })[];
  sessions: Session[];
  blocks: SessionBlock[];
  snatchBlocks: SnatchBlock[];
  hypertrophySets: HypertrophySet[];
  calisthenicsEntries: CalisthenicsEntry[];
  lastExerciseSettings: LastExerciseSetting[];
  lastSkillSettings: LastSkillSetting[];
  recentExerciseIds: number[];
  recentSkillVariationIds: number[];
  muscleGroups: MuscleGroup[];
  muscleRegions: MuscleRegion[];
  exercises: Exercise[];
  skills: Skill[];
  skillVariations: SkillVariation[];
  assistanceTypes: AssistanceType[];
  lastSession: SessionSummary | null;
  notes: ContextNote[];
  gyms: Gym[];
  presets: WeightPreset[];
  variations: SnatchVariation[];
  ladder: WarmupLadder | null;
  objective: SnatchObjective | null;
  weekdayThemes: WeekdayThemes;
};

const WORKSTREAMS: Workstream[] = ["snatch", "hypertrophy", "calisthenics"];
const TAB_KEY = "fitness.workstream-tab";

/**
 * A logger card wears its workstream: a bar across the top and a tinted
 * border. Enough to tell the three apart while scrolling one-handed, without
 * a colour field behind the numbers you are trying to read.
 */
function workstreamCard(workstream: Workstream) {
  const hue = wsColour(workstream);
  return {
    borderColor: `color-mix(in oklab, ${hue} 35%, var(--border))`,
    boxShadow: `inset 0 3px 0 ${hue}`,
  };
}

export function TodayScreen({
  date,
  day,
  metricDefs,
  metrics,
  lastMetricValues,
  sessions,
  blocks,
  snatchBlocks,
  hypertrophySets,
  calisthenicsEntries,
  lastExerciseSettings,
  lastSkillSettings,
  recentExerciseIds,
  recentSkillVariationIds,
  muscleGroups,
  muscleRegions,
  exercises,
  skills,
  skillVariations,
  assistanceTypes,
  lastSession,
  notes,
  gyms,
  presets,
  variations,
  ladder,
  objective,
  weekdayThemes,
}: Props) {
  const router = useRouter();
  // Reaching this screen at all means the middleware accepted a session, so
  // there is nothing further to check before allowing a write.
  const canWrite = true;
  // You usually go back to the same gym, so that is the default rather than
  // a blank. Changing it is one tap.
  const theme = weekdayThemes[String(isoWeekday(date))] ?? null;

  const [gymId, setGymId] = useState<number | null>(
    () => gyms.find((g) => g.name === lastSession?.gym)?.id ?? null,
  );
  // Most days have one visit. When there are two, the latest is the one being
  // logged into, and the other stays reachable rather than hidden.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Workstream>("snatch");

  // Which tab you were on, remembered per browser. It is a view preference,
  // not a fact about training, so it has no business in Postgres.
  useEffect(() => {
    const stored = (() => {
      try {
        return window.localStorage.getItem(TAB_KEY);
      } catch {
        // Private window, blocked storage: fall through to the suggestion.
        return null;
      }
    })();
    const remembered =
      stored && (WORKSTREAMS as string[]).includes(stored) ? (stored as Workstream) : null;
    // Nothing remembered: the weekday's stated focus, else what the last
    // visit contained. A preference about what to show, never a block.
    const next = remembered ?? theme?.focus ?? lastSession?.workstreams?.[0] ?? null;
    // Browser storage cannot be read during render without a hydration
    // mismatch, since the server has no access to it. An effect is the only
    // place this can happen, which is what the rule below is about.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (next) setTab(next);
    // Deliberately once, on mount: after that the tab is yours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseTab(next: Workstream) {
    setTab(next);
    try {
      window.localStorage.setItem(TAB_KEY, next);
    } catch {
      /* nothing to do: the tab simply will not be remembered */
    }
  }
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(task: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const session =
    sessions.find((s) => s.id === activeId) ?? sessions[sessions.length - 1] ?? null;
  const sessionBlocks = blocks.filter((b) => b.session_id === session?.id);
  const sessionSnatchBlocks = snatchBlocks.filter((b) => b.session_id === session?.id);
  const sessionHypertrophy = hypertrophySets.filter((h) => h.session_id === session?.id);
  const sessionCalisthenics = calisthenicsEntries.filter((c) => c.session_id === session?.id);

  /** What each tab has to show for itself. Nothing recorded reads as a dash,
   *  not a zero: zero sets is a measurement, and this is an absence. */
  function tabTotal(workstream: Workstream): string {
    if (workstream === "snatch") {
      const lifts = sessionSnatchBlocks.reduce(
        (total, b) => total + Number(b.attempts ?? 0),
        0,
      );
      // "Attempts", not "lifts": this counts pulls and bottom stands too, and
      // those are not snatches. The footer's success rate excludes them.
      return lifts > 0 ? `${lifts} attempt${lifts === 1 ? "" : "s"}` : "—";
    }
    if (workstream === "hypertrophy") {
      const n = sessionHypertrophy.length;
      return n > 0 ? `${n} set${n === 1 ? "" : "s"}` : "—";
    }
    const n = sessionCalisthenics.length;
    return n > 0 ? `${n} skill${n === 1 ? "" : "s"}` : "—";
  }

  const snatchBlock = sessionBlocks.find((b) => b.workstream === "snatch") ?? null;
  const hypertrophyBlock = sessionBlocks.find((b) => b.workstream === "hypertrophy") ?? null;
  const calisthenicsBlock = sessionBlocks.find((b) => b.workstream === "calisthenics") ?? null;
  return (
    <div className="space-y-4 pt-5">
      {/* Date, day and gym are shown rather than asked for. */}
      <header>
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-faint">
          {weekdayName(date)}
        </div>
        <h1 className="text-2xl font-bold leading-tight">{longDate(date)}</h1>
        {theme ? (
          <p className="mt-0.5 text-sm">
            <span className="font-semibold" style={{ color: "var(--accent)" }}>
              {theme.name}
            </span>
            {theme.emphasis ? (
              <span className="text-text-dim"> · {theme.emphasis}</span>
            ) : null}
          </p>
        ) : null}
      </header>

      {objective ? (
        <Card className="!p-3">
          <div className="text-[11px] uppercase tracking-wide text-text-faint">
            Current objective
          </div>
          <p className="mt-0.5 text-sm leading-snug">{objective.statement}</p>
          <div className="mt-2 flex gap-1.5">
            <Pill tone="accent">{objective.primary_load_kg} kg</Pill>
            <Pill tone="stood">target {objective.primary_target_stand_rate_pct}%</Pill>
            <Pill tone="caught">{objective.secondary_load_kg} kg not yet stood</Pill>
          </div>
        </Card>
      ) : null}

      {metricDefs.length > 0 ? (
        <Card>
          <DailyCheckIn
            date={date}
            defs={metricDefs}
            saved={metrics}
            lastValues={lastMetricValues}
            canWrite={canWrite}
          />
        </Card>
      ) : null}

      {!session && day?.status === "rest" ? (
        <Card>
          <SectionTitle>Rest day</SectionTitle>
          <p className="text-sm text-text-dim">
            Recorded as rest. That is a fact about today, not a gap in the record — it counts
            towards recovery intervals and training frequency.
          </p>
          <button
            type="button"
            disabled={!canWrite || busy}
            onClick={() =>
              run(async () => {
                await write({ action: "set_day_status", date, status: "unlogged" });
              })
            }
            className="mt-3 min-h-[44px] w-full rounded-[var(--radius)] border border-border text-sm font-semibold disabled:opacity-40"
          >
            Undo rest day
          </button>
        </Card>
      ) : !session ? (
        <Card>
          <SectionTitle>No session today</SectionTitle>
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-text-faint">
                Gym
              </div>
              <div className="grid grid-cols-2 gap-2">
                {gyms.map((gym) => (
                  <button
                    key={gym.id}
                    type="button"
                    onClick={() => setGymId(gym.id === gymId ? null : gym.id)}
                    aria-pressed={gymId === gym.id}
                    className="min-h-[42px] rounded-[var(--radius)] border px-2 text-sm font-semibold"
                    style={{
                      borderColor: gymId === gym.id ? "var(--accent)" : "var(--border)",
                      color: gymId === gym.id ? "var(--accent)" : "var(--text)",
                      background: "var(--surface-2)",
                    }}
                  >
                    {gym.name}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={() =>
                run(async () => {
                  await write({
                    action: "start_session",
                    gym_id: gymId,
                    session_date: date,
                    started_at: new Date().toISOString(),
                  });
                })
              }
              className="min-h-[52px] w-full rounded-[var(--radius)] text-base font-bold disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
            >
              Start session
            </button>

            {lastSession ? (
              <button
                type="button"
                disabled={!canWrite || busy}
                onClick={() =>
                  run(async () => {
                    await write<{ session: Session }>({
                      action: "start_session",
                      gym_id: lastSession.gym
                        ? (gyms.find((g) => g.name === lastSession.gym)?.id ?? null)
                        : null,
                      session_date: date,
                      started_at: new Date().toISOString(),
                    });
                    // The gym and the tab you land on, not the blocks. Copying
                    // blocks would make today claim yesterday's workstreams
                    // before anything had been recorded.
                    const first = lastSession.workstreams?.[0];
                    if (first) chooseTab(first);
                  })
                }
                className="min-h-[48px] w-full rounded-[var(--radius)] border border-border text-sm font-semibold disabled:opacity-40"
              >
                Repeat previous session
                <span className="ml-1 font-normal text-text-faint">
                  {lastSession.gym ?? "no gym"} ·{" "}
                  {(lastSession.workstreams ?? []).map((w) => WORKSTREAM_LABELS[w]).join(", ") ||
                    "no workstreams"}
                </span>
              </button>
            ) : null}

            {/* A rest day is data. Marking it is what makes "days since last
                heavy session" and "consecutive training days" trustworthy. */}
            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={() =>
                run(async () => {
                  await write({ action: "set_day_status", date, status: "rest" });
                })
              }
              className="min-h-[44px] w-full rounded-[var(--radius)] border border-dashed border-border text-sm font-semibold text-text-dim disabled:opacity-40"
            >
              Mark today as a rest day
            </button>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            {/* No clocks. Session times were never actually recorded, and
                showing them implied a precision that did not exist. */}
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-text-faint">
                Gym
              </div>
              <div className="flex flex-wrap gap-1.5">
                {gyms.map((gym) => {
                  const on = session.gym_id === gym.id;
                  return (
                    <Chip
                      key={gym.id}
                      on={on}
                      disabled={!canWrite || busy}
                      onClick={() =>
                        run(async () => {
                          await write({
                            action: "update_session",
                            session_id: session.id,
                            gym_id: on ? null : gym.id,
                          });
                        })
                      }
                    >
                      {gym.name}
                    </Chip>
                  );
                })}
              </div>
            </div>

            {sessions.length > 1 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {sessions.map((s, index) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    aria-pressed={s.id === session?.id}
                    className="min-h-[36px] rounded-[var(--radius)] border px-3 text-xs font-semibold"
                    style={{
                      borderColor: s.id === session?.id ? "var(--accent)" : "var(--border)",
                      color: s.id === session?.id ? "var(--accent)" : "var(--text-dim)",
                    }}
                  >
                    Visit {index + 1}
                    {s.started_at ? ` · ${londonTime(s.started_at)}` : ""}
                  </button>
                ))}
              </div>
            ) : null}

          </Card>

          {/* One work area, three tabs. Selecting a tab records nothing: the
              block for a workstream is created by its first set, lift or
              skill entry, server-side. The inactive panels stay mounted and
              are merely hidden, so a half-typed entry survives a switch. */}
          <Card style={workstreamCard(tab)}>
            <div
              role="tablist"
              aria-label="Workstream"
              className="mb-3 flex gap-1 rounded-[var(--radius)] p-1"
              style={{ background: "var(--surface-2)" }}
            >
              {WORKSTREAMS.map((workstream) => {
                const on = tab === workstream;
                const hue = wsColour(workstream);
                return (
                  <button
                    key={workstream}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => chooseTab(workstream)}
                    className="min-h-[44px] flex-1 rounded-[calc(var(--radius)-4px)] px-1 text-xs font-bold"
                    style={{
                      background: on ? "var(--surface)" : "transparent",
                      color: on ? hue : "var(--text-dim)",
                      boxShadow: on ? `inset 0 -2px 0 ${hue}` : undefined,
                    }}
                  >
                    <span className="block truncate">{WORKSTREAM_LABELS[workstream]}</span>
                    <span className="tnum block text-[10px] font-normal text-text-dim">
                      {tabTotal(workstream)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: tab === "snatch" ? undefined : "none" }}>
              {/* Keyed on the session: the logger seeds its state from these
                  blocks on mount, so switching visits must remount it rather
                  than leave the previous visit's blocks on screen. */}
              <SnatchLogger
                key={session.id}
                sessionId={session.id}
                sessionBlockId={snatchBlock?.id ?? null}
                presets={presets}
                variations={variations}
                ladder={ladder}
                initialBlocks={sessionSnatchBlocks}
                canWrite={canWrite}
              />
              <div className="mt-3">
                <DayNotes
                  date={date}
                  sessionId={session.id}
                  workstream="snatch"
                  notes={notes}
                  canWrite={canWrite}
                />
              </div>
            </div>

            <div style={{ display: tab === "hypertrophy" ? undefined : "none" }}>
              <HypertrophyLogger
                key={`h-${session.id}`}
                sessionId={session.id}
                sessionBlockId={hypertrophyBlock?.id ?? null}
                gymId={session.gym_id}
                exercises={exercises}
                muscleGroups={muscleGroups}
                muscleRegions={muscleRegions}
                regionHint={theme?.emphasis ?? null}
                recentExerciseIds={recentExerciseIds}
                lastSettings={lastExerciseSettings}
                initialSets={sessionHypertrophy}
                canWrite={canWrite}
              />
              <div className="mt-3">
                <DayNotes
                  date={date}
                  sessionId={session.id}
                  workstream="hypertrophy"
                  notes={notes}
                  canWrite={canWrite}
                />
              </div>
            </div>

            <div style={{ display: tab === "calisthenics" ? undefined : "none" }}>
              <CalisthenicsLogger
                key={`c-${session.id}`}
                sessionId={session.id}
                sessionBlockId={calisthenicsBlock?.id ?? null}
                skills={skills}
                variations={skillVariations}
                assistanceTypes={assistanceTypes}
                recentVariationIds={recentSkillVariationIds}
                lastSettings={lastSkillSettings}
                initialEntries={sessionCalisthenics}
                canWrite={canWrite}
              />
              <div className="mt-3">
                <DayNotes
                  date={date}
                  sessionId={session.id}
                  workstream="calisthenics"
                  notes={notes}
                  canWrite={canWrite}
                />
              </div>
            </div>
          </Card>

          <Card>
            <DayPerformance
              snatchBlocks={sessionSnatchBlocks}
              hypertrophySets={sessionHypertrophy}
              calisthenicsEntries={sessionCalisthenics}
              variations={variations}
              exercises={exercises}
              muscleGroups={muscleGroups}
            />
          </Card>
        </>
      )}

      {error ? (
        <p className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}

      {/* The day's own notes: the gym, the body, anything the Coach should
          know that is not attached to one workstream. These replaced the
          check-in's free-text dimensions, which lived in a table of
          measurements and were never measurements. */}
      <Card>
        <DayNotes
          date={date}
          sessionId={session?.id ?? null}
          notes={notes}
          canWrite={canWrite}
        />
      </Card>

      {lastSession ? (
        <Card>
          <SectionTitle
            aside={`${daysBetween(lastSession.session_date, date)} day${
              daysBetween(lastSession.session_date, date) === 1 ? "" : "s"
            } ago`}
          >
            Last recorded workout
          </SectionTitle>
          <div className="flex items-baseline justify-between">
            <div>
              <div className="font-semibold">{longDate(lastSession.session_date)}</div>
              <div className="text-sm text-text-dim">
                {lastSession.gym ?? "Gym not recorded"}
                {" · "}
                {(lastSession.workstreams ?? [])
                  .map((w) => WORKSTREAM_LABELS[w])
                  .join(", ") || "no workstreams recorded"}
              </div>
            </div>
            <div className="tnum text-right text-sm text-text-dim">
              {lastSession.snatch_blocks > 0 ? <div>{lastSession.snatch_blocks} snatch</div> : null}
              {lastSession.hypertrophy_sets > 0 ? (
                <div>{lastSession.hypertrophy_sets} sets</div>
              ) : null}
              {lastSession.calisthenics_entries > 0 ? (
                <div>{lastSession.calisthenics_entries} skills</div>
              ) : null}
            </div>
          </div>
          {lastSession.provenance !== "logged" ? (
            <div className="mt-2">
              <Pill>reconstructed record</Pill>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
