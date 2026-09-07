import { randomUUID } from "node:crypto";

import {
  isOCCError,
  type AuroraDSQLPool,
} from "@aws/aurora-dsql-node-postgres-connector";
import type { PoolClient } from "pg";

import { errorMessage } from "./live-connection.js";
import type { LiveConcurrencyObservation } from "./live-types.js";

const concurrentClients = 8;

export async function runAtomicityProbes(
  pool: AuroraDSQLPool,
): Promise<LiveConcurrencyObservation[]> {
  const results: LiveConcurrencyObservation[] = [];
  results.push(await probeProfileGetOrCreate(pool));
  results.push(await probeActivePracticeSlot(pool));
  results.push(await probePracticeReplace(pool));
  results.push(await probeExamFinalize(pool));
  results.push(await probeImportHeadSwitch(pool));
  return results;
}

async function probeProfileGetOrCreate(
  pool: AuroraDSQLPool,
): Promise<LiveConcurrencyObservation> {
  const googleSub = `spike-concurrent-${randomUUID()}`;
  try {
    const errors = await runAtBarrier(
      pool,
      concurrentClients,
      async (client, index) => {
        await retryOcc(async () => {
          await client.query(
            `INSERT INTO spike_user_profile (id, google_sub, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (google_sub) DO NOTHING`,
            [randomUUID(), googleSub, new Date(Date.now() + index).toISOString()],
          );
        });
      },
    );
    const count = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM spike_user_profile WHERE google_sub = $1",
      [googleSub],
    );
    const passed = errors.length === 0 && count.rows[0]?.count === "1";
    return observation(
      "profile-get-or-create",
      passed,
      `Barrier released ${concurrentClients} creators; persisted profile count=${count.rows[0]?.count ?? "unknown"}; errors=${errors.join(" | ") || "none"}.`,
    );
  } catch (error) {
    return observation("profile-get-or-create", false, errorMessage(error));
  }
}

async function probeActivePracticeSlot(
  pool: AuroraDSQLPool,
): Promise<LiveConcurrencyObservation> {
  const userId = await createProfile(pool, "practice-slot");
  const certificationId = randomUUID();
  try {
    const errors = await runAtBarrier(pool, concurrentClients, async (client) => {
      await retryOcc(async () => {
        const sessionId = randomUUID();
        await runClientTransaction(client, async () => {
          const slot = await client.query<{ session_id: string }>(
            `INSERT INTO spike_active_practice_slot
               (user_id, certification_id, session_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, certification_id) DO NOTHING
             RETURNING session_id`,
            [userId, certificationId, sessionId],
          );
          if (slot.rows[0]?.session_id !== sessionId) return;
          await client.query(
            `INSERT INTO spike_practice_session
               (id, user_id, certification_id, status, version, created_at)
             VALUES ($1, $2, $3, 'active', 0, $4)`,
            [sessionId, userId, certificationId, new Date().toISOString()],
          );
        });
      });
    });
    const count = await pool.query<{ slots: string; sessions: string }>(
      `SELECT
         (SELECT count(*) FROM spike_active_practice_slot
          WHERE user_id = $1 AND certification_id = $2)::text AS slots,
         (SELECT count(*) FROM spike_practice_session
          WHERE user_id = $1 AND certification_id = $2 AND status = 'active')::text
          AS sessions`,
      [userId, certificationId],
    );
    const passed =
      errors.length === 0 &&
      count.rows[0]?.slots === "1" &&
      count.rows[0]?.sessions === "1";
    return observation(
      "active-practice-slot",
      passed,
      `Barrier released ${concurrentClients} starters; slots=${count.rows[0]?.slots ?? "unknown"}; sessions=${count.rows[0]?.sessions ?? "unknown"}; errors=${errors.join(" | ") || "none"}.`,
    );
  } catch (error) {
    return observation("active-practice-slot", false, errorMessage(error));
  }
}

