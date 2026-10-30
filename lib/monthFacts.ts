import { safeRead } from "./supabase";
import { getRangeFacts, type WeekFacts } from "./weekFacts";
import type { Provenance } from "./types";

/**
 * A month, and enough about the month before it to say whether the two can
 * honestly be set side by side.
 *
 * That last part is the point. Most of this log's history is reconstruction
 * recovered from chat threads, and a month-on-month comparison across that
 * boundary compares record-keeping rather than training. The brief refuses
 * the comparison rather than printing a number that looks like progress.
 */

export type MonthBasis = "logged" | "reconstructed" | "mixed" | "nothing";

export interface MonthFacts {
  month: string;
  label: string;
  /** This month's rows, with the previous month available for matching. */
  facts: WeekFacts;
  basis: MonthBasis;
  previous: { month: string; label: string; basis: MonthBasis };
  /** True only when the month before was logged as it happened. */
  comparable: boolean;
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1] ?? m} ${y}`;
}

/**
 * How a month's records were made, counted across the three workstreams.
 *
 * Classified by provenance and never by volume: whether a month holds
 * enough is not something this app can know, and a grade would be the app
 * guessing at exactly what the audit warned against.
 */
async function basisOf(month: string): Promise<MonthBasis> {
  const from = monthStart(month);
  const to = monthEnd(month);

  const [snatch, sets, entries] = await Promise.all([
    safeRead<{ provenance: Provenance }[]>((c) =>
      c
        .from("v_snatch_blocks")
        .select("provenance")
        .gte("session_date", from)
        .lte("session_date", to),
    ),
    safeRead<{ provenance: Provenance; sessions: unknown }[]>((c) =>
      c.from("hypertrophy_sets").select("provenance, sessions(session_date)"),
    ),
    safeRead<{ provenance: Provenance; sessions: unknown }[]>((c) =>
      c.from("calisthenics_entries").select("provenance, sessions(session_date)"),
    ),
  ]);

  const inMonth = (row: { sessions: unknown }) => {
    const date = (row.sessions as unknown as { session_date: string } | null)?.session_date;
    return !!date && date >= from && date <= to;
  };

  const rows: Provenance[] = [
    ...(snatch.data ?? []).map((r) => r.provenance),
    ...(sets.data ?? []).filter(inMonth).map((r) => r.provenance),
    ...(entries.data ?? []).filter(inMonth).map((r) => r.provenance),
  ];

  if (rows.length === 0) return "nothing";
  const logged = rows.filter((p) => p === "logged").length;
  if (logged === rows.length) return "logged";
  if (logged === 0) return "reconstructed";
  return "mixed";
}

export async function getMonthFacts(month: string): Promise<MonthFacts> {
  const before = previousMonth(month);

  const [facts, basis, previousBasis] = await Promise.all([
    // History reaches back through the whole of the previous month, which is
    // what a matched load is compared against.
    getRangeFacts(monthStart(month), monthEnd(month), monthStart(before)),
    basisOf(month),
    basisOf(before),
  ]);

  return {
    month,
    label: monthLabel(month),
    facts,
    basis,
    previous: { month: before, label: monthLabel(before), basis: previousBasis },
    // Only a month logged as it happened. "Mixed" is not enough: a
    // comparison cannot say which half of it a figure came from.
    comparable: previousBasis === "logged",
  };
}
