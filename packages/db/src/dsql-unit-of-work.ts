import {
  Fraction,
  type Attempt,
  type CatalogGenerationSource,
  type CatalogRepository,
  type CatalogRevision,
  type CatalogRevisionSource,
  type CompletedPracticeResult,
  type ExamRepository,
  type ExamSession,
  type FinalizeExam,
  type FullCatalogGenerationSource,
  type HistoryRepository,
  type ImportCommitCommand,
  type JsonValue,
  type NewCompletedPracticeResult,
  type PersistedQuestionSnapshot,
  type PracticeRepository,
  type PracticeSession,
  type SubmitPracticeAnswer,
  type TransactionRepositories,
  type UnitOfWork,
  type UserProfile,
  type UserRepository,
} from "@cert-quiz/domain";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import type { DsqlPool } from "./dsql-pool.js";
import { isDsqlOccAbort } from "./migrate.js";

export type SqlClient = Pick<PoolClient, "query" | "release">;
export type SqlPool = Pick<DsqlPool, "connect">;
type Queryable = Pick<SqlClient, "query">;

export type DsqlUnitOfWorkOptions = {
  /** DSQL aborts optimistic conflicts; retry only the short idempotent transaction. */
  maxOccRetries?: number;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

/**
 * Production aggregate adapter. Every repository instance is bound to one
 * checked-out client, so related aggregate writes cannot escape transaction
 * boundaries. Domain services never receive SQL rows or a pooled client.
 */
export class DsqlUnitOfWork implements UnitOfWork {
  readonly #maxOccRetries: number;
  readonly #retryDelayMs: number;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly pool: SqlPool, options: DsqlUnitOfWorkOptions = {}) {
    this.#maxOccRetries = options.maxOccRetries ?? 2;
    this.#retryDelayMs = options.retryDelayMs ?? 25;
    this.#sleep = options.sleep ?? ((milliseconds) => delay(milliseconds));
  }

  async transaction<T>(work: (repos: TransactionRepositories) => Promise<T>): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt <= this.#maxOccRetries; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const value = await work(new DsqlRepositories(client));
        await client.query("COMMIT");
        return value;
      } catch (error) {
        last = error;
        await client.query("ROLLBACK").catch(() => undefined);
        if (!isDsqlOccAbort(error) || attempt === this.#maxOccRetries) throw error;
        await this.#sleep(this.#retryDelayMs * 2 ** attempt);
      } finally {
        client.release();
      }
    }
    throw last;
  }
}

class DsqlRepositories implements TransactionRepositories {
  readonly users: UserRepository;
  readonly catalog: CatalogRepository;
  readonly practice: PracticeRepository;
  readonly exams: ExamRepository;
  readonly history: HistoryRepository;

  constructor(private readonly db: Queryable) {
    this.users = this.userRepository();
    this.catalog = this.catalogRepository();
    this.practice = this.practiceRepository();
    this.exams = this.examRepository();
    this.history = this.historyRepository();
  }

  private userRepository(): UserRepository {
    return {
      getOrCreatePendingByGoogleSub: async (input) => {
        const inserted = await this.db.query<UserRow>(
          `INSERT INTO user_profiles
             (id, google_sub, display_name, email, role, approval_status, score_public,
              first_login_at, created_at, updated_at, version)
           VALUES ($1, $2, $3, $4, 'user', 'pending', false, $5, $5, $5, 0)
           ON CONFLICT (google_sub) DO NOTHING
           RETURNING ${userColumns}`,
          [input.id, input.googleSub, input.displayName, input.email, input.now],
        );
        if (inserted.rows[0]) return mapUser(inserted.rows[0]);
        const updated = await this.db.query<UserRow>(
          `UPDATE user_profiles
             SET display_name = $2, email = $3, updated_at = $4, version = version + 1
           WHERE google_sub = $1
             AND (display_name IS DISTINCT FROM $2 OR email IS DISTINCT FROM $3)
           RETURNING ${userColumns}`,
          [input.googleSub, input.displayName, input.email, input.now],
        );
        if (updated.rows[0]) return mapUser(updated.rows[0]);
        const existing = await this.db.query<UserRow>(
          `SELECT ${userColumns} FROM user_profiles WHERE google_sub = $1`,
          [input.googleSub],
        );
        return requiredRow(existing, "profile", mapUser);
      },
      findById: async (userId) => {
        const result = await this.db.query<UserRow>(
          `SELECT ${userColumns} FROM user_profiles WHERE id = $1`,
          [userId],
        );
        return result.rows[0] ? mapUser(result.rows[0]) : null;
      },
      findPending: async () => {
        const result = await this.db.query<UserRow>(
          `SELECT ${userColumns} FROM user_profiles
           WHERE approval_status = 'pending'
           ORDER BY first_login_at ASC, id ASC`,
        );
        return result.rows.map(mapUser);
      },
      approvePending: async (userId, approvedAt) => {
        const changed = await this.db.query<UserRow>(
          `UPDATE user_profiles
             SET approval_status = 'approved', approved_at = $2, updated_at = $2,
                 version = version + 1
           WHERE id = $1 AND approval_status = 'pending'
           RETURNING ${userColumns}`,
          [userId, approvedAt],
        );
        if (changed.rows[0]) return mapUser(changed.rows[0]);
        const existing = await this.db.query<UserRow>(
          `SELECT ${userColumns} FROM user_profiles WHERE id = $1`,
          [userId],
        );
        return existing.rows[0] ? mapUser(existing.rows[0]) : null;
      },
      updateScoreVisibility: async (input) => {
        const result = await this.db.query<UserRow>(
          `UPDATE user_profiles
             SET score_public = $2, updated_at = now(), version = version + 1
           WHERE id = $1 AND approval_status = 'approved' AND version = $3
           RETURNING ${userColumns}`,
          [input.userId, input.scorePublic, input.expectedVersion.toString()],
        );
        return result.rows[0] ? mapUser(result.rows[0]) : null;
      },
    };
  }

