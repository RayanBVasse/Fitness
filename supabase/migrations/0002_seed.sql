-- ============================================================================
-- Fitness Observatory — reference data seed
-- Run after 0001_init.sql. Safe to re-run; every insert is idempotent.
--
-- Libraries are the union of all three sources: the proposal, the August 2026
-- Physiology Observatory workbook, and the Jan-Oct 2026 backfill pack. Aliases
-- map each source's spelling onto one identity so progression series do not
-- fragment across "Pec fly" / "pec_fly" / "pec_fly_drop".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Gyms. "Other / Custom" is handled by sessions.gym_custom_label, not a row.
-- ---------------------------------------------------------------------------
insert into fitness.gyms (slug, name, sort_order) values
  ('greenford',      'Greenford',       10),
  ('white_city',     'White City',      20),
  ('shepherds_bush', 'Shepherd''s Bush', 30),
  ('ealing',         'Ealing',          40)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Snatch variations.
-- counts_as_full_lift = false for anything that is not a full snatch. The
-- import contract is explicit: pulls, panda pulls, aborted pulls and bottom
-- stands must never be counted as successful full snatches.
-- ---------------------------------------------------------------------------
insert into fitness.snatch_variations (slug, name, counts_as_full_lift, sort_order) values
  ('full_snatch',         'Full snatch',             true,  10),
  ('power_snatch',        'Power snatch',            true,  20),
  ('hang_snatch',         'Hang snatch',             true,  30),
  ('muscle_snatch',       'Muscle snatch',           true,  40),
  ('no_feet_snatch',      'No-feet snatch',          true,  50),
  ('overhead_squat',      'Overhead squat',          false, 60),
  ('snatch_pull',         'Snatch pull',             false, 70),
  ('snatch_pull_aborted', 'Snatch pull (aborted)',   false, 80),
  ('panda_pull',          'Panda / high pull',       false, 90),
  ('bottom_stand',        'Bottom stand',            false, 100)
on conflict (slug) do update set
  counts_as_full_lift = excluded.counts_as_full_lift,
  name = excluded.name;

-- Every load observed across the workbook and the backfill.
insert into fitness.snatch_weight_presets (weight_kg, sort_order) values
  (20, 10), (25, 20), (30, 30), (32, 40), (32.5, 50), (35, 60), (40, 70),
  (42, 80), (42.5, 90), (45, 100), (47.5, 110), (50, 120), (52.5, 130), (55, 140)
on conflict (weight_kg) do nothing;

-- ---------------------------------------------------------------------------
-- Failure modes. implies_received marks the ones where the bar was caught
-- overhead but never stood up — the distinction the 50 kg history turns on.
-- ---------------------------------------------------------------------------
insert into fitness.failure_modes (slug, name, implies_received, sort_order) values
  ('conversion_drop',         'Conversion / drop',            false, 10),
  ('caught_then_dropped',     'Caught then dropped',          true,  20),
  ('stable_squat_no_stand',   'Stable squat, no stand',       true,  30),
  ('unstable_overhead_squat', 'Unstable overhead squat',      true,  40),
  ('sofa_not_stood',          'Received low, not stood',      true,  50),
  ('drop_front',              'Dropped forward',              false, 60),
  ('drop_behind',             'Dropped behind',               false, 70),
  ('no_lockout',              'No lockout',                   false, 80),
  ('incomplete_pull',         'Incomplete pull',              false, 90),
  ('grip_or_strap_issue',     'Grip / strap issue',           false, 100)
on conflict (slug) do update set
  implies_received = excluded.implies_received, name = excluded.name;

