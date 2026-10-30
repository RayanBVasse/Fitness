# Fitness Observatory

A training log and analytics app for three workstreams — Olympic snatch,
calisthenics and hypertrophy — plus a cross-cutting injuries category.

Next.js 16 (App Router) on Vercel, Postgres on Supabase in a dedicated
`fitness` schema inside the living-literature project. Mobile-first: it is used
standing in a gym, one-handed, between sets.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Schema, session model, snatch logging | **done** |
| 2 | Hypertrophy logging | **done** |
| 2a | Daily check-in, quick mode | **done** |
| 2b | Day editor: any past day, rest days, reasons | **done** |
| 3 | Calisthenics logging with configurable success criteria | **done** |
| 4 | Injuries | not started |
| 5 | Weekly report and charts | not started |
| 6a | Observatory Coach — Phase A, read-only Q&A | **done** — see [docs/coach-design.md](docs/coach-design.md) |
| 6b | Coach — hypothesis register, journal extraction | not started |

Backfill import: **run.** 401 rows staged, 373 promoted into 79 sessions. See below.

## Setup

### Progress windows

**Monthly** is a calendar-month review and the default Progress view. It has
previous/next-month navigation and a month picker. Its calendar distinguishes logged,
historical, mixed, rest and context-only evidence; missing dates are unknown and
future dates are disabled. Weekly coverage bars count sessions with training records,
separated by source, rather than asserting training frequency. Snatch reliability
uses complete directly logged working-lift counts only; historical milestones remain
separate. Workstream tabs retain exercise/equipment and skill/assistance boundaries.
Recovery defaults to the latest seven calendar dates within the month, with an
all-month option. The rolling 30-day and longer charts remain available.

The **7 days** selection shows exactly seven London calendar dates, ending today.
Daily selection links snatch outcomes and working-load quality, exercise performance,
calisthenics quality and recovery in one inline inspector. Missing days stay visible;
`—` means no observation, `?` an incomplete measurement, and `0` a recorded zero.
Only logged observations enter this daily comparison. Warm-up and cooldown snatches
are excluded from working-load checkpoints. Hypertrophy sets are separated by
exercise, gym, machine and side, with reps, load, RIR and drop-set labels retained.
Unknown equipment context is explicitly marked as unverified for comparison.
Longer windows retain the weekly charts. Preceding-seven-day comparison is not yet
implemented.

The daily overview uses stacked snatch bars with a working-load selector, recovery
plots with gaps at missing readings, and compact set-dose bars. Outcome tiles retain
their counts and use symbols as well as colour; incomplete observations stay neutral.
Calisthenics has separate Quality and Success views. Quality arrows show the numeric
difference between single recorded ratings of the same variation and assistance,
not an established trend. Exercise sets live in the day inspector and exercise
drill-down. Repetition plots require a known recorded setup, matched load and at
least two observed dates; drop sets are excluded from those plots.

