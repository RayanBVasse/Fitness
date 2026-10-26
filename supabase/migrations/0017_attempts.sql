-- ============================================================================
-- Fitness Observatory — calisthenics attempts, and variation difficulty
--
-- Two changes that belong together, because both exist to separate "got
-- better at this variation" from "moved up to a harder one".
--
--   1. `calisthenics_attempts`: one row per attempt. Attempts, successes,
--      success rate, best hold, total hold, controlled ascents and descents
--      and negative duration stop being numbers typed into an entry and
--      become figures derived from rows. Nothing can contradict anything
--      else, because there is only one source.
--
--      The imported history has no attempts — it was reconstructed from
--      conversation as totals. Those entries keep their summary columns and
--      their `record_precision` of 'block'. They are not faked into rows.
--
--   2. `skill_variations.difficulty`: an ordinal rank WITHIN a skill. A
--      banded handstand push-up and a freestanding one are the same skill at
--      different difficulties; a back lever is a different skill entirely, so
--      the ranks are not comparable across skills and are deliberately not
--      one global scale.
--
--      Supporting exercises get NULL. Wrist prep, pancake mobility and a
--      barbell warm-up drill are not a ladder, and numbering them would
--      invent a progression that does not exist.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Difficulty within a skill.
-- ---------------------------------------------------------------------------
alter table fitness.skill_variations
  add column if not exists difficulty smallint
    check (difficulty is null or difficulty between 1 and 20);

comment on column fitness.skill_variations.difficulty is
  'Ordinal rank within the parent skill, 1 = easiest. NULL where the '
  'variations are not a progression. Never comparable across skills.';

update fitness.skill_variations v
   set difficulty = d.rank
  from (values
    -- Handstand: kick up, hold it, then control the way down.
    ('kick_up_to_handstand', 1),
    ('freestanding_handstand', 2),
    ('controlled_handstand_negative', 3),
    -- Handstand push-up: assistance removed step by step.
    ('wall_assisted_handstand_pushup', 1),
    ('banded_handstand_pushup', 2),
    ('freestanding_handstand_pushup', 3),
    -- L-sit to handstand: partial transition, then assisted, then strict.
    ('l_sit_to_tuck_transition', 1),
    ('wall_assisted_l_sit_to_handstand_pushup', 2),
    ('banded_l_sit_to_handstand_pushup', 3),
    ('l_sit_to_handstand_pushup_via_crow', 4),
    ('controlled_l_sit_to_handstand', 5),
    ('l_sit_to_handstand_pushup', 6),
    -- Floating and pressing: entry, ascent, full press.
    ('floating_tuck_entry', 1),
    ('knees_together_tuck_ascent', 2),
    ('floating_tuck_to_handstand', 3),
    ('controlled_reverse_transition', 4),
    ('bent_arm_press_to_handstand', 5),
    -- Back lever.
    ('back_lever_attempt', 1),
    ('back_lever_hold', 2)
  ) as d(slug, rank)
 where v.slug = d.slug;

-- ---------------------------------------------------------------------------
-- 2. One row per attempt.
-- ---------------------------------------------------------------------------
create table if not exists fitness.calisthenics_attempts (
  id                 uuid primary key default gen_random_uuid(),
  entry_id           uuid not null references fitness.calisthenics_entries(id)
                       on delete cascade,
  -- Position within the entry, so the order attempts happened in survives.
  ordinal            smallint not null,
  -- NULL means the attempt was recorded but its outcome never stated. That is
  -- different from a failure, and the success rate must not count it as one.
  succeeded          boolean,
  hold_seconds       numeric(6,2) check (hold_seconds is null or hold_seconds >= 0),
  controlled_ascent  boolean,
  controlled_descent boolean,
  -- Time spent lowering under control, where that is the thing being trained.
  negative_seconds   numeric(6,2) check (negative_seconds is null or negative_seconds >= 0),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (entry_id, ordinal)
);

create index if not exists calisthenics_attempts_entry_idx
  on fitness.calisthenics_attempts (entry_id, ordinal);

drop trigger if exists touch_calisthenics_attempts on fitness.calisthenics_attempts;
create trigger touch_calisthenics_attempts before update on fitness.calisthenics_attempts
for each row execute function fitness.touch_updated_at();

alter table fitness.calisthenics_attempts enable row level security;

-- 0001 granted only the public roles and 0006 had to repair it. Granting
-- explicitly here rather than trusting default privileges to have carried.
grant all privileges on fitness.calisthenics_attempts to service_role;
grant all privileges on fitness.third_parties to service_role;

-- ---------------------------------------------------------------------------
-- 3. The derived figures, with the basis named.
--
-- Rows win where they exist; an entry with no attempt rows falls back to the
-- summary it was imported with. `basis` says which, so nothing downstream has
-- to guess whether a success rate came from counted attempts or from a
-- sentence someone wrote in August.
-- ---------------------------------------------------------------------------
create or replace view fitness.v_calisthenics_progress as
with counted as (
  select a.entry_id,
         count(*)                                             as attempts,
         count(*) filter (where a.succeeded)                  as successes,
         max(a.hold_seconds) filter (where a.succeeded)       as best_hold_seconds,
         sum(a.hold_seconds) filter (where a.succeeded)       as total_hold_seconds,
         count(*) filter (where a.controlled_ascent)          as controlled_ascents,
         count(*) filter (where a.controlled_descent)         as controlled_descents,
         sum(a.negative_seconds)                              as negative_seconds
    from fitness.calisthenics_attempts a
   group by a.entry_id
)
select e.id as entry_id,
       e.session_id,
       e.skill_variation_id,
       v.skill_id,
       v.difficulty,
       e.provenance,
       case when c.attempts is not null then 'attempt' else e.record_precision::text end as basis,
       coalesce(c.attempts, e.attempts)                       as attempts,
       coalesce(c.successes, e.successful_attempts)           as successes,
       coalesce(c.best_hold_seconds, e.best_hold_seconds)     as best_hold_seconds,
       coalesce(c.total_hold_seconds, e.total_hold_seconds)   as total_hold_seconds,
       -- Counts exist only where attempts were recorded individually. The old
       -- booleans said "at least one", which is not a number, so they are
       -- reported as they were rather than converted into one.
       c.controlled_ascents,
       c.controlled_descents,
       e.controlled_ascent  as controlled_ascent_reported,
       e.controlled_descent as controlled_descent_reported,
       c.negative_seconds,
       e.assistance_id,
       e.quality_10
  from fitness.calisthenics_entries e
  join fitness.skill_variations v on v.id = e.skill_variation_id
  left join counted c on c.entry_id = e.id;

-- ---------------------------------------------------------------------------
-- Check.
-- ---------------------------------------------------------------------------
-- 1. Difficulty by skill. support_work should be the only one all NULL.
select s.name as skill,
       count(*) as variations,
       count(v.difficulty) as ranked,
       string_agg(v.name, ' < ' order by v.difficulty) filter (where v.difficulty is not null)
         as easiest_to_hardest
  from fitness.skill_variations v
  join fitness.skills s on s.id = v.skill_id
 group by s.name, s.sort_order
 order by s.sort_order;

-- 2. Existing entries, all of which should still read from their summaries.
select basis, count(*), sum(attempts) as attempts
  from fitness.v_calisthenics_progress
 group by basis;

-- 3. The new table is reachable by the server role.
select has_table_privilege('service_role', 'fitness.calisthenics_attempts', 'INSERT') as can_insert;
