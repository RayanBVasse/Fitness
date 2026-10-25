import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase";
import { londonToday } from "@/lib/time";

/**
 * The single write path.
 *
 * The app is private: the middleware rejects any unauthenticated request to
 * /api/* before it reaches this handler, so there is no passcode check here —
 * holding a valid session is the authorisation. Mutations execute with the
 * service-role key, which never leaves the server.
 *
 * One endpoint rather than a dozen, so the shape of a write is defined in
 * exactly one place.
 */

const uuid = z.string().uuid();

const Actions = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start_session"),
    gym_id: z.number().int().positive().nullable().optional(),
    gym_custom_label: z.string().trim().max(80).nullable().optional(),
    session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    started_at: z.string().datetime().nullable().optional(),
    /** A genuinely separate visit on the same day, rather than more of the same one. */
    force_new: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("update_session"),
    session_id: uuid,
    gym_id: z.number().int().positive().nullable().optional(),
    gym_custom_label: z.string().trim().max(80).nullable().optional(),
    started_at: z.string().datetime().nullable().optional(),
    ended_at: z.string().datetime().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    action: z.literal("set_day_status"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["trained", "rest", "unlogged"]),
    notes: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    action: z.literal("save_check_in"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    metrics: z
      .array(
        z.object({
          metric: z.string().min(1).max(64),
          value_numeric: z.number().nullable().optional(),
          value_text: z.string().max(4000).nullable().optional(),
        }),
      )
      .max(40),
  }),
  z.object({
    action: z.literal("log_hypertrophy_set"),
    session_id: uuid,
    session_block_id: uuid.nullable().optional(),
    exercise_id: z.number().int().positive(),
    machine_label: z.string().trim().max(80).nullable().optional(),
    load_kg: z.number().min(0).max(1000).nullable().optional(),
    reps: z.number().int().min(0).max(200).nullable().optional(),
    sets_count: z.number().int().min(1).max(20).optional(),
    side: z.enum(["both", "left", "right"]).optional(),
    order_vs_snatch: z.enum(["before_snatch", "after_snatch", "standalone", "unknown"]).optional(),
    /** A drop from the set it names, rather than a working set of its own. */
    parent_set_id: uuid.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    action: z.literal("delete_hypertrophy_set"),
    set_id: uuid,
  }),
  z.object({
    action: z.literal("log_calisthenics_entry"),
    session_id: uuid,
    session_block_id: uuid.nullable().optional(),
    skill_variation_id: z.number().int().positive(),
    sets_count: z.number().int().min(1).max(50).nullable().optional(),
    reps_per_set: z.number().int().min(0).max(100).nullable().optional(),
    attempts: z.number().int().min(0).max(200).nullable().optional(),
    successful_attempts: z.number().int().min(0).max(200).nullable().optional(),
    best_hold_seconds: z.number().min(0).max(3600).nullable().optional(),
    total_hold_seconds: z.number().min(0).max(36000).nullable().optional(),
    controlled_ascent: z.boolean().nullable().optional(),
    controlled_descent: z.boolean().nullable().optional(),
    assistance_id: z.number().int().positive().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    action: z.literal("delete_calisthenics_entry"),
    entry_id: uuid,
  }),
  z.object({
    action: z.literal("set_note_review"),
    note_ids: z.array(uuid).min(1).max(200),
    review_status: z.enum(["pending", "approved", "rejected"]),
    review_note: z.string().max(1000).nullable().optional(),
  }),
  z.object({
    action: z.literal("delete_session"),
    session_id: uuid,
    /** Set only after the user confirmed a count they were shown. */
    discard_records: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("add_block"),
    session_id: uuid,
    workstream: z.enum(["snatch", "calisthenics", "hypertrophy"]),
    started_at: z.string().datetime().nullable().optional(),
  }),
  z.object({
    action: z.literal("update_block"),
    block_id: uuid,
    started_at: z.string().datetime().nullable().optional(),
    ended_at: z.string().datetime().nullable().optional(),
    duration_minutes: z.number().int().min(0).max(600).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    action: z.literal("open_weight_block"),
    session_id: uuid,
    session_block_id: uuid.nullable().optional(),
    weight_kg: z.number().min(0).max(300),
    variation_id: z.number().int().positive(),
    straps: z.boolean().nullable().optional(),
    is_warmup: z.boolean().optional(),
    is_cooldown: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("log_attempt"),
    block_id: uuid,
    outcome: z.enum(["stood", "received_not_stood", "missed", "aborted"]),
    quality_10: z.number().int().min(1).max(10).nullable().optional(),
    failure_mode_id: z.number().int().positive().nullable().optional(),
  }),
  z.object({
    action: z.literal("undo_attempt"),
    block_id: uuid,
  }),
  z.object({
    action: z.literal("rate_weight_block"),
    weight_block_id: uuid,
    quality_10: z.number().int().min(1).max(10).nullable().optional(),
    rpe_10: z.number().min(1).max(10).nullable().optional(),
    straps: z.boolean().nullable().optional(),
    failure_mode_id: z.number().int().positive().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    action: z.literal("delete_weight_block"),
    weight_block_id: uuid,
  }),
]);

