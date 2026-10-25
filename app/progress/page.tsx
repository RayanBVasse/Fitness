import { getReferenceData, getSnatchSuccessByWeight } from "@/lib/queries";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, InsufficientData, Pill, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Phase 1 shows the one table that actually decides whether training is
 * working: stand rate against receive rate, per load, from substantiated
 * blocks only. Charts and the weekly report arrive in Phase 5.
 */
export default async function ProgressPage() {
  const [{ data, error }, reference] = await Promise.all([
    getSnatchSuccessByWeight(),
    getReferenceData(),
  ]);
  if (error) return <SetupNotice error={error} />;

  const rows = data ?? [];
  const objective = reference.objective;
  const primary = objective
    ? rows.find((row) => Number(row.weight_kg) === objective.primary_load_kg)
    : undefined;

  return (
    <div className="space-y-4 pt-5">
      <header>
        <h1 className="text-2xl font-bold">Progress</h1>
        <p className="text-sm text-text-dim">
          Substantiated blocks only — those recording both attempts and stands.
        </p>
      </header>

      {objective ? (
        <Card>
          <SectionTitle>Primary objective</SectionTitle>
          <p className="text-sm leading-snug">{objective.statement}</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-text-faint">Logged now</div>
              <div className="tnum text-xl font-semibold">
                {primary?.stand_rate_pct != null ? `${primary.stand_rate_pct}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-text-faint">Baseline</div>
              <div className="tnum text-xl font-semibold">
                {objective.primary_current_stand_rate_pct}%
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-text-faint">Target</div>
              <div className="tnum text-xl font-semibold">
                {objective.primary_target_stand_rate_pct}%
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-text-faint">
            Baseline is the Jan–Oct 2026 reconstruction at {objective.primary_load_kg} kg. It is a
            reference point, not merged with newly logged attempts.
          </p>
        </Card>
      ) : null}

      <Card>
        <SectionTitle aside="stand vs receive">By load</SectionTitle>
        {rows.length === 0 ? (
          <InsufficientData reason="No substantiated snatch blocks logged yet. Rates appear once a block records both attempts and stands." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-text-faint">
                <th className="pb-2 font-bold">Load</th>
                <th className="pb-2 text-right font-bold">Att.</th>
                <th className="pb-2 text-right font-bold">Stood</th>
                <th className="pb-2 text-right font-bold">Stand</th>
                <th className="pb-2 text-right font-bold">Receive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.weight_kg} className="tnum">
                  <td className="py-2 font-semibold">{Number(row.weight_kg)} kg</td>
                  <td className="py-2 text-right text-text-dim">{row.attempts}</td>
                  <td className="py-2 text-right text-text-dim">{row.stood}</td>
                  <td className="py-2 text-right font-semibold">
                    {row.stand_rate_pct != null ? `${row.stand_rate_pct}%` : "—"}
                  </td>
                  <td className="py-2 text-right" style={{ color: "var(--caught)" }}>
                    {row.receive_rate_pct != null ? `${row.receive_rate_pct}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[11px] leading-snug text-text-faint">
          Receiving the bar and standing it up are different capabilities. A high receive rate with
          a low stand rate means the catch is no longer the limiter.
        </p>
      </Card>

      <Card>
        <SectionTitle>Coming in Phase 5</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          <Pill>Selectable periods</Pill>
          <Pill>Quality over time</Pill>
          <Pill>Per-variation skill charts</Pill>
          <Pill>Volume by exercise</Pill>
          <Pill>Weekly report</Pill>
        </div>
        <p className="mt-2 text-[11px] text-text-faint">
          Reports need data to report on, so they come last. Progression rules are already
          documented and editable in Settings.
        </p>
      </Card>
    </div>
  );
}