-- ---------------------------------------------------------------------------
-- Technique observations and coaching cues.
-- ---------------------------------------------------------------------------
insert into fitness.snatch_tags (slug, name, kind, sort_order) values
  ('smooth_extension',          'Smooth extension',           'observation', 10),
  ('early_arm_bend',            'Early arm bend',             'observation', 20),
  ('bar_drifting_forward',      'Bar drifting forward',       'observation', 30),
  ('slow_turnover',             'Slow turnover',              'observation', 40),
  ('fast_turnover',             'Fast turnover',              'observation', 50),
  ('strong_turnover_and_stand', 'Strong turnover + stand',    'observation', 60),
  ('stable_catch',              'Stable catch',               'observation', 70),
  ('unstable_catch',            'Unstable catch',             'observation', 80),
  ('incomplete_extension',      'Incomplete extension',       'observation', 90),
  ('excellent_execution',       'Excellent execution',        'observation', 100),
  ('warmup',                    'Warm-up',                    'cue',         110),
  ('cooldown',                  'Cooldown',                   'cue',         120),
  ('quality_and_standing',      'Quality / standing',         'cue',         130),
  ('catch_strength_stability',  'Catch strength / stability', 'cue',         140),
  ('overhead_catch_stability',  'Overhead catch / stability', 'cue',         150)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Hypertrophy library
-- ---------------------------------------------------------------------------
insert into fitness.muscle_groups (slug, name, sort_order) values
  ('chest',      'Chest',      10),
  ('mid_back',   'Mid-back',   20),
  ('lats',       'Lats',       30),
  ('shoulders',  'Shoulders',  40),
  ('biceps',     'Biceps',     50),
  ('triceps',    'Triceps',    60),
  ('quads',      'Quadriceps', 70),
  ('hamstrings', 'Hamstrings', 80),
  ('glutes',     'Glutes',     90),
  ('calves',     'Calves',     100),
  ('core',       'Core',       110)
on conflict (slug) do nothing;

insert into fitness.exercises (slug, name, muscle_group_id, is_unilateral, sort_order)
select v.slug, v.name, g.id, v.unilateral, v.sort_order
  from (values
    ('pec_fly',                  'Pec fly',                      'chest',      false, 10),
    ('chest_press',              'Chest press',                  'chest',      false, 20),
    ('cable_chest',              'Cable chest',                  'chest',      false, 30),
    ('chest_accessories',        'Chest accessories',            'chest',      false, 40),
    ('seated_row',               'Seated cable row',             'mid_back',   false, 50),
    ('reverse_pec_fly',          'Reverse pec fly',              'mid_back',   false, 60),
    ('lat_pulldown',             'Lat pulldown',                 'lats',       false, 70),
    ('chinup',                   'Chin-up',                      'lats',       false, 80),
    ('weighted_chinup',          'Weighted chin-up',             'lats',       false, 90),
    ('front_and_lateral_raise',  'Front + lateral raise',        'shoulders',  false, 100),
    ('lateral_raise',            'Lateral raise',                'shoulders',  false, 110),
    ('overhead_press',           'Overhead press',               'shoulders',  false, 120),
    ('biceps_curl',              'Biceps curl',                  'biceps',     false, 130),
    ('hammer_curl',              'Hammer curl',                  'biceps',     false, 140),
    ('triceps_extension',        'Triceps extension',            'triceps',    false, 150),
    ('pendulum_squat',           'Pendulum squat',               'quads',      false, 160),
    ('leg_press',                'Leg press',                    'quads',      false, 170),
    ('incline_leg_press',        'Incline leg press',            'quads',      false, 180),
    ('leg_extension',            'Leg extension',                'quads',      false, 190),
    ('single_leg_extension',     'Single-leg extension',         'quads',      true,  200),
    ('walking_lunge',            'Walking lunge',                'quads',      true,  210),
    ('hamstring_curl',           'Hamstring curl',               'hamstrings', false, 220),
    ('seated_hamstring_curl',    'Seated hamstring curl',        'hamstrings', false, 230),
    ('prone_hamstring_curl',     'Prone hamstring curl',         'hamstrings', false, 240),
    ('glute_kickback',           'Glute kickback',               'glutes',     true,  250),
    ('calf_raise',               'Calf raise',                   'calves',     false, 260),
    ('single_leg_calf_raise',    'Single-leg calf raise',        'calves',     true,  270)
  ) as v(slug, name, mg, unilateral, sort_order)
  join fitness.muscle_groups g on g.slug = v.mg