1. **Run the migrations** in the Supabase SQL editor, in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_seed.sql`
2. **Expose the schema.** Supabase → Settings → API → Exposed schemas → add
   `fitness`. Without this the REST API cannot see the tables even though they
   exist, and the app will show its setup notice.
3. **Set environment variables** (locally in `.env.local`, on Vercel in project
   settings — see `.env.example`):

   | Variable | Where | Purpose |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | public | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Read-only key; safe in the browser *because* of RLS |
   | `SUPABASE_SERVICE_ROLE_KEY` | server only | The only write credential |
   | `FITNESS_WRITE_PASSCODE` | server only | Required for any write; writes are disabled while unset |

```bash
npm run dev
```

## Backfill import

Two sources are staged into `fitness.import_records`, which anon cannot read:

| Batch | Rows | Nature |
| --- | --- | --- |
| `backfill-pack-v0.1` | 311 | Reconstruction from prior chat records, Jan–Oct 2026 |
| `august-2026-workbook` | 90 | P1 Physiology Observatory workbook, 1–16 Aug 2026 |

Where both describe the same date **and** the same discipline, the workbook
wins — it carries sets, reps, quality, straps, failure mode, gym and
order-vs-snatch, none of which the backfill has. Those 28 backfill rows are
marked `superseded` and kept, never deleted.

Supersession is computed per `(date, discipline)`, never per date window. The
backfill holds August dates the workbook never covered — snatch on the 2nd,
4th, 10th, 21st, 24th and 25th; hypertrophy on the 10th; calisthenics across
the 22nd to the 28th. A window rule would have buried all of them.

```sql
-- 1. stage
\i supabase/migrations/0003_backfill_staging.sql
-- 2. install the review surface and the promotion function (promotes nothing)
\i supabase/migrations/0004_promote.sql
-- 3. review
select * from fitness.import_preview;
select * from fitness.import_conflicts;
select * from fitness.import_superseded;
-- 4. dry run, then commit
select * from fitness.promote_imports();
select * from fitness.promote_imports(true);
```

Expected after promoting — check the run against these:

| Target | Rows |
| --- | --- |
| sessions | 79 |
| session_blocks | 110 |
| snatch_blocks | 214 |
| hypertrophy_sets | 73 (67 + 6 drop sets) |
| calisthenics_entries | 29 |
| injury_observations | 7 |
| daily_metrics | 88 |

13 nutrition rows stay `pending_review` on purpose: nutrition is a later
category and has no target table yet. They are staged so nothing is lost.

The sources are recovered chat records, so a numeric field occasionally holds
prose — `reps_per_set` carries `'4-6'`, `'6-7'`, `'3-5'` and `'a_couple'`.
Every cast in the promotion goes through `safe_smallint` / `safe_numeric`,
which return null instead of throwing, and the original text is appended to
that row's notes. A range is never averaged into a number nobody recorded.

Promotion is idempotent — every target row carries `source_record_id` and
nothing is inserted twice, so a re-run is a no-op. Rows whose exercise or skill
cannot be resolved are left pending and reported rather than silently dropped.
Known conflicts (5 May, 17 May, 11 Aug) are flagged, not reconciled.

Regenerate the staging SQL with:

```bash
python scripts/build_backfill_sql.py <backfill.jsonl> <workbook.xlsx> supabase/migrations/0003_backfill_staging.sql
```

The generator refuses to run if any source value has no mapping, rather than
guessing one.

## Access model

**The app is private.** Every page and every write requires a session.

Migration `0005_private.sql` revoked all anonymous grants on the `fitness`
schema, so the data is unreadable over the Supabase REST API as well as through
the site. That ordering matters: the anon key ships in any browser bundle, so
locking only the front end would have left the database open.

Authentication is a passcode exchanged for a signed, HttpOnly, SameSite=Lax
cookie (90 days). `middleware.ts` gates every route, so a new page is private by
default rather than by remembering to protect it, and it **fails closed** — if
`AUTH_SECRET` or the passcode is missing, nothing is served at all.

Reads and writes both run server-side with the service-role key. No database
credential reaches the browser.

`service_role` needs its own `USAGE` on the `fitness` schema and rights on the
objects in it (`0006`). Bypassing RLS is not the same as having privileges —
without those grants every query fails at the schema boundary before RLS is
ever consulted.

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Project URL; opens nothing on its own |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | The only database credential |
| `AUTH_SECRET` | server only | Signs the session cookie; changing it signs out every device |
| `FITNESS_WRITE_PASSCODE` | server only | The passcode that unlocks the app |
| `ANTHROPIC_API_KEY` | server only | The Coach. Without it the Coach returns 503; the rest of the app is unaffected |

Login is rate-limited to 8 attempts per 10 minutes per IP, compared in constant
time, and the failure message does not distinguish causes. Signing out performs
a full document load so cached payloads do not survive it.

Supabase Auth would be the next step if a second person ever needs access — a
physio reading the knee history, say — or if per-device revocation matters. The
policies would be rewritten against `auth.uid()` and this gate replaced.

## Data model decisions

These are deliberate and load-bearing. Changing them changes what the app can
tell you.

**The journal stores into `daily_metrics`**, the same table the import filled,
so today's sleep score continues the recovered series rather than starting a
rival to it. The dimensions live in `daily_metric_defs` — adding one is a row,
not a migration and a deploy. Scales are 0-10 throughout, matching the history;
a series that changes scale halfway through is not comparable with itself.
Life context (food, gym notes) is text, never scored and never correlated
against performance.

**A day is not a session.** `fitness.days` records what a calendar day was —
trained, rested, or carrying notes without asserting either. Rest is data: a
gap in the record means the day was never logged, which is a different fact.
Rest days are never backfilled for historical gaps, because we do not know
which they were. The day is also the anchor the journal will hang from, since
sleep, readiness, bodyweight and symptoms belong to a day rather than a visit.

**A gym visit is one session.** It contains N workstream blocks, each with its
own editable start and end time. Three disciplines in one visit is one session,
not three.

**Snatch outcome has three states.** `stood`, `received_not_stood`, `missed`.
Catching the bar overhead and failing to stand it is neither a success nor a
miss, and across Jan–Oct 2026 it is the single most informative thing in the
record: receives-without-stands ran at 6 in January and 1 by August, which is
how you can see that the catch stopped being the limiter.

`received_total` (= stood + received_not_stood) and `dropped` deliberately
overlap: a lift can be received and then dropped. The 2026-05-30 block is the
proof — 7 attempts, 3 stood, 4 drops, 3 received-not-stood, summarised in the
source as "3/7 full stand, receiving 6/7".

**Outcome and quality are separate columns.** A lift that was stood is not
therefore a good lift. Nothing derives technical quality from load success.

**Machine identity is `(gym, exercise)`**, narrowed by `machine_label` where a
gym has two of the same machine. 55 kg on Ealing's pendulum squat is not 55 kg
on another gym's, and progression series never merge across them.

**Volume load is a training metric**, not a measurement of muscle growth, and
is labelled that way wherever it appears.

**Progression is not keyed off maximum load.** Maximum successful load was
50.0 kg in every month from January to October 2026. A classifier reading max
load would report MAINTAINED for ten consecutive months and say nothing useful.
Snatch progression is measured on stand rate at the primary load, the
received-not-stood share, attempt volume at or above it, and mean quality.

**Historical rows are marked and quarantined.** `provenance` distinguishes
`logged`, `workbook_import` and `historical_reconstruction`. `is_substantiated`
is true only where both attempts and stands are present, and every success rate
is gated on it — only 49 of 188 recovered snatch rows qualify.

**Pulls are not snatches.** `snatch_variations.counts_as_full_lift` is false for
pulls, panda pulls, aborted pulls, bottom stands and overhead squats, and the
success-rate views filter on it.

**No diagnosis, no causal attribution.** The injuries layer surfaces patterns
for training decisions or a physiotherapy appointment. It never claims an
exercise caused a symptom. `settings.analysis_guardrails` states this as data,
with a minimum-n gate before any association is displayed.

## Rules live in the database

`fitness.settings` holds the progression thresholds, the analysis guardrails,
the objective and the warm-up ladder as JSON, with notes. They are visible on
the Settings screen and editable without a deploy, so the classification rules
stay documented rather than buried in application code.

## Current objective

Convert 50 kg from roughly 53% to reliably 80% or better, and record a first
stood 52.5 kg.

50 kg is not a target to reach: it was first stood on 2026-01-06. Substantiated
baseline across Jan–Oct 2026 — 45 kg 100% (17/17), 47.5 kg 87.0% (40/46),
50 kg 52.9% (36/68), 52.5 kg 0% (0/3).

## Layout

```
app/
  page.tsx           Today — the operational screen
  history/           Sessions, most recent first
  progress/          Stand rate vs receive rate by load
  settings/          Libraries, progression rules, guardrails
  api/write/         The single gated write path
components/
  today/             Session header, workstreams, rapid snatch logging
lib/
  supabase.ts        Read client (anon) and admin client (service role)
  queries.ts         Server-side reads, each returning { data, error }
  time.ts            Europe/London dates, Monday-start weeks
  types.ts           Schema types
supabase/migrations/ 0001 schema + RLS, 0002 reference data seed
```