async function probePracticeReplace(
  pool: AuroraDSQLPool,
): Promise<LiveConcurrencyObservation> {
  const userId = await createProfile(pool, "practice-replace");
  const certificationId = randomUUID();
  const oldSessionId = randomUUID();
  const failedReplacementId = randomUUID();
  const successfulReplacementId = randomUUID();
  try {
    await pool.query(
      `INSERT INTO spike_practice_session
         (id, user_id, certification_id, status, version, created_at)
       VALUES ($1, $2, $3, 'active', 0, $4)`,
      [oldSessionId, userId, certificationId, new Date().toISOString()],
    );
    await pool.query(
      `INSERT INTO spike_active_practice_slot
         (user_id, certification_id, session_id)
       VALUES ($1, $2, $3)`,
      [userId, certificationId, oldSessionId],
    );
    await insertSnapshots(pool, oldSessionId, 3);

    let injectedFailureObserved = false;
    try {
      await pool.transaction(async (client) => {
        await client.query(
          "DELETE FROM spike_active_practice_slot WHERE session_id = $1",
          [oldSessionId],
        );
        await client.query(
          "DELETE FROM spike_practice_snapshot WHERE session_id = $1",
          [oldSessionId],
        );
        await client.query("DELETE FROM spike_practice_session WHERE id = $1", [
          oldSessionId,
        ]);
        await client.query(
          `INSERT INTO spike_practice_session
             (id, user_id, certification_id, status, version, created_at)
           VALUES ($1, $2, $3, 'active', 0, $4)`,
          [failedReplacementId, userId, certificationId, new Date().toISOString()],
        );
        await client.query(
          `INSERT INTO spike_active_practice_slot
             (user_id, certification_id, session_id)
           VALUES ($1, $2, $3)`,
          [userId, certificationId, failedReplacementId],
        );
        await client.query(
          `INSERT INTO spike_practice_snapshot
             (id, session_id, ordinal, snapshot_document)
           VALUES ($1, $2, 0, $3::jsonb)`,
          [randomUUID(), failedReplacementId, JSON.stringify({ ordinal: 0 })],
        );
        throw new Error("injected practice replacement failure");
      });
    } catch (error) {
      injectedFailureObserved = errorMessage(error).includes(
        "injected practice replacement failure",
      );
    }

    const afterFailure = await sessionShape(pool, oldSessionId, failedReplacementId);
    const rollbackPreservedOld =
      afterFailure.oldSessions === 1 &&
      afterFailure.oldSlots === 1 &&
      afterFailure.oldSnapshots === 3 &&
      afterFailure.newSessions === 0 &&
      afterFailure.newSlots === 0 &&
      afterFailure.newSnapshots === 0;

    const readerSnapshots: Array<{
      phase: "before" | "after";
      sessionId: string;
      snapshotCount: number;
    }> = [];
    const writerStaged = createSignal();
    const preCommitReadersDone = createSignal();
    const writerFinished = createSignal();
    let preCommitReaderCount = 0;
    const barrierErrors = await runAtBarrier(
      pool,
      concurrentClients,
      async (client, index) => {
        if (index === 0) {
          await client.query("BEGIN");
          try {
            await client.query(
              "DELETE FROM spike_active_practice_slot WHERE session_id = $1",
              [oldSessionId],
            );
            await client.query(
              "DELETE FROM spike_practice_snapshot WHERE session_id = $1",
              [oldSessionId],
            );
            await client.query("DELETE FROM spike_practice_session WHERE id = $1", [
              oldSessionId,
            ]);
            await client.query(
              `INSERT INTO spike_practice_session
                 (id, user_id, certification_id, status, version, created_at)
               VALUES ($1, $2, $3, 'active', 0, $4)`,
              [
                successfulReplacementId,
                userId,
                certificationId,
                new Date().toISOString(),
              ],
            );
            await client.query(
              `INSERT INTO spike_active_practice_slot
                 (user_id, certification_id, session_id)
               VALUES ($1, $2, $3)`,
              [userId, certificationId, successfulReplacementId],
            );
            for (let ordinal = 0; ordinal < 3; ordinal += 1) {
              await client.query(
                `INSERT INTO spike_practice_snapshot
                   (id, session_id, ordinal, snapshot_document)
                 VALUES ($1, $2, $3, $4::jsonb)`,
                [
                  randomUUID(),
                  successfulReplacementId,
                  ordinal,
                  JSON.stringify({ ordinal }),
                ],
              );
            }
            writerStaged.resolve();
            await preCommitReadersDone.promise;
            await client.query("COMMIT");
            writerFinished.resolve();
          } catch (error) {
            writerStaged.resolve();
            preCommitReadersDone.resolve();
            await client.query("ROLLBACK").catch(() => undefined);
            writerFinished.resolve();
            throw error;
          }
          return;
        }

        const phase = index <= 3 ? "before" : "after";
        if (phase === "before") await writerStaged.promise;
        else await writerFinished.promise;
        try {
          await runClientTransaction(client, async () => {
            const observed = await client.query<{
              session_id: string;
              snapshot_count: string;
            }>(
              `SELECT slot.session_id, count(snapshot.id)::text AS snapshot_count
               FROM spike_active_practice_slot slot
               JOIN spike_practice_session session ON session.id = slot.session_id
               JOIN spike_practice_snapshot snapshot ON snapshot.session_id = session.id
               WHERE slot.user_id = $1 AND slot.certification_id = $2
               GROUP BY slot.session_id`,
              [userId, certificationId],
            );
            readerSnapshots.push({
              phase,
              sessionId: observed.rows[0]?.session_id ?? "missing",
              snapshotCount: Number(observed.rows[0]?.snapshot_count ?? -1),
            });
          });
        } finally {
          if (phase === "before") {
            preCommitReaderCount += 1;
            if (preCommitReaderCount === 3) preCommitReadersDone.resolve();
          }
        }
      },
    );
    const beforeCommit = readerSnapshots.filter((entry) => entry.phase === "before");
    const afterCommit = readerSnapshots.filter((entry) => entry.phase === "after");
    const readersCrossedCommitBoundary =
      beforeCommit.length === 3 &&
      beforeCommit.every(
        (entry) => entry.sessionId === oldSessionId && entry.snapshotCount === 3,
      ) &&
      afterCommit.length === 4 &&
      afterCommit.every(
        (entry) =>
          entry.sessionId === successfulReplacementId && entry.snapshotCount === 3,
      );
    const afterSuccess = await sessionShape(
      pool,
      oldSessionId,
      successfulReplacementId,
    );
    const successComplete =
      afterSuccess.oldSessions === 0 &&
      afterSuccess.oldSlots === 0 &&
      afterSuccess.oldSnapshots === 0 &&
      afterSuccess.newSessions === 1 &&
      afterSuccess.newSlots === 1 &&
      afterSuccess.newSnapshots === 3;
    const passed =
      injectedFailureObserved &&
      rollbackPreservedOld &&
      barrierErrors.length === 0 &&
      readersCrossedCommitBoundary &&
      successComplete;
    return observation(
      "practice-replace",
      passed,
      `faultObserved=${injectedFailureObserved}; rollbackPreservedOld=${rollbackPreservedOld}; successComplete=${successComplete}; preCommitReaders=${beforeCommit.length}/3; postCommitReaders=${afterCommit.length}/4; readersCrossedCommitBoundary=${readersCrossedCommitBoundary}; barrierErrors=${barrierErrors.join(" | ") || "none"}.`,
    );
  } catch (error) {
    return observation("practice-replace", false, errorMessage(error));
  }
}

