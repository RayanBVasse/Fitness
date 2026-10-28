-- ============================================================================
-- Fitness Observatory — a hold is measured, not judged
--
-- On a timed skill the seconds are the measurement and the success is the
-- verdict against the variation's minimum. 0017 computed both hold columns
-- with `filter (where a.succeeded)`, so an L-sit held for 8 s against a 10 s
-- bar counted as no hold at all — the session's longest hold disappeared
-- because it was not long enough, which is the one number progression is
-- read from.
--
-- The filters come off. A hold under the bar is still the length you held.
--
-- Nothing in the app read this view — the TypeScript computes the same
-- figures from the same rows — so this changes no screen today. It exists so
-- that the view and the screen cannot answer the same question differently
-- later, which is how a frozen baseline drifted from its data once already.
--
-- `successes` keeps its filter. That one IS the verdict.
--
-- Which variations are timed needs no new column: `min_hold_seconds` already
-- marks exactly the L-sit, the freestanding handstand and the back lever
-- hold, and is null for every movement. A hold is a variation with a
-- duration to clear.
-- ============================================================================

create or replace view fitness.v_calisthenics_progress as
with counted as (
  select a.entry_id,
         count(*)                                             as attempts,
         count(*) filter (where a.succeeded)                  as successes,
         -- Every recorded hold, cleared or not.
         max(a.hold_seconds)                                  as best_hold_seconds,
         sum(a.hold_seconds)                                  as total_hold_seconds,
         count(*) filter (where a.hold_seconds is not null)   as held_attempts,
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
       -- The bar this variation's holds are measured against. Null means the
       -- variation is a movement, not a hold.
       v.min_hold_seconds,
       e.provenance,
       case when c.attempts is not null then 'attempt' else e.record_precision::text end as basis,
       coalesce(c.attempts, e.attempts)                       as attempts,
       coalesce(c.successes, e.successful_attempts)           as successes,
       coalesce(c.best_hold_seconds, e.best_hold_seconds)     as best_hold_seconds,
       coalesce(c.total_hold_seconds, e.total_hold_seconds)   as total_hold_seconds,
       -- How many attempts carry a duration at all. A rate over holds needs
       -- this as its denominator, not the attempt count: an attempt nobody
       -- timed is not an attempt that lasted zero seconds.
       c.held_attempts,
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
-- 1. The timed variations, and nothing else, carry a bar.
select v.name, v.min_hold_seconds, s.name as skill
  from fitness.skill_variations v
  join fitness.skills s on s.id = v.skill_id
 where v.min_hold_seconds is not null
 order by v.min_hold_seconds, v.name;

-- 2. Holds that were recorded but did not clear the bar. Before this
--    migration every one of these reported no hold at all.
select e.entry_id, v.name, e.attempts, e.successes,
       e.held_attempts, e.best_hold_seconds, e.min_hold_seconds
  from fitness.v_calisthenics_progress e
  join fitness.skill_variations v on v.id = e.skill_variation_id
 where e.min_hold_seconds is not null
   and e.best_hold_seconds is not null
   and e.best_hold_seconds < e.min_hold_seconds
 order by e.entry_id;

-- 3. Nothing lost: every entry with attempt rows still reports from them.
select basis, count(*), count(best_hold_seconds) as with_a_hold
  from fitness.v_calisthenics_progress
 group by basis order by basis;
