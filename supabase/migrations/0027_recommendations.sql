-- ============================================================================
-- Fitness Observatory — recommendations join the register
--
-- A hypothesis and a recommendation have the same shape and are asked
-- different questions. "Calisthenics before hypertrophy holds its technique"
-- is something you test, and the question at the end is what the evidence
-- showed. "Keep loads at 40–45 kg before increasing" is something you were
-- told, and the question at the end is whether you did it.
--
-- One table, because the lifecycle is identical — proposed, collecting,
-- concluded — and two tables would duplicate every column to carry one extra
-- fact. `kind` separates them and `followed` is the extra fact.
--
-- Follow-through is the point. Without it a recommendation is a sentence in
-- a review that nobody checks against what happened, which is the thing the
-- register was built to stop.
--
-- `declined` is a real answer, not a failure. A recommendation you read and
-- decided against is a decision, and more informative than one you agreed
-- with and forgot.
--
-- `hypothesis` becomes `statement`. A column named for one of its two kinds
-- misleads every future reader of this schema, and renaming it now costs a
-- rename while the table is days old.
-- ============================================================================

alter table fitness.experiments rename column hypothesis to statement;

do $$ begin
  create type fitness.experiment_kind as enum ('hypothesis', 'recommendation');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Not a verdict on the advice: a verdict on what you did about it.
  create type fitness.followed_through as enum
    ('not_yet', 'followed', 'partly', 'declined');
exception when duplicate_object then null; end $$;

alter table fitness.experiments
  add column if not exists kind fitness.experiment_kind not null default 'hypothesis',
  add column if not exists followed fitness.followed_through;

do $$ begin
  -- Only a recommendation can be followed. A hypothesis is tested.
  alter table fitness.experiments
    add constraint experiments_followed_is_for_advice check (
      followed is null or kind = 'recommendation'
    );
exception when duplicate_object then null; end $$;

do $$ begin
  -- Advice you declined showed you nothing, so there is nothing to conclude
  -- about it. The note is still yours to write.
  alter table fitness.experiments
    add constraint experiments_declined_has_no_outcome check (
      outcome is null or followed is distinct from 'declined'
    );
exception when duplicate_object then null; end $$;

create index if not exists experiments_kind_idx
  on fitness.experiments (kind, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Check.
-- ---------------------------------------------------------------------------
-- 1. Existing rows are hypotheses, and their statements survived the rename.
select kind, status, count(*), count(statement) as with_a_statement
  from fitness.experiments
 group by kind, status order by kind, status;

-- 2. A hypothesis cannot be "followed". Expect the constraint to refuse it.
do $$
begin
  insert into fitness.experiments (title, statement, measurement, kind, followed)
  values ('constraint probe', 's', 'm', 'hypothesis', 'followed');
  raise exception 'CHECK FAILED: a hypothesis accepted a follow-through';
exception
  when check_violation then raise notice 'ok: only advice is followed';
end $$;

-- 3. Declined advice cannot carry a verdict. Expect a refusal.
do $$
begin
  insert into fitness.experiments
    (title, statement, measurement, kind, status, followed, outcome)
  values ('constraint probe', 's', 'm', 'recommendation', 'concluded',
          'declined', 'supported');
  raise exception 'CHECK FAILED: declined advice accepted an outcome';
exception
  when check_violation then raise notice 'ok: what you did not do showed you nothing';
end $$;