async function probeExamFinalize(
  pool: AuroraDSQLPool,
): Promise<LiveConcurrencyObservation> {
  const userId = await createProfile(pool, "exam-finalize");
  const certificationId = randomUUID();
  const examSessionId = randomUUID();
  const expiresAt = new Date(Date.now() - 1_000);
  const manualReceivedAt = new Date(expiresAt.getTime() - 1_000).toISOString();
  const expiredObservedAt = new Date(expiresAt.getTime() + 1_000).toISOString();
  try {
    await pool.query(
      `INSERT INTO spike_exam_session
         (id, user_id, certification_id, status, started_at, expires_at)
       VALUES ($1, $2, $3, 'active', $4, $5)`,
      [
        examSessionId,
        userId,
        certificationId,
        new Date(expiresAt.getTime() - 60_000).toISOString(),
        expiresAt.toISOString(),
      ],
    );

    let injectedFailureObserved = false;
    try {
      await pool.transaction(async (client) => {
        await client.query(
          `INSERT INTO spike_attempt
             (id, exam_session_id, user_id, certification_id,
              raw_numerator, raw_denominator, accuracy_numerator,
              accuracy_denominator, submitted_at)
           VALUES ($1, $2, $3, $4, 1, 1, 100, 1, $5)`,
          [
            randomUUID(),
            examSessionId,
            userId,
            certificationId,
            new Date().toISOString(),
          ],
        );
        await client.query(
          `UPDATE spike_exam_session
           SET status = 'submitted'
           WHERE id = $1 AND status = 'active'`,
          [examSessionId],
        );
        throw new Error("injected finalize failure after attempt and status writes");
      });
    } catch (error) {
      injectedFailureObserved = errorMessage(error).includes(
        "injected finalize failure after attempt and status writes",
      );
    }
    const afterFault = await pool.query<{ attempts: string; status: string }>(
      `SELECT
         (SELECT count(*) FROM spike_attempt WHERE exam_session_id = $1)::text
           AS attempts,
         (SELECT status FROM spike_exam_session WHERE id = $1) AS status`,
      [examSessionId],
    );
    const faultRolledBack =
      afterFault.rows[0]?.attempts === "0" && afterFault.rows[0]?.status === "active";

    const attemptIds: string[] = [];
    const flows: Array<"manual" | "expired"> = [];
    let occRetryCount = 0;
    const errors = await runAtBarrier(
      pool,
      concurrentClients,
      async (client, index) => {
        const flow = index % 2 === 0 ? "manual" : "expired";
        const observedAt = flow === "manual" ? manualReceivedAt : expiredObservedAt;
        const eligibilityPredicate =
          flow === "manual" ? "expires_at > $2" : "expires_at <= $2";
        const committedAttemptId = await retryOcc(
          async () =>
            runClientTransaction(client, async () => {
              const eligible = await client.query<{ status: string }>(
                `SELECT status FROM spike_exam_session
                 WHERE id = $1 AND ${eligibilityPredicate}`,
                [examSessionId, observedAt],
              );
              if (!eligible.rows[0]) {
                throw new Error(`${flow} finalize precondition was not satisfied.`);
              }
              await client.query(
                `INSERT INTO spike_attempt
                   (id, exam_session_id, user_id, certification_id,
                    raw_numerator, raw_denominator, accuracy_numerator,
                    accuracy_denominator, submitted_at)
                 VALUES ($1, $2, $3, $4, 1, 1, 100, 1, $5)
                 ON CONFLICT (exam_session_id) DO NOTHING`,
                [
                  randomUUID(),
                  examSessionId,
                  userId,
                  certificationId,
                  new Date().toISOString(),
                ],
              );
              await client.query(
                `UPDATE spike_exam_session
                 SET status = 'submitted'
                 WHERE id = $1 AND status = 'active'`,
                [examSessionId],
              );
              const selected = await client.query<{ id: string }>(
                "SELECT id FROM spike_attempt WHERE exam_session_id = $1",
                [examSessionId],
              );
              const id = selected.rows[0]?.id;
              if (!id) throw new Error("Finalize replay could not read the Attempt.");
              return id;
            }),
          () => {
            occRetryCount += 1;
          },
        );
        attemptIds.push(committedAttemptId);
        flows.push(flow);
      },
    );
    const finalized = await pool.query<{
      count: string;
      id: string;
      status: string;
    }>(
      `SELECT
         (SELECT count(*) FROM spike_attempt WHERE exam_session_id = $1)::text
           AS count,
         (SELECT min(id::text) FROM spike_attempt WHERE exam_session_id = $1) AS id,
         (SELECT status FROM spike_exam_session WHERE id = $1) AS status`,
      [examSessionId],
    );
    const persistedId = finalized.rows[0]?.id;
    const allSame =
      attemptIds.length === concurrentClients &&
      attemptIds.every((attemptId) => attemptId === persistedId);
    const manualCount = flows.filter((flow) => flow === "manual").length;
    const expiredCount = flows.filter((flow) => flow === "expired").length;
    const bothFlowsRan = manualCount === 4 && expiredCount === 4;
    const passed =
      injectedFailureObserved &&
      faultRolledBack &&
      errors.length === 0 &&
      finalized.rows[0]?.count === "1" &&
      finalized.rows[0]?.status === "submitted" &&
      allSame &&
      bothFlowsRan &&
      occRetryCount > 0;
    return observation(
      "exam-finalize",
      passed,
      `faultObserved=${injectedFailureObserved}; faultRolledBack=${faultRolledBack}; attemptCount=${finalized.rows[0]?.count ?? "unknown"}; sessionStatus=${finalized.rows[0]?.status ?? "unknown"}; callersWithSameResult=${attemptIds.length}/${concurrentClients}; manualPreExpiry=${manualCount}/4; expiredPostExpiry=${expiredCount}/4; occRetries=${occRetryCount}; errors=${errors.join(" | ") || "none"}.`,
    );
  } catch (error) {
    return observation("exam-finalize", false, errorMessage(error));
  }
}

