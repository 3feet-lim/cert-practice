-- Disposable Aurora DSQL compatibility schema for Task 9 only.
-- Production migrations are implemented in Task 12 after the adapter decision.
-- DSQL permits one DDL statement per transaction, so every statement is idempotent
-- and the live runner records a checksum-protected checkpoint after each statement.

CREATE TABLE IF NOT EXISTS spike_user_profile (
  id uuid PRIMARY KEY,
  google_sub text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS spike_catalog_revision (
  id uuid PRIMARY KEY,
  revision_number integer NOT NULL UNIQUE,
  imported_document jsonb NOT NULL,
  complete boolean NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS spike_catalog_item (
  revision_id uuid NOT NULL REFERENCES spike_catalog_revision(id),
  item_key text NOT NULL,
  item_document jsonb NOT NULL,
  PRIMARY KEY (revision_id, item_key)
);

CREATE TABLE IF NOT EXISTS spike_catalog_head (
  singleton boolean PRIMARY KEY CHECK (singleton),
  revision_id uuid NOT NULL REFERENCES spike_catalog_revision(id),
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS spike_practice_session (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES spike_user_profile(id),
  certification_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'completed')),
  version integer NOT NULL CHECK (version >= 0),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS spike_active_practice_slot (
  user_id uuid NOT NULL,
  certification_id uuid NOT NULL,
  session_id uuid NOT NULL UNIQUE,
  PRIMARY KEY (user_id, certification_id)
);

CREATE TABLE IF NOT EXISTS spike_practice_snapshot (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES spike_practice_session(id),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  snapshot_document jsonb NOT NULL,
  UNIQUE (session_id, ordinal)
);

CREATE TABLE IF NOT EXISTS spike_exam_session (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES spike_user_profile(id),
  certification_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'submitted')),
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS spike_attempt (
  id uuid PRIMARY KEY,
  exam_session_id uuid NOT NULL UNIQUE REFERENCES spike_exam_session(id),
  user_id uuid NOT NULL REFERENCES spike_user_profile(id),
  certification_id uuid NOT NULL,
  raw_numerator bigint NOT NULL CHECK (raw_numerator >= 0),
  raw_denominator bigint NOT NULL CHECK (raw_denominator > 0),
  accuracy_numerator bigint NOT NULL CHECK (accuracy_numerator >= 0),
  accuracy_denominator bigint NOT NULL CHECK (accuracy_denominator > 0),
  submitted_at timestamptz NOT NULL
);

CREATE INDEX ASYNC spike_attempt_history_cursor
  ON spike_attempt (user_id, submitted_at, id);

CREATE INDEX ASYNC spike_attempt_leaderboard_candidates
  ON spike_attempt (certification_id, user_id, submitted_at, id);

CREATE TABLE IF NOT EXISTS spike_completed_practice_result (
  id uuid PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  result_document jsonb NOT NULL
);

CREATE INDEX ASYNC spike_practice_result_expiry
  ON spike_completed_practice_result (expires_at, id);
