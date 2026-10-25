-- ============================================================================
-- Fitness Observatory — editable days, and why a rest day happened
--
-- A rest day is not a blank. "Rested because I was wrecked after heavy legs"
-- and "rested because it was pouring and I could not face the walk" are
-- different facts, and only one of them belongs anywhere near a fatigue
-- question later.
--
-- The reason is stored as a day-scoped metric rather than a column on `days`,
-- so it sits with sleep, readiness and the rest of the journal in one place
-- the coach can read, instead of in a second store with its own rules.
-- ============================================================================

-- Suggested values let a text dimension offer quick chips without hard-coding
-- a list in the interface. Data, like every other rule in this schema.
alter table fitness.daily_metric_defs
  add column if not exists suggested_values text[] not null default '{}';

insert into fitness.daily_metric_defs
  (slug, label, grouping, kind, in_quick_mode, help, sort_order, suggested_values)
values
  ('rest_reason', 'Why rest?', 'life', 'text', false,
   'Chips are shorthand; add detail in your own words. Recorded as context, never scored.',
   155,
   array['Fatigued','Sore','Hungry / under-fuelled','Poor sleep','Knee','Illness',
         'Bad weather','Busy','Planned rest','Lost motivation','Travel']),
  ('session_context', 'How did the gym feel?', 'life', 'text', false,
   'Atmosphere, how busy it was, how focused you felt. Context for performance, not a measure of it.',
   165,
   array['Calm','Busy','Crowded','Good focus','Distracted','Great atmosphere','Flat','Rushed'])
on conflict (slug) do update set
  label = excluded.label,
  grouping = excluded.grouping,
  kind = excluded.kind,
  in_quick_mode = excluded.in_quick_mode,
  help = excluded.help,
  sort_order = excluded.sort_order,
  suggested_values = excluded.suggested_values;

-- ---------------------------------------------------------------------------
-- Verify.
-- ---------------------------------------------------------------------------
select slug, label, kind, in_quick_mode, cardinality(suggested_values) as chips
  from fitness.daily_metric_defs
 where is_active
 order by sort_order;