async function probeImportHeadSwitch(
  pool: AuroraDSQLPool,
): Promise<LiveConcurrencyObservation> {
  const previousRevisionId = randomUUID();
  const failedRevisionId = randomUUID();
  const successfulRevisionId = randomUUID();
  try {
    await pool.query(
      `INSERT INTO spike_catalog_revision
         (id, revision_number, imported_document, complete, created_at)
       VALUES ($1, 1, $2::jsonb, true, $3)`,
      [previousRevisionId, JSON.stringify({ revision: 1 }), new Date().toISOString()],
    );
    await insertCatalogItems(pool, previousRevisionId, 1);
    await pool.query(
      `INSERT INTO spike_catalog_head (singleton, revision_id, updated_at)
       VALUES (true, $1, $2)`,
      [previousRevisionId, new Date().toISOString()],
    );

    let injectedFailureObserved = false;
    try {
      await pool.transaction(async (client) => {
        await client.query(
          `INSERT INTO spike_catalog_revision
             (id, revision_number, imported_document, complete, created_at)
           VALUES ($1, 2, $2::jsonb, false, $3)`,
          [failedRevisionId, JSON.stringify({ revision: 2 }), new Date().toISOString()],
        );
        await insertCatalogItems(client, failedRevisionId, 2);
        await client.query(
          "UPDATE spike_catalog_head SET revision_id = $1, updated_at = $2 WHERE singleton",
          [failedRevisionId, new Date().toISOString()],
        );
        throw new Error("injected import head failure");
      });
    } catch (error) {
      injectedFailureObserved = errorMessage(error).includes(
        "injected import head failure",
      );
    }

    const afterFailure = await readCatalogHead(pool);
    const rollbackPreservedCompleteHead =
      afterFailure.revisionId === previousRevisionId &&
      afterFailure.complete &&
      afterFailure.activeItemCount === 3 &&
      afterFailure.itemsMatchRevision &&
      afterFailure.failedRevisionCount === 0;

    const readerHeads: Array<CatalogHeadShape & { phase: "before" | "after" }> = [];
    const writerStaged = createSignal();
    const preCommitReadersDone = createSignal();
    const writerFinished = createSignal();
    let preCommitReaderCount = 0;
    const barrierErrors = await runAtBarrier(
      pool,
      concurrentClients,
      async (client, index) => {
        if (index === 0) {
          await client.query("BEGIN");
          try {
            await client.query(
              `INSERT INTO spike_catalog_revision
                 (id, revision_number, imported_document, complete, created_at)
               VALUES ($1, 2, $2::jsonb, false, $3)`,
              [
                successfulRevisionId,
                JSON.stringify({ revision: 2 }),
                new Date().toISOString(),
              ],
            );
            await insertCatalogItems(client, successfulRevisionId, 2);
            await client.query(
              "UPDATE spike_catalog_revision SET complete = true WHERE id = $1",
              [successfulRevisionId],
            );
            await client.query(
              "UPDATE spike_catalog_head SET revision_id = $1, updated_at = $2 WHERE singleton",
              [successfulRevisionId, new Date().toISOString()],
            );
            writerStaged.resolve();
            await preCommitReadersDone.promise;
            await client.query("COMMIT");
            writerFinished.resolve();
          } catch (error) {
            writerStaged.resolve();
            preCommitReadersDone.resolve();
            await client.query("ROLLBACK").catch(() => undefined);
            writerFinished.resolve();
            throw error;
          }
          return;
        }

        const phase = index <= 3 ? "before" : "after";
        if (phase === "before") await writerStaged.promise;
        else await writerFinished.promise;
        try {
          await runClientTransaction(client, async () => {
            readerHeads.push({ ...(await readCatalogHead(client)), phase });
          });
        } finally {
          if (phase === "before") {
            preCommitReaderCount += 1;
            if (preCommitReaderCount === 3) preCommitReadersDone.resolve();
          }
        }
      },
    );

    const afterSuccess = await readCatalogHead(pool);
    const successComplete =
      afterSuccess.revisionId === successfulRevisionId &&
      afterSuccess.complete &&
      afterSuccess.activeItemCount === 3 &&
      afterSuccess.itemsMatchRevision;
    const beforeCommit = readerHeads.filter((head) => head.phase === "before");
    const afterCommit = readerHeads.filter((head) => head.phase === "after");
    const readersCrossedCommitBoundary =
      beforeCommit.length === 3 &&
      beforeCommit.every(
        (head) =>
          head.revisionId === previousRevisionId &&
          head.complete &&
          head.activeItemCount === 3 &&
          head.itemsMatchRevision,
      ) &&
      afterCommit.length === 4 &&
      afterCommit.every(
        (head) =>
          head.revisionId === successfulRevisionId &&
          head.complete &&
          head.activeItemCount === 3 &&
          head.itemsMatchRevision,
      );
    const passed =
      injectedFailureObserved &&
      rollbackPreservedCompleteHead &&
      barrierErrors.length === 0 &&
      readersCrossedCommitBoundary &&
      successComplete;
    return observation(
      "import-head-switch",
      passed,
      `faultObserved=${injectedFailureObserved}; rollbackPreservedCompleteHead=${rollbackPreservedCompleteHead}; successComplete=${successComplete}; preCommitReaders=${beforeCommit.length}/3; postCommitReaders=${afterCommit.length}/4; readersCrossedCommitBoundary=${readersCrossedCommitBoundary}; barrierErrors=${barrierErrors.join(" | ") || "none"}.`,
    );
  } catch (error) {
    return observation("import-head-switch", false, errorMessage(error));
  }
}

