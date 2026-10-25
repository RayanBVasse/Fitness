-- ============================================================================
-- Fitness Observatory — reviewed promotion from staging
--
-- 0003 stages rows. This file installs the review surface and the promotion
-- function. Running this file promotes NOTHING on its own.
--
--   1. Review:   select * from fitness.import_preview;
--   2. Dry run:  select * from fitness.promote_imports();
--   3. Promote:  select * from fitness.promote_imports(false);
--
-- Only rows with status 'pending_review' are promoted. Rows marked
-- 'superseded' — the 28 backfill rows the August workbook covers better — are
-- kept and skipped. Nutrition rows are staged but have no target table yet and
-- are skipped deliberately.
--
-- Promotion is idempotent: every target row carries source_record_id, and
-- nothing is inserted twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Safe casts.
--
-- The sources are recovered chat records, so a numeric field sometimes holds
-- prose: reps_per_set carries '4-6', '6-7', '3-5' and 'a_couple'. A direct
-- ::smallint aborts the whole promotion on the first one.
--
-- These return null rather than throwing, and unparsed_suffix keeps the
-- original text on the row's notes so the detail is preserved rather than
-- discarded. A range is not silently averaged into a number that was never
-- recorded.
-- ---------------------------------------------------------------------------
create or replace function fitness.safe_smallint(v text)
returns smallint language sql immutable as $$
  select case when v ~ '^-?\d+$' then v::smallint end;
$$;

create or replace function fitness.safe_numeric(v text)
returns numeric language sql immutable as $$
  select case when v ~ '^-?\d+(\.\d+)?$' then v::numeric end;
$$;

create or replace function fitness.unparsed_suffix(p jsonb, fields text[])
returns text language sql immutable as $$
  select coalesce(
           ' [' || string_agg(f || ' recorded as "' || (p->>f) || '"', '; ') || ']',
           '')
    from unnest(fields) as f
   where p ? f
     and (p->>f) !~ '^-?\d+(\.\d+)?$';
$$;

-- ---------------------------------------------------------------------------
-- Which source table feeds which target.
-- ---------------------------------------------------------------------------
create or replace function fitness.import_target(source_table text)
returns text language sql immutable as $$
  select case source_table
    when 'snatch_observations'       then 'snatch_blocks'
    when 'workbook_snatch'           then 'snatch_blocks'
    when 'hypertrophy_observations'  then 'hypertrophy_sets'
    when 'workbook_hypertrophy'      then 'hypertrophy_sets'
    when 'calisthenics_observations' then 'calisthenics_entries'
    when 'workbook_calisthenics'     then 'calisthenics_entries'
    when 'recovery_symptoms'         then 'daily_metrics_or_injury'
    when 'context_notes'             then 'daily_metrics'
    when 'workbook_daily_log'        then 'daily_metrics'
    when 'workbook_food'             then null
    else null
  end;
$$;

create or replace function fitness.import_workstream(source_table text)
returns fitness.workstream language sql immutable as $$
  select case source_table
    when 'snatch_observations'       then 'snatch'
    when 'workbook_snatch'           then 'snatch'
    when 'hypertrophy_observations'  then 'hypertrophy'
    when 'workbook_hypertrophy'      then 'hypertrophy'
    when 'calisthenics_observations' then 'calisthenics'
    when 'workbook_calisthenics'     then 'calisthenics'
    else null
  end::fitness.workstream;
$$;

-- ---------------------------------------------------------------------------
-- Review surface. What is staged, what it would become, what is held back.
-- ---------------------------------------------------------------------------
create or replace view fitness.import_preview as
select r.source_table,
       r.status,
       coalesce(fitness.import_target(r.source_table), '(no target — held)') as target,
       count(*)                                     as rows,
       min(r.observation_date)                      as first_date,
       max(r.observation_date)                      as last_date,
       count(*) filter (where r.conflict_flag)      as conflicts,
       count(distinct r.observation_date)           as distinct_dates
  from fitness.import_records r
 group by r.source_table, r.status, 3
 order by r.source_table, r.status;

-- Every row the pack flagged as disputed, so they can be read before promoting.
create or replace view fitness.import_conflicts as
select record_id, source_table, observation_date, status, conflict_note, record_quality, notes
  from fitness.import_records
 where conflict_flag
 order by observation_date, source_table, record_id;

-- The backfill rows the workbook supersedes. Kept, never deleted.
create or replace view fitness.import_superseded as
select record_id, source_table, observation_date, superseded_by, record_quality, notes
  from fitness.import_records
 where status = 'superseded'
 order by observation_date, source_table, record_id;

