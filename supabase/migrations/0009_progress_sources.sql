-- ============================================================================
-- Fitness Observatory — separate imported history from newly logged training
--
-- Two problems, one cause.
--
-- 1. `v_snatch_success_by_weight` has no provenance filter, so the Progress
--    screen's "logged now" figure already includes ten months of imported
--    history. Every session logged from here would be diluted into that
--    average and never show as its own signal.
--
-- 2. `settings` stored a frozen baseline of 52.9% at 50 kg. That number was
--    computed from the backfill pack before this pipeline existed: before
--    supersession, and before `counts_as_full_lift` excluded pulls. It
--    counted two aborted snatch pulls on 2026-10-05 as failed snatches.
--
--    Reconciliation of the two denominators, 50 kg, substantiated only:
--      68  backfill pack alone, as the frozen figure was computed
--      -1  2026-08-11, superseded by the August workbook
--      -2  2026-10-05, snatch_pull_aborted - a pull, not a snatch
--      +4  workbook 50 kg blocks (5, 11, 16 Aug), none stood
--      69  what the view computes. Stood is 36 either way.
--
-- A stored number cannot be kept honest as the data behind it changes, so it
-- is removed rather than corrected. The baseline is computed from here on.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Success by load AND source, so the two populations are never averaged
-- together by accident.
-- ---------------------------------------------------------------------------
create or replace view fitness.v_snatch_success_by_source as
select weight_kg,
       case when provenance = 'logged' then 'logged' else 'imported' end as source,
       count(*)                            as blocks,
       sum(attempts)                       as attempts,
       sum(full_stand_successes)           as stood,
       sum(coalesce(received_not_stood,0)) as received_not_stood,
       sum(coalesce(received_total,0))     as received,
       round(100.0 * sum(full_stand_successes) / nullif(sum(attempts),0), 1) as stand_rate_pct,
       round(100.0 * sum(coalesce(received_total,0)) / nullif(sum(attempts),0), 1) as receive_rate_pct
  from fitness.v_snatch_blocks
 where is_substantiated and counts_as_full_lift
 group by weight_kg, 2
 order by weight_kg, 2;

-- ---------------------------------------------------------------------------
-- Retire the frozen figures.
-- ---------------------------------------------------------------------------
delete from fitness.settings where key = 'snatch_baseline_2026';

update fitness.settings
   set value = (value - 'primary_current_stand_rate_pct'),
       notes = 'Revised 2026-10-25. 50 kg is not a target to reach: it was first stood on '
            || '2026-01-06 and has been the monthly maximum in all ten months. The objective '
            || 'is reliability at 50 kg and a breakthrough at 52.5 kg. The current rate is '
            || 'computed from the data by v_snatch_success_by_source and is deliberately not '
            || 'stored here: a frozen number cannot stay honest as the rows behind it change.',
       updated_at = now()
 where key = 'snatch_objective';

-- ---------------------------------------------------------------------------
-- Verify: imported and logged, side by side, per load.
-- ---------------------------------------------------------------------------
select weight_kg, source, blocks, attempts, stood, stand_rate_pct, receive_rate_pct
  from fitness.v_snatch_success_by_source
 order by weight_kg, source;

select key, value from fitness.settings where key = 'snatch_objective';
