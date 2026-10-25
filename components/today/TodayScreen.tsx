"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { SnatchLogger } from "@/components/today/SnatchLogger";
import { DailyCheckIn } from "@/components/today/DailyCheckIn";
import { HypertrophyLogger } from "@/components/today/HypertrophyLogger";
import { CalisthenicsLogger } from "@/components/today/CalisthenicsLogger";
import { Card, Pill, SectionTitle } from "@/components/ui";
import { londonTime, longDate, weekdayName, daysBetween } from "@/lib/time";
import {
  WORKSTREAM_LABELS,
  type AssistanceType,
  type CalisthenicsEntry,
  type Exercise,
  type FailureMode,
  type Gym,
  type HypertrophySet,
  type LastExerciseSetting,
  type LastSkillSetting,
  type MuscleGroup,
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
  exercises: Exercise[];
  skills: Skill[];
  skillVariations: SkillVariation[];
  assistanceTypes: AssistanceType[];
  lastSession: SessionSummary | null;
  gyms: Gym[];
  presets: WeightPreset[];
  variations: SnatchVariation[];
  failureModes: FailureMode[];
  ladder: WarmupLadder | null;
  objective: SnatchObjective | null;
};

const WORKSTREAMS: Workstream[] = ["snatch", "calisthenics", "hypertrophy"];

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
  exercises,
  skills,
  skillVariations,
  assistanceTypes,
  lastSession,
  gyms,
  presets,
  variations,
  failureModes,
  ladder,
  objective,
}: Props) {
  const router = useRouter();
  // Reaching this screen at all means the middleware accepted a session, so
  // there is nothing further to check before allowing a write.
  const canWrite = true;
  // You usually go back to the same gym, so that is the default rather than
  // a blank. Changing it is one tap.
  const [gymId, setGymId] = useState<number | null>(
    () => gyms.find((g) => g.name === lastSession?.gym)?.id ?? null,
  );
  // Most days have one visit. When there are two, the latest is the one being
  // logged into, and the other stays reachable rather than hidden.
  const [activeId, setActiveId] = useState<string | null>(null);
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
                    className="min-h-[48px] rounded-[var(--radius)] border px-3 text-sm font-semibold"
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
                    const created = await write<{ session: Session }>({
                      action: "start_session",
                      gym_id: lastSession.gym
                        ? (gyms.find((g) => g.name === lastSession.gym)?.id ?? null)
                        : null,
                      session_date: date,
                      started_at: new Date().toISOString(),
                    });
                    // Recreate the same workstream blocks, so a repeat visit is
                    // one tap rather than three.
                    for (const workstream of lastSession.workstreams ?? []) {
                      await write({
                        action: "add_block",
                        session_id: created.session.id,
                        workstream,
                      });
                    }
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
              <div className="grid grid-cols-2 gap-2">
                {gyms.map((gym) => {
                  const on = session.gym_id === gym.id;
                  return (
                    <button
                      key={gym.id}
                      type="button"
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
                      aria-pressed={on}
                      className="min-h-[44px] rounded-[var(--radius)] border px-2 text-sm font-semibold disabled:opacity-40"
                      style={{
                        borderColor: on ? "var(--accent)" : "var(--border)",
                        color: on ? "var(--accent)" : "var(--text-dim)",
                        background: on ? "var(--surface-2)" : "transparent",
                      }}
                    >
                      {gym.name}
                    </button>
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

            <div className="mt-4">
              <SectionTitle>Workstreams this visit</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {WORKSTREAMS.map((workstream) => {
                  const existing = sessionBlocks.find((b) => b.workstream === workstream);
                  return (
                    <button
                      key={workstream}
                      type="button"
                      disabled={!canWrite || busy || Boolean(existing)}
                      onClick={() =>
                        run(async () => {
                          await write({
                            action: "add_block",
                            session_id: session.id,
                            workstream,
                          });
                        })
                      }
                      className="min-h-[44px] rounded-[var(--radius)] border px-3 text-sm font-semibold disabled:opacity-100"
                      style={{
                        borderColor: existing ? "var(--accent)" : "var(--border)",
                        color: existing ? "var(--accent)" : "var(--text-dim)",
                        background: existing ? "var(--surface-2)" : "transparent",
                      }}
                    >
                      {existing ? "" : "+ "}
                      {WORKSTREAM_LABELS[workstream]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-text-faint">
                One visit, several disciplines.
              </p>
            </div>

          </Card>

          <Card>
            {/* Keyed on the session: the logger seeds its state from these
                blocks on mount, so switching visits must remount it rather
                than leave the previous visit's blocks on screen. */}
            <SnatchLogger
              key={session.id}
              sessionId={session.id}
              sessionBlockId={snatchBlock?.id ?? null}
              presets={presets}
              variations={variations}
              failureModes={failureModes}
              ladder={ladder}
              initialBlocks={sessionSnatchBlocks}
              canWrite={canWrite}
            />
          </Card>

          <Card>
            <HypertrophyLogger
              key={`h-${session.id}`}
              sessionId={session.id}
              sessionBlockId={hypertrophyBlock?.id ?? null}
              gymId={session.gym_id}
              exercises={exercises}
              muscleGroups={muscleGroups}
              recentExerciseIds={recentExerciseIds}
              lastSettings={lastExerciseSettings}
              initialSets={sessionHypertrophy}
              canWrite={canWrite}
            />
          </Card>

          <Card>
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
          </Card>
        </>
      )}

      {error ? (
        <p className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}

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
