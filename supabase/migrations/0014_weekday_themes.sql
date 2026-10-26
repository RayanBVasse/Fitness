-- ============================================================================
-- Fitness Observatory — weekday themes
--
-- The week already has a shape: Massive Mondays are legs, Technique Tuesdays,
-- Workhorse Wednesdays are heavy snatch, Form Fridays. Writing it down turns a
-- habit into a stated intention, which is the thing adherence can be measured
-- against — "Wednesday is meant to be heavy snatch" is checkable in a way that
-- "I usually snatch midweek" is not.
--
-- Stored in settings like the progression rules and the ladder: data, editable
-- without a deploy, and visible on the Settings screen.
--
-- Thursday, Saturday and Sunday are deliberately absent rather than guessed.
-- An empty day means no stated intention, which is different from a rest day
-- and different again from a day whose theme nobody has written down yet.
-- ============================================================================

insert into fitness.settings (key, value, notes) values
  ('weekday_themes', jsonb_build_object(
      '1', jsonb_build_object(
        'name', 'Massive Mondays',
        'focus', 'hypertrophy',
        'emphasis', 'legs',
        'note', 'Lower-body hypertrophy anchors the week.'),
      '2', jsonb_build_object(
        'name', 'Technique Tuesdays',
        'focus', 'snatch',
        'emphasis', 'technique',
        'note', 'Quality over load. A technical day is not a light day if the bar is at 90% or more.'),
      '3', jsonb_build_object(
        'name', 'Workhorse Wednesdays',
        'focus', 'snatch',
        'emphasis', 'heavy',
        'note', 'The heavy snatch day — where 50 kg attempts belong.'),
      '5', jsonb_build_object(
        'name', 'Form Fridays',
        'focus', null,
        'emphasis', 'form',
        'note', 'Focus not yet pinned down; set it here when it settles.')),
   'Weekday intentions, keyed by ISO weekday (1 = Monday). A missing day means '
   || 'no stated intention — not a rest day, and not a day whose theme is simply '
   || 'unwritten. The coach compares these against what was actually trained and '
   || 'must treat a mismatch as a question, never a failing: an intention is a '
   || 'plan, and training to how the body turns up on the day is the stated '
   || 'preference.')
on conflict (key) do update set value = excluded.value, notes = excluded.notes, updated_at = now();

-- ---------------------------------------------------------------------------
-- Verify, and show what each themed weekday has actually carried, so the
-- intention can be read next to the record from the start.
-- ---------------------------------------------------------------------------
select t.key as iso_weekday,
       t.value->>'name'  as theme,
       t.value->>'focus' as intended_focus,
       count(distinct s.session_date) as sessions_on_that_weekday
  from jsonb_each((select value from fitness.settings where key = 'weekday_themes')) as t(key, value)
  left join fitness.sessions s
    on extract(isodow from s.session_date)::text = t.key
 group by t.key, t.value
 order by t.key;
