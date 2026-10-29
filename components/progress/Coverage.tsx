import { Card, SectionTitle } from "@/components/ui";
import type { ProgressData } from "@/lib/queries";

/**
 * What each month of the window holds, and how it was recorded.
 *
 * Every chart on this screen is drawn from records, and records are not
 * training. Four sessions in September is either a quiet month or a badly
 * kept one, and nothing here can tell you which — so this says what it can
 * know for certain instead: those four were recovered from a written source,
 * while October's twelve were logged as they happened. That is usually the
 * whole explanation of a dip, and reading it as a decline is the mistake
 * this table exists to prevent.
 *
 * Months holding nothing get a row too. A month missing from a list reads as
 * a month that did not happen.
 *
 * A table rather than a chart. Four numbers and a classification per month is
 * not a magnitude to compare at a glance; it is a thing to read.
 */

const BASIS: Record<ProgressData["coverage"][number]["basis"], { label: string; tone: string }> =
  {
    logged: { label: "logged", tone: "var(--stood)" },
    reconstructed: { label: "reconstructed", tone: "var(--text-dim)" },
    mixed: { label: "mixed", tone: "var(--caught)" },
    notes_only: { label: "notes only", tone: "var(--text-faint)" },
    nothing: { label: "nothing recorded", tone: "var(--text-faint)" },
  };

export function Coverage({ data }: { data: ProgressData }) {
  const months = data.coverage;
  if (months.length === 0) return null;

  const reconstructed = months.filter(
    (m) => m.basis === "reconstructed" || m.basis === "mixed",
  ).length;

  return (
    <Card>
      <SectionTitle aside={`${months.length} month${months.length === 1 ? "" : "s"}`}>
        Coverage
      </SectionTitle>

      {/* The classification sits under the month rather than in a fifth
          column. At phone width a column for it pushed "reconstructed" off
          the right edge, which hid the one thing this table is for. */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-text-faint">
            <th className="pb-2 font-bold">Month</th>
            <th className="pb-2 pl-2 text-right font-bold">Days</th>
            <th className="pb-2 pl-2 text-right font-bold">Snatch</th>
            <th className="pb-2 pl-2 text-right font-bold">Sets</th>
            <th className="pb-2 pl-2 text-right font-bold">Skills</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {months.map((m) => {
            const basis = BASIS[m.basis];
            const empty = m.basis === "nothing" || m.basis === "notes_only";
            return (
              <tr key={m.month} className="tnum align-top">
                <td className="py-2 pr-2">
                  <span className="block whitespace-nowrap font-semibold">
                    {m.label}
                    {m.clipped ? (
                      <span className="ml-1 text-[10px] font-normal text-text-faint">
                        {m.current ? "so far" : "part"}
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-[10px]" style={{ color: basis.tone }}>
                    {basis.label}
                    {m.notes > 0 ? (
                      <span className="text-text-faint">
                        {" · "}
                        {m.notes} note{m.notes === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="py-2 pl-2 text-right">{dash(m.days, empty)}</td>
                <td className="py-2 pl-2 text-right">{dash(m.snatchBlocks, empty)}</td>
                <td className="py-2 pl-2 text-right">{dash(m.hypertrophySets, empty)}</td>
                <td className="py-2 pl-2 text-right">{dash(m.calisthenicsEntries, empty)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-3 text-[11px] leading-snug text-text-dim">
        Days holding a record, not days trained. A low month is a month with few records, and
        this cannot tell you whether that is a quiet month or a badly kept one — only how what
        is there was written down.
        {reconstructed > 0
          ? ` ${reconstructed} month${reconstructed === 1 ? " was" : "s were"} recovered from a written source rather than logged at the time, so ${reconstructed === 1 ? "its" : "their"} counts are what could be recovered.`
          : ""}{" "}
        Every chart above counts logged training only.
      </p>
    </Card>
  );
}

/** An em dash where there is nothing, rather than a nought that implies one. */
function dash(value: number, empty: boolean) {
  if (empty || value === 0) return <span className="text-text-faint">—</span>;
  return value;
}
