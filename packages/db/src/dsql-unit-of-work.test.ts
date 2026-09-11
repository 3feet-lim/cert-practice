import { Fraction, type ImportCommitCommand } from "@cert-quiz/domain";
import { describe, expect, it } from "vitest";

import { DsqlUnitOfWork } from "./dsql-unit-of-work.js";

type Call = { text: string; values?: readonly unknown[] };
type FixtureOptions = {
  head?: { active_revision_id: string; version: string };
  failWhen?: (text: string) => boolean;
  rejectHeadSwitch?: boolean;
};

function fixture(options: FixtureOptions = {}) {
  const calls: Call[] = [];
  let releases = 0;
  const client = {
    query: async (text: string, values?: readonly unknown[]) => {
      calls.push({ text, values });
      if (options.failWhen?.(text)) throw new Error("write failed");
      if (text.includes("SELECT active_revision_id, version FROM catalog_heads"))
        return { rows: options.head ? [options.head] : [], rowCount: options.head ? 1 : 0 };
      if (text.includes("AS orphan_choices"))
        return {
          rows: [
            {
              providers: "1",
              certifications: "1",
              domains: "1",
              questions: "1",
              choices: "2",
              orphan_questions: "0",
              orphan_choices: "0",
            },
          ],
          rowCount: 1,
        };
      if (text.includes("INSERT INTO catalog_heads"))
        return { rows: [{ certification_key: "CERT" }], rowCount: 1 };
      if (text.includes("UPDATE catalog_heads"))
        return {
          rows: options.rejectHeadSwitch ? [] : [{ certification_key: "CERT" }],
          rowCount: options.rejectHeadSwitch ? 0 : 1,
        };
      if (text.includes("UPDATE import_validations"))
        return { rows: [{ id: "validation" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release: () => {
      releases += 1;
    },
  };
  return {
    calls,
    released: () => releases,
    unitOfWork: new DsqlUnitOfWork({ connect: async () => client }),
  };
}

function commitCommand(): ImportCommitCommand {
  const revisionId = "00000000-0000-4000-8000-000000000001";
  const providerId = "00000000-0000-4000-8000-000000000002";
  const certificationId = "00000000-0000-4000-8000-000000000003";
  const domainId = "00000000-0000-4000-8000-000000000004";
  const questionId = "00000000-0000-4000-8000-000000000005";
  return {
    validationId: "00000000-0000-4000-8000-000000000006",
    actorUserId: "00000000-0000-4000-8000-000000000007",
    tokenDigest: "a".repeat(64),
    contentHash: "b".repeat(64),
    now: new Date("2026-03-20T00:00:00.000Z"),
    materialization: {
      revision: {
        id: revisionId,
        certificationKey: "CERT",
        contentHash: "b".repeat(64),
        importedBy: "00000000-0000-4000-8000-000000000007",
        importedAt: new Date("2026-03-20T00:00:00.000Z"),
        document: {},
      },
      source: {
        revisionId,
        certificationKey: "CERT",
        providers: [{ id: providerId, revisionId, name: "Provider", logoUrl: null }],
        certifications: [
          {
            id: certificationId,
            revisionId,
            providerId,
            externalKey: "CERT",
            code: "CERT",
            name: "Certification",
            totalQuestions: 1,
            timeLimitMinutes: 10,
            passThreshold: Fraction.of(75n),
            scoringMode: "all_or_nothing",
          },
        ],
        domains: [
          {
            id: domainId,
            revisionId,
            certificationId,
            name: "Domain",
            weightBasisPoints: 10_000,
            orderIndex: 0,
          },
        ],
        questions: [
          { id: questionId, revisionId, certificationId, domainId },
        ],
      },
      generation: {
        revisionId,
        provider: { id: providerId, revisionId, name: "Provider", logoUrl: null },
        certification: {
          id: certificationId,
          revisionId,
          providerId,
          externalKey: "CERT",
          code: "CERT",
          name: "Certification",
          totalQuestions: 1,
          timeLimitMinutes: 10,
          passThreshold: Fraction.of(75n),
          scoringMode: "all_or_nothing",
        },
        domains: [
          {
            id: domainId,
            revisionId,
            certificationId,
            name: "Domain",
            weightBasisPoints: 10_000,
            orderIndex: 0,
          },
        ],
        questions: [
          {
            id: questionId,
            revisionId,
            certificationId,
            domainId,
            domainName: "Domain",
            stem: { en: "Question", ko: null },
            explanation: { en: "Explanation", ko: null },
            choices: [
              {
                id: "00000000-0000-4000-8000-000000000008",
                externalId: "a",
                text: { en: "A", ko: null },
              },
              {
                id: "00000000-0000-4000-8000-000000000009",
                externalId: "b",
                text: { en: "B", ko: null },
              },
            ],
            correctChoiceIndexes: [0],
            requiredChoiceCount: 1,
            translationStatus: "en_only",
          },
        ],
      },
    },
  };
}

function callIndex(calls: readonly Call[], fragment: string): number {
  const index = calls.findIndex((call) => call.text.includes(fragment));
  expect(index, `missing SQL: ${fragment}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe("DSQL UnitOfWork transaction boundary", () => {
  it("commits a successful aggregate operation before releasing the pooled client", async () => {
    const { calls, released, unitOfWork } = fixture();

    await expect(unitOfWork.transaction(async () => "saved")).resolves.toBe("saved");

    expect(calls.map((call) => call.text)).toEqual(["BEGIN", "COMMIT"]);
    expect(released()).toBe(1);
  });

  it("rolls back a failed aggregate operation and still releases the pooled client", async () => {
    const { calls, released, unitOfWork } = fixture();

    await expect(
      unitOfWork.transaction(async () => {
        throw new Error("write failed");
      }),
    ).rejects.toThrow("write failed");

    expect(calls.map((call) => call.text)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(released()).toBe(1);
  });

  it("retries a raw OC000 raised by COMMIT after rolling back and releasing the aborted client", async () => {
    const calls: string[] = [];
    const delays: number[] = [];
    let connected = 0;
    let released = 0;
    let workRuns = 0;
    const unitOfWork = new DsqlUnitOfWork(
      {
        connect: async () => {
          const connection = connected++;
          return {
            query: async (text: string) => {
              calls.push(`${connection}:${text}`);
              if (connection === 0 && text === "COMMIT")
                throw Object.assign(new Error("transaction aborted"), { code: "OC000" });
              return { rows: [], rowCount: 0 };
            },
            release: () => {
              released += 1;
            },
          };
        },
      },
      {
        maxOccRetries: 1,
        retryDelayMs: 0,
        sleep: async (milliseconds) => {
          delays.push(milliseconds);
        },
      },
    );

    await expect(unitOfWork.transaction(async () => ++workRuns)).resolves.toBe(2);

    expect(calls).toEqual([
      "0:BEGIN",
      "0:COMMIT",
      "0:ROLLBACK",
      "1:BEGIN",
      "1:COMMIT",
    ]);
    expect(delays).toEqual([0]);
    expect(released).toBe(2);
  });
});

describe("DSQL active practice listing", () => {
  it("queries only the owner active sessions in deterministic creation order", async () => {
    const { calls, unitOfWork } = fixture();

    const sessions = await unitOfWork.transaction((repos) =>
      repos.practice.listActiveOwned("00000000-0000-4000-8000-000000000101"),
    );

    expect(sessions).toEqual([]);
    expect(calls).toContainEqual({
      text: expect.stringContaining(
        "WHERE user_id = $1 AND status = 'active'\n           ORDER BY created_at ASC, id ASC",
      ),
      values: ["00000000-0000-4000-8000-000000000101"],
    });
  });
});

describe("DSQL validated import commit", () => {
  it("inserts and verifies a staging revision before conditionally switching its head and consuming the token", async () => {
    const { calls, unitOfWork } = fixture();

    await expect(
      unitOfWork.transaction((repos) => repos.catalog.commitValidatedImport(commitCommand())),
    ).resolves.toBeUndefined();

    const revisionInsert = calls.find((call) =>
      call.text.includes("INSERT INTO catalog_revisions"),
    );
    expect(revisionInsert?.values?.at(-1)).toBe("staging");
    const verification = callIndex(calls, "AS orphan_choices");
    const activation = callIndex(calls, "SET status = CASE WHEN id = $2 THEN 'active'");
    const headSwitch = callIndex(calls, "INSERT INTO catalog_heads");
    const tokenConsume = callIndex(calls, "UPDATE import_validations");
    expect(verification).toBeLessThan(activation);
    expect(activation).toBeLessThan(headSwitch);
    expect(headSwitch).toBeLessThan(tokenConsume);
    expect(calls.at(-1)?.text).toBe("COMMIT");
  });

  it("rolls back without switching the head or consuming the token when revision insertion fails", async () => {
    const { calls, unitOfWork } = fixture({
      failWhen: (text) => text.includes("INSERT INTO questions"),
    });

    await expect(
      unitOfWork.transaction((repos) => repos.catalog.commitValidatedImport(commitCommand())),
    ).rejects.toThrow("write failed");

    expect(
      calls.some(
        (call) =>
          call.text.includes("INSERT INTO catalog_heads") ||
          call.text.includes("UPDATE catalog_heads SET"),
      ),
    ).toBe(false);
    expect(calls.some((call) => call.text.includes("UPDATE import_validations"))).toBe(
      false,
    );
    expect(calls.at(-1)?.text).toBe("ROLLBACK");
  });

  it("rolls back rather than overwriting a concurrently changed catalog head", async () => {
    const { calls, unitOfWork } = fixture({
      head: { active_revision_id: "00000000-0000-4000-8000-000000000010", version: "4" },
      rejectHeadSwitch: true,
    });

    await expect(
      unitOfWork.transaction((repos) => repos.catalog.commitValidatedImport(commitCommand())),
    ).rejects.toThrow("Catalog head changed during import");

    expect(calls.some((call) => call.text.includes("UPDATE import_validations"))).toBe(
      false,
    );
    expect(calls.at(-1)?.text).toBe("ROLLBACK");
  });
});