  private catalogRepository(): CatalogRepository {
    return {
      saveValidation: async (validation) => {
        await this.db.query(
          `INSERT INTO import_validations
             (id, actor_user_id, certification_key, content_hash, token_digest, status,
              total_questions, domain_counts_json, translation_counts_json, error_count,
              expires_at, created_at, version)
           VALUES ($1, $2, $3, $4, $5, $6, 0, '{}'::jsonb, '{}'::jsonb, 0, $7, now(), $8)`,
          [
            validation.id,
            validation.actorUserId,
            validation.certificationKey,
            validation.contentHash,
            validation.tokenDigest,
            validation.status,
            validation.expiresAt,
            validation.version.toString(),
          ],
        );
      },
      activateRevision: async (validationId, revision, now) => {
        const consumed = await consumeValidation(this.db, {
          validationId,
          actorUserId: revision.importedBy,
          contentHash: revision.contentHash,
          now,
        });
        if (!consumed) throw new Error("Import validation is not consumable.");
        await insertRevision(this.db, revision, "active");
        await switchHead(this.db, revision.certificationKey, revision.id, now);
      },
      commitValidatedImport: async (command) => {
        assertMaterialization(command);
        const { revision, source, generation } = command.materialization;
        // Capture the expected head before materializing. The conditional write below
        // rejects a concurrent catalog replacement instead of silently overwriting it.
        const expectedHead = await readHead(this.db, revision.certificationKey);
        await insertRevision(this.db, revision, "staging");
        for (const provider of source.providers)
          await this.db.query(
            `INSERT INTO providers (id, revision_id, external_key, name, logo_url)
             VALUES ($1, $2, $3, $4, $5)`,
            [provider.id, revision.id, provider.id, provider.name, provider.logoUrl],
          );
        for (const certification of source.certifications)
          await this.db.query(
            `INSERT INTO certifications
               (id, revision_id, provider_id, external_key, code, name, total_questions,
                time_limit_minutes, threshold_numerator, threshold_denominator, scoring_mode)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              certification.id,
              revision.id,
              certification.providerId,
              certification.externalKey,
              certification.code,
              certification.name,
              certification.totalQuestions,
              certification.timeLimitMinutes,
              certification.passThreshold.numerator.toString(),
              certification.passThreshold.denominator.toString(),
              certification.scoringMode,
            ],
          );
        for (const domain of source.domains)
          await this.db.query(
            `INSERT INTO domains
               (id, revision_id, certification_id, external_key, name, weight_basis_points, order_index)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              domain.id,
              revision.id,
              domain.certificationId,
              domain.id,
              domain.name,
              domain.weightBasisPoints,
              domain.orderIndex,
            ],
          );
        for (const question of generation.questions) {
          await this.db.query(
            `INSERT INTO questions
               (id, revision_id, certification_id, domain_id, external_key, stem_en, stem_ko,
                explanation_en, explanation_ko, translation_status, required_choice_count)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              question.id,
              revision.id,
              question.certificationId,
              question.domainId,
              question.id,
              question.stem.en,
              question.stem.ko,
              question.explanation.en,
              question.explanation.ko,
              question.translationStatus,
              question.requiredChoiceCount,
            ],
          );
          for (const [orderIndex, choice] of question.choices.entries())
            await this.db.query(
              `INSERT INTO choices
                 (id, revision_id, question_id, external_key, text_en, text_ko, order_index, is_correct)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                choice.id,
                revision.id,
                question.id,
                choice.externalId,
                choice.text.en,
                choice.text.ko,
                orderIndex,
                question.correctChoiceIndexes.includes(orderIndex),
              ],
            );
        }
        await assertPersistedRevision(this.db, revision.id, source, generation);
        await activateRevision(this.db, revision.certificationKey, revision.id);
        await switchHeadConditionally(
          this.db,
          revision.certificationKey,
          revision.id,
          command.now,
          expectedHead,
        );
        const consumed = await consumeValidation(this.db, command);
        if (!consumed) throw new Error("Import validation is not consumable.");
      },
      activeRevision: async (certificationKey) => {
        const result = await this.db.query<RevisionRow>(
          `SELECT revision.id, revision.certification_key, revision.content_hash,
                  revision.imported_by, revision.imported_at
           FROM catalog_heads head
           JOIN catalog_revisions revision ON revision.id = head.active_revision_id
           WHERE head.certification_key = $1`,
          [certificationKey],
        );
        return result.rows[0] ? mapRevision(result.rows[0]) : null;
      },
      activeCatalogSources: async () => loadActiveSources(this.db),
      generationSource: async (certificationId) => {
        const full = await loadFullSource(this.db, certificationId);
        if (!full) return null;
        return {
          revisionId: full.revisionId,
          certification: full.certification,
          provider: full.provider,
          domains: full.domains,
          questions: full.questions.map(({ id, revisionId, certificationId: cid, domainId }) => ({
            id,
            revisionId,
            certificationId: cid,
            domainId,
          })),
        } satisfies CatalogGenerationSource;
      },
      fullGenerationSource: async (certificationId) => loadFullSource(this.db, certificationId),
    };
  }

  private practiceRepository(): PracticeRepository {
    return {
      findActiveOwned: async (userId, certificationKey) =>
        loadPractice(this.db, `user_id = $1 AND certification_key = $2 AND status = 'active'`, [userId, certificationKey]),
      listActiveOwned: async (userId) => {
        const headers = await this.db.query<{ id: string }>(
          `SELECT id FROM practice_sessions
           WHERE user_id = $1 AND status = 'active'
           ORDER BY created_at ASC, id ASC`,
          [userId],
        );
        const sessions = await Promise.all(
          headers.rows.map((row) => loadPractice(this.db, "user_id = $1 AND id = $2", [userId, row.id])),
        );
        return sessions.filter((session): session is PracticeSession => session !== null);
      },
      getOwned: async (userId, sessionId) =>
        loadPractice(this.db, "user_id = $1 AND id = $2", [userId, sessionId]),
      replaceAtomically: async (input) => {
        await this.db.query(
          `DELETE FROM practice_session_questions
           WHERE practice_session_id IN (
             SELECT id FROM practice_sessions WHERE user_id = $1 AND certification_key = $2 AND status = 'active'
           )`,
          [input.userId, input.certificationKey],
        );
        await this.db.query(
          `DELETE FROM practice_sessions
           WHERE user_id = $1 AND certification_key = $2 AND status = 'active'`,
          [input.userId, input.certificationKey],
        );
        const certificationId = await activeCertificationId(this.db, input.certificationKey);
        if (!certificationId) throw new Error("Active certification is unavailable.");
        await this.db.query(
          `INSERT INTO practice_sessions
             (id, user_id, certification_id_at_start, certification_key, status, current_index,
              created_at, updated_at, version, active_slot)
           VALUES ($1, $2, $3, $4, 'active', $5, $6, $6, 0, 'active')`,
          [input.id, input.userId, certificationId, input.certificationKey, input.currentIndex, input.createdAt],
        );
        await insertPracticeQuestions(this.db, input.id, input.questions, input.createdAt);
        return required(await loadPractice(this.db, "id = $1", [input.id]), "practice");
      },
      replaceState: async ({ userId, sessionId, expectedVersion, session }) => {
        const changed = await this.db.query(
          `UPDATE practice_sessions
             SET current_index = $3, updated_at = now(), version = version + 1
           WHERE id = $1 AND user_id = $2 AND status = 'active' AND version = $4`,
          [sessionId, userId, session.currentIndex, expectedVersion.toString()],
        );
        if (changed.rowCount !== 1) return null;
        for (const item of session.questions)
          await this.db.query(
            `UPDATE practice_session_questions
               SET selected_choice_ids = $3::jsonb, flagged = $4, updated_at = now(), version = version + 1
             WHERE practice_session_id = $1 AND id = $2 AND final_choice_ids IS NULL`,
            [sessionId, item.id, json(item.selectedChoiceIds), item.flagged],
          );
        return loadPractice(this.db, "user_id = $1 AND id = $2", [userId, sessionId]);
      },
      saveState: async (command) => {
        const changed = await this.db.query(
          `UPDATE practice_sessions
             SET current_index = $3, updated_at = now(), version = version + 1
           WHERE id = $1 AND user_id = $2 AND status = 'active' AND version = $4`,
          [command.sessionId, command.userId, command.currentIndex, command.expectedVersion.toString()],
        );
        if (changed.rowCount !== 1) return null;
        const item = await this.db.query(
          `UPDATE practice_session_questions
             SET selected_choice_ids = $3::jsonb, flagged = $4, updated_at = now(), version = version + 1
           WHERE practice_session_id = $1 AND id = $2 AND final_choice_ids IS NULL`,
          [command.sessionId, command.questionId, json(command.selectedChoiceIds), command.flagged],
        );
        if (item.rowCount !== 1) return null;
        return loadPractice(this.db, "user_id = $1 AND id = $2", [command.userId, command.sessionId]);
      },
      submitFirstAnswer: async (command) => submitPractice(this.db, command),
      getCompletedOwned: async (userId, resultId, now) => {
        const expired = await this.db.query<{ id: string }>(
          `SELECT id FROM completed_practice_results
           WHERE id = $2 AND user_id = $1 AND expires_at <= $3`,
          [userId, resultId, now],
        );
        if (expired.rows[0]) {
          await this.db.query(
            "DELETE FROM completed_practice_items WHERE result_id = $1",
            [resultId],
          );
          await this.db.query(
            "DELETE FROM completed_practice_results WHERE id = $1 AND user_id = $2",
            [resultId, userId],
          );
          return null;
        }
        const result = await this.db.query<ResultRow>(
          `SELECT id, source_practice_session_id, user_id, raw_numerator, raw_denominator,
                  accuracy_numerator, accuracy_denominator, completed_at, expires_at, payload
           FROM completed_practice_results
           WHERE id = $2 AND user_id = $1 AND expires_at > $3`,
          [userId, resultId, now],
        );
        return result.rows[0] ? mapResult(result.rows[0]) : null;
      },
      deleteExpired: async (cutoffInclusive, batchSize) => {
        const candidates = await this.db.query<{ id: string }>(
          `SELECT id FROM completed_practice_results
           WHERE expires_at <= $1 ORDER BY expires_at ASC, id ASC LIMIT $2`,
          [cutoffInclusive, batchSize],
        );
        if (candidates.rows.length === 0) return 0;
        const ids = candidates.rows.map((row) => row.id);
        await this.db.query(
          "DELETE FROM completed_practice_items WHERE result_id = ANY($1::uuid[])",
          [ids],
        );
        const deleted = await this.db.query<{ id: string }>(
          "DELETE FROM completed_practice_results WHERE id = ANY($1::uuid[]) RETURNING id",
          [ids],
        );
        return deleted.rowCount ?? 0;
      },
    };
  }

  private examRepository(): ExamRepository {
    return {
      createWithSnapshots: async (input) => {
        const existing = await this.db.query<{ id: string }>(
          `SELECT id FROM exam_sessions WHERE user_id = $1 AND start_request_key = $2`,
          [input.userId, input.startRequestKey],
        );
        if (existing.rows[0]) return required(await loadExam(this.db, "id = $1", [existing.rows[0].id]), "exam");
        const certificationId = await activeCertificationId(this.db, input.certificationKey);
        if (!certificationId) throw new Error("Active certification is unavailable.");
        await this.db.query(
          `INSERT INTO exam_sessions
             (id, user_id, certification_id_at_start, certification_key, certification_snapshot,
              start_request_key, status, current_index, started_at, expires_at, version)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'active', $7, $8, $9, 0)`,
          [input.id, input.userId, certificationId, input.certificationKey,
            json(certificationSnapshot(input.questions)), input.startRequestKey, input.currentIndex,
            input.startedAt, input.expiresAt],
        );
        await insertExamQuestions(this.db, input.id, input.questions, input.startedAt);
        return required(await loadExam(this.db, "id = $1", [input.id]), "exam");
      },
      getOwned: async (userId, sessionId) => loadExam(this.db, "user_id = $1 AND id = $2", [userId, sessionId]),
      listExpiredOwned: async (userId, now) => {
        const headers = await this.db.query<{ id: string }>(
          `SELECT id FROM exam_sessions
           WHERE user_id = $1 AND status = 'active' AND expires_at <= $2
           ORDER BY expires_at ASC, id ASC`,
          [userId, now],
        );
        const sessions = await Promise.all(headers.rows.map((row) => loadExam(this.db, "user_id = $1 AND id = $2", [userId, row.id])));
        return sessions.filter((session): session is ExamSession => session !== null);
      },
      replaceState: async ({ userId, sessionId, expectedVersion, session, now }) =>
        replaceExamState(this.db, userId, sessionId, expectedVersion, session, now),
      saveBeforeExpiry: async (command) => {
        const current = await loadExam(this.db, "user_id = $1 AND id = $2", [command.userId, command.sessionId]);
        if (!current) return null;
        const question = current.questions.map((item) => item.id === command.questionId ? {
          ...item, selectedChoiceIds: [...command.selectedChoiceIds], flagged: command.flagged, savedAt: command.now,
        } : item);
        return replaceExamState(this.db, command.userId, command.sessionId, command.expectedVersion, {
          ...current, currentIndex: command.currentIndex, questions: question,
        }, command.now);
      },
      finalizeOnce: async (command) => finalizeExam(this.db, command),
    };
  }

  private historyRepository(): HistoryRepository {
    return {
      getAttemptOwned: async (userId, attemptId) => loadAttempt(this.db, "user_id = $1 AND id = $2", [userId, attemptId]),
      listAttempts: async (userId) => {
        const rows = await this.db.query<{ id: string }>(
          `SELECT id FROM attempts WHERE user_id = $1 ORDER BY submitted_at DESC, id ASC`, [userId],
        );
        return Promise.all(rows.rows.map(async (row) => required(
          await loadAttempt(this.db, "user_id = $1 AND id = $2", [userId, row.id]),
          "attempt",
        )));
      },
      listPublicAttempts: async (certificationId) => {
        const rows = await this.db.query<{ attempt_id: string; user_id: string }>(
          `SELECT attempt.id AS attempt_id, profile.id AS user_id
           FROM attempts attempt JOIN user_profiles profile ON profile.id = attempt.user_id
           WHERE profile.approval_status = 'approved' AND profile.score_public = true
             AND attempt.certification_snapshot->>'id' = $1
           ORDER BY attempt.submitted_at ASC, attempt.id ASC`, [certificationId],
        );
        const result: Array<{ user: UserProfile; attempt: Attempt }> = [];
        for (const row of rows.rows) {
          const [user, attempt] = await Promise.all([
            this.users.findById(row.user_id),
            loadAttempt(this.db, "user_id = $1 AND id = $2", [row.user_id, row.attempt_id]),
          ]);
          if (user && attempt) result.push({ user, attempt });
        }
        return result;
      },
    };
  }
}

