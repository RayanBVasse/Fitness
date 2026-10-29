-- ============================================================================
-- Fitness Observatory — squats
--
-- The library had no squat you do with a barbell. `pendulum_squat`,
-- `leg_press` and `incline_leg_press` are machines; `overhead_squat` and
-- `stable_squat_no_stand` are snatch variations, recorded as lifts rather
-- than as leg work. So a back squat had nowhere to go.
--
-- Two rows, not one. "Squat" on its own would be the error this app spends
-- its time avoiding: a front squat at 60 kg and a back squat at 60 kg are
-- the same number against different leverage, and the drill-down compares
-- sessions at a matched load within one exercise. Logged under a single
-- name they would be drawn as a change in the athlete, which is exactly
-- what separate machines are kept apart to prevent.
--
-- Both go to `quads`. A back squat loads the posterior chain heavily and an
-- argument for `glutes` exists, but the muscle group is what picks the
-- region, and these belong to a leg day. One update to muscle_group_id if
-- that turns out wrong.
--
-- Sort orders sit between the existing ones so nothing is renumbered, and
-- ahead of the machines: a barbell squat is the one the others accessorise.
--
-- Aliases are for the importer, which has already run. They are here so that
-- a re-import, or a historical thread mentioning "squats", lands on a named
-- exercise instead of creating a second one. The bare words map to the back
-- squat because that is what they mean unqualified; "front" never does.
-- ============================================================================

insert into fitness.exercises (slug, name, muscle_group_id, is_unilateral, sort_order)
select v.slug, v.name, g.id, v.unilateral, v.sort_order
  from (values
    ('back_squat',  'Back squat',  'quads', false, 156),
    ('front_squat', 'Front squat', 'quads', false, 158)
  ) as v(slug, name, mg, unilateral, sort_order)
  join fitness.muscle_groups g on g.slug = v.mg
on conflict (slug) do nothing;

insert into fitness.exercise_aliases (alias, exercise_id)
select a.alias, e.id
  from (values
    ('Squat',       'back_squat'),
    ('Squats',      'back_squat'),
    ('Back squat',  'back_squat'),
    ('back_squat',  'back_squat'),
    ('Barbell squat', 'back_squat'),
    ('Front squat', 'front_squat'),
    ('front_squat', 'front_squat')
  ) as a(alias, slug)
  join fitness.exercises e on e.slug = a.slug
on conflict (alias) do nothing;

-- ---------------------------------------------------------------------------
-- Check.
-- ---------------------------------------------------------------------------
-- 1. The two new rows, with the region each will appear under.
select e.slug, e.name, g.name as muscle_group, e.sort_order, e.is_active,
       coalesce(
         (select r.value->>'name'
            from fitness.settings s,
                 lateral jsonb_array_elements(s.value) as r(value)
           where s.key = 'muscle_regions'
             and g.slug in (select jsonb_array_elements_text(r.value->'groups'))
           limit 1),
         'no region — reachable through All') as region
  from fitness.exercises e
  join fitness.muscle_groups g on g.id = e.muscle_group_id
 where e.slug in ('back_squat', 'front_squat')
 order by e.sort_order;

-- 2. They sit ahead of the machines in the picker.
select slug, name, sort_order
  from fitness.exercises
 where muscle_group_id = (select id from fitness.muscle_groups where slug = 'quads')
   and is_active
 order by sort_order;

-- 3. The aliases resolve, and none was stolen from another exercise.
select a.alias, e.slug
  from fitness.exercise_aliases a
  join fitness.exercises e on e.id = a.exercise_id
 where a.alias ilike '%squat%'
 order by e.slug, a.alias;
