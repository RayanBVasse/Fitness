import Link from "next/link";
import { getProgress, getReferenceData, getSnatchSuccessBySource } from "@/lib/queries";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, InsufficientData, SectionTitle } from "@/components/ui";
import {
  CalisthenicsProgress,
  HypertrophyProgress,
  SnatchProgress,
} from "@/components/progress/ProgressSections";

export const dynamic = "force-dynamic";

/**
 * Imported history and newly logged training are shown side by side and never
 * averaged. A single blended figure would bury each new session in ten months
 * of reconstruction, which is the opposite of what this screen is for.
 *
 * Nothing here is stored: every figure is computed from the rows, so it cannot
 * drift from the data the way a frozen baseline did.
 */
const PERIODS: { label: string; weeks: number | null }[] = [
  { label: "4 weeks", weeks: 4 },
  { label: "8 weeks", weeks: 8 },
  { label: "12 weeks", weeks: 12 },
  { label: "All", weeks: null },
];

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string }>;
}) {
  const { weeks: weeksParam } = await searchParams;
  const period =
    PERIODS.find((p) => String(p.weeks ?? "all") === weeksParam) ?? PERIODS[1];

  const [{ data, error }, reference, progress] = await Promise.all([
    getSnatchSuccessBySource(),
    getReferenceData(),
    getProgress(period.weeks),
  ]);
  if (error) return <SetupNotice error={error} />;

  const rows = data ?? [];
  const objective = reference.objective;
  const weights = [...new Set(rows.map((r) => Number(r.weight_kg)))].sort((a, b) => a - b);
  const at = (weight: number, source: "imported" | "logged") =>
    rows.find((r) => Number(r.weight_kg) === weight && r.source === source) ?? null;

  const primary = objective?.primary_load_kg ?? 50;
  const primaryImported = at(primary, "imported");
  const primaryLogged = at(primary, "logged");

  return (
    <div className="space-y-4 pt-5">
      <header>
        <h1 className="text-2xl font-bold">Progress</h1>
        <p className="text-sm text-text-dim">
          Substantiated blocks only — those recording both attempts and stands.
        </p>
      </header>

      {/* The window every chart below is drawn over. A link rather than a
          control, so the page stays server-rendered and a period is a place
          you can return to. */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period">
        {PERIODS.map((p) => {
          const on = p.weeks === period.weeks;
          return (
            <Link
              key={p.label}
              href={`/progress?weeks=${p.weeks ?? "all"}`}
              aria-current={on ? "true" : undefined}
              className="min-h-[38px] rounded-full border px-3 text-xs font-semibold leading-[34px]"
              style={{
                borderColor: on ? "var(--accent)" : "var(--border)",
                color: on ? "var(--accent)" : "var(--text-dim)",
                background: on ? "color-mix(in oklab, var(--accent) 8%, transparent)" : "transparent",
              }}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      <SnatchProgress data={progress} />
      <HypertrophyProgress data={progress} regions={reference.muscleRegions} />
      <CalisthenicsProgress data={progress} />

      {objective ? (
        <Card>
          <SectionTitle>Primary objective</SectionTitle>
          <p className="text-sm leading-snug">{objective.statement}</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Figure
              label="Imported"
              value={primaryImported?.stand_rate_pct}
              hint={primaryImported ? `${primaryImported.attempts} attempts` : "no history"}
            />
            <Figure
              label="Logged since"
              value={primaryLogged?.stand_rate_pct}
              hint={primaryLogged ? `${primaryLogged.attempts} attempts` : "none yet"}
            />
            <Figure label="Target" value={objective.primary_target_stand_rate_pct} hint="stand rate" />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-text-faint">
            Imported is the Jan–Oct 2026 reconstruction at {primary} kg. It is a starting point,
            never merged with what you log from here.
          </p>
        </Card>
      ) : null}

      <Card>
        <SectionTitle aside="stand / receive">By load</SectionTitle>
        {rows.length === 0 ? (
          <InsufficientData reason="No substantiated snatch blocks yet. Rates appear once a block records both attempts and stands." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-text-faint">
                <th className="pb-2 font-bold">Load</th>
                <th className="pb-2 text-right font-bold">Imported</th>
                <th className="pb-2 text-right font-bold">Logged</th>
                <th className="pb-2 text-right font-bold">Receive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {weights.map((weight) => {
                const imported = at(weight, "imported");
                const logged = at(weight, "logged");
                const receive = logged ?? imported;
                return (
                  <tr key={weight} className="tnum">
                    <td className="py-2 font-semibold">{weight} kg</td>
                    <td className="py-2 text-right text-text-dim">
                      {imported ? (
                        <>
                          {imported.stand_rate_pct}%
                          <span className="ml-1 text-[10px] text-text-faint">
                            {imported.stood}/{imported.attempts}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 text-right font-semibold">
                      {logged ? (
                        <>
                          {logged.stand_rate_pct}%
                          <span className="ml-1 text-[10px] font-normal text-text-faint">
                            {logged.stood}/{logged.attempts}
                          </span>
                        </>
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right" style={{ color: "var(--caught)" }}>
                      {receive?.receive_rate_pct != null ? `${receive.receive_rate_pct}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[11px] leading-snug text-text-faint">
          Receiving the bar and standing it up are different capabilities. A high receive rate
          with a low stand rate means the catch is no longer the limiter.
        </p>
      </Card>

    </div>
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null | undefined;
  hint: string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-text-faint">{label}</div>
      <div className="tnum text-xl font-semibold">{value == null ? "—" : `${value}%`}</div>
      <div className="text-[10px] text-text-faint">{hint}</div>
    </div>
  );
}