const userColumns = "id, google_sub, display_name, email, role, approval_status, score_public, first_login_at, approved_at, version";
type UserRow = QueryResultRow & { id: string; google_sub: string; display_name: string; email: string; role: "user" | "admin"; approval_status: "pending" | "approved"; score_public: boolean; first_login_at: Date | string; approved_at: Date | string | null; version: string | bigint };
type RevisionRow = QueryResultRow & { id: string; certification_key: string; content_hash: string; imported_by: string; imported_at: Date | string };
type SessionRow = QueryResultRow & { id: string; user_id: string; certification_key: string; status: "active" | "completed"; current_index: number; result_id: string | null; created_at: Date | string; completed_at: Date | string | null; version: string | bigint };
type ExamRow = QueryResultRow & { id: string; user_id: string; certification_key: string; start_request_key: string; status: "active" | "submitted"; current_index: number; started_at: Date | string; expires_at: Date | string; attempt_id: string | null; version: string | bigint };
type QuestionRow = QueryResultRow & { id: string; display_index: number; snapshot_content: JsonValue | string; selected_choice_ids: JsonValue | string; final_choice_ids: JsonValue | string | null; earned_numerator: string | bigint | null; earned_denominator: string | bigint | null; flagged: boolean; saved_at?: Date | string; version: string | bigint };
type ResultRow = QueryResultRow & { id: string; source_practice_session_id: string; user_id: string; raw_numerator: string | bigint; raw_denominator: string | bigint; accuracy_numerator: string | bigint; accuracy_denominator: string | bigint; completed_at: Date | string; expires_at: Date | string; payload: JsonValue | string };
type AttemptRow = QueryResultRow & { id: string; exam_session_id: string; user_id: string; certification_key: string; raw_numerator: string | bigint; raw_denominator: string | bigint; accuracy_numerator: string | bigint; accuracy_denominator: string | bigint; threshold_numerator: string | bigint; threshold_denominator: string | bigint; passed: boolean; reference_1000: number; started_at: Date | string; expires_at: Date | string; submitted_at: Date | string; submission_reason: "manual" | "expired" };

