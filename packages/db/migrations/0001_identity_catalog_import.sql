-- Task 12 production migration: identity, revisioned catalog, and import validation.
-- This is intentionally separate from packages/db/src/spike/sql.

CREATE TABLE user_profiles (
  id uuid PRIMARY KEY,
  google_sub text NOT NULL UNIQUE,
  display_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'admin')),
  approval_status text NOT NULL CHECK (approval_status IN ('pending', 'approved')),
  score_public boolean NOT NULL DEFAULT false,
  first_login_at timestamptz NOT NULL,
  approved_at timestamptz NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL CHECK (version >= 0)
);
CREATE INDEX user_profiles_pending_order ON user_profiles (approval_status, first_login_at, id);

CREATE TABLE catalog_revisions (
  id uuid PRIMARY KEY,
  certification_key text NOT NULL,
  content_hash char(64) NOT NULL,
  imported_by uuid NOT NULL REFERENCES user_profiles(id),
  imported_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('staging', 'active', 'superseded')),
  UNIQUE (certification_key, content_hash),
  UNIQUE (id, certification_key)
);
CREATE TABLE catalog_heads (
  certification_key text PRIMARY KEY,
  active_revision_id uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL CHECK (version >= 0),
  FOREIGN KEY (active_revision_id, certification_key)
    REFERENCES catalog_revisions (id, certification_key)
);
CREATE TABLE providers (
  id uuid PRIMARY KEY,
  revision_id uuid NOT NULL REFERENCES catalog_revisions(id),
  external_key text NOT NULL,
  name text NOT NULL,
  logo_url text NULL,
  UNIQUE (revision_id, external_key),
  UNIQUE (id, revision_id)
);
CREATE TABLE certifications (
  id uuid PRIMARY KEY,
  revision_id uuid NOT NULL REFERENCES catalog_revisions(id),
  provider_id uuid NOT NULL,
  external_key text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  total_questions integer NOT NULL CHECK (total_questions > 0),
  time_limit_minutes integer NOT NULL CHECK (time_limit_minutes > 0),
  threshold_numerator bigint NOT NULL CHECK (threshold_numerator >= 0),
  threshold_denominator bigint NOT NULL CHECK (threshold_denominator > 0),
  scoring_mode text NOT NULL CHECK (scoring_mode IN ('all_or_nothing', 'partial')),
  UNIQUE (revision_id, external_key),
  UNIQUE (id, revision_id),
  FOREIGN KEY (provider_id, revision_id) REFERENCES providers (id, revision_id)
);
CREATE TABLE domains (
  id uuid PRIMARY KEY,
  revision_id uuid NOT NULL REFERENCES catalog_revisions(id),
  certification_id uuid NOT NULL,
  external_key text NOT NULL,
  name text NOT NULL,
  weight_basis_points integer NOT NULL CHECK (weight_basis_points > 0),
  order_index integer NOT NULL CHECK (order_index >= 0),
  UNIQUE (revision_id, certification_id, external_key),
  UNIQUE (revision_id, certification_id, order_index),
  UNIQUE (id, revision_id, certification_id),
  FOREIGN KEY (certification_id, revision_id)
    REFERENCES certifications (id, revision_id)
);
CREATE TABLE questions (
  id uuid PRIMARY KEY,
  revision_id uuid NOT NULL REFERENCES catalog_revisions(id),
  certification_id uuid NOT NULL,
  domain_id uuid NOT NULL,
  external_key text NOT NULL,
  stem_en text NOT NULL,
  stem_ko text NULL,
  explanation_en text NOT NULL,
  explanation_ko text NULL,
  translation_status text NOT NULL CHECK (translation_status IN ('translated', 'en_only')),
  required_choice_count integer NOT NULL CHECK (required_choice_count > 0),
  UNIQUE (revision_id, certification_id, external_key),
  UNIQUE (id, revision_id),
  FOREIGN KEY (certification_id, revision_id)
    REFERENCES certifications (id, revision_id),
  FOREIGN KEY (domain_id, revision_id, certification_id)
    REFERENCES domains (id, revision_id, certification_id)
);
CREATE TABLE choices (
  id uuid PRIMARY KEY,
  revision_id uuid NOT NULL REFERENCES catalog_revisions(id),
  question_id uuid NOT NULL,
  external_key text NOT NULL,
  text_en text NOT NULL,
  text_ko text NULL,
  order_index integer NOT NULL CHECK (order_index >= 0),
  is_correct boolean NOT NULL,
  UNIQUE (revision_id, question_id, external_key),
  UNIQUE (revision_id, question_id, order_index),
  FOREIGN KEY (question_id, revision_id) REFERENCES questions (id, revision_id)
);
CREATE INDEX questions_generation_pool ON questions (revision_id, certification_id, domain_id, id);

CREATE TABLE import_validations (
  id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES user_profiles(id),
  certification_key text NOT NULL,
  content_hash char(64) NOT NULL,
  token_digest char(64) NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('validated', 'consumed', 'expired')),
  total_questions integer NOT NULL CHECK (total_questions >= 0),
  domain_counts_json jsonb NOT NULL,
  translation_counts_json jsonb NOT NULL,
  error_count integer NOT NULL CHECK (error_count >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  version bigint NOT NULL CHECK (version >= 0)
);
CREATE INDEX import_validations_expiry ON import_validations (expires_at, id);
