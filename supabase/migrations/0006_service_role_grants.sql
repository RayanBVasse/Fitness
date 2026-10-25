-- ============================================================================
-- Fitness Observatory — grant the server role access to this schema
--
-- Fixes "permission denied for schema fitness" after 0005.
--
-- What went wrong: 0001 granted USAGE and SELECT on this schema to `anon` and
-- `authenticated`, and never to `service_role`. That was invisible for as long
-- as every read used the anon key — which it did, because the app was public
-- and only writes went through the service role, and no write had yet been
-- made through the app.
--
-- 0005 moved reads onto the service role. The role had no USAGE on the schema,
-- so every query failed at the schema boundary before RLS was ever consulted.
--
-- Bypassing RLS is not the same as having privileges: `service_role` still
-- needs USAGE on the schema and rights on the objects inside it.
--
-- This grants nothing to anon or authenticated. They stay revoked, and the
-- data stays unreadable with the publishable key.
-- ============================================================================

grant usage on schema fitness to service_role;

grant all privileges on all tables in schema fitness to service_role;
grant all privileges on all sequences in schema fitness to service_role;
grant execute on all functions in schema fitness to service_role;

-- Future objects in this schema, so the next migration does not reintroduce
-- the same gap.
alter default privileges in schema fitness grant all on tables to service_role;
alter default privileges in schema fitness grant all on sequences to service_role;
alter default privileges in schema fitness grant execute on functions to service_role;

-- ---------------------------------------------------------------------------
-- Verify.
--
-- 1. service_role should now hold privileges on the tables and views.
--    Expect one row per object.
-- ---------------------------------------------------------------------------
select grantee, count(*) as objects
  from information_schema.role_table_grants
 where table_schema = 'fitness'
 group by grantee
 order by grantee;

-- 2. anon and authenticated must still hold nothing. Expect zero rows.
select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'fitness'
   and grantee in ('anon', 'authenticated')
 order by table_name, grantee;

-- 3. The schema itself: service_role must have USAGE, the public roles must not.
select r.rolname,
       has_schema_privilege(r.rolname, 'fitness', 'USAGE') as has_usage
  from pg_roles r
 where r.rolname in ('service_role', 'anon', 'authenticated')
 order by r.rolname;