on conflict (slug) do nothing;

-- Source-spelling aliases. Drop-set rows collapse onto the parent exercise;
-- the drop itself is modelled by hypertrophy_sets.is_drop, not by identity.
insert into fitness.exercise_aliases (alias, exercise_id)
select a.alias, e.id
  from (values
    ('Pec fly',                   'pec_fly'),
    ('pec_fly_drop',              'pec_fly'),
    ('Cable chest',               'cable_chest'),
    ('Seated cable row',          'seated_row'),
    ('cable_row',                 'seated_row'),
    ('seated_row_drop',           'seated_row'),
    ('Biceps curl',               'biceps_curl'),
    ('biceps_curl_drop',          'biceps_curl'),
    ('Triceps (mild)',            'triceps_extension'),
    ('triceps_cable_various',     'triceps_extension'),
    ('triceps_upper_back',        'triceps_extension'),
    ('Front + lateral raise',     'front_and_lateral_raise'),
    ('Pendulum squat',            'pendulum_squat'),
    ('Leg press',                 'leg_press'),
    ('Incline leg press',         'incline_leg_press'),
    ('Leg extension',             'leg_extension'),
    ('Leg extension (bilateral)', 'leg_extension'),
    ('Single-leg extension',      'single_leg_extension'),
    ('Walking lunge',             'walking_lunge'),
    ('Hamstring curl',            'hamstring_curl'),
    ('hamstring_machine',         'hamstring_curl'),
    ('Seated leg curl',           'seated_hamstring_curl'),
    ('seated_hamstring_curl_drop','seated_hamstring_curl'),
    ('Prone leg curl',            'prone_hamstring_curl'),
    ('Glute kickback',            'glute_kickback'),
    ('Calf raise',                'calf_raise'),
    ('calf_raise_machine',        'calf_raise'),
    ('Single-leg calf raise',     'single_leg_calf_raise'),
    ('Weighted chin-up',          'weighted_chinup'),
    ('Chin-up',                   'chinup')
  ) as a(alias, slug)
  join fitness.exercises e on e.slug = a.slug
on conflict (alias) do nothing;

-- ---------------------------------------------------------------------------
-- Calisthenics library. Success criteria are defaults and are editable.
-- ---------------------------------------------------------------------------
insert into fitness.skills (slug, name, sort_order) values
  ('handstand',           'Handstand',              10),
  ('handstand_pushup',    'Handstand push-up',      20),
  ('l_sit_to_handstand',  'L-sit to handstand',     30),
  ('floating_press',      'Floating and pressing',  40),
  ('back_lever',          'Back lever',             50),
  ('support_work',        'Supporting exercises',   60)
on conflict (slug) do nothing;

insert into fitness.skill_variations
  (skill_id, slug, name, min_hold_seconds, requires_no_kick,
   requires_controlled_ascent, requires_controlled_descent, criteria_notes, sort_order)
