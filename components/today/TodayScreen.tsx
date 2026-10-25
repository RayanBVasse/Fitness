"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePasscode, write } from "@/lib/write";
import { PasscodeGate } from "@/components/PasscodeGate";
import { SnatchLogger } from "@/components/today/SnatchLogger";
import { Card, Empty, Pill, SectionTitle, Stat } from "@/components/ui";
import {
  formatDuration,
  londonTime,
  longDate,
  minutesBetween,
  weekdayName,
  daysBetween,
} from "@/lib/time";
import {
  WORKSTREAM_LABELS,
  type FailureMode,
  type Gym,
  type Session,
  type SessionBlock,
  type SessionSummary,
  type SnatchBlock,
  type SnatchObjective,
  type SnatchVariation,
  type WarmupLadder,
  type WeightPreset,
  type Workstream,
} from "@/lib/types";

type Props = {
  date: string;
  session: Session | null;
  blocks: SessionBlock[];
  snatchBlocks: SnatchBlock[];
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
  session,
  blocks,
  snatchBlocks,
  lastSession,
  gyms,
  presets,
  variations,
  failureModes,
  ladder,
  objective,
}: Props) {
  const router = useRouter();
  // Both this screen and the gate read the same external store, so unlocking
  // enables the controls without any state being copied around.
  const canWrite = Boolean(usePasscode());
  const [gymId, setGymId] = useState<number | null>(null);
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

  const snatchBlock = blocks.find((b) => b.workstream === "snatch") ?? null;
  const sessionMinutes = session ? minutesBetween(session.started_at, session.ended_at) : null;
  const elapsed =
    session?.started_at && !session.ended_at
      ? minutesBetween(session.started_at, new Date().toISOString())
      : null;

  return (
    <div className="space-y-4 pt-5">
      {/* Date, day and gym are shown rather than asked for. */}
      <header>
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-faint">
          {weekdayName(date)}
        </div>
        <h1 className="text-2xl font-bold leading-tight">{longDate(date)}</h1>
      </header>

      <PasscodeGate />

      {objective ? (
        <Card className="!p-3">
          <div className="text-[11px] uppercase tracking-wide text-text-faint">
            Current objective
          </div>
          <p className="mt-0.5 text-sm leading-snug">{objective.statement}</p>
          <div className="mt-2 flex gap-1.5">
            <Pill tone="accent">
              {objective.primary_load_kg} kg now {objective.primary_current_stand_rate_pct}%
            </Pill>
            <Pill tone="stood">target {objective.primary_target_stand_rate_pct}%</Pill>
            <Pill tone="caught">{objective.secondary_load_kg} kg not yet stood</Pill>
          </div>
        </Card>
      ) : null}

      {!session ? (
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
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-3 gap-3">
              <Stat
                label="Gym"
                value={
                  gyms.find((g) => g.id === session.gym_id)?.name ??
                  session.gym_custom_label ??
                  "—"
                }
              />
              <Stat
                label="Started"
                value={session.started_at ? londonTime(session.started_at) : "—"}
              />
              <Stat
                label={session.ended_at ? "Duration" : "Elapsed"}
                value={formatDuration(sessionMinutes ?? elapsed)}
              />
            </div>

            <div className="mt-4">
              <SectionTitle>Workstreams this visit</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {WORKSTREAMS.map((workstream) => {
                  const existing = blocks.find((b) => b.workstream === workstream);
                  const minutes = existing
                    ? (existing.duration_minutes ??
                      minutesBetween(existing.started_at, existing.ended_at))
                    : null;
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
                      {minutes !== null ? (
                        <span className="tnum ml-1 font-normal">{minutes} min</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-text-faint">
                One visit, several disciplines. Each keeps its own clock.
              </p>
            </div>

            {!canWrite ? (
              <p className="mt-3 text-[11px] text-text-faint">
                Read-only. Enter the passcode above to log.
              </p>
            ) : null}
          </Card>

          <Card>
            <SnatchLogger
              sessionId={session.id}
              sessionBlockId={snatchBlock?.id ?? null}
              presets={presets}
              variations={variations}
              failureModes={failureModes}
              ladder={ladder}
              initialBlocks={snatchBlocks}
              canWrite={canWrite}
            />
          </Card>

          <Card>
            <SectionTitle>Calisthenics · Hypertrophy</SectionTitle>
            <Empty>
              Logging for these two workstreams arrives in Phase 2 and Phase 3. The schema and
              libraries are already in place, so nothing here needs re-entering later.
            </Empty>
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