function createSignal(): { promise: Promise<void>; resolve: () => void } {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: () => release?.() };
}

async function runAtBarrier(
  pool: AuroraDSQLPool,
  count: number,
  action: (client: PoolClient, index: number) => Promise<void>,
): Promise<string[]> {
  let ready = 0;
  let releaseBarrier: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  const clients = await Promise.all(
    Array.from({ length: count }, () => pool.connect()),
  );
  const errors: string[] = [];

  await Promise.all(
    clients.map(async (client, index) => {
      ready += 1;
      if (ready === count) releaseBarrier?.();
      await barrier;
      try {
        await action(client, index);
      } catch (error) {
        errors.push(errorMessage(error));
      } finally {
        client.release();
      }
    }),
  );
  return errors;
}

async function runClientTransaction<T>(
  client: PoolClient,
  action: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await action();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function retryOcc<T>(action: () => Promise<T>, onRetry?: () => void): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (!isOCCError(error) || attempt === 7) throw error;
      onRetry?.();
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
  throw new Error("OCC retry loop exhausted without a result.");
}

async function createProfile(pool: AuroraDSQLPool, label: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO spike_user_profile (id, google_sub, created_at)
     VALUES ($1, $2, $3)`,
    [id, `spike-${label}-${id}`, new Date().toISOString()],
  );
  return id;
}

async function insertSnapshots(
  pool: AuroraDSQLPool,
  sessionId: string,
  count: number,
): Promise<void> {
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    await pool.query(
      `INSERT INTO spike_practice_snapshot
         (id, session_id, ordinal, snapshot_document)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [randomUUID(), sessionId, ordinal, JSON.stringify({ ordinal })],
    );
  }
}

