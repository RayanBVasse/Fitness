import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase";
import { runTool, toolSchemas } from "@/lib/coach/tools";
import { redactDeep, verifyAnswer } from "@/lib/coach/verify";
import { londonToday } from "@/lib/time";

/**
 * The Coach turn.
 *
 * The model has no database access. It calls the Layer A tools by name, and
 * every figure in its answer is checked against what those tools returned
 * before anything is shown. One retry names the violation; a second failure is
 * refused rather than displayed.
 *
 * Private, like everything else: the middleware rejects unauthenticated calls
 * to /api/* before this handler runs.
 */

const MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 6;

const Body = z.object({
  conversation_id: z.string().uuid(),
  question: z.string().trim().min(1).max(2000),
});

const SYSTEM = `You are the Observatory Coach for a single athlete training three workstreams: Olympic snatch, calisthenics and hypertrophy.

HOW YOU WORK
You compute nothing. Every number you state must come from a tool result in this conversation. If you have not called a tool, you do not have the number. Never estimate, extrapolate or carry a figure over from general knowledge about training.

Each tool result carries its own window, row count (n) and an "insufficient" flag with a note. When insufficient is true, say so plainly and say what would settle it. Do not soften it into a tentative conclusion.

THREE KINDS OF STATEMENT — never blend them
- Measured: it came from a tool computing over recorded rows.
- Reported: the athlete said it. Approved notes are reports, not measurements.
- Interpretation: your own reading. Label it as yours, and as untested.

Attribute every claim. "24 Oct: 45-47.5 kg felt heavy from the outset (athlete report). 22 Oct included heavy legs (training record)." Then, separately, what you make of it.

WHAT YOU MUST NOT DO
- State a number no tool returned.
- Diagnose. The knee is undiagnosed; it stays that way until a physiotherapist says otherwise.
- Claim causation from correlation, or build a physiological theory from one session.
- Treat a weekday theme as an obligation. Massive Mondays and the rest are stated intentions; a week that departs from them is a question worth asking, never a failing. Training to how the body turns up on the day is the stated preference.
- Prescribe compulsory rest days. This athlete trains 6-7 days a week by preference. Modulating intensity is advice; mandating absence is not.
- Score, profile or speculate about other people. Third parties appear as roles, never names.

CONTEXT YOU SHOULD KNOW
Snatch outcomes have three states: stood (received and stood up — the only success), received_not_stood (caught, never stood), and missed. Receiving and standing are different capabilities. Success and technical quality are recorded separately: a lift that was stood is not therefore a good lift.
Pulls and bottom stands are not snatches and never count towards a success rate.
Hypertrophy loads are not comparable across gyms, because the machines differ. Volume load is a training metric, not evidence of muscle growth.
RIR is the athlete's estimate of how many reps were left, so it is a report, not a measurement. It is least reliable far from failure, and a trend in it partly measures the athlete getting better at estimating rather than the training changing. Never treat an RIR series as evidence on its own.
Calisthenics figures counted from individual attempts and figures carried over as a block summary are not the same thing. Tool results name the basis; say which you are using.
Skill variation difficulty ranks within one skill only. A level 3 handstand and a level 3 back lever have nothing in common.
Imported history is a reconstruction from conversation; newly logged data is precise. Tool results tell you which is which — keep them apart rather than averaging them.
A day with no session is unlogged. That is not the same as rested.

VOICE
Warm, familiar, willing to challenge, occasionally funny. No sycophancy, no lecture, no invented certainty. Challenge from the record, never from tone: if the athlete calls something a light day and the record shows twelve lifts at 90-95%, say so.
Be concise. Lead with the answer.`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "The Coach is not configured: ANTHROPIC_API_KEY is not set." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }
  const { conversation_id, question } = parsed.data;

  const db = adminClient();
  const client = new Anthropic({ apiKey });

  // Prior turns, so the conversation has continuity.
  const { data: history } = await db
    .from("coach_messages")
    .select("role, content")
    .eq("conversation_id", conversation_id)
    .order("created_at")
    .limit(40);

  const messages: Anthropic.MessageParam[] = [
    ...(history ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: question },
  ];

  // The redaction list, read once per turn. A failed or empty lookup falls
  // back to the built-in list rather than to no redaction at all.
  const { data: people } = await db
    .from("third_parties")
    .select("alias, role")
    .eq("is_active", true);
  const redactionList = people && people.length > 0 ? people : undefined;

  const evidence: unknown[] = [];
  const toolCalls: { name: string; input: unknown }[] = [];
  let redactedNames = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  async function converse(extraInstruction?: string): Promise<string> {
    const working = [...messages];
    if (extraInstruction) {
      working.push({ role: "user", content: extraInstruction });
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system: `${SYSTEM}\n\nToday is ${londonToday()} (Europe/London).`,
        tools: toolSchemas().map((t) => ({ ...t, strict: true })),
        messages: working,
      });

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      if (response.stop_reason === "refusal") {
        return "I can't answer that one.";
      }

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );

      if (toolUses.length === 0) {
        return response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();
      }

      working.push({ role: "assistant", content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        toolCalls.push({ name: use.name, input: use.input });
        try {
          const raw = await runTool(use.name, use.input);
          // Redact before the result is ever sent back to the model.
          const { value, count } = redactDeep(raw, redactionList);
          redactedNames += count;
          evidence.push(value);
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify(value),
          });
        } catch (error) {
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content: error instanceof Error ? error.message : String(error),
          });
        }
      }
      working.push({ role: "user", content: results });
    }

    return "I ran out of analysis steps before reaching an answer. Try narrowing the question.";
  }

  let answer: string;
  let verifierStatus: "passed" | "retried" | "rejected" = "passed";
  let unsourced: string[] = [];

  try {
    answer = await converse();
    let check = verifyAnswer(answer, evidence, question);

    if (!check.ok) {
      // Name the violation and give it one chance to correct itself.
      verifierStatus = "retried";
      answer = await converse(
        `Your previous answer contained figures that appear in no tool result: ${check.unsourced.join(
          ", ",
        )}. Rewrite it using only numbers the tools returned, or say that the data does not support the point.`,
      );
      check = verifyAnswer(answer, evidence, question);

      if (!check.ok) {
        verifierStatus = "rejected";
        unsourced = check.unsourced;
        answer = `I produced an answer containing figures I can't trace to your data (${check.unsourced.join(
          ", ",
        )}), so I'm not showing it. Ask me again, or more narrowly, and I'll work from the records directly.`;
      }
    }
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Coach unavailable (${error.status}): ${error.message}` },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Coach failed" },
      { status: 500 },
    );
  }

  const { error: writeError } = await db.from("coach_messages").insert([
    { conversation_id, role: "user", content: question },
    {
      conversation_id,
      role: "assistant",
      content: answer,
      tool_calls: toolCalls,
      tool_results: evidence,
      sent_payload: { model: MODEL, system: SYSTEM, question },
      redacted_names: redactedNames,
      model: MODEL,
      verifier_status: verifierStatus,
      unsourced_numbers: unsourced,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  ]);
  if (writeError) {
    return NextResponse.json({ error: writeError.message }, { status: 500 });
  }

  return NextResponse.json({
    answer,
    verifier: { status: verifierStatus, unsourced },
    tools_used: toolCalls.map((c) => c.name),
    redacted_names: redactedNames,
  });
}
