"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { SectionTitle, wsColour } from "@/components/ui";
import {
  DAY_NOTE_CATEGORIES,
  NOTE_CATEGORIES,
  NOTE_CATEGORY_LABELS,
  WORKSTREAM_NOTE_CATEGORIES,
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
 *
 * The day's notes offer the same topics every day — food, the gym, sleep —
 * because the same ground covered daily is what makes days comparable. They
 * are the four check-in text fields 0015 folded away, returned as prompts
 * rather than as four boxes demanding to be filled. A topic nobody asked you
 * about is a topic you did not write about, which is not the same as one
 * with nothing to say.
 */

/**
 * Something this note could be about, offered beside the topic chips.
 *
 * Only what was actually logged in this session: a note about an exercise
 * you did not do today is a note about something else, and a list of every
 * exercise in the library would make picking one a search rather than a tap.
 */
export type NoteSubject = {
  kind: "exercise" | "skill";
  id: number;
  name: string;
};

type Props = {
  date: string;
  sessionId: string | null;
  /** Set when this composer belongs to one workstream's tab. */
  workstream?: Workstream;
  notes: ContextNote[];
  /** What this workstream has on record today. Empty for a day's note. */
  subjects?: NoteSubject[];
  canWrite: boolean;
};

/** What a saved note is about, where this composer knows the name. */
function subjectName(subjects: NoteSubject[], note: ContextNote): string | null {
  const found = subjects.find(
    (s) =>
      (s.kind === "exercise" && s.id === note.exercise_id) ||
      (s.kind === "skill" && s.id === note.skill_variation_id),
  );
  return found?.name ?? null;
}

export function DayNotes({ date, sessionId, workstream, notes, subjects = [], canWrite }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<NoteCategory>("observation");
  const [important, setImportant] = useState(false);
  const [subject, setSubject] = useState<NoteSubject | null>(null);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const mine = notes.filter((n) =>
    workstream ? n.workstream === workstream : n.workstream === null,
  );
  const hue = workstream ? wsColour(workstream) : "var(--accent)";
  const offered = workstream ? WORKSTREAM_NOTE_CATEGORIES : DAY_NOTE_CATEGORIES;

  function reset() {
    setOpen(false);
    setEditingId(null);
    setContent("");
    setCategory("observation");
    setImportant(false);
    setSubject(null);
  }

  /** Open the composer on one topic. */
  function start(next: NoteCategory) {
    setEditingId(null);
    setContent("");
    setImportant(false);
    setSubject(null);
    setCategory(next);
    setOpen(true);
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
          exercise_id: subject?.kind === "exercise" ? subject.id : null,
          skill_variation_id: subject?.kind === "skill" ? subject.id : null,
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
          exercise_id: subject?.kind === "exercise" ? subject.id : null,
          skill_variation_id: subject?.kind === "skill" ? subject.id : null,
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
    setSubject(
      subjects.find(
        (s) =>
          (s.kind === "exercise" && s.id === note.exercise_id) ||
          (s.kind === "skill" && s.id === note.skill_variation_id),
      ) ?? null,
    );
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
                  {subjectName(subjects, note) ? ` · ${subjectName(subjects, note)}` : ""}
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
            {offered.map((value) => {
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

          {/* What it is about. Optional: most notes are about the session,
              and a note forced to name an exercise would start naming one
              it is not about. */}
          {subjects.length > 0 ? (
            <div className="mt-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-text-dim">
                About
              </div>
              <div className="flex flex-wrap gap-1.5">
                {subjects.map((s) => {
                  const on = subject?.kind === s.kind && subject.id === s.id;
                  return (
                    <button
                      key={`${s.kind}-${s.id}`}
                      type="button"
                      onClick={() => setSubject(on ? null : s)}
                      aria-pressed={on}
                      className="min-h-[34px] rounded-full border px-2.5 text-[11px] font-semibold"
                      style={{
                        borderColor: on ? hue : `color-mix(in oklab, ${hue} 32%, transparent)`,
                        background: on
                          ? `color-mix(in oklab, ${hue} 8%, transparent)`
                          : "transparent",
                        color: on ? hue : "var(--text-dim)",
                      }}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[10px] leading-snug text-text-faint">
                Naming one files the note under that exercise on Progress, where you read it
                back beside the loads. Leave it for a note about the session.
              </p>
            </div>
          ) : null}

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
      ) : workstream ? (
        <button
          type="button"
          disabled={!canWrite || busy}
          onClick={() => setOpen(true)}
          className="min-h-[44px] w-full rounded-[var(--radius)] border border-dashed px-3 text-sm font-semibold disabled:opacity-40"
          style={{ borderColor: `color-mix(in oklab, ${hue} 45%, transparent)`, color: hue }}
        >
          + Add a note
        </button>
      ) : (
        /* The same ground every day. A topic already written about is marked
           and still tappable — second thoughts about food are still about
           food. Nothing here is required; the point is seeing what is
           missing, not filling it in. */
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-dim">
            Write about
          </div>
          <div className="flex flex-wrap gap-1.5">
            {offered.map((value) => {
              const covered = mine.some((n) => n.category === value);
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={() => start(value)}
                  className="min-h-[38px] rounded-full border px-3 text-xs font-semibold disabled:opacity-40"
                  style={{
                    borderColor: covered
                      ? `color-mix(in oklab, ${hue} 45%, transparent)`
                      : "var(--border)",
                    color: covered ? hue : "var(--text-dim)",
                    background: covered
                      ? `color-mix(in oklab, ${hue} 8%, transparent)`
                      : "transparent",
                  }}
                >
                  {covered ? "✓ " : "+ "}
                  {NOTE_CATEGORY_LABELS[value]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-2 text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