function mapUser(row: UserRow): UserProfile { return { id: row.id, googleSub: row.google_sub, displayName: row.display_name, email: row.email, role: row.role, approvalStatus: row.approval_status, scorePublic: row.score_public, firstLoginAt: date(row.first_login_at), approvedAt: row.approved_at ? date(row.approved_at) : null, version: bigint(row.version) }; }
function mapRevision(row: RevisionRow): CatalogRevision { return { id: row.id, certificationKey: row.certification_key, contentHash: row.content_hash, importedBy: row.imported_by, importedAt: date(row.imported_at), document: {} }; }
function mapQuestion(row: QuestionRow): PersistedQuestionSnapshot { return { id: row.id, displayIndex: row.display_index, content: object(row.snapshot_content), selectedChoiceIds: strings(row.selected_choice_ids), finalChoiceIds: row.final_choice_ids === null ? null : strings(row.final_choice_ids), earnedScore: row.earned_numerator === null || row.earned_denominator === null ? null : Fraction.of(bigint(row.earned_numerator), bigint(row.earned_denominator)), flagged: row.flagged, ...(row.saved_at ? { savedAt: date(row.saved_at) } : {}), version: bigint(row.version) }; }
function mapResult(row: ResultRow): CompletedPracticeResult { return { id: row.id, sourcePracticeSessionId: row.source_practice_session_id, userId: row.user_id, rawScore: Fraction.of(bigint(row.raw_numerator), bigint(row.raw_denominator)), accuracyRate: Fraction.of(bigint(row.accuracy_numerator), bigint(row.accuracy_denominator)), completedAt: date(row.completed_at), expiresAt: date(row.expires_at), payload: object(row.payload) }; }

