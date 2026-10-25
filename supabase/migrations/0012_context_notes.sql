-- ============================================================================
-- Fitness Observatory — context notes (private review table)
--
-- Narrative, not measurement. These are coaching observations, athlete
-- reports and hypotheses recovered from conversation: "the bar felt heavy
-- from the first contact", "possibly accumulated fatigue, untested".
--
-- They live in their own table precisely so they can never be mistaken for
-- results. Nothing here feeds a success rate, a volume total or a trend. A
-- note saying "one 50 kg stood" is a milestone worth remembering and is NOT
-- a 1/1 success rate — the denominator was never recorded.
--
-- `structured_observation` holds the numbers a note happens to mention. It is
-- a hint for a human reviewer, never a value for analytics, and
-- `candidate_numeric` marks the rows where that temptation exists.
--
-- Everything arrives as `pending`. The coach may eventually read `approved`
-- rows only.
-- ============================================================================

create table if not exists fitness.context_notes (
  id                     uuid primary key default gen_random_uuid(),
  -- Idempotent re-import: the pack's own stable identifier.
  external_source_id     text not null unique,
  note_type              text not null,
  category               text not null,
  content                text not null,

  -- A day when one is established, otherwise a period label like '2026-10'.
  -- Both null is allowed: some coaching knowledge is not anchored in time.
  anchor_date            date,
  period_label           text,

  source_type            text not null,
  source_timestamp       timestamptz,
  -- user_reported, assistant_hypothesis, assistant_recommendation,
  -- retrieved_user_report_requires_source_verification, ...
  evidence_status        text not null,
  tags                   text[] not null default '{}',

  -- Numbers the note mentions. A reviewer's hint; never an input to analytics.
  structured_observation jsonb,
  candidate_numeric      boolean not null default false,
  sensitivity            text not null default 'normal',

  -- Annotation only. Linking a note to a session says "this describes that
  -- day"; it never adds an attempt, a set or a success to it.
  linked_session_id      uuid references fitness.sessions(id) on delete set null,

  review_status          text not null default 'pending'
                         check (review_status in ('pending', 'approved', 'rejected')),
  reviewed_at            timestamptz,
  review_note            text,

  -- Lets a re-import detect changed content without overwriting a decision.
  content_hash           text not null,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint context_notes_has_some_text check (length(btrim(content)) > 0)
);

create index if not exists context_notes_anchor_idx on fitness.context_notes (anchor_date desc);
create index if not exists context_notes_review_idx on fitness.context_notes (review_status, note_type);
create index if not exists context_notes_tags_idx   on fitness.context_notes using gin (tags);

drop trigger if exists touch_context_notes on fitness.context_notes;
create trigger touch_context_notes before update on fitness.context_notes
for each row execute function fitness.touch_updated_at();

-- Private like the rest of the schema. 0005 revoked the default grant for the
-- public roles and 0006 granted the server role, so this table inherits the
-- right posture without being named in either.
alter table fitness.context_notes enable row level security;

-- ---------------------------------------------------------------------------
-- Review surface.
-- ---------------------------------------------------------------------------
create or replace view fitness.v_context_notes_review as
select n.id,
       n.external_source_id,
       n.anchor_date,
       n.period_label,
       n.note_type,
       n.category,
       n.evidence_status,
       n.sensitivity,
       n.candidate_numeric,
       n.review_status,
       n.content,
       n.tags,
       n.linked_session_id,
       (s.id is not null) as has_session_that_day
  from fitness.context_notes n
  left join fitness.sessions s on s.id = n.linked_session_id
 order by n.anchor_date desc nulls last, n.external_source_id;

-- ---------------------------------------------------------------------------
-- Correct the 50 kg wording.
--
-- The objective note asserted that 50 kg "was first stood on 2026-01-06".
-- That was true of the imported data and overstated as a fact: a retrieved
-- report describes a completed 50 kg stand on 2025-11-16, with further ones
-- in December 2025. Those are not source-verified, and the Jan-Oct rate
-- baselines are unaffected either way, so the claim is softened rather than
-- replaced.
-- ---------------------------------------------------------------------------
update fitness.settings
   set notes = 'Revised 2026-10-25. 50 kg is not a target to reach: the earliest stood lift '
            || 'in the imported data is 2026-01-06, and a retrieved report describes one on '
            || '2025-11-16 that is not yet source-verified. Either way it has been the monthly '
            || 'maximum throughout, so the objective is reliability at 50 kg and a breakthrough '
            || 'at 52.5 kg. The current rate is computed by v_snatch_success_by_source and is '
            || 'deliberately not stored: a frozen number cannot stay honest as the rows behind '
            || 'it change.',
       updated_at = now()
 where key = 'snatch_objective';

-- ---------------------------------------------------------------------------
-- Verify: empty table, ready for the import.
-- ---------------------------------------------------------------------------
select count(*) as context_notes_rows from fitness.context_notes;
