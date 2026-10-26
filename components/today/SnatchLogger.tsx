"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { Pill, SectionTitle, wsColour } from "@/components/ui";
import { londonTime } from "@/lib/time";
import type {
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

  /**
   * Consecutive blocks at the same load, variation and strap setting read as
   * one line. Quality shows as a range when the blocks disagree, because
   * averaging a technical judgement would invent a score nobody gave.
   */
  const collapsed = useMemo(() => {
    const out: {
      key: string;
      ids: string[];
      last: SnatchBlock;
      attempts: number;
      stood: number;
      caught: number;
      quality: string | null;
    }[] = [];
    for (const block of blocks) {
      const previous = out.at(-1);
      const matches =
        previous &&
        Number(previous.last.weight_kg) === Number(block.weight_kg) &&
        previous.last.variation_id === block.variation_id &&
        previous.last.straps === block.straps;
      if (previous && matches) {
        previous.ids.push(block.id);
        previous.last = block;
        previous.attempts += block.attempts ?? 0;
        previous.stood += block.full_stand_successes ?? 0;
        previous.caught += block.received_not_stood ?? 0;
      } else {
        out.push({
          key: block.id,
          ids: [block.id],
          last: block,
          attempts: block.attempts ?? 0,
          stood: block.full_stand_successes ?? 0,
          caught: block.received_not_stood ?? 0,
          quality: null,
        });
      }
    }
    for (const group of out) {
      const scores = group.ids
        .map((id) => blocks.find((b) => b.id === id)?.quality_10)
        .filter((q): q is number => typeof q === "number");
      group.quality =
        scores.length === 0
          ? null
          : Math.min(...scores) === Math.max(...scores)
            ? `Q${Math.min(...scores)}`
            : `Q${Math.min(...scores)}-${Math.max(...scores)}`;
    }
    return out;
  }, [blocks]);

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
          tone={wsColour("snatch")}
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
              borderColor: straps ? wsColour("snatch") : "var(--border)",
              color: straps ? wsColour("snatch") : "var(--text-dim)",
            }}
          >
            Straps {straps ? "on" : "off"}
          </button>
        </div>

        {/* Load presets. One tap opens a block at that weight. */}
        <div className="grid grid-cols-5 gap-1.5">
          {presets.map((preset) => {
            const weight = Number(preset.weight_kg);
            const inLadder = ladderWeights.includes(weight);
            return (
              <button
                key={preset.weight_kg}
                type="button"
                disabled={!canWrite || busy}
                onClick={() => openWeight(weight)}
                className="tnum min-h-[44px] rounded-[var(--radius)] border text-sm font-semibold disabled:opacity-40"
                style={{
                  borderColor: inLadder ? wsColour("snatch") : "var(--border)",
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

        <p className="mt-1.5 text-[10px] leading-snug text-text-faint">
          Outlined loads are your usual ladder. The ladder opens blocks only — outcomes are
          always yours to tap.
        </p>
      </div>

      {/* The open block: the rapid-tap surface. */}
      {openBlock ? (
        <div
          className="rounded-[var(--radius)] border p-2.5"
          style={{ borderColor: wsColour("snatch"), background: "var(--surface-2)" }}
        >
          <div className="mb-2 flex items-baseline justify-between">
            <div className="tnum text-xl font-bold">
              {trim(Number(openBlock.weight_kg ?? 0))} kg
            </div>
            <div className="tnum text-sm text-text-dim">
              {openBlock.attempts ?? 0} attempt{(openBlock.attempts ?? 0) === 1 ? "" : "s"}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {OUTCOMES.map(({ outcome, label, sub, tone }) => (
              <button
                key={outcome}
                type="button"
                disabled={!canWrite || busy}
                onClick={() => logAttempt(outcome)}
                className="flex min-h-[56px] flex-col items-center justify-center rounded-[var(--radius)] font-bold disabled:opacity-40"
                style={{
                  background: `var(--${tone}-bg)`,
                  color: `var(--${tone})`,
                  border: `1px solid var(--${tone})`,
                }}
              >
                <span className="text-sm leading-none">{label}</span>
                <span className="mt-0.5 text-[9px] font-medium leading-none opacity-75">{sub}</span>
              </button>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
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
          <div className="mt-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-text-faint">
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
                  className="tnum h-8 flex-1 rounded-md border text-[11px] font-semibold disabled:opacity-40"
                  style={{
                    borderColor:
                      openBlock.quality_10 === n ? wsColour("snatch") : "var(--border)",
                    color: openBlock.quality_10 === n ? wsColour("snatch") : "var(--text-faint)",
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

      {/* Blocks logged in this session, with repeats of the same load folded
          into one line: five rows of "35 kg 1/1" is one fact written five
          times. */}
      {blocks.length ? (
        <div className="space-y-1">
          {collapsed.map((group) => {
            const block = group.last;
            const isOpen = group.ids.includes(openBlockId ?? "");
            const variation = variations.find((v) => v.id === block.variation_id);
            return (
              <div
                key={group.key}
                className="flex items-center gap-2 rounded-[var(--radius)] border border-border px-2.5 py-1.5"
                style={{ background: isOpen ? "var(--surface-2)" : "transparent" }}
              >
                <button
                  type="button"
                  onClick={() => setOpenBlockId(block.id)}
                  className="flex flex-1 items-baseline gap-1.5 text-left"
                >
                  <span className="tnum w-14 shrink-0 text-sm font-semibold">
                    {trim(Number(block.weight_kg ?? 0))} kg
                  </span>
                  <span className="tnum text-sm text-text-dim">
                    {group.stood}/{group.attempts}
                  </span>
                  {group.caught > 0 ? <Pill tone="caught">{group.caught} caught</Pill> : null}
                  {group.quality ? <Pill tone="accent">{group.quality}</Pill> : null}
                  {block.straps ? <Pill>straps</Pill> : null}
                  {variation && !variation.counts_as_full_lift ? (
                    <Pill>{variation.name}</Pill>
                  ) : null}
                  {group.ids.length > 1 ? (
                    <span className="ml-auto text-[10px] text-text-faint">
                      {group.ids.length} blocks
                    </span>
                  ) : block.logged_at ? (
                    <span className="ml-auto text-[10px] text-text-faint">
                      {londonTime(block.logged_at)}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={() => removeBlock(group.ids[group.ids.length - 1])}
                  aria-label={
                    group.ids.length > 1
                      ? `Remove the last ${trim(Number(block.weight_kg ?? 0))} kg block`
                      : `Delete ${trim(Number(block.weight_kg ?? 0))} kg block`
                  }
                  className="min-h-[30px] px-1 text-sm text-text-faint disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

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
