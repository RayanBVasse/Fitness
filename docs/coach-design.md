# Observatory Coach — design

**Status:** proposal, nothing built. Written 25 October 2026.

The goal, in the athlete's words: *"can I reproduce a peak performance based on
the notes"*. That is a question about what preceded good sessions, asked across
a year of uneven records. It is answerable — but only if the system is honest
about what it measured, what was merely reported, and what it is guessing.

---

## 1. Two layers, and a boundary that is enforced

**Layer A — deterministic.** Every number is computed by SQL and TypeScript.
Success rates, counts, intervals, trends, distributions. Reproducible, testable,
and already half-built: `v_snatch_success_by_source`, `is_substantiated`,
`counts_as_full_lift`, `days`.

**Layer B — interpretation.** The model reads Layer A's output and the approved
context notes, and discusses them. It identifies possible explanations,
contradictions and patterns worth testing.

The boundary is the whole design. Stated as a rule the code enforces:

> **The Coach computes nothing.** It has no database access. It calls named
> analysis tools, each returning a typed result carrying its own window, row
> count and source split. Any figure in its answer must appear in what those
> tools returned.

Three mechanisms, not one prompt:

1. **No raw access.** The model never sees tables, only tool results. There is
   no query it can write.
2. **Provenance travels with every number.** A tool never returns a bare `52.2`.
   It returns the rate, the numerator, the denominator, the window, and whether
   the rows were imported or logged.
3. **A numeric check on the way out.** Before an answer is shown, extract every
   numeral and confirm it appears in the tool payloads for that turn. An
   unmatched number is a fabrication, and the answer is rejected rather than
   shown. This is cheap, mechanical, and catches the failure mode that matters
   most.

A prompt saying "do not invent measurements" is a wish. A verifier that refuses
answers containing unsourced numbers is a guarantee.

---

## 2. The tool surface (Layer A)

Each returns `{ value, n, window, source, insufficient }`. `insufficient` is set
by the tool, from a documented minimum — not judged by the model.

| Tool | Answers |
| --- | --- |
| `snatch_success(window, load?, source?)` | attempts, stood, received-not-stood, stand rate, receive rate |
| `snatch_by_week(load, window)` | the weekly series behind a trend claim |
| `session_sequence(window)` | training days, rest days, unlogged days, consecutive-day runs |
| `performance_after_recovery(window, gap_days)` | sessions split by the gap that preceded them |
| `day_context(date)` | that day's metrics, status, rest reason, approved notes |
| `skill_progress(variation, window)` | success rate and holds for one variation, never pooled |
| `exercise_progress(gym, exercise, window)` | load and reps at a fixed machine identity |
| `injury_timeline(window)` | symptom entries, provoking activities, pain-free days |
| `journal_series(metric, window)` | sleep, readiness, soreness, mood as a dated series |

`performance_after_recovery` is the one the athlete actually asked for. It is
also the one most likely to return `insufficient`: with the current data there
are few comparable sessions, and saying so is the correct answer.

---

## 3. What the Coach may read

- **Deterministic results** from the tools above.
- **`context_notes` where `review_status = 'approved'`.** Approval is the
  consent gate. Nothing pending or rejected is ever visible.
- **`settings`** — the objective, progression rules and analysis guardrails.
  This is the durable coaching knowledge layer, and it is configuration rather
  than observation, which is why it lives there and not in the notes table.

It may not read: pending notes, the import staging tables, or anything marked
`sensitivity = 'health_private'` unless explicitly included for that question.

---

## 4. Three kinds of statement, kept apart

The notes already carry this distinction; the Coach must preserve it in every
answer.

| Kind | Example | Where it lives |
| --- | --- | --- |
| **Measured** | 2/4 stood at 50 kg on 20 Oct | performance tables |
| **Reported** | "felt heavy from the first contact with the bar" | `context_notes`, `user_reported` |
| **Interpretation** | "may be compatible with accumulated fatigue" | `context_notes`, `assistant_hypothesis` |

An answer that blends them is wrong even when every part is individually true.
The required shape, from the pack's own example:

