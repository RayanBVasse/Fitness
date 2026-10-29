-- ============================================================================
-- Fitness Observatory — the experiment register
--
-- Training throws up hypotheses constantly: whether the first-pull adjustment
-- is improving the snatch, whether calisthenics before hypertrophy holds its
-- technique better, whether particular leg work provokes the knee. They are
-- generated in conversation, acted on for a fortnight, and forgotten — and
-- the next conversation generates a fresh set.
--
-- A register is what stops that. Each row says what is being asked, what
-- would answer it, and what counts as a comparable observation; the last of
-- those is the one always left out, and the reason a hypothesis can be
-- "tested" for a month and settle nothing.
--
-- `context_notes` already has a category of 'experiment', but a note is a
-- sentence someone wrote. This has a lifecycle — proposed, collecting,
-- concluded — and a verdict field that stays empty until a human fills it.
--
-- NOTHING HERE IS COMPUTED. The outcome is written by the person who read
-- the evidence. An app that decided its own hypotheses had been supported
-- would be the AI coach generating a new theory every Tuesday, wearing a
-- lab coat.
-- ============================================================================

do $$ begin
  create type fitness.experiment_status as enum
    ('proposed', 'collecting', 'concluded', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Deliberately not 'true'/'false'. A hypothesis that ran its course and
  -- settled nothing is the commonest outcome in training, and it is a result:
  -- it says the comparison was not sharp enough, or the n never arrived.
  create type fitness.experiment_outcome as enum
    ('supported', 'not_supported', 'inconclusive');
exception when duplicate_object then null; end $$;

create table if not exists fitness.experiments (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  -- What you think is true. One sentence, in your own words.
  hypothesis     text not null,
  -- What would settle it. Written before the evidence arrives, so that the
  -- measure cannot be chosen afterwards to fit what happened.
  measurement    text not null,
  -- What counts as a comparable observation: same variation, same machine,
  -- same load. Without this a register entry is a wish.
  comparison     text,
  workstream     fitness.workstream,
  status         fitness.experiment_status not null default 'proposed',
  started_on     date,
  ended_on       date,
  -- Empty until a human reads the evidence and writes a verdict.
  outcome        fitness.experiment_outcome,
  outcome_note   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint experiments_title_not_blank check (length(btrim(title)) > 0),
  constraint experiments_hypothesis_not_blank check (length(btrim(hypothesis)) > 0),
  constraint experiments_measurement_not_blank check (length(btrim(measurement)) > 0),
  -- A verdict belongs to a finished experiment. One recorded against a live
  -- one would be a conclusion drawn while still collecting the evidence.
  constraint experiments_outcome_needs_an_end check (
    outcome is null or status in ('concluded', 'abandoned')
  ),
  constraint experiments_ends_after_it_starts check (
    started_on is null or ended_on is null or ended_on >= started_on
  )
);

create index if not exists experiments_status_idx
  on fitness.experiments (status, created_at desc);

drop trigger if exists touch_experiments on fitness.experiments;
create trigger touch_experiments before update on fitness.experiments
for each row execute function fitness.touch_updated_at();

alter table fitness.experiments enable row level security;

-- 0001 granted only the public roles and 0006 had to repair it. Granting
-- explicitly rather than trusting default privileges to have carried.
grant all privileges on fitness.experiments to service_role;

-- ---------------------------------------------------------------------------
-- Evidence: a note can belong to an experiment.
--
-- Annotation only, exactly as `linked_session_id` is. Attaching a note says
-- "this bears on that question"; it never adds an observation, and no count
-- anywhere reads this column.
-- ---------------------------------------------------------------------------
alter table fitness.context_notes
  add column if not exists experiment_id uuid
    references fitness.experiments(id) on delete set null;

create index if not exists context_notes_experiment_idx
  on fitness.context_notes (experiment_id)
  where experiment_id is not null;

-- ---------------------------------------------------------------------------
-- Check.
-- ---------------------------------------------------------------------------
-- 1. The table, empty, with its constraints in place.
select count(*) as experiments from fitness.experiments;

-- 2. A verdict cannot be recorded against a live experiment. Expect an error
--    naming experiments_outcome_needs_an_end; roll it back either way.
do $$
begin
  insert into fitness.experiments (title, hypothesis, measurement, status, outcome)
  values ('constraint probe', 'h', 'm', 'collecting', 'supported');
  raise exception 'CHECK FAILED: a collecting experiment accepted a verdict';
exception
  when check_violation then
    raise notice 'ok: a verdict needs a finished experiment';
end $$;

-- 3. Notes can now point at one, and none do yet.
select count(*) filter (where experiment_id is not null) as linked_notes,
       count(*) as total_notes
  from fitness.context_notes;
