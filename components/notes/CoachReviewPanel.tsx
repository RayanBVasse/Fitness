"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { Markdown } from "@/components/notes/Markdown";
import { SectionTitle } from "@/components/ui";

/**
 * The coach's review of a day or a week, written outside this app.
 *
 * The coach is an LLM elsewhere. So this panel is two halves of one exchange:
 * the facts to take out, and the review to bring back. Neither half is a
 * measurement, and the panel says so — what is pasted in is one reader's
 * interpretation of rows this app already holds, and the moment it is allowed
 * to look like a result it starts being cited as evidence for itself.
 *
 * The facts block is composed server-side and arrives already redacted, so
 * copying it cannot send a third party's name anywhere. The alias list is not
 * shipped to the browser.
 *
 * One review per period, keyed on the date, so pasting again replaces rather
 * than accumulates: a corrected review is the same review.
 */

type Props = {
  scope: "day" | "week";
  /** The day, or the Monday of the week. Both ISO dates. */
  periodKey: string;
  /** What this period is called on screen. */
  label: string;
  content: string | null;
  updatedAt: string | null;
  /** The deterministic facts to paste out. Null where none are composed. */
  brief?: string | null;
  /**
   * Side by side rather than stacked: the facts going out on the left, the
   * review coming back on the right. Only where there is width for it.
   */
  columns?: boolean;
  canWrite: boolean;
};

export function CoachReviewPanel({
  scope,
  periodKey,
  label,
  content,
  updatedAt,
  brief,
  columns,
  canWrite,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content ?? "");
  const [showFacts, setShowFacts] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(next: string) {
    setError(null);
    startTransition(async () => {
      try {
        await write({ action: "save_review", scope, key: periodKey, content: next });
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  async function copyFacts() {
    if (!brief) return;
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused outside a secure context and in some
      // in-app browsers. The text is on screen and selectable either way.
      setShowFacts(true);
      setError("Could not reach the clipboard — select the text below instead.");
    }
  }

  return (
    <div
      className={
        columns
          ? "grid grid-cols-1 items-start gap-4 min-[900px]:grid-cols-2"
          : "space-y-3"
      }
    >
      <div className={columns ? "min-[900px]:col-span-2" : ""}>
        <SectionTitle aside={updatedAt ? `saved ${updatedAt}` : null}>
          {scope === "week" ? `Coach review · ${label}` : "Coach review"}
        </SectionTitle>
      </div>

      {/* Half one: what to take out. Offered before the box, because this is
          the step that comes first. */}
      {brief ? (
        <div className="rounded-[var(--radius)] border border-border">
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => setShowFacts((v) => !v)}
              aria-expanded={showFacts}
              className="text-[11px] font-semibold uppercase tracking-wide text-text-dim"
            >
              {showFacts ? "▾" : "▸"} Facts to paste out
            </button>
            <button
              type="button"
              onClick={copyFacts}
              className="ml-auto min-h-[34px] rounded-[var(--radius)] border px-2.5 text-[11px] font-semibold"
              style={{
                borderColor: copied ? "var(--stood)" : "var(--border)",
                color: copied ? "var(--stood)" : "var(--text-dim)",
              }}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
          {showFacts ? (
            // Wrapped, not scrolled sideways: this is read on a phone, and a
            // line you have to drag to finish is a line you skip.
            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words border-t border-border px-3 py-2 text-[11px] leading-snug text-text-dim">
              {brief}
            </pre>
          ) : null}
        </div>
      ) : null}

      {/* Half two: what comes back. */}
      {editing || !content ? (
        <div>
          <textarea
            autoFocus={editing}
            value={draft}
            disabled={!canWrite || busy}
            rows={content ? 16 : 6}
            placeholder={
              scope === "week"
                ? "Paste the weekly review here. Headings, bullets and tables are kept."
                : "Paste the coach's review of today here."
            }
            onChange={(event) => setDraft(event.target.value)}
            className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 font-mono text-[12px] leading-snug"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={!canWrite || busy || draft.trim() === (content ?? "")}
              onClick={() => save(draft.trim())}
              className="min-h-[44px] flex-1 rounded-[var(--radius)] text-sm font-bold disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
            >
              {busy ? "Saving…" : content ? "Save changes" : "Save review"}
            </button>
            {content ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDraft(content);
                  setEditing(false);
                }}
                className="min-h-[44px] rounded-[var(--radius)] border border-border px-3 text-sm font-semibold"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div>
          <div
            className="rounded-[var(--radius)] border-l-2 pl-3"
            style={{ borderColor: "var(--accent)" }}
          >
            <Markdown source={content} />
          </div>
          <div className="mt-2 flex gap-2 text-[11px] text-text-dim">
            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={() => {
                setDraft(content);
                setEditing(true);
              }}
              className="underline underline-offset-2 disabled:no-underline"
            >
              edit
            </button>
            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={() => {
                setDraft("");
                save("");
              }}
              className="underline underline-offset-2 disabled:no-underline"
            >
              remove
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}

      <p
        className={`text-[10px] leading-snug text-text-faint ${
          columns ? "min-[900px]:col-span-2" : ""
        }`}
      >
        One reader&rsquo;s interpretation, stored as such. Nothing pasted here reaches a success
        rate, a volume total or a trend — those are counted from your records only.
      </p>
    </div>
  );
}