async function loadPractice(db: Queryable, condition: string, values: unknown[]): Promise<PracticeSession | null> {
  const header = await db.query<SessionRow>(`SELECT id, user_id, certification_key, status, current_index, result_id, created_at, completed_at, version FROM practice_sessions WHERE ${condition} ORDER BY created_at ASC LIMIT 1`, values);
  const row = header.rows[0]; if (!row) return null;
  const questions = await db.query<QuestionRow>(`SELECT id, display_index, snapshot_content, selected_choice_ids, final_choice_ids, earned_numerator, earned_denominator, flagged, version FROM practice_session_questions WHERE practice_session_id = $1 ORDER BY display_index ASC`, [row.id]);
  return { id: row.id, userId: row.user_id, certificationKey: row.certification_key, status: row.status, currentIndex: row.current_index, questions: questions.rows.map(mapQuestion), resultId: row.result_id, createdAt: date(row.created_at), completedAt: row.completed_at ? date(row.completed_at) : null, version: bigint(row.version) };
}
async function loadExam(db: Queryable, condition: string, values: unknown[]): Promise<ExamSession | null> {
  const header = await db.query<ExamRow>(`SELECT id, user_id, certification_key, start_request_key, status, current_index, started_at, expires_at, attempt_id, version FROM exam_sessions WHERE ${condition} ORDER BY started_at ASC LIMIT 1`, values);
  const row = header.rows[0]; if (!row) return null;
  const questions = await db.query<QuestionRow>(`SELECT id, display_index, snapshot_content, selected_choice_ids, NULL::jsonb AS final_choice_ids, NULL::bigint AS earned_numerator, NULL::bigint AS earned_denominator, flagged, saved_at, version FROM exam_session_questions WHERE exam_session_id = $1 ORDER BY display_index ASC`, [row.id]);
  return { id: row.id, userId: row.user_id, certificationKey: row.certification_key, startRequestKey: row.start_request_key, status: row.status, currentIndex: row.current_index, startedAt: date(row.started_at), expiresAt: date(row.expires_at), questions: questions.rows.map(mapQuestion), attemptId: row.attempt_id, version: bigint(row.version) };
}
async function loadAttempt(db: Queryable, condition: string, values: unknown[]): Promise<Attempt | null> {
  const header = await db.query<AttemptRow>(`SELECT id, exam_session_id, user_id, certification_key, raw_numerator, raw_denominator, accuracy_numerator, accuracy_denominator, threshold_numerator, threshold_denominator, passed, reference_1000, started_at, expires_at, submitted_at, submission_reason FROM attempts WHERE ${condition} LIMIT 1`, values);
  const row = header.rows[0]; if (!row) return null;
  const items = await db.query<QuestionRow>(`SELECT id, display_index, snapshot_content, selected_choice_ids, selected_choice_ids AS final_choice_ids, earned_numerator, earned_denominator, false AS flagged, 0::bigint AS version FROM attempt_items WHERE attempt_id = $1 ORDER BY display_index ASC`, [row.id]);
  return { id: row.id, examSessionId: row.exam_session_id, userId: row.user_id, certificationKey: row.certification_key, rawScore: Fraction.of(bigint(row.raw_numerator), bigint(row.raw_denominator)), accuracyRate: Fraction.of(bigint(row.accuracy_numerator), bigint(row.accuracy_denominator)), passThreshold: Fraction.of(bigint(row.threshold_numerator), bigint(row.threshold_denominator)), passed: row.passed, reference1000Score: row.reference_1000, startedAt: date(row.started_at), expiresAt: date(row.expires_at), submittedAt: date(row.submitted_at), submissionReason: row.submission_reason, items: items.rows.map(mapQuestion) };
}

async function insertPracticeQuestions(db: Queryable, sessionId: string, questions: readonly PersistedQuestionSnapshot[], now: Date): Promise<void> { for (const item of questions) await db.query(`INSERT INTO practice_session_questions (id, practice_session_id, display_index, snapshot_content, selected_choice_ids, final_choice_ids, earned_numerator, earned_denominator, flagged, updated_at, version) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)`, [item.id, sessionId, item.displayIndex, json(item.content), json(item.selectedChoiceIds), item.finalChoiceIds === null ? null : json(item.finalChoiceIds), item.earnedScore?.numerator.toString() ?? null, item.earnedScore?.denominator.toString() ?? null, item.flagged, now, item.version.toString()]); }
async function insertExamQuestions(db: Queryable, sessionId: string, questions: readonly PersistedQuestionSnapshot[], now: Date): Promise<void> { for (const item of questions) await db.query(`INSERT INTO exam_session_questions (id, exam_session_id, display_index, snapshot_content, selected_choice_ids, flagged, saved_at, version) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)`, [item.id, sessionId, item.displayIndex, json(item.content), json(item.selectedChoiceIds), item.flagged, item.savedAt ?? now, item.version.toString()]); }

