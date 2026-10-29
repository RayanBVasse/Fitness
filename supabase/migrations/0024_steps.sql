-- ============================================================================
-- Fitness Observatory — daily steps
--
-- The whole day's total, read off the phone. It is the load a training log
-- cannot see: twelve thousand steps on a rest day is not a rest day, and a
-- heavy leg session on top of one is a different session from the same work
-- on top of three thousand.
--
-- A dimension rather than a table, because that is what it is — one number
-- per day, like bodyweight. It needs no UI: the check-in renders whatever
-- `daily_metric_defs` offers, a `number` kind becomes a typed field rather
-- than a slider, and `in_quick_mode` keeps it on the first screen.
--
-- Deliberately NOT given a target. A step count with a goal attached stops
-- being a measurement and becomes a score, and nothing else in this app
-- tells you whether a number was good.
-- ============================================================================

insert into fitness.daily_metric_defs
  (slug, label, grouping, kind, min_value, max_value, step, unit, in_quick_mode, help, sort_order)
values
  ('steps', 'Steps', 'body', 'number', 0, 80000, 1, 'steps', true,
   'The whole day''s total from your phone, including the walk to the gym. Load the session never records.',
   105)
on conflict (slug) do update set
  label = excluded.label,
  grouping = excluded.grouping,
  kind = excluded.kind,
  min_value = excluded.min_value,
  max_value = excluded.max_value,
  step = excluded.step,
  unit = excluded.unit,
  in_quick_mode = excluded.in_quick_mode,
  help = excluded.help,
  sort_order = excluded.sort_order,
  is_active = true;

-- ---------------------------------------------------------------------------
-- Check.
-- ---------------------------------------------------------------------------
-- 1. It is there, active, and in the quick set.
select slug, label, kind, unit, min_value, max_value, in_quick_mode, is_active, sort_order
  from fitness.daily_metric_defs
 where slug = 'steps';

-- 2. The body group, in the order the check-in will render it.
select slug, label, kind, in_quick_mode
  from fitness.daily_metric_defs
 where grouping = 'body' and is_active
 order by sort_order;

-- 3. Nothing recorded against it yet.
select count(*) as step_days
  from fitness.daily_metrics
 where metric = 'steps';
