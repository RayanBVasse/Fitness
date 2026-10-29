-- ============================================================================
-- Fitness Observatory — a note can name what it is about
--
-- A note can already point at a day, a session and a workstream. It cannot
-- point at the thing it is actually about, so "the Maxim hamstring curl felt
-- different today" is filed as a note about Tuesday, and the only place it
-- is ever read again is a list of notes.
--
-- Two columns. The drill-down compares one exercise on one machine and the
-- skill series tracks one variation; those are the two places an observation
-- has somewhere to land, so those are the two anchors. Snatch needs neither:
-- `snatch_blocks.notes` already holds a note against the load it was written
-- about.
--
-- A note is about one thing. Both columns set would mean a note filed under
-- a curl and a handstand at once, which is two notes.
--
-- Annotation, exactly as `linked_session_id` and `experiment_id` are.
-- Attaching a note to an exercise says "this is about that"; it adds no set,
-- no attempt and no volume, and nothing that counts reads these columns. A
-- note saying "felt like 45 kg" against an exercise is still not a load.
--
-- Nullable and unbackfilled. Every existing note stays exactly as anchored
-- as it was: guessing an exercise from the wording of 133 reconstructed
-- notes is the inference the audit spent its length warning against.
-- ============================================================================

alter table fitness.context_notes
  add column if not exists exercise_id smallint
    references fitness.exercises(id) on delete set null,
  add column if not exists skill_variation_id smallint
    references fitness.skill_variations(id) on delete set null;

do $$ begin
  alter table fitness.context_notes
    add constraint context_notes_one_subject check (
      exercise_id is null or skill_variation_id is null
    );
exception when duplicate_object then null; end $$;

-- Partial: almost every row has neither, and an index over those is an index
-- of nothing.
create index if not exists context_notes_exercise_idx
  on fitness.context_notes (exercise_id, anchor_date desc)
  where exercise_id is not null;

create index if not exists context_notes_skill_idx
  on fitness.context_notes (skill_variation_id, anchor_date desc)
  where skill_variation_id is not null;

-- ---------------------------------------------------------------------------
-- Check.
-- ---------------------------------------------------------------------------
-- 1. The columns exist and nothing was backfilled.
select count(*) as notes,
       count(exercise_id) as about_an_exercise,
       count(skill_variation_id) as about_a_skill
  from fitness.context_notes;

-- 2. A note cannot be about both. Expect the constraint to refuse it.
do $$
begin
  insert into fitness.context_notes
    (external_source_id, note_type, category, content, source_type,
     evidence_status, content_hash, exercise_id, skill_variation_id)
  values ('constraint probe', 'athlete_report', 'observation', 'probe',
          'authored_in_app', 'user_reported', 'probe',
          (select id from fitness.exercises limit 1),
          (select id from fitness.skill_variations limit 1));
  raise exception 'CHECK FAILED: a note was accepted about two subjects';
exception
  when check_violation then
    raise notice 'ok: a note is about one thing';
end $$;

-- 3. Nothing counted reads these. Volume, sets and attempts are unchanged.
select (select count(*) from fitness.hypertrophy_sets)      as hypertrophy_sets,
       (select count(*) from fitness.calisthenics_attempts) as calisthenics_attempts,
       (select count(*) from fitness.snatch_attempts)       as snatch_attempts;
