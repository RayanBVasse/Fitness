"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { Pill, SectionTitle } from "@/components/ui";
import { londonTime } from "@/lib/time";
import type {
  FailureMode,
  SnatchBlock,
  SnatchOutcome,
  SnatchVariation,
  WarmupLadder,
  WeightPreset,
} from "@/lib/types";

/**
 * Rapid attempt logging.
 *
 * Pick a load once, then tap the outcome for each attempt. Every tap writes one
 * attempt row; the weight block's counters are maintained by a database
 * trigger, so the tally shown here is the stored truth and not a local guess.
 *
 * Three outcome buttons, not two. "Caught, no stand" is a real and distinct
 * result: at 50 kg it is the difference between a near miss and a non-lift.
 */

type Props = {
  sessionId: string;
  sessionBlockId: string | null;
  presets: WeightPreset[];
  variations: SnatchVariation[];
  failureModes: FailureMode[];
  ladder: WarmupLadder | null;
  initialBlocks: SnatchBlock[];
  canWrite: boolean;
};

const OUTCOMES: { outcome: SnatchOutcome; label: string; sub: string; tone: string }[] = [
  { outcome: "stood", label: "Stood", sub: "received + stood", tone: "stood" },
  { outcome: "received_not_stood", label: "Caught", sub: "no stand", tone: "caught" },
  { outcome: "missed", label: "Missed", sub: "not received", tone: "missed" },
];