async function sessionShape(
  pool: AuroraDSQLPool,
  oldSessionId: string,
  newSessionId: string,
): Promise<{
  oldSessions: number;
  oldSlots: number;
  oldSnapshots: number;
  newSessions: number;
  newSlots: number;
  newSnapshots: number;
}> {
  const result = await pool.query<{
    old_sessions: string;
    old_slots: string;
    old_snapshots: string;
    new_sessions: string;
    new_slots: string;
    new_snapshots: string;
  }>(
    `SELECT
       (SELECT count(*) FROM spike_practice_session WHERE id = $1)::text AS old_sessions,
       (SELECT count(*) FROM spike_active_practice_slot WHERE session_id = $1)::text AS old_slots,
       (SELECT count(*) FROM spike_practice_snapshot WHERE session_id = $1)::text AS old_snapshots,
       (SELECT count(*) FROM spike_practice_session WHERE id = $2)::text AS new_sessions,
       (SELECT count(*) FROM spike_active_practice_slot WHERE session_id = $2)::text AS new_slots,
       (SELECT count(*) FROM spike_practice_snapshot WHERE session_id = $2)::text AS new_snapshots`,
    [oldSessionId, newSessionId],
  );
  const row = result.rows[0];
  return {
    oldSessions: Number(row?.old_sessions ?? -1),
    oldSlots: Number(row?.old_slots ?? -1),
    oldSnapshots: Number(row?.old_snapshots ?? -1),
    newSessions: Number(row?.new_sessions ?? -1),
    newSlots: Number(row?.new_slots ?? -1),
    newSnapshots: Number(row?.new_snapshots ?? -1),
  };
}

