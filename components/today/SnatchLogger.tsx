"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { Pill, SectionTitle, wsColour } from "@/components/ui";
import { OUTCOME_LABELS } from "@/lib/types";
import type {
  FailureMode,
  SnatchAttempt,
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
 *
 * Every attempt is shown, in the order it happened, and every one can be
 * opened, corrected or removed. The list used to collapse consecutive blocks
 * at the same load into one line, which summed the counters, hid whichever
 * field made two rows differ, and left all but the newest block in a group
 * unreachable. Opening a load twice now continues the first block instead of
 * starting a second, so there is nothing left to collapse.
 */

type Props = {
  sessionId: string;
  sessionBlockId: string | null;
  presets: WeightPreset[];
  variations: SnatchVariation[];
  ladder: WarmupLadder | null;
  initialBlocks: SnatchBlock[];
  initialAttempts: SnatchAttempt[];
  failureModes: FailureMode[];
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
  initialAttempts,
  failureModes,
  canWrite,
}: Props) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<SnatchBlock[]>(initialBlocks);
  const [attempts, setAttempts] = useState<SnatchAttempt[]>(initialAttempts);
  const [detailId, setDetailId] = useState<string | null>(null);
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
      // The server may have continued an existing block rather than made
      // one. Appending it blindly would show the same row twice until the
      // next refresh.
      setBlocks((prev) => upsert(prev, result.weight_block));
      setOpenBlockId(result.weight_block.id);
    });
  }

  function logAttempt(outcome: SnatchOutcome) {
    if (!openBlock) return;
    run(async () => {
      const result = await write<{ attempt: SnatchAttempt; weight_block: SnatchBlock }>({
        action: "log_attempt",
        block_id: openBlock.id,
        outcome,
      });
      setAttempts((prev) => [...prev, result.attempt]);
      setBlocks((prev) =>
        prev.map((b) => (b.id === result.weight_block.id ? result.weight_block : b)),
      );
    });
  }

  /** Correct one lift: its outcome, how it looked, or why it was missed. */
  function patchAttempt(id: string, patch: Partial<SnatchAttempt>) {
    run(async () => {
      const result = await write<{ attempt: SnatchAttempt; weight_block: SnatchBlock }>({
        action: "update_snatch_attempt",
        attempt_id: id,
        ...patch,
      });
      setAttempts((prev) => prev.map((a) => (a.id === id ? result.attempt : a)));
      setBlocks((prev) =>
        prev.map((b) => (b.id === result.weight_block.id ? result.weight_block : b)),
      );
    });
  }

  function removeAttempt(id: string) {
    run(async () => {
      const result = await write<{ weight_block: SnatchBlock }>({
        action: "delete_snatch_attempt",
        attempt_id: id,
      });
      setAttempts((prev) => prev.filter((a) => a.id !== id));
      setBlocks((prev) =>
        prev.map((b) => (b.id === result.weight_block.id ? result.weight_block : b)),
      );
      if (detailId === id) setDetailId(null);
    });
  }

  function undo() {
    if (!openBlock) return;
    run(async () => {
      const result = await write<{ undone: string; weight_block: SnatchBlock }>({
        action: "undo_attempt",
        block_id: openBlock.id,
      });
      setAttempts((prev) => prev.filter((a) => a.id !== result.undone));
      setBlocks((prev) =>
        prev.map((b) => (b.id === result.weight_block.id ? result.weight_block : b)),
      );
    });
  }

  /**
   * The cross on a row: one lift off the end, and the row with it once the
   * last one goes. Taking a whole block away in a single unconfirmed tap was
   * destroying four records to correct one.
   */
  function removeLastLift(id: string) {
    run(async () => {
      const result = await write<{
        removed_attempt?: string;
        removed_block?: string;
        weight_block?: SnatchBlock;
      }>({ action: "remove_last_lift", weight_block_id: id });

      if (result.removed_attempt) {
        setAttempts((prev) => prev.filter((a) => a.id !== result.removed_attempt));
      }
      if (result.removed_block) {
        setBlocks((prev) => prev.filter((b) => b.id !== result.removed_block));
        if (openBlockId === result.removed_block) setOpenBlockId(null);
      } else if (result.weight_block) {
        const updated = result.weight_block;
        setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      }
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

  /** The lifts of one block, in the order they happened. */
  function attemptsOf(blockId: string): SnatchAttempt[] {
    return attempts
      .filter((a) => a.block_id === blockId)
      .sort((a, b) => a.ordinal - b.ordinal);
  }

  /**
   * Technical quality across a block's lifts, as a range rather than a mean.
   * Averaging a judgement invents a score nobody gave. Falls back to the
   * block's own rating, which is where imported history keeps it.
   */
  function qualityOf(block: SnatchBlock): string | null {
    const scores = attemptsOf(block.id)
      .map((a) => a.quality_10)
      .filter((q): q is number => typeof q === "number");
    if (scores.length === 0) {
      return block.quality_10 != null ? `Q${block.quality_10}` : null;
    }
    const low = Math.min(...scores);
    const high = Math.max(...scores);
    return low === high ? `Q${low}` : `Q${low}-${high}`;
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
      setBlocks((prev) => created.reduce(upsert, prev));
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
                    color: openBlock.quality_10 === n ? wsColour("snatch") : "var(--text-dim)",
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
        <div className="space-y-1.5">
          {blocks.map((block) => {
            const isOpen = block.id === openBlockId;
            const variation = variations.find((v) => v.id === block.variation_id);
            const lifts = attemptsOf(block.id);
            // Both numbers from the same source. An imported block has
            // counters and no rows; taking the numerator from rows and the
            // denominator from counters reports 0/2 for a block that was
            // stood twice.
            const stood = lifts.length
              ? lifts.filter((a) => a.outcome === "stood").length
              : (block.full_stand_successes ?? 0);
            const total = lifts.length || (block.attempts ?? 0);
            const caught = lifts.length
              ? lifts.filter((a) => a.outcome === "received_not_stood").length
              : (block.received_not_stood ?? 0);
            const quality = qualityOf(block);
            return (
              <div
                key={block.id}
                className="rounded-[var(--radius)] border px-2.5 py-1.5"
                style={{
                  borderColor: isOpen ? wsColour("snatch") : "var(--border)",
                  background: isOpen ? "var(--surface-2)" : "transparent",
                }}
              >
                {/* One line per load. The lifts themselves stand in for a
                    tally, so the row says what happened rather than counting
                    it. The clock is gone: the order is already the order they
                    were done in, and a timestamp on every row was a column of
                    noise. Open the block to see it. */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenBlockId(block.id)}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-left"
                  >
                    <span className="tnum w-12 shrink-0 text-sm font-semibold">
                      {trim(Number(block.weight_kg ?? 0))}
                    </span>
                    {lifts.length > 0 ? (
                      lifts.map((a) => {
                        const tone =
                          a.outcome === "stood"
                            ? "var(--stood)"
                            : a.outcome === "received_not_stood"
                              ? "var(--caught)"
                              : "var(--missed)";
                        return (
                          <span
                            key={a.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`Lift ${a.ordinal}, ${OUTCOME_LABELS[a.outcome]}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDetailId(detailId === a.id ? null : a.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                setDetailId(detailId === a.id ? null : a.id);
                              }
                            }}
                            className="tnum flex h-7 min-w-[24px] items-center justify-center gap-0.5 rounded border px-1 text-[11px] font-bold"
                            style={{
                              borderColor: tone,
                              color: tone,
                              background:
                                detailId === a.id ? "var(--surface)" : "transparent",
                            }}
                          >
                            {a.outcome === "stood" ? "✓" : a.outcome === "received_not_stood" ? "◎" : "✕"}
                            {a.quality_10 != null ? (
                              <span className="font-normal">{a.quality_10}</span>
                            ) : null}
                          </span>
                        );
                      })
                    ) : (
                      /* No individual lifts: the imported history keeps its
                         totals this way, and they are not invented into
                         marks that were never recorded. */
                      <span className="tnum shrink-0 text-sm text-text-dim">
                        {block.attempts ? `${stood}/${total} total` : "nothing logged"}
                      </span>
                    )}
                    {caught > 0 && lifts.length === 0 ? (
                      <Pill tone="caught">{caught} caught</Pill>
                    ) : null}
                    {quality && lifts.length === 0 ? <Pill tone="accent">{quality}</Pill> : null}
                    {block.straps ? <Pill>straps</Pill> : null}
                    {/* Always named. Leaving the ordinary case blank saves a
                        little room and says nothing: an empty space only
                        reads as "full snatch" if you already know that is
                        what it means. A variation that does not count as a
                        full lift keeps the louder pill, because it carries
                        tonnage but never a success rate. */}
                    {variation ? (
                      variation.counts_as_full_lift ? (
                        <span className="truncate text-[11px] text-text-dim">
                          {variation.name}
                        </span>
                      ) : (
                        <Pill tone="caught">{variation.name}</Pill>
                      )
                    ) : null}
                  </button>
                  <button
                    type="button"
                    disabled={!canWrite || busy}
                    onClick={() => removeLastLift(block.id)}
                    aria-label={
                      lifts.length > 1
                        ? `Remove the last lift of ${trim(Number(block.weight_kg ?? 0))} kg`
                        : `Remove the ${trim(Number(block.weight_kg ?? 0))} kg row`
                    }
                    className="min-h-[30px] shrink-0 px-1 text-sm text-text-dim disabled:opacity-40"
                  >
                    ×
                  </button>
                </div>

                {detailId && lifts.some((a) => a.id === detailId) ? (
                  <AttemptDetail
                    attempt={lifts.find((a) => a.id === detailId)!}
                    failureModes={failureModes}
                    disabled={!canWrite || busy}
                    onPatch={(patch) => patchAttempt(detailId, patch)}
                    onDelete={() => removeAttempt(detailId)}
                    onClose={() => setDetailId(null)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

    </div>
  );
}

/**
 * One lift. Its outcome is correctable — a stand you decide was a press-out is
 * still a recorded fact, and the block's counters follow from the row, so
 * fixing it here fixes every figure that depends on it.
 */
function AttemptDetail({
  attempt,
  failureModes,
  disabled,
  onPatch,
  onDelete,
  onClose,
}: {
  attempt: SnatchAttempt;
  failureModes: FailureMode[];
  disabled: boolean;
  onPatch: (patch: Partial<SnatchAttempt>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="mt-2 rounded-[var(--radius)] border p-2"
      style={{ borderColor: wsColour("snatch"), background: "var(--surface)" }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold">Lift {attempt.ordinal}</span>
        <span className="flex gap-2 text-[11px] text-text-dim">
          <button
            type="button"
            disabled={disabled}
            onClick={onDelete}
            className="underline underline-offset-2"
          >
            delete
          </button>
          <button type="button" onClick={onClose} className="underline underline-offset-2">
            close
          </button>
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1">
        {OUTCOMES.map(({ outcome, label }) => {
          const on = attempt.outcome === outcome;
          return (
            <button
              key={outcome}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onPatch({ outcome })}
              className="min-h-[38px] rounded-md border text-xs font-bold disabled:opacity-40"
              style={{
                borderColor: on ? `var(--${outcome === "received_not_stood" ? "caught" : outcome})` : "var(--border)",
                color: on
                  ? `var(--${outcome === "received_not_stood" ? "caught" : outcome})`
                  : "var(--text-dim)",
                background: on
                  ? `var(--${outcome === "received_not_stood" ? "caught" : outcome}-bg)`
                  : "transparent",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-2">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-text-dim">
          Technical quality {attempt.quality_10 ? `· ${attempt.quality_10}/10` : "· not rated"}
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onPatch({ quality_10: attempt.quality_10 === n ? null : n })}
              aria-label={`Quality ${n} of 10 for lift ${attempt.ordinal}`}
              className="tnum h-8 flex-1 rounded-md border text-[11px] font-semibold disabled:opacity-40"
              style={{
                borderColor: attempt.quality_10 === n ? wsColour("snatch") : "var(--border)",
                color: attempt.quality_10 === n ? wsColour("snatch") : "var(--text-dim)",
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {attempt.outcome !== "stood" && failureModes.length > 0 ? (
        <div className="mt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-text-dim">
            What went wrong
          </div>
          <select
            value={attempt.failure_mode_id ?? ""}
            disabled={disabled}
            onChange={(event) =>
              onPatch({
                failure_mode_id:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
            className="min-h-[40px] w-full rounded-[var(--radius)] border border-border bg-surface-2 px-2 text-sm"
            aria-label="Failure mode"
          >
            <option value="">Not recorded</option>
            {failureModes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

/** Replace a block if it is already held, append it if it is not. */
function upsert(blocks: SnatchBlock[], block: SnatchBlock): SnatchBlock[] {
  return blocks.some((b) => b.id === block.id)
    ? blocks.map((b) => (b.id === block.id ? block : b))
    : [...blocks, block];
}

function sum(values: (number | null)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/** 47.50 -> "47.5", 45.00 -> "45". */
function trim(value: number): string {
  return String(Number(value));
}
