-- Task 12 production migration: practice aggregate and immutable completed results.

CREATE TABLE practice_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  certification_id_at_start uuid NOT NULL REFERENCES certifications(id),
  certification_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'completed')),
  current_index integer NOT NULL CHECK (current_index >= 0),
  result_id uuid NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  version bigint NOT NULL CHECK (version >= 0),
  active_slot text NULL CHECK (active_slot IS NULL OR active_slot = 'active'),
  UNIQUE (user_id, certification_key, active_slot)
);
CREATE TABLE practice_session_questions (
  id uuid NOT NULL,
  practice_session_id uuid NOT NULL REFERENCES practice_sessions(id),
  display_index integer NOT NULL CHECK (display_index >= 0),
  snapshot_content jsonb NOT NULL,
  selected_choice_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_choice_ids jsonb NULL,
  earned_numerator bigint NULL CHECK (earned_numerator >= 0),
  earned_denominator bigint NULL CHECK (earned_denominator > 0),
  submitted_at timestamptz NULL,
  flagged boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL CHECK (version >= 0),
  PRIMARY KEY (practice_session_id, id),
  UNIQUE (practice_session_id, display_index)
);
CREATE TABLE completed_practice_results (
  id uuid PRIMARY KEY,
  source_practice_session_id uuid NOT NULL UNIQUE REFERENCES practice_sessions(id),
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  certification_snapshot jsonb NOT NULL,
  raw_numerator bigint NOT NULL CHECK (raw_numerator >= 0),
  raw_denominator bigint NOT NULL CHECK (raw_denominator > 0),
  accuracy_numerator bigint NOT NULL CHECK (accuracy_numerator >= 0),
  accuracy_denominator bigint NOT NULL CHECK (accuracy_denominator > 0),
  domain_performance jsonb NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > completed_at)
);
CREATE TABLE completed_practice_items (
  id uuid NOT NULL,
  result_id uuid NOT NULL REFERENCES completed_practice_results(id),
  display_index integer NOT NULL CHECK (display_index >= 0),
  snapshot_content jsonb NOT NULL,
  selected_choice_ids jsonb NOT NULL,
  earned_numerator bigint NOT NULL CHECK (earned_numerator >= 0),
  earned_denominator bigint NOT NULL CHECK (earned_denominator > 0),
  PRIMARY KEY (result_id, id),
  UNIQUE (result_id, display_index)
);
CREATE INDEX completed_practice_results_owner_expiry ON completed_practice_results (user_id, expires_at, id);
CREATE INDEX completed_practice_results_expiry ON completed_practice_results (expires_at, id);
