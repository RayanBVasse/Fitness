-- ============================================================================
-- Fitness Observatory — three exercises
--
-- Face pulls and two more triceps movements. Added as rows rather than seeded
-- in 0002, so the original seed stays a record of what the library was when
-- it was written.
--
-- `triceps_extension` already exists and is unchanged. "Overhead cable
-- triceps" is a different movement with a different line of pull, not a
-- rename of it, and the two are kept apart for the same reason variations of
-- a skill are: a load on one says nothing about the other.
--
-- Face pulls go to `mid_back` rather than `shoulders`. They train the rear
-- delt and the mid-trap together, so either is defensible — mid_back puts
-- them in the "Back & triceps" region, which is the day they belong to.
-- Moving them is one update to muscle_group_id if that is wrong.
--
-- Sort orders sit between the existing ones so nothing has to be renumbered.
-- ============================================================================

insert into fitness.exercises (slug, name, muscle_group_id, is_unilateral, sort_order)
select v.slug, v.name, g.id, v.unilateral, v.sort_order
  from (values
    ('face_pull',                'Face pull',                    'mid_back', false, 65),
    ('overhead_cable_triceps',   'Overhead cable triceps',       'triceps',  false, 152),
    ('skull_crusher',            'Skull crusher',                'triceps',  false, 154)
  ) as v(slug, name, mg, unilateral, sort_order)
  join fitness.muscle_groups g on g.slug = v.mg
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Check.
-- ---------------------------------------------------------------------------
-- 1. The three new rows, with the region each will appear under.
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
 where e.slug in ('face_pull', 'overhead_cable_triceps', 'skull_crusher')
 order by e.sort_order;

-- 2. Back & triceps should now offer nine, and the picker's "All" count rises
--    from 27 to 30.
select r.value->>'name' as region,
       (select count(*)
          from fitness.exercises e
          join fitness.muscle_groups g on g.id = e.muscle_group_id
         where g.slug in (select jsonb_array_elements_text(r.value->'groups'))
           and e.is_active) as exercises
  from fitness.settings s,
       lateral jsonb_array_elements(s.value) as r(value)
 where s.key = 'muscle_regions';
