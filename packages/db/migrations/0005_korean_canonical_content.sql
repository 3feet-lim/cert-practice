-- Korean becomes the canonical/default catalog language; English becomes an
-- optional translation. packages/domain now requires Korean stem/explanation/
-- choice text on import and permits English to be absent, the inverse of the
-- assumption baked into migration 0001.
--
-- Aurora DSQL does not support "ALTER COLUMN ... SET NOT NULL" (only
-- "DROP NOT NULL" is in the supported ALTER TABLE action list), so the
-- previously-required Korean-must-be-present direction cannot be enforced at
-- the DB layer going forward either. As decided, the application layer
-- (packages/domain's import-service.ts) is now the sole enforcer that Korean
-- content is present when a revision is written; stem_ko/explanation_ko and
-- choices.text_ko remain nullable at the DB level. This mirrors the precedent
-- set in migration 0004, where an Aurora DSQL DDL limitation is documented
-- instead of worked around with unsupported syntax.
--
-- English becomes optional at the DB level too, which Aurora DSQL does
-- support via DROP NOT NULL.
ALTER TABLE questions ALTER COLUMN stem_en DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN explanation_en DROP NOT NULL;
ALTER TABLE choices ALTER COLUMN text_en DROP NOT NULL;

-- translation_status: migration 0001 created an (unnamed / auto-generated)
-- CHECK constraint allowing only ('translated', 'en_only'). The domain layer
-- now produces 'ko_only' instead of 'en_only' for partially-translated rows.
--
-- Unlike the column NOT NULL case above, Aurora DSQL's ALTER TABLE syntax
-- documentation *does* list "DROP CONSTRAINT [ IF EXISTS ] constraint_name
-- [ RESTRICT | CASCADE ]" as supported
-- (https://docs.aws.amazon.com/aurora-dsql/latest/userguide/alter-table-syntax-support.html),
-- and this is a plain CHECK constraint with no index or primary-key
-- involvement, so DROP CONSTRAINT is usable here. The 0004 comment about
-- unsupported ALTER TABLE DROP CONSTRAINT refers to a different situation
-- (aggregate-scoped item keys / result payload shape needing to be correct
-- from CREATE TABLE) and is not a blanket statement that DROP CONSTRAINT
-- never works in Aurora DSQL.
--
-- Postgres auto-generates the constraint name questions_translation_status_check
-- for an inline CHECK on the translation_status column with no explicit
-- CONSTRAINT name, matching migration 0001's CREATE TABLE statement. Drop it
-- and add a replacement (allowing both legacy 'en_only' rows and new
-- 'ko_only' rows) using ADD CONSTRAINT ... NOT VALID, which is required for
-- CHECK constraints added via ALTER TABLE in Aurora DSQL.
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_translation_status_check;
ALTER TABLE questions
  ADD CONSTRAINT questions_translation_status_check
  CHECK (translation_status IN ('translated', 'en_only', 'ko_only')) NOT VALID;
