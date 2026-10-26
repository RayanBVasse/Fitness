"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { SectionTitle, wsColour } from "@/components/ui";
import {
  NOTE_CATEGORIES,
  NOTE_CATEGORY_LABELS,
  type ContextNote,
  type NoteCategory,
  type Workstream,
} from "@/lib/types";

/**
 * Notes, written where the training is.
 *
 * These replace the free-text dimensions of the daily check-in, which were
 * rows in a table of measurements and are not measurements. A note is a
 * report: the athlete said it. The Coach is told so explicitly, and nothing
 * written here ever reaches a success rate or a volume total.
 *
 * A note carries a workstream when it is about one, but it is NOT a session
 * block. Writing "did some handstands, didn't count" records the fact in your
 * words without claiming a trained workstream the counters would then count.
 *
 * Notes written here are approved on arrival, so the Coach can read them at
 * once. The imported pack keeps its review gate: that material was written
 * without the Coach in mind, which is the whole reason the gate exists.
 */

type Props = {
  date: string;
  sessionId: string | null;
  /** Set when this composer belongs to one workstream's tab. */
  workstream?: Workstream;
  notes: ContextNote[];
  canWrite: boolean;
};

export function DayNotes({ date, sessionId, workstream, notes, canWrite }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<NoteCategory>("observation");
  const [important, setImportant] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const mine = notes.filter((n) =>
    workstream ? n.workstream === workstream : n.workstream === null,
  );
  const hue = workstream ? wsColour(workstream) : "var(--accent)";

  function reset() {
    setOpen(false);
    setEditingId(null);
    setContent("");
    setCategory("observation");
    setImportant(false);
  }

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

  function save() {
    if (!content.trim()) return;
    const id = editingId;
    run(async () => {
      if (id) {
        await write({
          action: "update_note",
          note_id: id,
          content: content.trim(),
          category,
          important,
        });
      } else {
        await write({
          action: "add_note",
          content: content.trim(),
          category,
          anchor_date: date,
          workstream: workstream ?? null,
          session_id: sessionId,
          important,
        });
      }
      reset();
    });
  }

  function edit(note: ContextNote) {
    setEditingId(note.id);
    setContent(note.content);
    setCategory(
      (NOTE_CATEGORIES as readonly string[]).includes(note.category)
        ? (note.category as NoteCategory)
        : "observation",
    );
    setImportant(note.tags.includes("important"));
    setOpen(true);
  }

  function remove(id: string) {
    run(async () => {
      await write({ action: "delete_note", note_id: id });
      if (editingId === id) reset();
    });
  }

  return (
    <div className={workstream ? "" : "space-y-3"}>
      {workstream ? null : (
        <SectionTitle aside={mine.length > 0 ? `${mine.length} today` : null}>
          Notes for the Coach
        </SectionTitle>
      )}

      {mine.length > 0 ? (
        <ul className="space-y-1.5">
          {mine.map((note) => (
            <li
              key={note.id}
              className="rounded-[var(--radius)] border px-3 py-2"
              style={{
                borderColor: note.tags.includes("important") ? hue : "var(--border)",
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide" style={{ color: hue }}>
                  {NOTE_CATEGORY_LABELS[note.category as NoteCategory] ?? note.category}
                  {note.tags.includes("important") ? " · important" : ""}
                </span>
                {/* text-dim, not text-faint: these are controls, and faint
                    falls below 4.5:1 on the dark surface. */}
                <span className="flex shrink-0 gap-2 text-[11px] text-text-dim">
                  <button
                    type="button"
                    disabled={!canWrite || busy}
                    onClick={() => edit(note)}
                    className="underline underline-offset-2 disabled:no-underline"
                  >
                    edit
                  </button>
                  <button
                    type="button"
                    disabled={!canWrite || busy}
                    onClick={() => remove(note.id)}
                    className="underline underline-offset-2 disabled:no-underline"
                  >
                    delete
                  </button>
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug">{note.content}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div
          className="rounded-[var(--radius)] border p-3"
          style={{ borderColor: hue, background: "var(--surface-2)" }}
        >
          <textarea
            autoFocus
            value={content}
            disabled={!canWrite || busy}
            rows={4}
            placeholder={
              workstream
                ? "What happened, what you noticed, what you changed."
                : "The day, the gym, how it went. Anything the Coach should know."
            }
            onChange={(event) => setContent(event.target.value)}
            className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm"
          />

          <div className="mt-2 flex flex-wrap gap-1.5">
            {NOTE_CATEGORIES.map((value) => {
              const on = value === category;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(value)}
                  aria-pressed={on}
                  className="min-h-[34px] rounded-full border px-2.5 text-[11px] font-semibold"
                  style={{
                    borderColor: on ? hue : `color-mix(in oklab, ${hue} 32%, transparent)`,
                    background: on ? `color-mix(in oklab, ${hue} 8%, transparent)` : "transparent",
                    color: on ? hue : "var(--text-dim)",
                  }}
                >
                  {NOTE_CATEGORY_LABELS[value]}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setImportant((v) => !v)}
              aria-pressed={important}
              className="min-h-[34px] rounded-[var(--radius)] border px-2.5 text-[11px] font-semibold"
              style={{
                borderColor: important ? hue : "var(--border)",
                color: important ? hue : "var(--text-dim)",
              }}
            >
              {important ? "★ Important" : "☆ Mark important"}
            </button>
            <span className="text-[10px] leading-snug text-text-faint">
              Kept in front of the Coach across sessions.
            </span>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!canWrite || busy || !content.trim()}
              onClick={save}
              className="min-h-[44px] flex-1 rounded-[var(--radius)] text-sm font-bold disabled:opacity-40"
              style={{ background: hue, color: "var(--accent-text)" }}
            >
              {busy ? "Saving…" : editingId ? "Save changes" : "Save note"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="min-h-[44px] rounded-[var(--radius)] border border-border px-3 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>

          <p className="mt-2 text-[10px] leading-snug text-text-faint">
            Recorded as a report in your words, never as a measurement. Other people are
            replaced by their role before anything reaches the Coach.
          </p>
        </div>
      ) : (
        <button
          type="button"
          disabled={!canWrite || busy}
          onClick={() => setOpen(true)}
          className="min-h-[44px] w-full rounded-[var(--radius)] border border-dashed px-3 text-sm font-semibold disabled:opacity-40"
          style={{ borderColor: `color-mix(in oklab, ${hue} 45%, transparent)`, color: hue }}
        >
          + Add a note{workstream ? "" : " for the day"}
        </button>
      )}

      {error ? (
        <p className="mt-2 text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
