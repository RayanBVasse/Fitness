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
    /** Log the same set several times. Each becomes its own row: a set that
     *  happened is a row, and `sets_count` means something else entirely —
     *  it is how the imported history recorded a block it never broke down. */
    repeat: z.number().int().min(1).max(12).optional(),
    side: z.enum(["both", "left", "right"]).optional(),
    order_vs_snatch: z.enum(["before_snatch", "after_snatch", "standalone", "unknown"]).optional(),
    /** A drop from the set it names, rather than a working set of its own. */
    parent_set_id: uuid.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    action: z.literal("update_hypertrophy_set"),
    set_id: uuid,
    load_kg: z.number().min(0).max(1000).nullable(),
    reps: z.number().int().min(0).max(200).nullable(),
    rir: z.number().int().min(0).max(10).nullable(),
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
    action: z.literal("log_attempt_row"),
    entry_id: uuid,
    succeeded: z.boolean().nullable(),
    hold_seconds: z.number().min(0).max(3600).nullable().optional(),
    controlled_ascent: z.boolean().nullable().optional(),
    controlled_descent: z.boolean().nullable().optional(),
    negative_seconds: z.number().min(0).max(3600).nullable().optional(),
  }),
  z.object({
    action: z.literal("update_attempt_row"),
    attempt_id: uuid,
    succeeded: z.boolean().nullable().optional(),
    hold_seconds: z.number().min(0).max(3600).nullable().optional(),
    controlled_ascent: z.boolean().nullable().optional(),
    controlled_descent: z.boolean().nullable().optional(),
    negative_seconds: z.number().min(0).max(3600).nullable().optional(),
  }),
  z.object({
    action: z.literal("delete_attempt_row"),
    attempt_id: uuid,
  }),
  z.object({
    action: z.literal("update_calisthenics_entry"),
    entry_id: uuid,
    attempts: z.number().int().min(0).max(200).nullable(),
    successful_attempts: z.number().int().min(0).max(200).nullable(),
    best_hold_seconds: z.number().min(0).max(3600).nullable(),
    controlled_ascent: z.boolean().nullable(),
    controlled_descent: z.boolean().nullable(),
    assistance_id: z.number().int().positive().nullable(),
    quality_10: z.number().int().min(1).max(10).nullable().optional(),
  }),
  z.object({
    action: z.literal("delete_calisthenics_entry"),
    entry_id: uuid,
  }),
  z.object({
    action: z.literal("add_note"),
    content: z.string().trim().min(1).max(4000),
    category: z.enum([
      "observation",
      "technique",
      "coaching_advice",
      "question",
      "experiment",
      "nutrition",
      "gym_context",
      "sleep",
    ]),
    anchor_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    workstream: z.enum(["snatch", "calisthenics", "hypertrophy"]).nullable().optional(),
    session_id: uuid.nullable().optional(),
    important: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("update_note"),
    note_id: uuid,
    content: z.string().trim().min(1).max(4000),
    category: z.enum([
      "observation",
      "technique",
      "coaching_advice",
      "question",
      "experiment",
      "nutrition",
      "gym_context",
      "sleep",
    ]),
    important: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("delete_note"),
    note_id: uuid,
  }),
  z.object({
    action: z.literal("set_note_review"),
    note_ids: z.array(uuid).min(1).max(200),
    review_status: z.enum(["pending", "approved", "rejected"]),
    review_note: z.string().max(1000).nullable().optional(),
  }),
  z.object({
    action: z.literal("save_body_observation"),
    injury_id: z.number().int(),
    obs_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // A pain-free day carries no severity: the table refuses both, and so
    // does this, rather than letting the database be the only thing that
    // notices.
    pain_free: z.boolean(),
    pain_during_0_10: z.number().int().min(0).max(10).nullable().optional(),
    pain_after_0_10: z.number().int().min(0).max(10).nullable().optional(),
    provoking_activity_id: z.number().int().nullable().optional(),
    session_id: uuid.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    action: z.literal("set_next_morning"),
    observation_id: uuid,
    pain_next_morning_0_10: z.number().int().min(0).max(10).nullable(),
  }),
  z.object({
    action: z.literal("delete_body_observation"),
    observation_id: uuid,
  }),
  z.object({
    action: z.literal("save_review"),
    scope: z.enum(["day", "week"]),
    /** The day, or the Monday of the week. Both ISO dates. */
    key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // Long-form: these arrive as whole documents with headings and tables.
    // Blank is how a review is removed, so there is no minimum.
    content: z.string().max(20000),
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
    action: z.literal("update_snatch_attempt"),
    attempt_id: uuid,
    outcome: z.enum(["stood", "received_not_stood", "missed", "aborted"]).optional(),
    quality_10: z.number().int().min(1).max(10).nullable().optional(),
    failure_mode_id: z.number().int().positive().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    action: z.literal("delete_snatch_attempt"),
    attempt_id: uuid,
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
    action: z.literal("remove_last_lift"),
    weight_block_id: uuid,
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
        const row = {
            session_id: input.session_id,
            session_block_id:
              input.session_block_id ??
              (await ensureBlock(db, input.session_id, "hypertrophy")),
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
        };
        const { data, error } = await db
          .from("hypertrophy_sets")
          .insert(Array.from({ length: input.repeat ?? 1 }, () => ({ ...row })))
          .select();
        if (error) throw error;
        const sets = data ?? [];
        return NextResponse.json({ set: sets[0], sets });
      }

      case "update_hypertrophy_set": {
        // Logged rows only. An imported reconstruction corrected in place would
        // quietly become indistinguishable from something actually measured,
        // and the provenance split is what the whole analysis rests on.
        const { data, error } = await db
          .from("hypertrophy_sets")
          .update({
            load_kg: input.load_kg,
            reps: input.reps,
            rir: input.rir,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.set_id)
          .eq("provenance", "logged")
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          return NextResponse.json(
            {
              error:
                "That set came from the imported history, not from logging here, so it is not editable.",
            },
            { status: 409 },
          );
        }
        return NextResponse.json({ set: data });
      }

      case "delete_hypertrophy_set": {
        const { data: owner } = await db
          .from("hypertrophy_sets")
          .select("session_id")
          .eq("id", input.set_id)
          .maybeSingle();
        // Drops hang off their parent and go with it; the cascade handles that.
        const { error } = await db.from("hypertrophy_sets").delete().eq("id", input.set_id);
        if (error) throw error;
        if (owner) await pruneEmptyBlock(db, owner.session_id, "hypertrophy");
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
            session_block_id:
              input.session_block_id ??
              (await ensureBlock(db, input.session_id, "calisthenics")),
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

      case "log_attempt_row": {
        // Appended at the end: the order attempts happened in is part of the
        // record, and a success on the fifth try is not the same session as a
        // success on the first.
        const { data: last } = await db
          .from("calisthenics_attempts")
          .select("ordinal")
          .eq("entry_id", input.entry_id)
          .order("ordinal", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data, error } = await db
          .from("calisthenics_attempts")
          .insert({
            entry_id: input.entry_id,
            ordinal: (last?.ordinal ?? 0) + 1,
            succeeded: input.succeeded,
            hold_seconds: input.hold_seconds ?? null,
            controlled_ascent: input.controlled_ascent ?? null,
            controlled_descent: input.controlled_descent ?? null,
            negative_seconds: input.negative_seconds ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ attempt: data });
      }

      case "update_attempt_row": {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (input.succeeded !== undefined) patch.succeeded = input.succeeded;
        if (input.hold_seconds !== undefined) patch.hold_seconds = input.hold_seconds;
        if (input.controlled_ascent !== undefined) {
          patch.controlled_ascent = input.controlled_ascent;
        }
        if (input.controlled_descent !== undefined) {
          patch.controlled_descent = input.controlled_descent;
        }
        if (input.negative_seconds !== undefined) {
          patch.negative_seconds = input.negative_seconds;
        }
        const { data, error } = await db
          .from("calisthenics_attempts")
          .update(patch)
          .eq("id", input.attempt_id)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ attempt: data });
      }

      case "delete_attempt_row": {
        const { error } = await db
          .from("calisthenics_attempts")
          .delete()
          .eq("id", input.attempt_id);
        if (error) throw error;
        return NextResponse.json({ deleted: input.attempt_id });
      }

      case "update_calisthenics_entry": {
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

        // Logged rows only, as with hypertrophy sets: the imported history is
        // a reconstruction and has to stay recognisable as one.
        //
        // The skill variation itself is not editable. A banded handstand
        // push-up corrected into a freestanding one is not a corrected
        // record, it is a different skill wearing the first one's history.
        const { data, error } = await db
          .from("calisthenics_entries")
          .update({
            attempts: input.attempts,
            successful_attempts: input.successful_attempts,
            best_hold_seconds: input.best_hold_seconds,
            controlled_ascent: input.controlled_ascent,
            controlled_descent: input.controlled_descent,
            assistance_id: input.assistance_id,
            quality_10: input.quality_10 ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.entry_id)
          .eq("provenance", "logged")
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          return NextResponse.json(
            {
              error:
                "That entry came from the imported history, not from logging here, so it is not editable.",
            },
            { status: 409 },
          );
        }
        return NextResponse.json({ entry: data });
      }

      case "delete_calisthenics_entry": {
        const { data: owner } = await db
          .from("calisthenics_entries")
          .select("session_id")
          .eq("id", input.entry_id)
          .maybeSingle();
        const { error } = await db
          .from("calisthenics_entries")
          .delete()
          .eq("id", input.entry_id);
        if (error) throw error;
        if (owner) await pruneEmptyBlock(db, owner.session_id, "calisthenics");
        return NextResponse.json({ deleted: input.entry_id });
      }

      case "add_note": {
        // Approved on write. The review gate exists so that material written
        // without the Coach in mind is not sent to it unseen; a note typed
        // into a box labelled "for the Coach" has already cleared that bar.
        // The imported pack keeps its gate untouched.
        const { data, error } = await db
          .from("context_notes")
          .insert({
            external_source_id: `authored:${crypto.randomUUID()}`,
            note_type: "athlete_report",
            category: input.category,
            content: input.content,
            anchor_date: input.anchor_date,
            workstream: input.workstream ?? null,
            source_type: "authored_in_app",
            evidence_status: "user_reported",
            sensitivity: "normal",
            review_status: "approved",
            reviewed_at: new Date().toISOString(),
            linked_session_id: input.session_id ?? null,
            tags: input.important ? ["authored", "important"] : ["authored"],
            content_hash: await sha256(input.content),
          })
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ note: data });
      }

      case "update_note": {
        // Authored notes only. An imported note's wording is a record of what
        // was said at the time; editing it would quietly rewrite the source.
        const { data: existing, error: readError } = await db
          .from("context_notes")
          .select("tags, source_type")
          .eq("id", input.note_id)
          .maybeSingle();
        if (readError) throw readError;
        if (!existing || existing.source_type === "pack_import") {
          return NextResponse.json(
            { error: "Imported notes record what was said at the time and are not editable." },
            { status: 409 },
          );
        }
        const tags = (existing.tags ?? []).filter(
          (t: string) => t !== "important",
        );
        if (input.important) tags.push("important");

        const { data, error } = await db
          .from("context_notes")
          .update({
            content: input.content,
            category: input.category,
            tags,
            content_hash: await sha256(input.content),
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.note_id)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ note: data });
      }

      case "delete_note": {
        const { data: existing, error: readError } = await db
          .from("context_notes")
          .select("source_type")
          .eq("id", input.note_id)
          .maybeSingle();
        if (readError) throw readError;
        if (!existing || existing.source_type === "pack_import") {
          return NextResponse.json(
            { error: "Imported notes are part of the record and are rejected, not deleted." },
            { status: 409 },
          );
        }
        const { error } = await db.from("context_notes").delete().eq("id", input.note_id);
        if (error) throw error;
        return NextResponse.json({ deleted: input.note_id });
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

      case "save_body_observation": {
        // One reading per site per day. The table allows several — an import
        // may hold two sentences about one knee — but a screen that let you
        // add a second today would quietly double the day in every count.
        const { data: existing, error: readError } = await db
          .from("injury_observations")
          .select("id")
          .eq("injury_id", input.injury_id)
          .eq("obs_date", input.obs_date)
          .eq("provenance", "logged")
          .limit(1);
        if (readError) throw readError;

        const patch = {
          injury_id: input.injury_id,
          obs_date: input.obs_date,
          pain_free: input.pain_free,
          // Cleared rather than left behind when the day turns out pain-free:
          // a severity from an earlier edit would contradict the flag, and
          // the check constraint would reject the row anyway.
          pain_during_0_10: input.pain_free ? null : (input.pain_during_0_10 ?? null),
          pain_after_0_10: input.pain_free ? null : (input.pain_after_0_10 ?? null),
          provoking_activity_id: input.pain_free
            ? null
            : (input.provoking_activity_id ?? null),
          session_id: input.session_id ?? null,
          notes: input.notes ?? null,
          provenance: "logged" as const,
        };

        const row = existing?.[0];
        const result = row
          ? await db
              .from("injury_observations")
              .update({
                ...patch,
                // A pain-free day cannot carry a next-morning reading, so the
                // flag flipping to true has to take it with it.
                ...(input.pain_free ? { pain_next_morning_0_10: null } : {}),
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id)
              .select()
              .single()
          : await db.from("injury_observations").insert(patch).select().single();
        if (result.error) throw result.error;
        return NextResponse.json({ observation: result.data });
      }

      case "set_next_morning": {
        // How it felt the morning after, written onto the day it is about.
        // Recorded a day late by definition, which is why it is patched onto
        // an existing row rather than opening a new one.
        const { data, error } = await db
          .from("injury_observations")
          .update({
            pain_next_morning_0_10: input.pain_next_morning_0_10,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.observation_id)
          .eq("provenance", "logged")
          .eq("pain_free", false)
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          return NextResponse.json(
            {
              error:
                "That reading is either imported or recorded as pain-free, and a pain-free day holds no severity.",
            },
            { status: 409 },
          );
        }
        return NextResponse.json({ observation: data });
      }

      case "delete_body_observation": {
        const { data, error } = await db
          .from("injury_observations")
          .delete()
          .eq("id", input.observation_id)
          .eq("provenance", "logged")
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          return NextResponse.json(
            { error: "Imported readings are part of the record and are not deleted." },
            { status: 409 },
          );
        }
        return NextResponse.json({ deleted: input.observation_id });
      }

      case "save_review": {
        // One review per period. The external id is the period, so pasting a
        // corrected review updates the row instead of leaving two documents
        // claiming to describe the same day.
        const isWeek = input.scope === "week";
        const externalId = `${isWeek ? "weekly" : "daily"}_review:${input.key}`;
        const content = input.content.trim();

        if (!content) {
          // Clearing the box removes the review. The content column refuses
          // blank text, so there is no empty-document state to store.
          const { error } = await db
            .from("context_notes")
            .delete()
            .eq("external_source_id", externalId);
          if (error) throw error;
          return NextResponse.json({ deleted: externalId });
        }

        const { data, error } = await db
          .from("context_notes")
          .upsert(
            {
              external_source_id: externalId,
              // Not an athlete report. The Coach must be able to tell its own
              // reading of a day from what the athlete said about it, or a
              // hypothesis starts being cited as evidence for itself.
              note_type: "assistant_review",
              category: "coaching_advice",
              content,
              anchor_date: isWeek ? null : input.key,
              period_label: isWeek ? input.key : null,
              source_type: "pasted_review",
              evidence_status: "external_assistant_interpretation",
              sensitivity: "normal",
              // Pasted deliberately into a box labelled for the purpose, by
              // the only person the gate protects. Same reasoning as an
              // authored note; the imported pack keeps its own gate.
              review_status: "approved",
              reviewed_at: new Date().toISOString(),
              tags: ["review", isWeek ? "weekly" : "daily"],
              content_hash: await sha256(content),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "external_source_id" },
          )
          .select("id, content, anchor_date, period_label, updated_at")
          .single();
        if (error) throw error;
        return NextResponse.json({ review: data });
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
        // Continue the block you are already on; start a new one otherwise.
        //
        // Only the MOST RECENT block is a candidate. Tapping 45 twice in a
        // row is one bout and must not produce two identical rows — that was
        // the original complaint. But 45, then 47.5, then 45 again on the way
        // down is two separate bouts at 45, and folding the second into the
        // first would file lifts under a row that sits above the heavier work
        // they came after. The order you lifted in is part of the record.
        const { data: latest, error: latestError } = await db
          .from("snatch_blocks")
          .select("*")
          .eq("session_id", input.session_id)
          .order("logged_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestError) throw latestError;

        const continues =
          latest &&
          Number(latest.weight_kg) === Number(input.weight_kg) &&
          latest.variation_id === input.variation_id &&
          Boolean(latest.straps) === Boolean(input.straps);
        if (continues) {
          return NextResponse.json({ weight_block: latest, reused: true });
        }

        const { data, error } = await db
          .from("snatch_blocks")
          .insert({
            session_id: input.session_id,
            session_block_id:
              input.session_block_id ?? (await ensureBlock(db, input.session_id, "snatch")),
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

      case "update_snatch_attempt": {
        const patch: Record<string, unknown> = {};
        if (input.outcome !== undefined) patch.outcome = input.outcome;
        if (input.quality_10 !== undefined) patch.quality_10 = input.quality_10;
        if (input.failure_mode_id !== undefined) {
          patch.failure_mode_id = input.failure_mode_id;
        }
        if (input.notes !== undefined) patch.notes = input.notes;

        const { data, error } = await db
          .from("snatch_attempts")
          .update(patch)
          .eq("id", input.attempt_id)
          .select()
          .single();
        if (error) throw error;

        // The trigger has already corrected the block's counters.
        const { data: block, error: blockError } = await db
          .from("snatch_blocks")
          .select("*")
          .eq("id", data.block_id)
          .single();
        if (blockError) throw blockError;
        return NextResponse.json({ attempt: data, weight_block: block });
      }

      case "delete_snatch_attempt": {
        const { data: attempt, error: readError } = await db
          .from("snatch_attempts")
          .select("block_id")
          .eq("id", input.attempt_id)
          .maybeSingle();
        if (readError) throw readError;
        if (!attempt) {
          return NextResponse.json({ error: "No such attempt." }, { status: 404 });
        }
        const { error } = await db
          .from("snatch_attempts")
          .delete()
          .eq("id", input.attempt_id);
        if (error) throw error;

        const { data: block, error: blockError } = await db
          .from("snatch_blocks")
          .select("*")
          .eq("id", attempt.block_id)
          .single();
        if (blockError) throw blockError;
        return NextResponse.json({ deleted: input.attempt_id, weight_block: block });
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

      case "remove_last_lift": {
        // What the cross on a row does. Removing four lifts in one unconfirmed
        // tap is not an undo, and every lift is individually removable by
        // opening it, so this takes the most recent one off the end.
        const { data: last, error: lastError } = await db
          .from("snatch_attempts")
          .select("id")
          .eq("block_id", input.weight_block_id)
          .order("ordinal", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastError) throw lastError;

        if (!last) {
          // Nothing individual to remove: either the block was opened and
          // never used, or it is imported history recorded as a total. The
          // block itself is the only thing there is to take away.
          const { error } = await db
            .from("snatch_blocks")
            .delete()
            .eq("id", input.weight_block_id);
          if (error) throw error;
          return NextResponse.json({ removed_block: input.weight_block_id });
        }

        const { error: deleteError } = await db
          .from("snatch_attempts")
          .delete()
          .eq("id", last.id);
        if (deleteError) throw deleteError;

        // The trigger has recounted the block. An empty one is a row that
        // claims a load was worked when nothing was.
        const { data: block, error: blockError } = await db
          .from("snatch_blocks")
          .select("*")
          .eq("id", input.weight_block_id)
          .single();
        if (blockError) throw blockError;

        if (!block.attempts) {
          const { error } = await db
            .from("snatch_blocks")
            .delete()
            .eq("id", input.weight_block_id);
          if (error) throw error;
          return NextResponse.json({
            removed_attempt: last.id,
            removed_block: input.weight_block_id,
          });
        }
        return NextResponse.json({ removed_attempt: last.id, weight_block: block });
      }

      case "delete_weight_block": {
        const { data: owner } = await db
          .from("snatch_blocks")
          .select("session_id")
          .eq("id", input.weight_block_id)
          .maybeSingle();
        const { error } = await db
          .from("snatch_blocks")
          .delete()
          .eq("id", input.weight_block_id);
        if (error) throw error;
        if (owner) await pruneEmptyBlock(db, owner.session_id, "snatch");
        return NextResponse.json({ deleted: input.weight_block_id });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Content hash for change detection on re-import. Prefixed so the pack's own
 *  md5 hashes stay distinguishable from these. */
async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

/**
 * A workstream block, created the first time something is actually recorded
 * into that workstream.
 *
 * A block is the assertion that a workstream happened: `v_session_summary`
 * derives its `workstreams` array from these rows, and the Coach reads that
 * to judge weekday themes. So opening a tab must not create one, or a glance
 * at all three would make every session claim all three. The first set, lift
 * or skill entry is the evidence; this is where the block earns its place.
 */
async function ensureBlock(
  db: ReturnType<typeof adminClient>,
  sessionId: string,
  workstream: "snatch" | "calisthenics" | "hypertrophy",
): Promise<string> {
  const { data: existing, error } = await db
    .from("session_blocks")
    .select("id")
    .eq("session_id", sessionId)
    .eq("workstream", workstream)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing.id as string;

  const { count } = await db
    .from("session_blocks")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  const { data, error: insertError } = await db
    .from("session_blocks")
    .insert({
      session_id: sessionId,
      workstream,
      started_at: new Date().toISOString(),
      sort_order: ((count ?? 0) + 1) * 10,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return data.id as string;
}

const WORKSTREAM_RECORDS = {
  snatch: "snatch_blocks",
  hypertrophy: "hypertrophy_sets",
  calisthenics: "calisthenics_entries",
} as const;

/**
 * The mirror of `ensureBlock`: once the last record in a workstream is gone,
 * the block it created goes too. Without this, deleting your only set would
 * leave the session still claiming a hypertrophy block, and the workstream
 * counts would drift upward over time through a different door.
 *
 * A block carrying its own note is left alone — that note is a record of
 * something, even if the measurements were removed.
 */
async function pruneEmptyBlock(
  db: ReturnType<typeof adminClient>,
  sessionId: string,
  workstream: keyof typeof WORKSTREAM_RECORDS,
): Promise<void> {
  const { count, error } = await db
    .from(WORKSTREAM_RECORDS[workstream])
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw error;
  if ((count ?? 0) > 0) return;

  await db
    .from("session_blocks")
    .delete()
    .eq("session_id", sessionId)
    .eq("workstream", workstream)
    .is("notes", null);
}
