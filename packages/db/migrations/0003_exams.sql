-- Task 12 production migration: exam aggregate, immutable attempts, history, and leaderboard.

CREATE TABLE exam_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  certification_id_at_start uuid NOT NULL REFERENCES certifications(id),
  certification_key text NOT NULL,
  certification_snapshot jsonb NOT NULL,
  start_request_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'submitted')),
  current_index integer NOT NULL CHECK (current_index >= 0),
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > started_at),
  submitted_at timestamptz NULL,
  attempt_id uuid NULL,
  version bigint NOT NULL CHECK (version >= 0),
  UNIQUE (user_id, start_request_key)
);
CREATE TABLE exam_session_questions (
  id uuid PRIMARY KEY,
  exam_session_id uuid NOT NULL REFERENCES exam_sessions(id),
  display_index integer NOT NULL CHECK (display_index >= 0),
  snapshot_content jsonb NOT NULL,
  selected_choice_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  flagged boolean NOT NULL DEFAULT false,
  saved_at timestamptz NOT NULL,
  version bigint NOT NULL CHECK (version >= 0),
  UNIQUE (exam_session_id, display_index)
);
CREATE TABLE attempts (
  id uuid PRIMARY KEY,
  exam_session_id uuid NOT NULL UNIQUE REFERENCES exam_sessions(id),
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  certification_key text NOT NULL,
  certification_snapshot jsonb NOT NULL,
  raw_numerator bigint NOT NULL CHECK (raw_numerator >= 0),
  raw_denominator bigint NOT NULL CHECK (raw_denominator > 0),
  accuracy_numerator bigint NOT NULL CHECK (accuracy_numerator >= 0),
  accuracy_denominator bigint NOT NULL CHECK (accuracy_denominator > 0),
  reference_1000 integer NOT NULL CHECK (reference_1000 >= 0 AND reference_1000 <= 1000),
  threshold_numerator bigint NOT NULL CHECK (threshold_numerator >= 0),
  threshold_denominator bigint NOT NULL CHECK (threshold_denominator > 0),
  passed boolean NOT NULL,
  domain_performance jsonb NOT NULL,
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz NOT NULL,
  submission_reason text NOT NULL CHECK (submission_reason IN ('manual', 'expired'))
);
CREATE TABLE attempt_items (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES attempts(id),
  display_index integer NOT NULL CHECK (display_index >= 0),
  snapshot_content jsonb NOT NULL,
  selected_choice_ids jsonb NOT NULL,
  earned_numerator bigint NOT NULL CHECK (earned_numerator >= 0),
  earned_denominator bigint NOT NULL CHECK (earned_denominator > 0),
  UNIQUE (attempt_id, display_index)
);
CREATE INDEX attempts_history_cursor ON attempts (user_id, submitted_at DESC, id ASC);
CREATE INDEX attempts_leaderboard_candidates ON attempts (certification_key, user_id, submitted_at ASC, id ASC);
