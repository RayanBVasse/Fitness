import Link from "next/link";
import { getRecentSessions } from "@/lib/queries";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, Empty, Pill, SectionTitle } from "@/components/ui";
import { formatDuration, longDate, minutesBetween, weekdayName } from "@/lib/time";
import { WORKSTREAM_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { data, error } = await getRecentSessions(50);
  if (error) return <SetupNotice error={error} />;

  const sessions = data ?? [];

  return (
    <div className="space-y-4 pt-5">
      <header>
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-sm text-text-dim">Most recent sessions first.</p>
      </header>

      {sessions.length === 0 ? (
        <Card>
          <Empty>
            No sessions recorded yet. Start one on{" "}
            <Link href="/" className="underline underline-offset-2">
              Today
            </Link>
            , or import the Jan–Oct 2026 backfill once it has been reviewed.
          </Empty>
        </Card>
      ) : (
        <Card>
          <SectionTitle aside={`${sessions.length} shown`}>Sessions</SectionTitle>
          <ul className="divide-y divide-border">
            {sessions.map((session) => {
              const minutes = minutesBetween(session.started_at, session.ended_at);
              return (
                <li key={session.id} className="py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-semibold">
                      {longDate(session.session_date)}
                      <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-text-faint">
                        {weekdayName(session.session_date)}
                      </span>
                    </div>
                    <div className="tnum text-sm text-text-dim">{formatDuration(minutes)}</div>
                  </div>
                  <div className="mt-0.5 text-sm text-text-dim">
                    {session.gym ?? "Gym not recorded"}
                    {" · "}
                    {(session.workstreams ?? []).map((w) => WORKSTREAM_LABELS[w]).join(", ") ||
                      "no workstreams"}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {session.snatch_blocks > 0 ? (
                      <Pill tone="accent">{session.snatch_blocks} snatch blocks</Pill>
                    ) : null}
                    {session.hypertrophy_sets > 0 ? (
                      <Pill>{session.hypertrophy_sets} sets</Pill>
                    ) : null}
                    {session.calisthenics_entries > 0 ? (
                      <Pill>{session.calisthenics_entries} skill entries</Pill>
                    ) : null}
                    {session.provenance !== "logged" ? (
                      <Pill tone="caught">
                        {session.provenance === "historical_reconstruction"
                          ? "reconstructed"
                          : "imported"}
                      </Pill>
                    ) : null}
                  </div>
                  {session.notes ? (
                    <p className="mt-1.5 text-sm text-text-faint">{session.notes}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