type CatalogQueryable = Pick<PoolClient, "query">;

type CatalogHeadShape = {
  revisionId: string;
  complete: boolean;
  activeItemCount: number;
  itemsMatchRevision: boolean;
  failedRevisionCount: number;
};

async function insertCatalogItems(
  queryable: CatalogQueryable,
  revisionId: string,
  revisionNumber: number,
): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await queryable.query(
      `INSERT INTO spike_catalog_item (revision_id, item_key, item_document)
       VALUES ($1, $2, $3::jsonb)`,
      [
        revisionId,
        `${revisionNumber}:item-${index}`,
        JSON.stringify({ revision: revisionNumber, index }),
      ],
    );
  }
}

async function readCatalogHead(queryable: CatalogQueryable): Promise<CatalogHeadShape> {
  const result = await queryable.query<{
    revision_id: string;
    revision_number: number;
    complete: boolean;
    item_key: string | null;
    item_document: { revision?: number } | null;
    failed_revision_count: string;
  }>(`
    SELECT head.revision_id, revision.revision_number, revision.complete,
      item.item_key, item.item_document,
      (SELECT count(*) FROM spike_catalog_revision WHERE complete = false)::text
        AS failed_revision_count
    FROM spike_catalog_head head
    JOIN spike_catalog_revision revision ON revision.id = head.revision_id
    LEFT JOIN spike_catalog_item item ON item.revision_id = head.revision_id
    WHERE head.singleton
    ORDER BY item.item_key
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Catalog head is missing.");
  const activeItems = result.rows.filter((item) => item.item_key !== null);
  return {
    revisionId: row.revision_id,
    complete: row.complete,
    activeItemCount: activeItems.length,
    itemsMatchRevision: activeItems.every(
      (item) =>
        item.item_key?.startsWith(`${row.revision_number}:`) === true &&
        item.item_document?.revision === row.revision_number,
    ),
    failedRevisionCount: Number(row.failed_revision_count),
  };
}

function observation(
  id: LiveConcurrencyObservation["id"],
  passed: boolean,
  detail: string,
): LiveConcurrencyObservation {
  return {
    id,
    status: passed ? "pass" : "fail",
    clients: concurrentClients,
    detail,
  };
}