async function submitPractice(db: Queryable, command: SubmitPracticeAnswer) {
  const current = await loadPractice(db, "user_id = $1 AND id = $2", [command.userId, command.sessionId]);
  if (!current) return null;
  const existing = current.questions.find((item) => item.id === command.questionId);
  if (!existing) return null;
  if (existing.finalChoiceIds) return { session: current, result: current.resultId ? await completedBySession(db, command.sessionId) : null, firstSubmission: false };
  const parent = await db.query(`UPDATE practice_sessions SET version = version + 1, updated_at = now() WHERE id = $1 AND user_id = $2 AND status = 'active' AND version = $3`, [command.sessionId, command.userId, command.expectedVersion.toString()]);
  if (parent.rowCount !== 1) return null;
  const item = await db.query(`UPDATE practice_session_questions SET selected_choice_ids = $3::jsonb, final_choice_ids = $3::jsonb, earned_numerator = $4, earned_denominator = $5, submitted_at = now(), updated_at = now(), version = version + 1 WHERE practice_session_id = $1 AND id = $2 AND final_choice_ids IS NULL`, [command.sessionId, command.questionId, json(command.selectedChoiceIds), command.earnedScore.numerator.toString(), command.earnedScore.denominator.toString()]);
  if (item.rowCount !== 1) return null;
  const completed = current.questions.every((question) => question.id === command.questionId || question.finalChoiceIds !== null);
  let result: CompletedPracticeResult | null = null;
  if (completed) {
    if (!command.completedResult) throw new Error("Final practice submission requires a completed result.");
    result = await insertCompletedResult(db, command.completedResult, current);
    await db.query(`UPDATE practice_sessions SET status = 'completed', active_slot = NULL, result_id = $2, completed_at = $3 WHERE id = $1`, [command.sessionId, result.id, result.completedAt]);
  }
  return { session: required(await loadPractice(db, "user_id = $1 AND id = $2", [command.userId, command.sessionId]), "practice"), result, firstSubmission: true };
}
async function insertCompletedResult(db: Queryable, input: NewCompletedPracticeResult, session: PracticeSession): Promise<CompletedPracticeResult> {
  await db.query(
    `INSERT INTO completed_practice_results
       (id, source_practice_session_id, user_id, certification_snapshot, raw_numerator,
        raw_denominator, accuracy_numerator, accuracy_denominator, domain_performance,
        completed_at, expires_at, payload)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,'[]'::jsonb,$9,$10,$11::jsonb)`,
    [input.id, session.id, session.userId, json(certificationSnapshot(session.questions)),
      input.rawScore.numerator.toString(), input.rawScore.denominator.toString(),
      input.accuracyRate.numerator.toString(), input.accuracyRate.denominator.toString(),
      input.completedAt, input.expiresAt, json(input.payload)],
  );
  const items = await db.query<QuestionRow>(
    `SELECT id, display_index, snapshot_content, selected_choice_ids, final_choice_ids,
            earned_numerator, earned_denominator, flagged, version
     FROM practice_session_questions WHERE practice_session_id = $1 ORDER BY display_index ASC`,
    [session.id],
  );
  for (const item of items.rows) {
    if (item.final_choice_ids === null || item.earned_numerator === null || item.earned_denominator === null)
      throw new Error("Completed practice result has an unlocked question.");
    await db.query(
      `INSERT INTO completed_practice_items
         (id, result_id, display_index, snapshot_content, selected_choice_ids,
          earned_numerator, earned_denominator)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,
      [item.id, input.id, item.display_index, json(object(item.snapshot_content)),
        json(strings(item.final_choice_ids)), item.earned_numerator.toString(),
        item.earned_denominator.toString()],
    );
  }
  return { ...input, sourcePracticeSessionId: session.id, userId: session.userId };
}
async function completedBySession(db: Queryable, sessionId: string): Promise<CompletedPracticeResult | null> { const row = await db.query<ResultRow>(`SELECT id, source_practice_session_id, user_id, raw_numerator, raw_denominator, accuracy_numerator, accuracy_denominator, completed_at, expires_at, payload FROM completed_practice_results WHERE source_practice_session_id = $1`, [sessionId]); return row.rows[0] ? mapResult(row.rows[0]) : null; }

async function replaceExamState(db: Queryable, userId: string, sessionId: string, expected: bigint, session: ExamSession, now: Date): Promise<ExamSession | null> { const parent = await db.query(`UPDATE exam_sessions SET current_index = $3, version = version + 1 WHERE id = $1 AND user_id = $2 AND status = 'active' AND expires_at > $4 AND version = $5`, [sessionId, userId, session.currentIndex, now, expected.toString()]); if (parent.rowCount !== 1) return null; for (const item of session.questions) await db.query(`UPDATE exam_session_questions SET selected_choice_ids = $3::jsonb, flagged = $4, saved_at = $5, version = version + 1 WHERE exam_session_id = $1 AND id = $2`, [sessionId, item.id, json(item.selectedChoiceIds), item.flagged, item.savedAt ?? now]); return loadExam(db, "user_id = $1 AND id = $2", [userId, sessionId]); }
async function finalizeExam(db: Queryable, command: FinalizeExam): Promise<Attempt | null> { const current = await loadExam(db, "user_id = $1 AND id = $2", [command.userId, command.sessionId]); if (!current) return null; if (current.status === "submitted") return current.attemptId ? loadAttempt(db, "user_id = $1 AND id = $2", [command.userId, current.attemptId]) : null; const transition = await db.query(`UPDATE exam_sessions SET status = 'submitted', attempt_id = $3, submitted_at = $4, version = version + 1 WHERE id = $1 AND user_id = $2 AND status = 'active'`, [command.sessionId, command.userId, command.id, command.submittedAt]); if (transition.rowCount !== 1) { const replay = await loadExam(db, "user_id = $1 AND id = $2", [command.userId, command.sessionId]); return replay?.attemptId ? loadAttempt(db, "user_id = $1 AND id = $2", [command.userId, replay.attemptId]) : null; } const items = command.items ?? current.questions; await db.query(`INSERT INTO attempts (id, exam_session_id, user_id, certification_key, certification_snapshot, raw_numerator, raw_denominator, accuracy_numerator, accuracy_denominator, reference_1000, threshold_numerator, threshold_denominator, passed, domain_performance, started_at, expires_at, submitted_at, submission_reason) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,'[]'::jsonb,$14,$15,$16,$17)`, [command.id, current.id, current.userId, current.certificationKey, json(certificationSnapshot(items)), command.rawScore.numerator.toString(), command.rawScore.denominator.toString(), command.accuracyRate.numerator.toString(), command.accuracyRate.denominator.toString(), command.reference1000Score, command.passThreshold.numerator.toString(), command.passThreshold.denominator.toString(), command.passed, current.startedAt, current.expiresAt, command.submittedAt, command.submissionReason]); for (const item of items) await db.query(`INSERT INTO attempt_items (id, attempt_id, display_index, snapshot_content, selected_choice_ids, earned_numerator, earned_denominator) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`, [item.id, command.id, item.displayIndex, json(item.content), json(item.selectedChoiceIds), (item.earnedScore ?? Fraction.of(0n)).numerator.toString(), (item.earnedScore ?? Fraction.of(0n)).denominator.toString()]); return required(await loadAttempt(db, "user_id = $1 AND id = $2", [command.userId, command.id]), "attempt"); }

async function activeCertificationId(db: Queryable, key: string): Promise<string | null> { const result = await db.query<{ id: string }>(`SELECT certification.id FROM catalog_heads head JOIN certifications certification ON certification.revision_id = head.active_revision_id WHERE head.certification_key = $1 AND certification.external_key = $1`, [key]); return result.rows[0]?.id ?? null; }
async function consumeValidation(db: Queryable, command: Pick<ImportCommitCommand, "validationId" | "actorUserId" | "contentHash" | "now"> & { tokenDigest?: string }): Promise<boolean> { const token = command.tokenDigest ? " AND token_digest = $5" : ""; const values = command.tokenDigest ? [command.validationId, command.actorUserId, command.contentHash, command.now, command.tokenDigest] : [command.validationId, command.actorUserId, command.contentHash, command.now]; const result = await db.query(`UPDATE import_validations SET status = 'consumed', consumed_at = $4, version = version + 1 WHERE id = $1 AND actor_user_id = $2 AND content_hash = $3 AND status = 'validated' AND expires_at > $4${token} RETURNING id`, values); return result.rowCount === 1; }
type CatalogHead = { revisionId: string; version: bigint };
type RevisionCounts = { providers: number | string; certifications: number | string; domains: number | string; questions: number | string; choices: number | string; orphan_questions: number | string; orphan_choices: number | string };
async function readHead(db: Queryable, certificationKey: string): Promise<CatalogHead | null> { const result = await db.query<{ active_revision_id: string; version: string | bigint }>(`SELECT active_revision_id, version FROM catalog_heads WHERE certification_key = $1`, [certificationKey]); const row = result.rows[0]; return row ? { revisionId: row.active_revision_id, version: bigint(row.version) } : null; }
async function insertRevision(db: Queryable, revision: CatalogRevision, status: "active" | "staging") { await db.query(`INSERT INTO catalog_revisions (id, certification_key, content_hash, imported_by, imported_at, status) VALUES ($1,$2,$3,$4,$5,$6)`, [revision.id, revision.certificationKey, revision.contentHash, revision.importedBy, revision.importedAt, status]); }
async function assertPersistedRevision(db: Queryable, revisionId: string, source: CatalogRevisionSource, generation: FullCatalogGenerationSource): Promise<void> { const result = await db.query<RevisionCounts>(`SELECT (SELECT count(*) FROM providers WHERE revision_id = $1) AS providers, (SELECT count(*) FROM certifications WHERE revision_id = $1) AS certifications, (SELECT count(*) FROM domains WHERE revision_id = $1) AS domains, (SELECT count(*) FROM questions WHERE revision_id = $1) AS questions, (SELECT count(*) FROM choices WHERE revision_id = $1) AS choices, (SELECT count(*) FROM questions question LEFT JOIN domains domain ON domain.id = question.domain_id AND domain.revision_id = question.revision_id AND domain.certification_id = question.certification_id WHERE question.revision_id = $1 AND domain.id IS NULL) AS orphan_questions, (SELECT count(*) FROM choices choice LEFT JOIN questions question ON question.id = choice.question_id AND question.revision_id = choice.revision_id WHERE choice.revision_id = $1 AND question.id IS NULL) AS orphan_choices`, [revisionId]); const row = required(result.rows[0], "persisted catalog revision"); const expectedChoices = generation.questions.reduce((total, question) => total + question.choices.length, 0); if (Number(row.providers) !== source.providers.length || Number(row.certifications) !== source.certifications.length || Number(row.domains) !== source.domains.length || Number(row.questions) !== generation.questions.length || Number(row.choices) !== expectedChoices || Number(row.orphan_questions) !== 0 || Number(row.orphan_choices) !== 0) throw new Error("Persisted import revision failed verification."); }
async function activateRevision(db: Queryable, certificationKey: string, revisionId: string): Promise<void> { await db.query(`UPDATE catalog_revisions SET status = CASE WHEN id = $2 THEN 'active' ELSE 'superseded' END WHERE certification_key = $1 AND (id = $2 OR status = 'active')`, [certificationKey, revisionId]); }
async function switchHead(db: Queryable, key: string, revisionId: string, now: Date) { await db.query(`INSERT INTO catalog_heads (certification_key, active_revision_id, updated_at, version) VALUES ($1,$2,$3,0) ON CONFLICT (certification_key) DO UPDATE SET active_revision_id = EXCLUDED.active_revision_id, updated_at = EXCLUDED.updated_at, version = catalog_heads.version + 1`, [key, revisionId, now]); }
async function switchHeadConditionally(db: Queryable, key: string, revisionId: string, now: Date, expected: CatalogHead | null): Promise<void> { const result = expected ? await db.query(`UPDATE catalog_heads SET active_revision_id = $2, updated_at = $3, version = version + 1 WHERE certification_key = $1 AND active_revision_id = $4 AND version = $5 RETURNING certification_key`, [key, revisionId, now, expected.revisionId, expected.version.toString()]) : await db.query(`INSERT INTO catalog_heads (certification_key, active_revision_id, updated_at, version) VALUES ($1,$2,$3,0) ON CONFLICT (certification_key) DO NOTHING RETURNING certification_key`, [key, revisionId, now]); if (result.rowCount !== 1) throw new Error("Catalog head changed during import."); }
function assertMaterialization(command: ImportCommitCommand) { const { revision, source, generation } = command.materialization; const sourceQuestionIds = new Set(source.questions.map((question) => question.id)); const generationQuestionIds = new Set(generation.questions.map((question) => question.id)); const expectedCertification = source.certifications.find((item) => item.id === generation.certification.id); const sourceDomains = new Set(source.domains.map((domain) => domain.id)); const valid = revision.certificationKey === source.certificationKey && revision.contentHash === command.contentHash && revision.importedBy === command.actorUserId && source.revisionId === revision.id && generation.revisionId === revision.id && source.providers.some((item) => item.id === generation.provider.id) && expectedCertification?.revisionId === revision.id && source.questions.length === generation.questions.length && sourceQuestionIds.size === source.questions.length && generationQuestionIds.size === generation.questions.length && [...sourceQuestionIds].every((id) => generationQuestionIds.has(id)) && generation.questions.every((question) => question.revisionId === revision.id && question.certificationId === generation.certification.id && sourceDomains.has(question.domainId) && question.choices.length > 0 && new Set(question.choices.map((choice) => choice.id)).size === question.choices.length && question.correctChoiceIndexes.every((index) => index >= 0 && index < question.choices.length)); if (!valid) throw new Error("Import materialization is invalid."); }

async function loadActiveSources(db: Queryable): Promise<readonly CatalogRevisionSource[]> { const revisions = await db.query<{ revision_id: string; certification_key: string }>(`SELECT head.active_revision_id AS revision_id, head.certification_key FROM catalog_heads head ORDER BY head.certification_key ASC`); return Promise.all(revisions.rows.map(({ revision_id, certification_key }) => loadSource(db, revision_id, certification_key))); }
async function loadSource(db: Queryable, revisionId: string, certificationKey: string): Promise<CatalogRevisionSource> { const [providers, certifications, domains, questions] = await Promise.all([db.query<any>(`SELECT id, revision_id, name, logo_url FROM providers WHERE revision_id = $1`, [revisionId]), db.query<any>(`SELECT id, revision_id, provider_id, external_key, code, name, total_questions, time_limit_minutes, threshold_numerator, threshold_denominator, scoring_mode FROM certifications WHERE revision_id = $1`, [revisionId]), db.query<any>(`SELECT id, revision_id, certification_id, name, weight_basis_points, order_index FROM domains WHERE revision_id = $1 ORDER BY order_index`, [revisionId]), db.query<any>(`SELECT id, revision_id, certification_id, domain_id FROM questions WHERE revision_id = $1`, [revisionId])]); return { revisionId, certificationKey, providers: providers.rows.map((row: any) => ({ id: row.id, revisionId: row.revision_id, name: row.name, logoUrl: row.logo_url })), certifications: certifications.rows.map((row: any) => ({ id: row.id, revisionId: row.revision_id, providerId: row.provider_id, externalKey: row.external_key, code: row.code, name: row.name, totalQuestions: row.total_questions, timeLimitMinutes: row.time_limit_minutes, passThreshold: Fraction.of(bigint(row.threshold_numerator), bigint(row.threshold_denominator)), scoringMode: row.scoring_mode })), domains: domains.rows.map((row: any) => ({ id: row.id, revisionId: row.revision_id, certificationId: row.certification_id, name: row.name, weightBasisPoints: row.weight_basis_points, orderIndex: row.order_index })), questions: questions.rows.map((row: any) => ({ id: row.id, revisionId: row.revision_id, certificationId: row.certification_id, domainId: row.domain_id })) }; }
async function loadFullSource(db: Queryable, certificationId: string): Promise<FullCatalogGenerationSource | null> { const found = await db.query<{ revision_id: string; certification_key: string }>(`SELECT head.active_revision_id AS revision_id, head.certification_key FROM catalog_heads head JOIN certifications certification ON certification.revision_id = head.active_revision_id WHERE certification.id = $1`, [certificationId]); const head = found.rows[0]; if (!head) return null; const source = await loadSource(db, head.revision_id, head.certification_key); const certification = source.certifications.find((item) => item.id === certificationId); if (!certification) return null; const provider = source.providers.find((item) => item.id === certification.providerId); if (!provider) return null; const rows = await db.query<any>(`SELECT question.id, question.revision_id, question.certification_id, question.domain_id, domain.name AS domain_name, question.stem_en, question.stem_ko, question.explanation_en, question.explanation_ko, question.required_choice_count, question.translation_status, choice.id AS choice_id, choice.external_key AS choice_external_id, choice.text_en, choice.text_ko, choice.order_index, choice.is_correct FROM questions question JOIN domains domain ON domain.id = question.domain_id AND domain.revision_id = question.revision_id JOIN choices choice ON choice.question_id = question.id AND choice.revision_id = question.revision_id WHERE question.revision_id = $1 AND question.certification_id = $2 ORDER BY question.id, choice.order_index`, [head.revision_id, certificationId]); const grouped = new Map<string, any[]>(); for (const row of rows.rows) grouped.set(row.id, [...(grouped.get(row.id) ?? []), row]); return { revisionId: source.revisionId, certification, provider, domains: source.domains.filter((item) => item.certificationId === certificationId), questions: [...grouped.values()].map((group) => { const first = group[0]!; return { id: first.id, revisionId: first.revision_id, certificationId: first.certification_id, domainId: first.domain_id, domainName: first.domain_name, stem: { en: first.stem_en, ko: first.stem_ko }, explanation: { en: first.explanation_en, ko: first.explanation_ko }, choices: group.map((row) => ({ id: row.choice_id, externalId: row.choice_external_id, text: { en: row.text_en, ko: row.text_ko } })), correctChoiceIndexes: group.flatMap((row, index) => row.is_correct ? [index] : []), requiredChoiceCount: first.required_choice_count, translationStatus: first.translation_status }; }) }; }

function certificationSnapshot(items: readonly PersistedQuestionSnapshot[]): JsonValue { const content = items[0]?.content; if (!content || typeof content !== "object" || Array.isArray(content)) return {}; const certification = (content as Record<string, JsonValue>).certification; return certification && typeof certification === "object" && !Array.isArray(certification) ? certification : {}; }
function json(value: unknown): string { return JSON.stringify(value); }
function object(value: JsonValue | string): JsonValue { if (typeof value === "string") return JSON.parse(value) as JsonValue; return value; }
function strings(value: JsonValue | string): string[] { const parsed = object(value); if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error("Stored choice IDs are invalid."); return [...parsed] as string[]; }
function date(value: Date | string): Date { return value instanceof Date ? new Date(value) : new Date(value); }
function bigint(value: string | bigint): bigint { return typeof value === "bigint" ? value : BigInt(value); }
function required<T>(value: T | null | undefined, name: string): T { if (value === null || value === undefined) throw new Error(`Missing ${name}.`); return value; }
function requiredRow<T extends QueryResultRow, U>(result: QueryResult<T>, name: string, map: (row: T) => U): U { return map(required(result.rows[0], name)); }
function delay(milliseconds: number) { return new Promise<void>((resolve) => setTimeout(resolve, milliseconds)); }
