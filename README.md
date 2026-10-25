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
| 2 | Hypertrophy logging | not started |
| 3 | Calisthenics logging with configurable success criteria | not started |
| 4 | Injuries | not started |
| 5 | Weekly report and charts | not started |

Backfill import: **staged and ready, not yet run.** See below.

## Setup

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

The site is **public and readable** by anyone with the link. RLS grants `anon`
`SELECT` and nothing else, so a visitor can look but cannot change anything.

Every mutation goes through `POST /api/write`, which checks a passcode and then
executes with the service-role key server-side. The passcode is entered once
per device and lives in that browser's `localStorage`; it is never bundled.

Writes fail closed: no passcode configured → `503`; wrong passcode → `401`;
malformed payload → `422`. Staging tables (`import_records`, `import_batches`)
are not readable by `anon` at all — they hold unreviewed rows with known
conflicts in them.

## Data model decisions

These are deliberate and load-bearing. Changing them changes what the app can
tell you.

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