/**
 * Drops keys the caller did not send, so a partial update never overwrites a
 * stored value with null just because the field was absent from the payload.
 */
function patch<T extends Record<string, unknown>>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const parsed = Actions.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", detail: parsed.error.issues },
      { status: 422 },
    );
  }

  let db;
  try {
    db = adminClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Write path unavailable" },
      { status: 503 },
    );
  }

  const input = parsed.data;

  try {
    switch (input.action) {
      case "start_session": {
        const session_date = input.session_date ?? londonToday();
        // A session is one gym visit. Three workstreams in one visit belong to
        // the same session, so the default is to reuse today's — but a morning
        // and an evening visit are two visits, and `force_new` says so.
        if (!input.force_new) {
          const existing = await db
            .from("sessions")
            .select("*")
            .eq("session_date", session_date)
            .order("created_at", { ascending: true })
            .limit(1);
          if (existing.error) throw existing.error;
          if (existing.data?.length) {
            return NextResponse.json({ session: existing.data[0], reused: true });
          }
        }
        const { data, error } = await db
          .from("sessions")
          .insert({
            session_date,
            gym_id: input.gym_id ?? null,
            gym_custom_label: input.gym_custom_label ?? null,
            started_at: input.started_at ?? new Date().toISOString(),
          })
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ session: data, reused: false });
      }

      case "update_session": {
        const { data, error } = await db
          .from("sessions")
          .update(
            patch({
              gym_id: input.gym_id,
              gym_custom_label: input.gym_custom_label,
              started_at: input.started_at,
              ended_at: input.ended_at,
              notes: input.notes,
            }),
          )
          .eq("id", input.session_id)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ session: data });
      }

      case "set_day_status": {
        // A day with sessions on it is trained, whatever the request says;
        // refusing here keeps the record honest rather than letting a stray
        // tap overwrite what actually happened.
        if (input.status === "rest") {
          const { count, error } = await db
            .from("sessions")
            .select("id", { count: "exact", head: true })
            .eq("session_date", input.date);
          if (error) throw error;
          if ((count ?? 0) > 0) {
            return NextResponse.json(
              { error: "That day already has training logged against it." },
              { status: 409 },
            );
          }
        }

        const { data, error } = await db
          .from("days")
          .upsert(
            {
              day: input.date,
              status: input.status,
              notes: input.notes ?? null,
              provenance: "logged",
            },
            { onConflict: "day" },
          )
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ day: data });
      }

      case "save_check_in": {
        // Only metrics the database defines are accepted, so a typo or a
        // crafted payload cannot invent a dimension and quietly pollute the
        // series the charts read.
        const { data: defs, error: defsError } = await db
          .from("daily_metric_defs")
          .select("slug, kind, min_value, max_value")
          .eq("is_active", true);
        if (defsError) throw defsError;
        const known = new Map((defs ?? []).map((d) => [d.slug, d]));

        const unknown = input.metrics.filter((m) => !known.has(m.metric));
        if (unknown.length) {
          return NextResponse.json(
            { error: `Unknown metric: ${unknown.map((m) => m.metric).join(", ")}` },
            { status: 422 },
          );
        }

        for (const entry of input.metrics) {
          const def = known.get(entry.metric)!;
          const numeric = entry.value_numeric ?? null;
          if (numeric !== null) {
            if (
              (def.min_value !== null && numeric < Number(def.min_value)) ||
              (def.max_value !== null && numeric > Number(def.max_value))
            ) {
              return NextResponse.json(
                { error: `${entry.metric} is outside its allowed range.` },
                { status: 422 },
              );
            }
          }
          const text = entry.value_text?.trim() ? entry.value_text.trim() : null;

          // Clearing a field removes the row: a blank is "not recorded", which
          // is different from a recorded zero.
          if (numeric === null && text === null) {
            const { error } = await db
              .from("daily_metrics")
              .delete()
              .eq("metric_date", input.date)
              .eq("metric", entry.metric)
              .eq("provenance", "logged");
            if (error) throw error;
            continue;
          }

          const { data: existing, error: findError } = await db
            .from("daily_metrics")
            .select("id")
            .eq("metric_date", input.date)
            .eq("metric", entry.metric)
            .eq("provenance", "logged")
            .maybeSingle();
          if (findError) throw findError;

          if (existing) {
            const { error } = await db
              .from("daily_metrics")
              .update({ value_numeric: numeric, value_text: text })
              .eq("id", existing.id);
            if (error) throw error;
          } else {
            const { error } = await db.from("daily_metrics").insert({
              metric_date: input.date,
              metric: entry.metric,
              value_numeric: numeric,
              value_text: text,
              provenance: "logged",
            });
            if (error) throw error;
          }
        }

        const { data, error } = await db
          .from("daily_metrics")
          .select("metric, value_numeric, value_text")
          .eq("metric_date", input.date)
          .eq("provenance", "logged");
        if (error) throw error;
        return NextResponse.json({ metrics: data });
      }

      case "log_hypertrophy_set": {
        const { data, error } = await db
          .from("hypertrophy_sets")
          .insert({
            session_id: input.session_id,
            session_block_id: input.session_block_id ?? null,
            exercise_id: input.exercise_id,
            machine_label: input.machine_label ?? null,
            load_kg: input.load_kg ?? null,
            reps: input.reps ?? null,
            sets_count: input.sets_count ?? 1,
            side: input.side ?? "both",
            order_vs_snatch: input.order_vs_snatch ?? "unknown",
            parent_set_id: input.parent_set_id ?? null,
            is_drop: Boolean(input.parent_set_id),
            notes: input.notes ?? null,
            logged_at: new Date().toISOString(),
            record_precision: "attempt",
          })
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ set: data });
      }

      case "delete_hypertrophy_set": {
        // Drops hang off their parent and go with it; the cascade handles that.
        const { error } = await db.from("hypertrophy_sets").delete().eq("id", input.set_id);
        if (error) throw error;
        return NextResponse.json({ deleted: input.set_id });
      }

      case "log_calisthenics_entry": {
        if (
          input.attempts != null &&
          input.successful_attempts != null &&
          input.successful_attempts > input.attempts
        ) {
          return NextResponse.json(
            { error: "Successes cannot exceed attempts." },
            { status: 422 },
          );
        }
        if (
          input.best_hold_seconds != null &&
          input.total_hold_seconds != null &&
          input.best_hold_seconds > input.total_hold_seconds
        ) {
          return NextResponse.json(
            { error: "Best hold cannot exceed total hold." },
            { status: 422 },
          );
        }

        const { data, error } = await db
          .from("calisthenics_entries")
          .insert({
            session_id: input.session_id,
            session_block_id: input.session_block_id ?? null,
            skill_variation_id: input.skill_variation_id,
            sets_count: input.sets_count ?? null,
            reps_per_set: input.reps_per_set ?? null,
            attempts: input.attempts ?? null,
            successful_attempts: input.successful_attempts ?? null,
            best_hold_seconds: input.best_hold_seconds ?? null,
            total_hold_seconds: input.total_hold_seconds ?? null,
            controlled_ascent: input.controlled_ascent ?? null,
            controlled_descent: input.controlled_descent ?? null,
            assistance_id: input.assistance_id ?? null,
            notes: input.notes ?? null,
            logged_at: new Date().toISOString(),
            record_precision: "attempt",
          })
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ entry: data });
      }

      case "delete_calisthenics_entry": {
        const { error } = await db
          .from("calisthenics_entries")
          .delete()
          .eq("id", input.entry_id);
        if (error) throw error;
        return NextResponse.json({ deleted: input.entry_id });
      }

      case "set_note_review": {
        // Approval is the consent gate: the Coach can read approved notes and
        // nothing else, so this is the only thing standing between a private
        // journal and a model.
        const { data, error } = await db
          .from("context_notes")
          .update({
            review_status: input.review_status,
            reviewed_at: input.review_status === "pending" ? null : new Date().toISOString(),
            review_note: input.review_note ?? null,
          })
          .in("id", input.note_ids)
          .select("id");
        if (error) throw error;
        return NextResponse.json({ updated: data?.length ?? 0 });
      }

      case "delete_session": {
        // Refuses when training is logged against it. Changing your mind about
        // a session you never used is routine; discarding recorded lifts is
        // not, and should not happen by tapping the wrong thing.
        const counts = await Promise.all(
          (["snatch_blocks", "hypertrophy_sets", "calisthenics_entries"] as const).map((table) =>
            db
              .from(table)
              .select("id", { count: "exact", head: true })
              .eq("session_id", input.session_id),
          ),
        );
        const failed = counts.find((c) => c.error);
        if (failed?.error) throw failed.error;
        const logged = counts.reduce((total, c) => total + (c.count ?? 0), 0);
        // Refuses by default so a stray tap cannot discard training. It is
        // surmountable, not a dead end: the interface shows the count and asks,
        // and `discard_records` is that answer. Cascades remove the children.
        if (logged > 0 && !input.discard_records) {
          return NextResponse.json(
            {
              error: `That session has ${logged} record${logged === 1 ? "" : "s"} logged against it.`,
              logged,
              needs_confirmation: true,
            },
            { status: 409 },
          );
        }

        const { data: session, error: findError } = await db
          .from("sessions")
          .select("session_date")
          .eq("id", input.session_id)
          .maybeSingle();
        if (findError) throw findError;

        const { error } = await db.from("sessions").delete().eq("id", input.session_id);
        if (error) throw error;

        // The day was marked trained when the session was created. With no
        // sessions left it is unlogged again - not rest, which is a claim only
        // you can make.
        if (session) {
          const { count, error: remainingError } = await db
            .from("sessions")
            .select("id", { count: "exact", head: true })
            .eq("session_date", session.session_date);
          if (remainingError) throw remainingError;
          if ((count ?? 0) === 0) {
            const { error: dayError } = await db
              .from("days")
              .update({ status: "unlogged" })
              .eq("day", session.session_date)
              .eq("status", "trained");
            if (dayError) throw dayError;
          }
        }
        return NextResponse.json({ deleted: input.session_id });
      }

      case "add_block": {
        const { count, error: countError } = await db
          .from("session_blocks")
          .select("id", { count: "exact", head: true })
          .eq("session_id", input.session_id);
        if (countError) throw countError;
        const { data, error } = await db
          .from("session_blocks")
          .insert({
            session_id: input.session_id,
            workstream: input.workstream,
            started_at: input.started_at ?? new Date().toISOString(),
            sort_order: ((count ?? 0) + 1) * 10,
          })
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ block: data });
      }

      case "update_block": {
        const { data, error } = await db
          .from("session_blocks")
          .update(
            patch({
              started_at: input.started_at,
              ended_at: input.ended_at,
              duration_minutes: input.duration_minutes,
              notes: input.notes,
            }),
          )
          .eq("id", input.block_id)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ block: data });
      }

      case "open_weight_block": {
        const { data, error } = await db
          .from("snatch_blocks")
          .insert({
            session_id: input.session_id,
            session_block_id: input.session_block_id ?? null,
            weight_kg: input.weight_kg,
            variation_id: input.variation_id,
            straps: input.straps ?? null,
            is_warmup: input.is_warmup ?? false,
            is_cooldown: input.is_cooldown ?? false,
            logged_at: new Date().toISOString(),
            record_precision: "attempt",
          })
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ weight_block: data });
      }

      case "log_attempt": {
        // Ordinals are assigned server-side so rapid tapping cannot interleave
        // two attempts onto the same number.
        const { data: last, error: lastError } = await db
          .from("snatch_attempts")
          .select("ordinal")
          .eq("block_id", input.block_id)
          .order("ordinal", { ascending: false })
          .limit(1);
        if (lastError) throw lastError;
        const ordinal = (last?.[0]?.ordinal ?? 0) + 1;

        const { data, error } = await db
          .from("snatch_attempts")
          .insert({
            block_id: input.block_id,
            ordinal,
            outcome: input.outcome,
            quality_10: input.quality_10 ?? null,
            failure_mode_id: input.failure_mode_id ?? null,
          })
          .select()
          .single();
        if (error) throw error;

        // The block counters are maintained by a trigger; read them back so the
        // UI shows the stored truth rather than its own optimistic tally.
        const { data: block, error: blockError } = await db
          .from("snatch_blocks")
          .select("*")
          .eq("id", input.block_id)
          .single();
        if (blockError) throw blockError;
        return NextResponse.json({ attempt: data, weight_block: block });
      }

      case "undo_attempt": {
        const { data: last, error: lastError } = await db
          .from("snatch_attempts")
          .select("id, ordinal")
          .eq("block_id", input.block_id)
          .order("ordinal", { ascending: false })
          .limit(1);
        if (lastError) throw lastError;
        if (!last?.length) {
          return NextResponse.json({ error: "Nothing to undo" }, { status: 404 });
        }
        const { error } = await db.from("snatch_attempts").delete().eq("id", last[0].id);
        if (error) throw error;

        const { data: block, error: blockError } = await db
          .from("snatch_blocks")
          .select("*")
          .eq("id", input.block_id)
          .single();
        if (blockError) throw blockError;
        return NextResponse.json({ undone: last[0].id, weight_block: block });
      }

      case "rate_weight_block": {
        const { data, error } = await db
          .from("snatch_blocks")
          .update(
            patch({
              quality_10: input.quality_10,
              rpe_10: input.rpe_10,
              straps: input.straps,
              failure_mode_id: input.failure_mode_id,
              notes: input.notes,
            }),
          )
          .eq("id", input.weight_block_id)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ weight_block: data });
      }

      case "delete_weight_block": {
        const { error } = await db
          .from("snatch_blocks")
          .delete()
          .eq("id", input.weight_block_id);
        if (error) throw error;
        return NextResponse.json({ deleted: input.weight_block_id });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
