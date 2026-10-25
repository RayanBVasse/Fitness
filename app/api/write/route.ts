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
        // One session per gym visit. If today already has one, return it rather
        // than creating a second: multiple workstreams belong to one visit.
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