select s.id, v.slug, v.name, v.min_hold, v.no_kick, v.asc_ctl, v.desc_ctl, v.notes, v.sort_order
  from (values
    ('handstand', 'kick_up_to_handstand', 'Kick-up to handstand',
      null, false, false, false, null, 10),
    ('handstand', 'freestanding_handstand', 'Freestanding handstand hold',
      10, false, false, false,
      'Success = balanced position reached and held for at least the minimum duration. Adjust min_hold_seconds as the hold improves; baseline best hold was 15 s in Aug 2026.', 20),
    ('handstand', 'controlled_handstand_negative', 'Controlled handstand negative',
      null, false, false, true,
      'Success requires a deliberate controlled descent, not falling out of position.', 30),
    ('handstand_pushup', 'freestanding_handstand_pushup', 'Freestanding handstand push-up',
      null, false, false, false, null, 40),
    ('handstand_pushup', 'banded_handstand_pushup', 'Banded handstand push-up',
      null, false, false, false, null, 50),
    ('handstand_pushup', 'wall_assisted_handstand_pushup', 'Wall-assisted handstand push-up',
      null, false, false, false, null, 60),
    ('l_sit_to_handstand', 'controlled_l_sit_to_handstand', 'Controlled L-sit to handstand',
      null, true, true, false,
      'Success requires the feet to leave the floor without kicking, followed by the full transition.', 70),
    ('l_sit_to_handstand', 'l_sit_to_handstand_pushup', 'L-sit to handstand push-up',
      null, true, true, false, null, 80),
    ('l_sit_to_handstand', 'banded_l_sit_to_handstand_pushup', 'Banded L-sit to handstand push-up',
      null, false, false, false, null, 90),
    ('l_sit_to_handstand', 'wall_assisted_l_sit_to_handstand_pushup', 'Wall-assisted L-sit to handstand push-up',
      null, false, false, false, null, 100),
    ('l_sit_to_handstand', 'l_sit_to_handstand_pushup_via_crow', 'L-sit to handstand push-up via crow',
      null, false, false, false, null, 110),
    ('l_sit_to_handstand', 'l_sit_to_tuck_transition', 'L-sit to tuck transition',
      null, true, true, false, null, 120),
    ('floating_press', 'floating_tuck_entry', 'Floating tuck entry',
      null, true, false, false,
      'Success requires the feet to leave the floor without kicking.', 130),
    ('floating_press', 'floating_tuck_to_handstand', 'Floating tuck to handstand',
      null, true, true, false, null, 140),
    ('floating_press', 'knees_together_tuck_ascent', 'Knees-together tuck ascent',
      null, true, true, false, null, 150),
    ('floating_press', 'bent_arm_press_to_handstand', 'Bent-arm press to handstand',
      null, false, true, false, null, 160),
    ('floating_press', 'controlled_reverse_transition', 'Controlled reverse transition',
      null, false, false, true, null, 170),
    ('back_lever', 'back_lever_attempt', 'Back lever attempt',
      null, false, false, false, null, 180),
    ('back_lever', 'back_lever_hold', 'Back lever hold',
      5, false, false, false, null, 190),
    ('support_work', 'l_sit_hold', 'L-sit hold',
      10, false, false, false, null, 200),
    ('support_work', 'compression_drills', 'Compression drills',
      null, false, false, false, null, 210),
    ('support_work', 'pancake_mobility', 'Pancake mobility',
      null, false, false, false, null, 220),
    ('support_work', 'wrist_shoulder_prep', 'Wrist / shoulder preparation',
      null, false, false, false, null, 230),
    ('support_work', 'barbell_warmup_drill', 'Barbell warm-up drill',
      null, false, false, false,
      'Light barbell drill, logged as practice. Never counted as a snatch attempt.', 240)
  ) as v(skill, slug, name, min_hold, no_kick, asc_ctl, desc_ctl, notes, sort_order)
  join fitness.skills s on s.slug = v.skill
on conflict (slug) do nothing;

insert into fitness.assistance_types (slug, name, sort_order) values
  ('none',       'None',       10),
  ('wall_start', 'Wall start', 20),
  ('band',       'Band',       30),
  ('spotter',    'Spotter',    40),
  ('box',        'Box',        50),
  ('other',      'Other',      60)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Injuries. Generic by site. The right knee is the live one; the earlier
