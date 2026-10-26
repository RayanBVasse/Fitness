-- ============================================================================
-- Fitness Observatory — training regions
--
-- A day is a region, not an exercise. You go in for legs, or chest and
-- biceps, or back and triceps, and the twelve-to-fifteen machines for that
-- region are the only ones worth seeing; the other fifteen are distance to
-- scroll past one-handed.
--
-- A region is a grouping ABOVE muscle_groups: one row here covers several of
-- them. It is stored as data, like the weekday themes and the ladder, so
-- changing a split is an edit to one row rather than a deploy. The order of
-- the array is the order they appear on screen.
--
-- `groups` holds muscle_group slugs. An exercise whose muscle group is in no
-- region is still reachable — the picker keeps an "All" escape — because a
-- region that silently hid an exercise would be worse than no region at all.
-- ============================================================================

insert into fitness.settings (key, value, notes) values
  ('muscle_regions', jsonb_build_array(
      jsonb_build_object(
        'slug',   'legs',
        'name',   'Legs',
        'groups', jsonb_build_array('quads', 'hamstrings', 'glutes', 'calves')),
      jsonb_build_object(
        'slug',   'chest_biceps',
        'name',   'Chest & biceps',
        'groups', jsonb_build_array('chest', 'biceps')),
      jsonb_build_object(
        'slug',   'back_triceps',
        'name',   'Back & triceps',
        'groups', jsonb_build_array('mid_back', 'lats', 'triceps')),
      jsonb_build_object(
        'slug',   'shoulders_core',
        'name',   'Shoulders & core',
        'groups', jsonb_build_array('shoulders', 'core'))),
   'Training regions: which muscle groups you train together on a day. Taken '
   'from the athlete''s own split (legs / chest and biceps / back and triceps); '
   'shoulders and core were not named and are grouped here so that every '
   'muscle group has a home. Edit this row to change a split — the picker, the '
   'prefill and the Settings screen all read it.')
on conflict (key) do update
  set value = excluded.value,
      notes = excluded.notes,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Check.
-- ---------------------------------------------------------------------------
-- 1. The regions, and how many exercises each one would offer.
select r.region, r.groups,
       (select count(*)
          from fitness.exercises e
          join fitness.muscle_groups g on g.id = e.muscle_group_id
         where g.slug = any (r.groups) and e.is_active) as exercises
  from (
    select x.value->>'name' as region,
           array(select jsonb_array_elements_text(x.value->'groups')) as groups
      from fitness.settings s,
           lateral jsonb_array_elements(s.value) as x(value)
     where s.key = 'muscle_regions'
  ) r;

-- 2. Any muscle group left out of every region. These stay reachable through
--    "All", but if something lands here it is probably an oversight.
select g.slug, g.name
  from fitness.muscle_groups g
 where g.is_active
   and not exists (
     select 1
       from fitness.settings s,
            lateral jsonb_array_elements(s.value) as x(value)
      where s.key = 'muscle_regions'
        and g.slug in (select jsonb_array_elements_text(x.value->'groups'))
   )
 order by g.sort_order;