-- ---------------------------------------------------------------------------
-- Promotion
-- ---------------------------------------------------------------------------
create or replace function fitness.promote_imports(p_commit boolean default false)
returns table (step text, detail text, rows bigint)
language plpgsql as $$
declare
  n bigint;
begin
  if not p_commit then
    return query
      select 'dry_run'::text,
             r.source_table || ' -> ' || coalesce(fitness.import_target(r.source_table), 'held back'),
             count(*)
        from fitness.import_records r
       where r.status = 'pending_review'
       group by r.source_table
       order by r.source_table;
    return query select 'dry_run'::text, 'nothing written; call promote_imports(false => true) to commit'::text, 0::bigint;
    return;
  end if;

  -- 1. Sessions: one per date. The gym comes from the workbook where it knows
  --    one; the backfill deliberately records no gym rather than inferring it.
  insert into fitness.sessions (session_date, gym_id, provenance, record_quality, notes)
  select d.observation_date,
         g.id,
         case when d.has_workbook then 'workbook_import' else 'historical_reconstruction' end::fitness.provenance,
         'imported',
         'Created by backfill promotion. Times of day are unknown: the source carries chat timestamps, not workout clocks.'
    from (
      select r.observation_date,
             bool_or(r.source_table like 'workbook%')                                  as has_workbook,
             (array_agg(r.payload->>'gym_slug') filter (where r.payload->>'gym_slug' is not null))[1] as gym_slug
        from fitness.import_records r
       where r.status = 'pending_review'
         and r.observation_date is not null
         and fitness.import_target(r.source_table) is not null
       group by r.observation_date
    ) d
    left join fitness.gyms g on g.slug = d.gym_slug
   where not exists (select 1 from fitness.sessions s where s.session_date = d.observation_date);
  get diagnostics n = row_count;
  return query select 'sessions'::text, 'created'::text, n;

  -- 2. One workstream block per (date, discipline).
  insert into fitness.session_blocks (session_id, workstream, sort_order)
  select s.id, x.workstream, 10
    from (
      select distinct r.observation_date, fitness.import_workstream(r.source_table) as workstream
        from fitness.import_records r
       where r.status = 'pending_review'
         and fitness.import_workstream(r.source_table) is not null
    ) x
    join fitness.sessions s on s.session_date = x.observation_date
   where not exists (
     select 1 from fitness.session_blocks sb
      where sb.session_id = s.id and sb.workstream = x.workstream);
  get diagnostics n = row_count;
  return query select 'session_blocks'::text, 'created'::text, n;

  -- 3. Snatch. `attempts` comes from the workbook's Attempts or the backfill's
  --    reported_repetitions; `dropped` from Drops or misses_or_drops. A row
  --    with no attempt count is stored as qualitative and is excluded from
  --    every success rate by is_substantiated.
  insert into fitness.snatch_blocks (
    session_id, session_block_id, variation_id, weight_kg, sets_count, reps_per_set,
    attempts, full_stand_successes, received_not_stood, dropped,
    quality_10, straps, failure_mode_id, notes,
    provenance, record_precision, record_quality, source_record_id)
  select s.id, sb.id, v.id,
         fitness.safe_numeric(r.payload->>'weight_kg'),
         fitness.safe_smallint(r.payload->>'sets_count'),
         fitness.safe_smallint(r.payload->>'reps_per_set'),
         coalesce(fitness.safe_smallint(r.payload->>'attempts'),
                  fitness.safe_smallint(r.payload->>'reported_repetitions')),
         fitness.safe_smallint(r.payload->>'full_stand_successes'),
         fitness.safe_smallint(r.payload->>'received_not_stood'),
         coalesce(fitness.safe_smallint(r.payload->>'dropped'),
                  fitness.safe_smallint(r.payload->>'misses_or_drops')),
         fitness.safe_smallint(r.payload->>'quality_10'),
         (r.payload->>'straps')::boolean,
         fm.id,
         nullif(coalesce(r.notes, '') || fitness.unparsed_suffix(r.payload,
           array['weight_kg','sets_count','reps_per_set','attempts',
                 'reported_repetitions','full_stand_successes',
                 'received_not_stood','dropped','misses_or_drops','quality_10']), ''),
         case when r.source_table like 'workbook%' then 'workbook_import' else 'historical_reconstruction' end::fitness.provenance,
         case when coalesce(fitness.safe_smallint(r.payload->>'attempts'),
                            fitness.safe_smallint(r.payload->>'reported_repetitions')) is null
              then 'qualitative' else 'block' end::fitness.record_precision,
         r.record_quality,
         r.record_id
    from fitness.import_records r
    join fitness.sessions s on s.session_date = r.observation_date
    left join fitness.session_blocks sb on sb.session_id = s.id and sb.workstream = 'snatch'
    join fitness.snatch_variations v on v.slug = coalesce(r.payload->>'variation_slug', 'full_snatch')
    left join fitness.failure_modes fm on fm.slug = r.payload->>'failure_mode_slug'
   where r.status = 'pending_review'
     and r.source_table in ('snatch_observations', 'workbook_snatch')
     and not exists (select 1 from fitness.snatch_blocks x where x.source_record_id = r.record_id);
  get diagnostics n = row_count;
  return query select 'snatch_blocks'::text, 'inserted'::text, n;

  -- Technical cues recorded on workbook rows.
  insert into fitness.snatch_block_tags (block_id, tag_id)
  select b.id, t.id
    from fitness.import_records r
    join fitness.snatch_blocks b on b.source_record_id = r.record_id
    join fitness.snatch_tags t on t.slug = r.payload->>'tag_slug'
   where r.payload ? 'tag_slug'
  on conflict do nothing;
  get diagnostics n = row_count;
  return query select 'snatch_block_tags'::text, 'linked'::text, n;

  -- 4. Hypertrophy. Exercise identity resolves through the slug first, then the
  --    alias table, so "Pec fly", "pec_fly" and "pec_fly_drop" land on one row.
  insert into fitness.hypertrophy_sets (
    session_id, session_block_id, exercise_id, load_kg, reps, sets_count,
    order_vs_snatch, is_drop, notes,
    provenance, record_precision, record_quality, source_record_id)
  select s.id, sb.id, coalesce(e.id, al.exercise_id),
         coalesce(fitness.safe_numeric(r.payload->>'load_kg'),
                  fitness.safe_numeric(r.payload->>'weight_kg')),
         coalesce(fitness.safe_smallint(r.payload->>'reps'),
                  fitness.safe_smallint(r.payload->>'reps_per_set')),
         coalesce(fitness.safe_smallint(r.payload->>'sets_count'),
                  fitness.safe_smallint(r.payload->>'sets'), 1),
         coalesce((r.payload->>'order_vs_snatch')::fitness.snatch_order, 'unknown'),
         coalesce(r.payload->>'exercise', '') like '%\_drop',
         nullif(coalesce(r.notes, '') || fitness.unparsed_suffix(r.payload,
           array['load_kg','weight_kg','reps','reps_per_set','sets_count','sets']), ''),
         case when r.source_table like 'workbook%' then 'workbook_import' else 'historical_reconstruction' end::fitness.provenance,
         'block'::fitness.record_precision,
         r.record_quality,
         r.record_id
    from fitness.import_records r
    join fitness.sessions s on s.session_date = r.observation_date
    left join fitness.session_blocks sb on sb.session_id = s.id and sb.workstream = 'hypertrophy'
    left join fitness.exercises e
           on e.slug = coalesce(r.payload->>'exercise', r.payload->>'exercise_name')
    left join fitness.exercise_aliases al
           on al.alias = coalesce(r.payload->>'exercise_name', r.payload->>'exercise')
   where r.status = 'pending_review'
     and r.source_table in ('hypertrophy_observations', 'workbook_hypertrophy')
     and coalesce(e.id, al.exercise_id) is not null
     and not exists (select 1 from fitness.hypertrophy_sets x where x.source_record_id = r.record_id);
  get diagnostics n = row_count;
  return query select 'hypertrophy_sets'::text, 'inserted'::text, n;

  -- The workbook records drop sets as extra columns on the parent row. They
  -- become their own set, pointing back at the set they dropped from.
  insert into fitness.hypertrophy_sets (
    session_id, session_block_id, exercise_id, load_kg, reps, sets_count,
    order_vs_snatch, is_drop, parent_set_id, notes,
    provenance, record_precision, record_quality, source_record_id)
  select p.session_id, p.session_block_id, p.exercise_id,
         fitness.safe_numeric(r.payload->>'drop_load_kg'),
         coalesce(fitness.safe_smallint(r.payload->>'drop_reps'), p.reps),
         coalesce(fitness.safe_smallint(r.payload->>'drop_sets'), 1),
         p.order_vs_snatch, true, p.id,
         'Drop set recorded on the parent row in the August workbook.',
         'workbook_import'::fitness.provenance,
         'block'::fitness.record_precision,
         r.record_quality,
         r.record_id || ':drop'
    from fitness.import_records r
    join fitness.hypertrophy_sets p on p.source_record_id = r.record_id
   where r.source_table = 'workbook_hypertrophy'
     and r.payload ? 'drop_load_kg'
     and not exists (select 1 from fitness.hypertrophy_sets x where x.source_record_id = r.record_id || ':drop');
  get diagnostics n = row_count;
  return query select 'hypertrophy_sets'::text, 'drop sets inserted'::text, n;

  -- 5. Calisthenics, per movement variation. Never pooled across movements.
  insert into fitness.calisthenics_entries (
    session_id, session_block_id, skill_variation_id, sets_count, reps_per_set,
    attempts, successful_attempts, best_hold_seconds, total_hold_seconds,
    assistance_id, notes,
    provenance, record_precision, record_quality, source_record_id)
  select s.id, sb.id, sv.id,
         coalesce(fitness.safe_smallint(r.payload->>'sets_count'),
                  fitness.safe_smallint(r.payload->>'sets')),
         fitness.safe_smallint(r.payload->>'reps_per_set'),
         fitness.safe_smallint(r.payload->>'attempts'),
         fitness.safe_smallint(r.payload->>'successful_attempts'),
         coalesce(fitness.safe_numeric(r.payload->>'best_hold_seconds'),
                  fitness.safe_numeric(r.payload->>'hold_seconds')),
         fitness.safe_numeric(r.payload->>'total_hold_seconds'),
         a.id,
         nullif(coalesce(r.notes, '') || fitness.unparsed_suffix(r.payload,
           array['sets_count','sets','reps_per_set','attempts','successful_attempts',
                 'best_hold_seconds','hold_seconds','total_hold_seconds']), ''),
         case when r.source_table like 'workbook%' then 'workbook_import' else 'historical_reconstruction' end::fitness.provenance,
         case when fitness.safe_smallint(r.payload->>'attempts') is null
              then 'qualitative' else 'block' end::fitness.record_precision,
         r.record_quality,
         r.record_id
    from fitness.import_records r
    join fitness.sessions s on s.session_date = r.observation_date
    left join fitness.session_blocks sb on sb.session_id = s.id and sb.workstream = 'calisthenics'
    join fitness.skill_variations sv on sv.slug = r.payload->>'skill_variation_slug'
    left join fitness.assistance_types a on a.slug = r.payload->>'assistance_slug'
   where r.status = 'pending_review'
     and r.source_table in ('calisthenics_observations', 'workbook_calisthenics')
     and not exists (select 1 from fitness.calisthenics_entries x where x.source_record_id = r.record_id);
  get diagnostics n = row_count;
  return query select 'calisthenics_entries'::text, 'inserted'::text, n;

  -- 6. Injury observations. Severity is recorded only where the source gave a
  --    rating; a row with none stays unrated rather than being scored.
  insert into fitness.injury_observations (
    injury_id, session_id, obs_date, pain_during_0_10, notes,
    provenance, record_quality, source_record_id)
  select i.id, s.id, r.observation_date,
         case when r.payload->>'unit' = '0-10' then fitness.safe_smallint(r.payload->>'value') end,
         r.notes,
         'historical_reconstruction'::fitness.provenance,
         r.record_quality,
         r.record_id
    from fitness.import_records r
    join fitness.injuries i on i.slug = r.payload->>'injury_slug'
    left join fitness.sessions s on s.session_date = r.observation_date
   where r.status = 'pending_review'
     and r.source_table = 'recovery_symptoms'
     and r.payload ? 'injury_slug'
     and not exists (select 1 from fitness.injury_observations x where x.source_record_id = r.record_id);
  get diagnostics n = row_count;
  return query select 'injury_observations'::text, 'inserted'::text, n;

  -- 7. Daily metrics: readiness and sleep from the backfill, the workbook's
  --    daily log, and the context notes that carry no series of their own.
  insert into fitness.daily_metrics (
    metric_date, metric, value_numeric, value_text, unit, notes,
    provenance, record_quality, source_record_id)
  select r.observation_date,
         r.payload->>'metric',
         fitness.safe_numeric(r.payload->>'value'),
         case when fitness.safe_numeric(r.payload->>'value') is null
              then r.payload->>'value' end,
         r.payload->>'unit',
         r.notes,
         'historical_reconstruction'::fitness.provenance,
         r.record_quality,
         r.record_id
    from fitness.import_records r
   where r.status = 'pending_review'
     and r.source_table = 'recovery_symptoms'
     and not (r.payload ? 'injury_slug')
     and not exists (select 1 from fitness.daily_metrics x where x.source_record_id = r.record_id);
  get diagnostics n = row_count;
  return query select 'daily_metrics'::text, 'from recovery rows'::text, n;

  insert into fitness.daily_metrics (
    metric_date, metric, value_text, notes,
    provenance, record_quality, source_record_id)
  select r.observation_date,
         'context_' || coalesce(r.payload->>'kind', 'note'),
         r.notes,
         r.notes,
         'historical_reconstruction'::fitness.provenance,
         r.record_quality,
         r.record_id
    from fitness.import_records r
   where r.status = 'pending_review'
     and r.source_table = 'context_notes'
     and not exists (select 1 from fitness.daily_metrics x where x.source_record_id = r.record_id);
  get diagnostics n = row_count;
  return query select 'daily_metrics'::text, 'from context notes'::text, n;

  insert into fitness.daily_metrics (
    metric_date, metric, value_numeric, notes,
    provenance, record_quality, source_record_id)
  select r.observation_date, m.key, fitness.safe_numeric(m.value), r.notes,
         'workbook_import'::fitness.provenance, r.record_quality,
         r.record_id || ':' || m.key
    from fitness.import_records r
    cross join lateral jsonb_each_text(r.payload->'metrics') as m(key, value)
   where r.status = 'pending_review'
     and r.source_table = 'workbook_daily_log'
     and not exists (select 1 from fitness.daily_metrics x where x.source_record_id = r.record_id || ':' || m.key);
  get diagnostics n = row_count;
  return query select 'daily_metrics'::text, 'from workbook daily log (numeric)'::text, n;

  insert into fitness.daily_metrics (
    metric_date, metric, value_text, notes,
    provenance, record_quality, source_record_id)
  select r.observation_date, t.key, t.value, r.notes,
         'workbook_import'::fitness.provenance, r.record_quality,
         r.record_id || ':' || t.key
    from fitness.import_records r
    cross join lateral jsonb_each_text(r.payload->'texts') as t(key, value)
   where r.status = 'pending_review'
     and r.source_table = 'workbook_daily_log'
     and not exists (select 1 from fitness.daily_metrics x where x.source_record_id = r.record_id || ':' || t.key);
  get diagnostics n = row_count;
  return query select 'daily_metrics'::text, 'from workbook daily log (text)'::text, n;

  -- 8. Mark what landed. Rows whose target could not be resolved stay pending
  --    and are reported, rather than being quietly marked done.
  update fitness.import_records r
     set status = 'imported',
         reviewed_at = now(),
         target_table = fitness.import_target(r.source_table)
   where r.status = 'pending_review'
     and exists (
       select 1 from fitness.snatch_blocks        x where x.source_record_id = r.record_id
       union all
       select 1 from fitness.hypertrophy_sets     x where x.source_record_id = r.record_id
       union all
       select 1 from fitness.calisthenics_entries x where x.source_record_id = r.record_id
       union all
       select 1 from fitness.injury_observations  x where x.source_record_id = r.record_id
       union all
       select 1 from fitness.daily_metrics        x where x.source_record_id = r.record_id
       union all
       select 1 from fitness.daily_metrics        x where x.source_record_id like r.record_id || ':%'
     );
  get diagnostics n = row_count;
  return query select 'import_records'::text, 'marked imported'::text, n;

  return query
    select 'still_pending'::text,
           r.source_table || coalesce(' — ' || fitness.import_target(r.source_table), ' — no target table (nutrition is a later category)'),
           count(*)
      from fitness.import_records r
     where r.status = 'pending_review'
     group by r.source_table
     order by r.source_table;
end $$;

-- ---------------------------------------------------------------------------
-- Lock the promotion down.
--
-- Postgres grants EXECUTE on every new function to PUBLIC, so revoking from
-- anon alone would leave it callable over RPC. PUBLIC is revoked first, then
-- the roles, in that order.
--
-- The function is SECURITY INVOKER, so an anon caller would also fail on the
-- table grants — but a writable entry point should not be reachable at all.
--
-- The staging views expose unreviewed rows with known conflicts in them, and
-- 0001 set default privileges granting anon SELECT on new tables and views in
-- this schema, so they need revoking explicitly too.
-- ---------------------------------------------------------------------------
revoke all on function fitness.promote_imports(boolean) from public;
revoke all on function fitness.promote_imports(boolean) from anon, authenticated;
revoke all on function fitness.import_target(text) from public;
revoke all on function fitness.import_workstream(text) from public;
revoke all on function fitness.safe_smallint(text) from public;
revoke all on function fitness.safe_numeric(text) from public;
revoke all on function fitness.unparsed_suffix(jsonb, text[]) from public;

revoke select on fitness.import_preview, fitness.import_conflicts, fitness.import_superseded
  from anon, authenticated;
