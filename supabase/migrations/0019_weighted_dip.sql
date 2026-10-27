-- ============================================================================
-- Fitness Observatory — the weighted dip
--
-- Its own migration rather than an addition to 0018, which was already
-- pushed. Editing a migration after it has gone out means that anyone who
-- has run it has no reason to run it again, and the row would quietly never
-- arrive. Numbered files are append-only for exactly that reason.
--
-- Filed under chest, at the athlete's word. A dip is a chest or a triceps
-- movement depending on how far you lean, and the person doing it is the one
-- who knows which it is for them. Sitting at 35 puts it after the cable
-- chest work and before "Chest accessories", which is a catch-all and
-- belongs last.
-- ============================================================================

insert into fitness.exercises (slug, name, muscle_group_id, is_unilateral, sort_order)
select v.slug, v.name, g.id, v.unilateral, v.sort_order
  from (values
    ('weighted_dip', 'Weighted dip', 'chest', false, 35)
  ) as v(slug, name, mg, unilateral, sort_order)
  join fitness.muscle_groups g on g.slug = v.mg
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Check.
-- ---------------------------------------------------------------------------
-- The chest list, in the order the picker will show it.
select e.slug, e.name, e.sort_order, e.is_active
  from fitness.exercises e
  join fitness.muscle_groups g on g.id = e.muscle_group_id
 where g.slug = 'chest'
 order by e.sort_order;
