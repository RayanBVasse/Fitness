-- ============================================================================
-- Fitness Observatory — Coach conversation store
--
-- Every turn records what was asked, which analysis tools ran, what they
-- returned, and the exact payload that left this server. "What did you send?"
-- must be answerable precisely rather than approximately — especially now that
-- the notes include health details and named people.
--
-- The verifier's decision is stored with the turn. An answer containing a
-- figure that appeared in no tool result is rejected, and the rejection is
-- kept: a silent retry that happened to pass the second time is not the same
-- as an answer that was right first time, and the difference is worth seeing.
-- ============================================================================

create table if not exists fitness.coach_messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null,
  role              text not null check (role in ('user', 'assistant')),
  content           text not null,

  -- Which Layer A tools ran for this turn, and what they returned. This is
  -- the evidence an answer is allowed to cite, and nothing else is.
  tool_calls        jsonb,
  tool_results      jsonb,

  -- Exactly what was sent to the model, after redaction.
  sent_payload      jsonb,
  redacted_names    integer not null default 0,

  model             text,
  -- passed | retried | rejected
  verifier_status   text,
  unsourced_numbers text[] not null default '{}',

  input_tokens      integer,
  output_tokens     integer,

  created_at        timestamptz not null default now()
);

create index if not exists coach_messages_conversation_idx
  on fitness.coach_messages (conversation_id, created_at);

alter table fitness.coach_messages enable row level security;

-- ---------------------------------------------------------------------------
-- Verify.
-- ---------------------------------------------------------------------------
select count(*) as coach_messages_rows from fitness.coach_messages;