export function SnatchLogger({
  sessionId,
  sessionBlockId,
  presets,
  variations,
  failureModes,
  ladder,
  initialBlocks,
  canWrite,
}: Props) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<SnatchBlock[]>(initialBlocks);
  const [openBlockId, setOpenBlockId] = useState<string | null>(
    initialBlocks.length ? initialBlocks[initialBlocks.length - 1].id : null,
  );
  const [variationId, setVariationId] = useState<number>(
    variations.find((v) => v.slug === "full_snatch")?.id ?? variations[0]?.id ?? 1,
  );
  const [straps, setStraps] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const openBlock = blocks.find((b) => b.id === openBlockId) ?? null;
  const fullLiftVariationIds = useMemo(
    () => new Set(variations.filter((v) => v.counts_as_full_lift).map((v) => v.id)),
    [variations],
  );

  const sessionTally = useMemo(() => {
    const full = blocks.filter((b) => fullLiftVariationIds.has(b.variation_id));
    return {
      attempts: sum(full.map((b) => b.attempts)),
      stood: sum(full.map((b) => b.full_stand_successes)),
      caught: sum(full.map((b) => b.received_not_stood)),
      heaviestStood: Math.max(
        0,
        ...full
          .filter((b) => (b.full_stand_successes ?? 0) > 0)
          .map((b) => Number(b.weight_kg ?? 0)),
      ),
    };
  }, [blocks, fullLiftVariationIds]);

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

  function openWeight(weightKg: number, opts?: { warmup?: boolean; cooldown?: boolean }) {
    run(async () => {
      const result = await write<{ weight_block: SnatchBlock }>({
        action: "open_weight_block",
        session_id: sessionId,
        session_block_id: sessionBlockId,
        weight_kg: weightKg,
        variation_id: variationId,
        straps,
        is_warmup: opts?.warmup ?? false,
        is_cooldown: opts?.cooldown ?? false,
      });
      setBlocks((prev) => [...prev, result.weight_block]);
      setOpenBlockId(result.weight_block.id);
    });
  }

  function logAttempt(outcome: SnatchOutcome) {
    if (!openBlock) return;
    run(async () => {
      const result = await write<{ weight_block: SnatchBlock }>({
        action: "log_attempt",
        block_id: openBlock.id,
        outcome,
      });
      setBlocks((prev) =>
        prev.map((b) => (b.id === result.weight_block.id ? result.weight_block : b)),
      );
    });
  }

  function undo() {
    if (!openBlock) return;
    run(async () => {
      const result = await write<{ weight_block: SnatchBlock }>({
        action: "undo_attempt",
        block_id: openBlock.id,
      });
      setBlocks((prev) =>
        prev.map((b) => (b.id === result.weight_block.id ? result.weight_block : b)),
      );
    });
  }

  function removeBlock(id: string) {
    run(async () => {
      await write({ action: "delete_weight_block", weight_block_id: id });
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      if (openBlockId === id) setOpenBlockId(null);
    });
  }

  function rate(id: string, quality: number) {
    run(async () => {
      const result = await write<{ weight_block: SnatchBlock }>({
        action: "rate_weight_block",
        weight_block_id: id,
        quality_10: quality,
      });
      setBlocks((prev) =>
        prev.map((b) => (b.id === result.weight_block.id ? result.weight_block : b)),
      );
    });
  }

  const ladderWeights = ladder
    ? [...ladder.warmup.map((w) => w.weight_kg), ...ladder.working]
    : [];

  /**
   * Opens the usual ladder in one tap. It creates the blocks and nothing else:
   * outcomes stay untapped, because a warm-up the app assumed you did is a
   * lift that never happened.
   */
  function openLadder() {
    const existing = new Set(blocks.map((b) => Number(b.weight_kg)));
    const wanted = ladderWeights.filter((w) => !existing.has(w));
    if (!wanted.length) return;
    run(async () => {
      const created: SnatchBlock[] = [];
      for (const weight of wanted) {
        const result = await write<{ weight_block: SnatchBlock }>({
          action: "open_weight_block",
          session_id: sessionId,
          session_block_id: sessionBlockId,
          weight_kg: weight,
          variation_id: variationId,
          straps,
          is_warmup: ladder ? ladder.warmup.some((w) => w.weight_kg === weight) : false,
        });
        created.push(result.weight_block);
      }
      setBlocks((prev) => [...prev, ...created]);
      if (created.length) setOpenBlockId(created[0].id);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle
          aside={
            sessionTally.attempts > 0 ? (
              <span className="tnum">
                {sessionTally.stood}/{sessionTally.attempts} stood
                {sessionTally.heaviestStood > 0
                  ? ` · heaviest ${trim(sessionTally.heaviestStood)} kg`
                  : ""}
              </span>
            ) : null
          }
        >
          Snatch
        </SectionTitle>

        {/* Variation and straps apply to the next block opened. */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={variationId}
            onChange={(event) => setVariationId(Number(event.target.value))}
            className="min-h-[40px] rounded-[var(--radius)] border border-border bg-surface-2 px-2 text-sm"
            aria-label="Lift variation"
          >
            {variations.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.counts_as_full_lift ? "" : " (not a full lift)"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setStraps((s) => !s)}
            aria-pressed={straps}
            className="min-h-[40px] rounded-[var(--radius)] border px-3 text-sm font-medium"
            style={{
              borderColor: straps ? "var(--accent)" : "var(--border)",
              color: straps ? "var(--accent)" : "var(--text-dim)",
            }}
          >
            Straps {straps ? "on" : "off"}
          </button>
        </div>

        {/* Load presets. One tap opens a block at that weight. */}
        <div className="grid grid-cols-4 gap-2">
          {presets.map((preset) => {
            const weight = Number(preset.weight_kg);
            const inLadder = ladderWeights.includes(weight);
            return (
              <button
                key={preset.weight_kg}
                type="button"
                disabled={!canWrite || busy}
                onClick={() => openWeight(weight)}
                className="tnum min-h-[48px] rounded-[var(--radius)] border text-base font-semibold disabled:opacity-40"
                style={{
                  borderColor: inLadder ? "var(--accent)" : "var(--border)",
                  background: "var(--surface-2)",
                }}
              >
                {trim(weight)}
              </button>
            );
          })}
        </div>
        {ladder && ladderWeights.some((w) => !blocks.some((b) => Number(b.weight_kg) === w)) ? (
          <button
            type="button"
            disabled={!canWrite || busy}
            onClick={openLadder}
            className="mt-2 min-h-[44px] w-full rounded-[var(--radius)] border border-dashed border-border text-sm font-semibold text-text-dim disabled:opacity-40"
          >
            Open usual ladder ({ladderWeights.map((w) => trim(w)).join(" · ")})
          </button>
        ) : null}

        <p className="mt-2 text-[11px] text-text-faint">
          Outlined loads are your usual ladder. Opening a load starts a block; each tap below
          records one attempt at it. The ladder opens the blocks only — outcomes are always
          yours to tap.
        </p>
      </div>

      {/* The open block: the rapid-tap surface. */}
      {openBlock ? (
        <div
          className="rounded-[var(--radius)] border p-3"
          style={{ borderColor: "var(--accent)", background: "var(--surface-2)" }}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <div className="tnum text-2xl font-bold">
              {trim(Number(openBlock.weight_kg ?? 0))} kg
            </div>
            <div className="tnum text-sm text-text-dim">
              {openBlock.attempts ?? 0} attempt{(openBlock.attempts ?? 0) === 1 ? "" : "s"}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {OUTCOMES.map(({ outcome, label, sub, tone }) => (
              <button
                key={outcome}
                type="button"
                disabled={!canWrite || busy}
                onClick={() => logAttempt(outcome)}
                className="flex min-h-[72px] flex-col items-center justify-center rounded-[var(--radius)] font-bold disabled:opacity-40"
                style={{
                  background: `var(--${tone}-bg)`,
                  color: `var(--${tone})`,
                  border: `1px solid var(--${tone})`,
                }}
              >
                <span className="text-base leading-tight">{label}</span>
                <span className="text-[10px] font-medium opacity-80">{sub}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              <Pill tone="stood">{openBlock.full_stand_successes ?? 0} stood</Pill>
              <Pill tone="caught">{openBlock.received_not_stood ?? 0} caught</Pill>
              <Pill tone="missed">
                {Math.max(
                  0,
                  (openBlock.attempts ?? 0) -
                    (openBlock.full_stand_successes ?? 0) -
                    (openBlock.received_not_stood ?? 0),
                )}{" "}
                missed
              </Pill>
            </div>
            <button
              type="button"
              disabled={!canWrite || busy || (openBlock.attempts ?? 0) === 0}
              onClick={undo}
              className="min-h-[40px] rounded-[var(--radius)] border border-border px-3 text-sm font-semibold disabled:opacity-40"
            >
              Undo
            </button>
          </div>

          {/* Technical quality is recorded separately from load outcome. A lift
              that was stood is not therefore a good lift. */}
          <div className="mt-3">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-text-faint">
              Technical quality {openBlock.quality_10 ? `· ${openBlock.quality_10}/10` : "· not rated"}
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={() => rate(openBlock.id, n)}
                  aria-label={`Quality ${n} of 10`}
                  className="tnum h-9 flex-1 rounded-md border text-xs font-semibold disabled:opacity-40"
                  style={{
                    borderColor:
                      openBlock.quality_10 === n ? "var(--accent)" : "var(--border)",
                    color: openBlock.quality_10 === n ? "var(--accent)" : "var(--text-faint)",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}

      {/* Blocks logged in this session. */}
      {blocks.length ? (
        <div className="space-y-1.5">
          {blocks.map((block) => {
            const isOpen = block.id === openBlockId;
            const variation = variations.find((v) => v.id === block.variation_id);
            return (
              <div
                key={block.id}
                className="flex items-center gap-2 rounded-[var(--radius)] border border-border px-3 py-2"
                style={{ background: isOpen ? "var(--surface-2)" : "transparent" }}
              >
                <button
                  type="button"
                  onClick={() => setOpenBlockId(block.id)}
                  className="flex flex-1 items-baseline gap-2 text-left"
                >
                  <span className="tnum w-16 font-semibold">
                    {trim(Number(block.weight_kg ?? 0))} kg
                  </span>
                  <span className="tnum text-sm text-text-dim">
                    {block.full_stand_successes ?? 0}/{block.attempts ?? 0}
                  </span>
                  {(block.received_not_stood ?? 0) > 0 ? (
                    <Pill tone="caught">{block.received_not_stood} caught</Pill>
                  ) : null}
                  {block.quality_10 ? <Pill tone="accent">Q{block.quality_10}</Pill> : null}
                  {block.straps ? <Pill>straps</Pill> : null}
                  {variation && !variation.counts_as_full_lift ? (
                    <Pill>{variation.name}</Pill>
                  ) : null}
                  {block.logged_at ? (
                    <span className="ml-auto text-[11px] text-text-faint">
                      {londonTime(block.logged_at)}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={() => removeBlock(block.id)}
                  aria-label={`Delete ${trim(Number(block.weight_kg ?? 0))} kg block`}
                  className="min-h-[32px] px-1 text-sm text-text-faint disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {failureModes.length === 0 ? null : (
        <p className="text-[11px] text-text-faint">
          Failure mode and technique tags are recorded per block in Phase 2.
        </p>
      )}
    </div>
  );
}

function sum(values: (number | null)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/** 47.50 -> "47.5", 45.00 -> "45". */
function trim(value: number): string {
  return String(Number(value));
}
