-- ============================================================================
-- Fitness Observatory — what you did last time
--
-- Logging is meant to take seconds, which means the app should already know
-- the answer and ask you to confirm it. These views supply the defaults.
--
-- Machine identity is (gym, exercise): the last load for the pendulum squat at
-- Ealing is not the last load for the pendulum squat at Greenford, so the
-- prefill is keyed on both. Without a gym it falls back to the exercise alone,
-- which is still better than an empty field but is marked as such.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Last load and reps per (gym, exercise). Drop sets are excluded: the number
-- worth offering again is the working set, not what you dropped to.
-- ---------------------------------------------------------------------------
create or replace view fitness.v_last_exercise_setting as
select distinct on (s.gym_id, h.exercise_id)
       s.gym_id,
       h.exercise_id,
       h.load_kg,
       h.reps,
       h.sets_count,
       h.machine_label,
       s.session_date as last_used_on
  from fitness.hypertrophy_sets h
  join fitness.sessions s on s.id = h.session_id
 where not h.is_drop
 order by s.gym_id, h.exercise_id, s.session_date desc, h.created_at desc;

-- ---------------------------------------------------------------------------
-- Which exercises are actually in rotation, most recent first. The picker
-- leads with these rather than with 27 alphabetical rows.
-- ---------------------------------------------------------------------------
create or replace view fitness.v_recent_exercises as
select h.exercise_id,
       max(s.session_date) as last_used_on,
       count(*)            as times_logged
  from fitness.hypertrophy_sets h
  join fitness.sessions s on s.id = h.session_id
 group by h.exercise_id
 order by max(s.session_date) desc;

-- ---------------------------------------------------------------------------
-- The same for calisthenics, keyed on the skill variation. Holds and
-- assistance carry forward; attempt counts deliberately do not, because last
-- session's attempts are not a default for this one.
-- ---------------------------------------------------------------------------
create or replace view fitness.v_last_skill_setting as
select distinct on (c.skill_variation_id)
       c.skill_variation_id,
       c.assistance_id,
       c.best_hold_seconds,
       c.sets_count,
       s.session_date as last_used_on
  from fitness.calisthenics_entries c
  join fitness.sessions s on s.id = c.session_id
 order by c.skill_variation_id, s.session_date desc, c.created_at desc;

create or replace view fitness.v_recent_skills as
select c.skill_variation_id,
       max(s.session_date) as last_used_on,
       count(*)            as times_logged
  from fitness.calisthenics_entries c
  join fitness.sessions s on s.id = c.session_id
 group by c.skill_variation_id
 order by max(s.session_date) desc;

-- ---------------------------------------------------------------------------
-- Verify: the views answer, and the prefill has something to offer.
-- ---------------------------------------------------------------------------
select 'recent exercises' as view, count(*) as rows from fitness.v_recent_exercises
union all
select 'last exercise setting', count(*) from fitness.v_last_exercise_setting
union all
select 'recent skills', count(*) from fitness.v_recent_skills
union all
select 'last skill setting', count(*) from fitness.v_last_skill_setting;