-- wrist, lumbar and lat entries give the recovered 2026 observations a home
-- and prove the category is not knee-specific.
-- ---------------------------------------------------------------------------
insert into fitness.provoking_activities (slug, name, sort_order) values
  ('stairs',         'Stairs',         10),
  ('lunges',         'Lunges',         20),
  ('pendulum_squat', 'Pendulum squat', 30),
  ('leg_extension',  'Leg extension',  40),
  ('deep_squat',     'Deep squat',     50),
  ('snatch_catch',   'Snatch catch',   60),
  ('walking',        'Walking',        70),
  ('other',          'Other',          80)
on conflict (slug) do nothing;

insert into fitness.injuries (slug, label, body_region, side, detail, onset_date, is_active, notes) values
  ('right_knee_patellar', 'Right knee', 'knee', 'right',
   'Upper-inner region near the kneecap',
   '2026-08-24', true,
   'First recorded 2026-08-24 (ache entering squat after heavy leg machines). Recurred 2026-10-12 during a 20 kg walking lunge on the lowering phase and again with pendulum squat. Reported minor and improving on 2026-10-22. Pattern tracking only — no diagnosis, no causal attribution.'),
  ('wrist_discomfort', 'Wrist discomfort', 'wrist', 'both',
   'Onset at heavier snatch loads',
   '2026-04-29', false,
   'Recorded 2026-04-29 and 2026-05-04 at 45-50 kg. No severity ratings captured.'),
  ('lumbar_tightness', 'Lumbar tightness', 'lower_back', 'both',
   null, null, false, 'Single recovered observation; no severity rating.'),
  ('lat_irritation', 'Lat irritation', 'lat', 'left',
   'Bilateral, left greater than right',
   '2026-08-16', false,
   'Recorded during warm-up on 2026-08-16; coincided with two unsuccessful 50 kg attempts.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Settings. Progression thresholds are data, not code, so the rules stay
-- documented, inspectable in SETTINGS and adjustable without a deploy.
-- ---------------------------------------------------------------------------
insert into fitness.settings (key, value, notes) values
  ('timezone', '"Europe/London"'::jsonb,
   'All dates and week boundaries resolve in this zone.'),

  ('week_start', '"monday"'::jsonb,
   'Weekly reports run Monday to Sunday.'),

  ('heavy_session_threshold_kg', '47.5'::jsonb,
   'A snatch session counts as heavy when it includes at least one attempt at or above this load.'),

  ('snatch_objective', jsonb_build_object(
      'primary_load_kg', 50,
      'primary_target_stand_rate_pct', 80,
      'primary_current_stand_rate_pct', 52.9,
      'primary_sessions_per_week', 2,
      'secondary_load_kg', 52.5,
      'secondary_goal', 'first substantiated stood lift',
      'statement', 'Convert 50 kg from roughly 53% to reliably 80% or better, and record a first stood 52.5 kg.'),
   'Revised 2026-10-25 against the Jan-Oct 2026 backfill. 50 kg is not a target to reach: it was first stood on 2026-01-06 and has been the monthly maximum in all ten months. The objective is reliability at 50 kg and a breakthrough at 52.5 kg.'),

  ('snatch_baseline_2026', jsonb_build_object(
      'window', '2026-01-02..2026-10-24',
      'source', 'historical_reconstruction',
      'substantiated_only', true,
      'by_weight', jsonb_build_object(
        '45',   jsonb_build_object('attempts', 17, 'stood', 17, 'rate_pct', 100.0),
        '47.5', jsonb_build_object('attempts', 46, 'stood', 40, 'rate_pct', 87.0),
        '50',   jsonb_build_object('attempts', 68, 'stood', 36, 'rate_pct', 52.9),
        '52.5', jsonb_build_object('attempts', 3,  'stood', 0,  'rate_pct', 0.0)),
      'received_not_stood_by_month', jsonb_build_object(
        '2026-01', 6, '2026-05', 3, '2026-06', 2, '2026-08', 1),
      'note', 'Reference figures only. Computed from 49 of 188 recovered snatch rows — the rows where both attempts and stands were recorded. Not a complete training diary.'),
   'Frozen baseline for comparison. Live logging supersedes these numbers; it does not merge with them.'),

  ('progression_rules', jsonb_build_object(
      'applies_to', jsonb_build_array('snatch', 'calisthenics', 'hypertrophy'),
      'verdicts', jsonb_build_array('progressed', 'maintained', 'regressed', 'insufficient_data'),
      'max_load_is_not_a_progression_signal', true,
      'max_load_rationale', 'Maximum successful load was 50.0 kg in every month from Jan to Oct 2026. Keying progression off max load would report MAINTAINED for ten consecutive months and say nothing.',
      'snatch', jsonb_build_object(
        'primary_signal', 'stand rate at the primary load (50 kg)',
        'secondary_signals', jsonb_build_array(
          'received_not_stood as a share of attempts at the primary load',
          'attempt volume at or above the primary load',
          'mean quality_10 at the primary load'),
        'min_substantiated_attempts_for_verdict', 6,
        'progressed_if', 'stand rate at primary load improves by at least 10 percentage points against the trailing 4-week mean, or received_not_stood share falls by at least 10 points at equal or greater attempt volume',
        'regressed_if', 'stand rate at primary load falls by at least 15 percentage points against the trailing 4-week mean across at least 6 substantiated attempts',
        'single_miss_rule', 'A single missed heavy attempt can never produce a regressed verdict.',
        'insufficient_data_if', 'fewer than 6 substantiated attempts at the primary load in the week'),
      'calisthenics', jsonb_build_object(
        'per_variation', true,
        'never_pool_movements', true,
        'primary_signals', jsonb_build_array(
          'success rate within a single variation',
          'best hold seconds', 'total hold seconds',
          'controlled ascent count', 'controlled descent count'),
        'min_attempts_for_verdict', 5),
      'hypertrophy', jsonb_build_object(
        'progression_key', jsonb_build_array('gym', 'exercise', 'machine_label'),
        'primary_signals', jsonb_build_array(
          'load at fixed reps', 'reps at fixed load', 'volume load'),
        'volume_load_caveat', 'Volume load is a training metric, not a measurement of muscle growth.',
        'min_sets_for_verdict', 3)),
   'Documented classification rules. Edit here rather than in application code.'),

  ('analysis_guardrails', jsonb_build_object(
      'flag_insufficient_data_rather_than_infer', true,
      'min_n_for_correlation_display', 8,
      'label_all_associations_as_correlation', true,
      'no_diagnosis', true,
      'no_causal_attribution', 'The app must not claim that an exercise caused an injury or symptom on the basis of correlation. Its role is to surface patterns for training decisions or a sports physiotherapy appointment.',
      'composite_load_score', jsonb_build_object(
        'enabled', false,
        'requirement', 'Any composite training-load score must publish its formula in SETTINGS and must never be plotted on the same axis as measured performance.'),
      'historical_rows', jsonb_build_object(
        'excluded_from_precision_metrics_unless_substantiated', true,
        'rendered_distinctly_in_charts', true)),
   'Hard constraints on what the analytics layer is allowed to assert.'),

  ('snatch_warmup_ladder', jsonb_build_object(
      'derived_from', 'August 2026 workbook, repeated near-identically every session',
      'warmup', jsonb_build_array(
        jsonb_build_object('weight_kg', 35,   'reps', 2),
        jsonb_build_object('weight_kg', 42.5, 'reps', 2)),
      'working', jsonb_build_array(45, 47.5, 50),
      'cooldown', jsonb_build_array(
        jsonb_build_object('weight_kg', 45, 'reps', 2),
        jsonb_build_object('weight_kg', 40, 'reps', 3))),
   'Prefills the TODAY screen so a session starts from one tap rather than a blank form.')
on conflict (key) do update set value = excluded.value, notes = excluded.notes, updated_at = now();
