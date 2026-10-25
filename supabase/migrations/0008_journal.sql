-- ============================================================================
-- Fitness Observatory — daily check-in (quick mode)
--
-- The journal stores into `daily_metrics`, which already holds 88 rows
-- recovered from Jan-Oct 2026. Reusing it means today's sleep score continues
-- the same series as the imported one rather than starting a rival to it.
--
-- The dimensions live in a table rather than in application code, like the
-- progression rules in `settings`: adding "enthusiasm" later is a row, not a
-- migration and a deploy.
--
-- Scales are 0-10 throughout. The proposal had some 1-5, but the recovered
-- history records sleep_quality and fatigue on 0-10, and a series that changes
-- scale halfway through is not comparable with itself.
-- ============================================================================

create table if not exists fitness.daily_metric_defs (
  slug          text primary key,
  label         text not null,
  grouping      text not null,
  kind          text not null check (kind in ('scale', 'number', 'text')),
  min_value     numeric,
  max_value     numeric,
  step          numeric,
  unit          text,
  -- Quick mode is meant to take 20-30 seconds. Only the fields worth that
  -- time every day carry this flag; the rest are available but not asked for.
  in_quick_mode boolean not null default false,
  help          text,
  sort_order    smallint not null default 100,
  is_active     boolean not null default true
);

alter table fitness.daily_metric_defs enable row level security;

-- One logged value per metric per day, so the check-in can be edited through
-- the day rather than appending. Partial, because the imported rows are
-- historical and may legitimately repeat a metric on a date.
create unique index if not exists daily_metrics_logged_unique
  on fitness.daily_metrics (metric_date, metric)
  where provenance = 'logged';

insert into fitness.daily_metric_defs
  (slug, label, grouping, kind, min_value, max_value, step, unit, in_quick_mode, help, sort_order)
values
  -- Sleep
  ('sleep_duration',   'Sleep',            'sleep',     'number', 0, 14, 0.5, 'hours', true,
   'Hours actually asleep, not time in bed.', 10),
  ('sleep_quality',    'Sleep quality',    'sleep',     'scale',  0, 10, 1,   null,    true,
   null, 20),
  ('sleep_interruptions', 'Interruptions', 'sleep',     'number', 0, 10, 1,   'times', false,
   'Times woken.', 30),

  -- Readiness
  ('readiness',        'Readiness',        'readiness', 'scale',  0, 10, 1,   null,    true,
   'How ready you feel to train, before training.', 40),
  ('energy',           'Energy',           'readiness', 'scale',  0, 10, 1,   null,    false,
   null, 50),
  ('enthusiasm',       'Enthusiasm',       'readiness', 'scale',  0, 10, 1,   null,    false,
   'Wanting to train, as distinct from being able to.', 60),
  ('perceived_strength', 'Perceived strength', 'readiness', 'scale', 0, 10, 1, null,   false,
   'A perception, never a measurement. Load data lives with the session.', 70),

  -- Body
  ('soreness',         'Soreness',         'body',      'scale',  0, 10, 1,   null,    true,
   null, 80),
  ('fatigue',          'Fatigue',          'body',      'scale',  0, 10, 1,   null,    true,
   null, 90),
  ('bodyweight',       'Bodyweight',       'body',      'number', 30, 200, 0.1, 'kg',  true,
   'Morning weight. Read as a weekly average, not day to day.', 100),
  ('waist_cm',         'Waist',            'body',      'number', 40, 200, 0.5, 'cm',  false,
   null, 110),

  -- Mind
  ('stress',           'Stress',           'mind',      'scale',  0, 10, 1,   null,    true,
   null, 120),
  ('mood',             'Mood',             'mind',      'scale',  0, 10, 1,   null,    true,
   null, 130),
  ('mental_clarity',   'Clarity',          'mind',      'scale',  0, 10, 1,   null,    false,
   'Concentration and freedom from preoccupation.', 140),

  -- Life. Text, never scored, never correlated against performance.
  ('nutrition_note',   'Food',             'life',      'text',   null, null, null, null, false,
   'What you ate, in your own words. Macros optional and later.', 150),
  ('gym_gossip',       'Gym notes',        'life',      'text',   null, null, null, null, false,
   'Encounters, conversations, atmosphere. Life context, not physiology: kept out of every correlation.', 160),
  ('day_note',         'Anything else',    'life',      'text',   null, null, null, null, false,
   null, 170)
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
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Verify: the quick-mode set, and how much history each dimension already has.
-- ---------------------------------------------------------------------------
select d.slug, d.label, d.kind, d.in_quick_mode,
       (select count(*) from fitness.daily_metrics m where m.metric = d.slug) as existing_rows
  from fitness.daily_metric_defs d
 where d.is_active
 order by d.sort_order;
