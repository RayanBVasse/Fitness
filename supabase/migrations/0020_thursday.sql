-- ============================================================================
-- Fitness Observatory — Thursday
--
-- Leg development and calisthenics. The fourth weekday to get a stated
-- intention; Saturday and Sunday still have none, which remains a fact about
-- them rather than an omission.
--
-- `focus` takes one workstream because it is what adherence is measured
-- against, and hypertrophy is the half of the day with loads on it. The
-- calisthenics half lives in `emphasis`, which is prose and is read by the
-- picker rather than counted.
--
-- Merged into the existing row rather than replacing it, so Monday, Tuesday,
-- Wednesday and Friday keep whatever they say now — including any edit made
-- in the SQL editor since 0014.
-- ============================================================================

update fitness.settings
   set value = value || jsonb_build_object(
         '4', jsonb_build_object(
           'name',     'Leg-Dev Thursdays',
           'focus',    'hypertrophy',
           'emphasis', 'legs and calisthenics',
           'note',     'Leg development with a calisthenics focus. The leg work '
                       'is the measured half; the calisthenics is the reason the '
                       'day is not simply a second Monday.')),
       updated_at = now()
 where key = 'weekday_themes';

-- ---------------------------------------------------------------------------
-- Check.
-- ---------------------------------------------------------------------------
-- The week as it now stands. Thursday should be present, Saturday and Sunday
-- absent — an empty day means no stated intention, not a rest day.
select d.iso::text as weekday,
       s.value->d.iso->>'name'     as theme,
       s.value->d.iso->>'focus'    as focus,
       s.value->d.iso->>'emphasis' as emphasis
  from fitness.settings s,
       (values ('1'), ('2'), ('3'), ('4'), ('5'), ('6'), ('7')) as d(iso)
 where s.key = 'weekday_themes'
 order by d.iso;
