-- ============================================================================
-- Fitness Observatory — the day as a first-class record
--
-- Until now, a day with no session row was ambiguous: it could mean a rest day
-- or a day that was never logged. Every derived figure that counts consecutive
-- training days, days since the last heavy session, or performance after rest
-- was inferring rest from absence, which is a guess.
--
-- A day is not a session. A session is a gym visit; a day happens whether or
-- not you train. Modelling rest as a flag on `sessions` would mean storing a
-- visit that did not occur.
--
-- This table is also the anchor the daily journal needs. Sleep, readiness,
-- soreness, stress, mood, bodyweight, nutrition and knee symptoms all belong
-- to a day rather than to a session — and the most informative entries are
-- often on days with no training at all.
-- ============================================================================

do $$ begin
  create type fitness.day_status as enum ('trained', 'rest', 'unlogged');
exception when duplicate_object then null; end $$;

create table if not exists fitness.days (
  day        date primary key,
  -- 'unlogged' is for a row that exists to carry notes or journal data without
  -- asserting anything about training. The absence of a row asserts nothing
  -- at all, which is different again.
  status     fitness.day_status not null default 'unlogged',
  notes      text,
  provenance fitness.provenance not null default 'logged',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists days_status_idx on fitness.days (status, day desc);

drop trigger if exists touch_days on fitness.days;
create trigger touch_days before update on fitness.days
for each row execute function fitness.touch_updated_at();

-- Private like everything else. 0005 revoked the default SELECT grant for the
-- public roles and 0006 granted the server role, so this table inherits the
-- right posture without being named in either.
alter table fitness.days enable row level security;

-- ---------------------------------------------------------------------------
-- Backfill: every date that already has a session is a day that was trained.
--
-- Deliberately NOT backfilled: rest days. A gap in the record means the day
-- was not logged, and we do not know whether it was rested or simply never
-- written down. Inventing rest days would put a fact in the database that was
-- never observed, which is the one thing this project does not do.
-- ---------------------------------------------------------------------------
insert into fitness.days (day, status, provenance)
select s.session_date,
       'trained'::fitness.day_status,
       case when bool_or(s.provenance = 'logged') then 'logged'
            else 'historical_reconstruction' end::fitness.provenance
  from fitness.sessions s
 group by s.session_date
on conflict (day) do nothing;

-- ---------------------------------------------------------------------------
-- Keep `trained` true by construction: creating a session marks its day.
-- ---------------------------------------------------------------------------
create or replace function fitness.mark_day_trained()
returns trigger language plpgsql as $$
begin
  insert into fitness.days (day, status, provenance)
  values (new.session_date, 'trained', new.provenance)
  on conflict (day) do update
    set status = 'trained',
        updated_at = now()
    -- A day someone marked as rest, then trained on anyway, becomes trained.
    where fitness.days.status <> 'trained';
  return new;
end $$;

drop trigger if exists sessions_mark_day on fitness.sessions;
create trigger sessions_mark_day
after insert on fitness.sessions
for each row execute function fitness.mark_day_trained();

-- ---------------------------------------------------------------------------
-- Verify: trained days should equal the number of distinct session dates.
-- ---------------------------------------------------------------------------
select (select count(*) from fitness.days where status = 'trained') as trained_days,
       (select count(distinct session_date) from fitness.sessions)  as session_dates,
       (select count(*) from fitness.days where status = 'rest')    as rest_days;
