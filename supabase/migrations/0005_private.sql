-- ============================================================================
-- Fitness Observatory — make the data private
--
-- Until now RLS granted `anon` SELECT on every table, which made the whole
-- schema readable over the Supabase REST API with the publishable anon key —
-- independently of the website. Locking the front end would have left that
-- open, so the fix starts here rather than in the app.
--
-- After this migration the anon key opens nothing. Every read goes through the
-- server with the service-role key, behind a session cookie.
--
-- Note on roles: this Supabase project is shared with other applications
-- (Author-LL, gna, wsai, carlos). Granting to `authenticated` would expose
-- this schema to any authenticated user of the whole project, so that role is
-- revoked here too rather than used as the new gate.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop the public read policies.
--    RLS stays enabled: the service role bypasses it, everyone else now has
--    no policy granting them anything, which denies by default.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'gyms','snatch_variations','snatch_weight_presets','failure_modes','snatch_tags',
    'muscle_groups','exercises','exercise_aliases','skills','skill_variations',
    'assistance_types','provoking_activities','sessions','session_blocks',
    'snatch_blocks','snatch_attempts','snatch_block_tags','snatch_attempt_tags',
    'calisthenics_entries','hypertrophy_sets','injuries','injury_observations',
    'daily_metrics','import_batches','import_records','settings'
  ] loop
    execute format('drop policy if exists public_read on fitness.%I', t);
    -- Belt and braces: RLS must stay on, or a future grant would expose rows.
    execute format('alter table fitness.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Revoke the table and view grants.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema fitness from anon, authenticated;
revoke all on all sequences in schema fitness from anon, authenticated;
revoke all on all functions in schema fitness from anon, authenticated;
revoke usage on schema fitness from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reverse the default privileges set in 0001.
--
--    This is the line that matters most. Without it, every table created in
--    this schema from now on would silently be granted SELECT to anon again,
--    and the next migration would quietly reopen everything.
-- ---------------------------------------------------------------------------
alter default privileges in schema fitness revoke select on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Verify.
--
--    Expect zero rows. Any row returned is a grant that still exists, and the
--    schema is not private until this comes back empty.
-- ---------------------------------------------------------------------------
select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'fitness'
   and grantee in ('anon', 'authenticated')
 order by table_name, grantee;

-- And expect zero policies remaining for the public roles.
select tablename, policyname, roles
  from pg_policies
 where schemaname = 'fitness'
 order by tablename, policyname;