> *24 Oct: 45–47.5 kg felt heavy from the outset (athlete report). 22 Oct
> included heavy legs (training record). Those are compatible with accumulated
> fatigue, but nothing here isolates a cause — there are 3 comparable sessions,
> below the 8 needed to say anything about the pattern.*

---

## 5. A hypothesis register — where this gets interesting

The athlete asked for a coach that remembers earlier hypotheses and checks
whether later results supported them. That needs a table, not a conversation.

```
coach_hypotheses
  id, statement, created_at, created_by ('coach' | 'athlete'),
  predicts            -- what should be observed if true
  test_tool, test_params, test_window, min_n, threshold
  status              -- open | supported | unsupported | insufficient | abandoned
  evaluated_at, evidence jsonb, review_status
```

The Coach proposes a hypothesis and the test that would settle it. The athlete
approves it. When the window closes, **Layer A evaluates it** — the model does
not grade its own prediction. The verdict is a computation.

This is what makes "it can disagree with itself" real. A coach that says *"I
suggested in September that 24 hours was enough recovery; across 11 sessions
since, the 50 kg stand rate after one rest day is 48% against 61% after two —
that doesn't support what I said"* is doing something no generic assistant can.

It also directly serves the peak-performance question: each candidate factor —
sleep, carbohydrate the night before, rest interval, gym atmosphere — becomes a
registered hypothesis with a pre-declared test, rather than a story told after
the fact.

---

## 6. Privacy: what leaves the database

This is the decision with the least room for drift, because the afternoon of
25 October was spent closing exactly this exposure.

**Server-side only.** The provider call happens in a route handler. No key
reaches the browser, as with everything else.

**Approval is consent.** Only approved notes are eligible. 133 are pending and
none is visible until reviewed.

**Third parties are redacted by default.** The notes name a trainer and
describe an acquaintance. Those people are not users of this app and have
consented to nothing. A redaction pass replaces known names with roles — *a
trainer*, *an acquaintance* — with the mapping held locally and never sent. The
athlete's own experience survives; the identification does not.

**Health-sensitive notes are opt-in per question**, using the `sensitivity`
flag already on the table.

**A visible record of what was sent.** Every Coach turn stores the exact
payload. "What did you send?" must be answerable precisely, not approximately.

**Provider settings** must exclude training on submitted data, and the
conversation must be exportable and deletable, like the rest.

---

## 7. What the Coach must never do

- Write to any performance table. It proposes; the athlete confirms; existing
  write actions execute. No exceptions.
- State a number that did not come from a tool.
- Diagnose. The knee is undiagnosed and stays that way until a physiotherapist
  says otherwise.
- Claim causation from correlation, or build a physiological theory from one
  session.
- Prescribe compulsory rest. The athlete trains 6–7 days by preference;
  modulating intensity is advice, mandating absence is not.
- Score, profile or speculate about other people.

---

## 8. Voice

Warm, familiar, mildly teasing, willing to challenge. No sycophancy, no
lecture, no invented certainty.

Challenge is grounded in measurement, never in tone: *"you called that a light
technical day, but it was twelve lifts at 90–95% of your best"* is a record
disagreeing with a description. That is the honest kind.

It should also recognise a deliberate experiment and track it rather than nag —
training frequency is being tested on purpose.

---

## 9. Build order

**Phase A — read-only Q&A.** Tools, the numeric verifier, approved notes, the
conversation store. The Coach can answer and must cite.

**Phase B — hypothesis register.** Propose, approve, evaluate deterministically.

**Phase C — natural-language journal entry.** One paragraph in, structured
observations proposed, confirmed before saving. It reuses the staging pattern
the backfill proved: propose, review, promote. Never infer a rating from an
adjective.

---

## 10. The honest caveat

There is almost no newly logged data: one hypertrophy set, no logged check-ins,
no rest days. Ten months of imported history is narrative-rich and
measurement-poor — 49 of 188 recovered snatch rows carried both a numerator and
a denominator.

So early on the Coach will often, correctly, say there is not enough to go on.
That is the system working. The alternative — a confident explanation drawn
from four sessions — is the thing this whole design exists to prevent.

The register in §5 is what converts that from a limitation into a plan: each
question becomes a declared test, and the data accumulates against it.
