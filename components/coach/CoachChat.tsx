"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Card, Pill } from "@/components/ui";

/**
 * The Coach surface.
 *
 * It shows which analysis tools ran for each answer, because an answer that
 * cites nothing is the one worth distrusting. The verifier's verdict is shown
 * too: an answer that needed correcting is not the same as one that was right
 * first time, and hiding the difference would defeat the point.
 */

type Turn = {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  verifier?: { status: string; unsourced: string[] };
  redacted?: number;
};

const SUGGESTIONS = [
  "Why were my snatches heavy on 24 October?",
  "Am I getting better at recovering within 24 hours?",
  "How is 50 kg going compared with 47.5?",
  "What happened in the week before my best session?",
];

export function CoachChat({ conversationId }: { conversationId: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setError(null);
    setQuestion("");
    setTurns((prev) => [...prev, { role: "user", content: trimmed }]);

    start(async () => {
      try {
        const response = await fetch("/api/coach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversation_id: conversationId, question: trimmed }),
        });
        const body = await response.json();
        if (!response.ok) {
          setError(body.error ?? `Request failed (${response.status})`);
          return;
        }
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: body.answer,
            tools: body.tools_used,
            verifier: body.verifier,
            redacted: body.redacted_names,
          },
        ]);
        endRef.current?.scrollIntoView({ behavior: "smooth" });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="space-y-4 pt-5">
      <header>
        <h1 className="text-2xl font-bold leading-tight">Coach</h1>
        <p className="text-sm text-text-dim">
          Reads your records and approved notes. Every figure it quotes is checked against the
          data before you see it.
        </p>
      </header>

      {turns.length === 0 ? (
        <Card>
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-dim">
            Try asking
          </div>
          <div className="mt-2 space-y-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="block w-full rounded-[var(--radius)] border border-border px-3 py-2 text-left text-sm"
              >
                {s}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-text-faint">
            It can only quote notes you have approved.{" "}
            <Link href="/notes" className="underline underline-offset-2">
              Review them
            </Link>{" "}
            to let it use your own words.
          </p>
        </Card>
      ) : null}

      {turns.map((turn, index) =>
        turn.role === "user" ? (
          <div
            key={index}
            className="ml-8 rounded-[var(--radius)] px-3 py-2 text-sm"
            style={{ background: "var(--surface-2)" }}
          >
            {turn.content}
          </div>
        ) : (
          <Card key={index}>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{turn.content}</div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
              {turn.verifier?.status === "rejected" ? (
                <Pill tone="missed">answer refused</Pill>
              ) : turn.verifier?.status === "retried" ? (
                <Pill tone="caught">corrected once</Pill>
              ) : (
                <Pill tone="stood">figures verified</Pill>
              )}
              {(turn.tools ?? []).map((tool, i) => (
                <Pill key={`${tool}-${i}`}>{tool}</Pill>
              ))}
              {turn.redacted ? <Pill>{turn.redacted} name redacted</Pill> : null}
            </div>
          </Card>
        ),
      )}

      {pending ? (
        <Card>
          <div className="text-sm text-text-faint">Reading your records…</div>
        </Card>
      ) : null}

      {error ? (
        <p className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}

      <div ref={endRef} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
        className="sticky bottom-[72px] flex gap-2 bg-bg py-2"
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about your training"
          disabled={pending}
          className="min-h-[48px] flex-1 rounded-[var(--radius)] border border-border bg-surface-2 px-3 text-base"
          aria-label="Ask the coach"
        />
        <button
          type="submit"
          disabled={pending || !question.trim()}
          className="min-h-[48px] rounded-[var(--radius)] px-4 text-sm font-bold disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          Ask
        </button>
      </form>
    </div>
  );
}
