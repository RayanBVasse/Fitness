"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { write } from "@/lib/write";
import { Card, Pill } from "@/components/ui";
import { longDate } from "@/lib/time";
import type { ContextNote } from "@/lib/types";

/**
 * The review queue.
 *
 * Approval is the consent gate, not housekeeping: the Coach can read approved
 * notes and nothing else. So each note is shown in full — you approve what you
 * have actually read, and the things most worth a second look are marked.
 */

type Props = {
  notes: ContextNote[];
  counts: { pending: number; approved: number; rejected: number };
  months: string[];
  noteTypes: string[];
  filters: { status: string; month?: string; noteType?: string };
};

export function NotesReview({ notes, counts, months, noteTypes, filters }: Props) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingBulk, setConfirmingBulk] = useState(false);

  function review(ids: string[], status: "approved" | "rejected" | "pending") {
    setError(null);
    start(async () => {
      try {
        await write({ action: "set_note_review", note_ids: ids, review_status: status });
        setConfirmingBulk(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function setFilter(key: string, value: string | null) {
    const params = new URLSearchParams();
    const next = { ...filters, [key]: value ?? undefined } as Record<string, string | undefined>;
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    router.push(`/notes?${params.toString()}`);
  }

  const pendingShown = notes.filter((n) => n.review_status === "pending");

  return (
    <div className="space-y-4 pt-5">
      <header>
        <h1 className="text-2xl font-bold leading-tight">Context notes</h1>
        <p className="text-sm text-text-dim">
          The Coach reads approved notes only. Everything else stays private to this screen.
        </p>
        <div className="mt-2 flex gap-1.5">
          <Pill tone="caught">{counts.pending} pending</Pill>
          <Pill tone="stood">{counts.approved} approved</Pill>
          {counts.rejected > 0 ? <Pill tone="missed">{counts.rejected} rejected</Pill> : null}
        </div>
      </header>

      <Card className="!p-3">
        <div className="flex flex-wrap gap-1.5">
          {["pending", "approved", "rejected", "all"].map((status) => (
            <FilterChip
              key={status}
              label={status}
              on={filters.status === status}
              onClick={() => setFilter("status", status)}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <FilterChip label="any type" on={!filters.noteType} onClick={() => setFilter("noteType", null)} />
          {noteTypes.map((type) => (
            <FilterChip
              key={type}
              label={type.replace(/_/g, " ")}
              on={filters.noteType === type}
              onClick={() => setFilter("noteType", type)}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <FilterChip label="any month" on={!filters.month} onClick={() => setFilter("month", null)} />
          {months.map((month) => (
            <FilterChip
              key={month}
              label={month}
              on={filters.month === month}
              onClick={() => setFilter("month", month)}
            />
          ))}
        </div>
      </Card>

      {pendingShown.length > 1 ? (
        <Card className="!p-3">
          {confirmingBulk ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => review(pendingShown.map((n) => n.id), "approved")}
                className="min-h-[44px] flex-1 rounded-[var(--radius)] text-sm font-bold disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--accent-text)" }}
              >
                Approve all {pendingShown.length} shown
              </button>
              <button
                type="button"
                onClick={() => setConfirmingBulk(false)}
                className="min-h-[44px] rounded-[var(--radius)] border border-border px-3 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingBulk(true)}
              className="min-h-[44px] w-full rounded-[var(--radius)] border border-dashed border-border text-sm font-semibold text-text-dim disabled:opacity-40"
            >
              Approve all {pendingShown.length} shown
            </button>
          )}
          <p className="mt-2 text-[11px] leading-snug text-text-faint">
            Bulk approval is for a filtered set you have read — the profile and policy notes, say.
            Narrow the filters first.
          </p>
        </Card>
      ) : null}

      {notes.length === 0 ? (
        <Card>
          <p className="text-sm text-text-faint">Nothing matches these filters.</p>
        </Card>
      ) : null}

      {notes.map((note) => (
        <Card key={note.id} className="!p-3">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-text-dim">
              {note.anchor_date ? longDate(note.anchor_date) : (note.period_label ?? "undated")}
            </span>
            <Pill>{note.note_type.replace(/_/g, " ")}</Pill>
            {/* The ones worth reading twice. */}
            {note.evidence_status.startsWith("assistant") ? (
              <Pill tone="caught">interpretation, not measurement</Pill>
            ) : null}
            {note.evidence_status.includes("requires_source_verification") ? (
              <Pill tone="caught">unverified recall</Pill>
            ) : null}
            {note.candidate_numeric ? <Pill tone="accent">mentions numbers</Pill> : null}
            {note.sensitivity !== "normal" ? <Pill tone="missed">{note.sensitivity}</Pill> : null}
          </div>

          <p className="text-sm leading-snug">{note.content}</p>

          <div className="mt-2 flex items-center gap-2">
            {note.review_status === "approved" ? (
              <>
                <Pill tone="stood">approved</Pill>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => review([note.id], "pending")}
                  className="text-[11px] text-text-faint underline underline-offset-2"
                >
                  undo
                </button>
              </>
            ) : note.review_status === "rejected" ? (
              <>
                <Pill tone="missed">rejected</Pill>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => review([note.id], "pending")}
                  className="text-[11px] text-text-faint underline underline-offset-2"
                >
                  undo
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => review([note.id], "approved")}
                  className="min-h-[36px] flex-1 rounded-[var(--radius)] text-xs font-bold disabled:opacity-40"
                  style={{ background: "var(--accent)", color: "var(--accent-text)" }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => review([note.id], "rejected")}
                  className="min-h-[36px] rounded-[var(--radius)] border border-border px-3 text-xs font-semibold disabled:opacity-40"
                >
                  Reject
                </button>
              </>
            )}
            <span className="ml-auto text-[10px] text-text-faint">{note.external_source_id}</span>
          </div>
        </Card>
      ))}

      {error ? (
        <p className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}

      <Link
        href="/coach"
        className="flex min-h-[48px] items-center justify-center rounded-[var(--radius)] border border-border text-sm font-semibold"
      >
        Back to Coach
      </Link>
    </div>
  );
}

function FilterChip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="min-h-[32px] rounded-full border px-2.5 text-[11px] font-semibold"
      style={{
        borderColor: on ? "var(--accent)" : "var(--border)",
        color: on ? "var(--accent)" : "var(--text-faint)",
      }}
    >
      {label}
    </button>
  );
}
