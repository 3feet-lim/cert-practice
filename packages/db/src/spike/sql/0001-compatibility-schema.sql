-- Candidate DSQL compatibility schema only. This is not a production migration.
-- Every statement requires target-engine verification before Task 12 promotion.

CREATE TABLE spike_user_profile (
  id uuid PRIMARY KEY,
  google_sub text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL
);

CREATE TABLE spike_catalog_revision (
  id uuid PRIMARY KEY,
  revision_number integer NOT NULL UNIQUE,
  imported_document jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE spike_catalog_head (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  revision_id uuid NOT NULL REFERENCES spike_catalog_revision(id),
  updated_at timestamptz NOT NULL
);

CREATE TABLE spike_practice_session (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES spike_user_profile(id),
  certification_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'completed')),
  version integer NOT NULL CHECK (version >= 0),
  created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX spike_active_practice_per_user_certification
  ON spike_practice_session (user_id, certification_id)
  WHERE status = 'active';

CREATE TABLE spike_attempt (
  id uuid PRIMARY KEY,
  exam_session_id uuid NOT NULL UNIQUE,
  raw_numerator bigint NOT NULL CHECK (raw_numerator >= 0),
  raw_denominator bigint NOT NULL CHECK (raw_denominator > 0),
  accuracy_numerator bigint NOT NULL CHECK (accuracy_numerator >= 0),
  accuracy_denominator bigint NOT NULL CHECK (accuracy_denominator > 0),
  submitted_at timestamptz NOT NULL
);
CREATE INDEX spike_attempt_history_cursor
  ON spike_attempt (submitted_at DESC, id DESC);
CREATE INDEX spike_attempt_leaderboard
  ON spike_attempt (accuracy_numerator DESC, submitted_at ASC, id ASC);

CREATE TABLE spike_completed_practice_result (
  id uuid PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  result_document jsonb NOT NULL
);
CREATE INDEX spike_practice_result_expiry ON spike_completed_practice_result (expires_at, id);
