-- ============================================================================
-- Fitness Observatory — the hypertrophy half of the week
--
-- A day has two intentions, not one. Tuesday is snatch technique AND back and
-- triceps; Wednesday is heavy snatch AND chest and biceps. `focus` holds one
-- workstream because that is what adherence is measured against, and
-- `emphasis` is prose — so the muscle region had nowhere to live except
-- inside a sentence, which the picker was reading by string match.
--
-- `region` gives it a field of its own: a muscle_regions slug, or null where
-- the day has no stated hypertrophy intention.
--
-- The weekend is recorded as what was actually said and no more. One of the
-- two days is chest, the other is back with biceps and triceps, and one of
-- them is a heavy 50 kg snatch day — but WHICH day is which was not stated,
-- and guessing would put a plan in the record that nobody made. Both days
-- carry the plan in their note with focus and region left null, so the
-- picker opens on Recent rather than on a region the app invented.
-- ============================================================================

update fitness.settings
   set value = jsonb_build_object(
         '1', (value->'1') || jsonb_build_object('region', 'legs'),
         '2', (value->'2') || jsonb_build_object('region', 'back_triceps'),
         '3', (value->'3') || jsonb_build_object('region', 'chest_biceps'),
         '4', (value->'4') || jsonb_build_object('region', 'legs'),
         '5', (value->'5') || jsonb_build_object('region', null),
         '6', jsonb_build_object(
                'name',     'Weekend',
                'focus',    null,
                'region',   null,
                'emphasis', 'chest or back',
                'note',     'Across Saturday and Sunday: one day chest, the other '
                            'back with biceps and triceps, and one of the two a '
                            'heavy 50 kg snatch day. Which day is which is decided '
                            'on the day, so neither is written down here.'),
         '7', jsonb_build_object(
                'name',     'Weekend',
                'focus',    null,
                'region',   null,
                'emphasis', 'chest or back',
                'note',     'Across Saturday and Sunday: one day chest, the other '
                            'back with biceps and triceps, and one of the two a '
                            'heavy 50 kg snatch day. Which day is which is decided '
                            'on the day, so neither is written down here.')),
       notes = 'Weekday intentions, keyed by ISO weekday (1 = Monday). `focus` is '
               'the workstream the day is judged on; `region` is the muscle region '
               'the hypertrophy picker opens on; `emphasis` is prose. A missing '
               'day, or a null field, means no stated intention — which is not the '
               'same as a rest day.',
       updated_at = now()
 where key = 'weekday_themes';

-- ---------------------------------------------------------------------------
-- Check.
-- ---------------------------------------------------------------------------
-- 1. The week, both halves of it.
select d.iso::text as weekday,
       s.value->d.iso->>'name'     as theme,
       s.value->d.iso->>'focus'    as snatch_focus,
       s.value->d.iso->>'region'   as hypertrophy_region,
       s.value->d.iso->>'emphasis' as emphasis
  from fitness.settings s,
       (values ('1'), ('2'), ('3'), ('4'), ('5'), ('6'), ('7')) as d(iso)
 where s.key = 'weekday_themes'
 order by d.iso;

-- 2. Every region named above must exist, or the picker opens on nothing.
select d.iso::text as weekday, s.value->d.iso->>'region' as region,
       exists (
         select 1
           from fitness.settings r,
                lateral jsonb_array_elements(r.value) as x(value)
          where r.key = 'muscle_regions'
            and x.value->>'slug' = s.value->d.iso->>'region'
       ) as region_exists
  from fitness.settings s,
       (values ('1'), ('2'), ('3'), ('4'), ('5'), ('6'), ('7')) as d(iso)
 where s.key = 'weekday_themes'
   and s.value->d.iso->>'region' is not null
 order by d.iso;
