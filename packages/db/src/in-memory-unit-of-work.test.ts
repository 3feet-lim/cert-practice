import { describe, expect, it } from "vitest";
import {
  Fraction,
  type NewPracticeSession,
  type PersistedQuestionSnapshot,
} from "@cert-quiz/domain";

import {
  DOP_C02_CATALOG_FIXTURE,
  createDopC02CatalogFixture,
} from "./dop-c02-fixture.js";
import { InMemoryUnitOfWork } from "./in-memory-unit-of-work.js";
import { describeRepositoryContractSuite } from "./repository-contract-suite.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const later = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000);

function question(id: string): PersistedQuestionSnapshot {
  return {
    id,
    displayIndex: 0,
    content: { id, stem: "immutable" },
    selectedChoiceIds: [],
    finalChoiceIds: null,
    earnedScore: null,
    flagged: false,
    version: 0n,
  };
}

function practice(id: string): NewPracticeSession {
  return {
    id,
    userId: "user-a",
    certificationKey: "cert-a",
    currentIndex: 0,
    questions: [question(`${id}-q`)],
    createdAt: now,
  };
}

async function identity(db: InMemoryUnitOfWork): Promise<void> {
  await db.transaction((repos) =>
    repos.users.getOrCreatePendingByGoogleSub({
      id: "user-a",
      googleSub: "user-a",
      displayName: "user-a",
      email: "user-a@example.test",
      now,
    }),
  );
}

describeRepositoryContractSuite("in-memory", async () => {
  const unitOfWork = new InMemoryUnitOfWork();
  return {
    unitOfWork,
    prepareActiveCertification: async () => undefined,
    cleanup: async () => undefined,
  };
});

describe("in-memory fault-injection repository behavior", () => {
  it("rolls back injected write failures, including an atomic catalog-head switch", async () => {
    const db = new InMemoryUnitOfWork();
    db.failNext("profile-write");
    await expect(identity(db)).rejects.toThrow("profile-write");
    await db.transaction(async (repos) =>
      expect(await repos.users.findPending()).toEqual([]),
    );
    await identity(db);

    await db.transaction((repos) => repos.practice.replaceAtomically(practice("practice-old")));
    db.failNext("practice-replace");
    await expect(
      db.transaction((repos) => repos.practice.replaceAtomically(practice("practice-new"))),
    ).rejects.toThrow("practice-replace");
    await db.transaction(async (repos) =>
      expect((await repos.practice.findActiveOwned("user-a", "cert-a"))?.id).toBe(
        "practice-old",
      ),
    );

    const validation = {
      id: "validation-1",
      actorUserId: "user-a",
      certificationKey: "cert-a",
      contentHash: "a".repeat(64),
      tokenDigest: "b".repeat(64),
      expiresAt: later(1),
      status: "validated" as const,
      version: 0n,
    };
    await db.transaction((repos) => repos.catalog.saveValidation(validation));
    db.failNext("catalog-switch");
    await expect(
      db.transaction((repos) =>
        repos.catalog.activateRevision(
          "validation-1",
          {
            id: "revision-1",
            certificationKey: "cert-a",
            contentHash: validation.contentHash,
            importedBy: "user-a",
            importedAt: now,
            document: { revision: 1 },
          },
          now,
        ),
      ),
    ).rejects.toThrow("catalog-switch");
    await db.transaction(async (repos) =>
      expect(await repos.catalog.activeRevision("cert-a")).toBeNull(),
    );
  });

  it("rolls back a failed exam finalization and leaves it retryable", async () => {
    const db = new InMemoryUnitOfWork();
    await identity(db);
    await db.transaction((repos) =>
      repos.exams.createWithSnapshots({
        id: "exam-fault",
        userId: "user-a",
        certificationKey: "cert-a",
        startRequestKey: "request-fault",
        currentIndex: 0,
        startedAt: now,
        expiresAt: later(3),
        questions: [question("fault-q")],
      }),
    );
    const command = {
      id: "attempt-fault",
      userId: "user-a",
      sessionId: "exam-fault",
      rawScore: Fraction.of(1n),
      accuracyRate: Fraction.of(100n),
      passThreshold: Fraction.of(75n),
      passed: true,
      reference1000Score: 1000,
      submittedAt: later(1),
      submissionReason: "manual" as const,
    };
    db.failNext("exam-finalize");
    await expect(db.transaction((repos) => repos.exams.finalizeOnce(command))).rejects.toThrow(
      "exam-finalize",
    );
    await db.transaction(async (repos) =>
      expect(await repos.exams.getOwned("user-a", "exam-fault")).toMatchObject({
        status: "active",
        attemptId: null,
      }),
    );
    await expect(db.transaction((repos) => repos.exams.finalizeOnce(command))).resolves.toMatchObject({
      id: "attempt-fault",
    });
  });
});

describe("revisioned catalog repository reads", () => {
  it("returns only active-head sources and isolates generation to the selected active revision", async () => {
    const db = new InMemoryUnitOfWork();
    const active = createDopC02CatalogFixture();
    const inactive = createDopC02CatalogFixture();
    inactive.revision.id = "00000000-0000-4000-8000-000000000901";
    inactive.revision.certificationKey = "DOP-C02-OLD";
    inactive.source.revisionId = inactive.revision.id;
    inactive.source.certificationKey = inactive.revision.certificationKey;
    inactive.source.providers.forEach((provider) => {
      provider.revisionId = inactive.revision.id;
    });
    inactive.source.certifications.forEach((certification) => {
      certification.id = "00000000-0000-4000-8000-000000000902";
      certification.revisionId = inactive.revision.id;
      certification.externalKey = inactive.revision.certificationKey;
    });
    inactive.source.domains.forEach((domain) => {
      domain.revisionId = inactive.revision.id;
      domain.certificationId = inactive.source.certifications[0]?.id ?? "";
    });
    inactive.source.questions.forEach((item) => {
      item.revisionId = inactive.revision.id;
      item.certificationId = inactive.source.certifications[0]?.id ?? "";
    });

    db.seedCatalogSource(inactive.source, inactive.revision, false);
    db.seedCatalogSource(active.source, active.revision);
    await db.transaction(async (repositories) => {
      const sources = await repositories.catalog.activeCatalogSources();
      expect(sources).toHaveLength(1);
      expect(sources[0]?.revisionId).toBe(active.revision.id);
      expect(
        await repositories.catalog.generationSource(
          inactive.source.certifications[0]?.id ?? "",
        ),
      ).toBeNull();
      const generation = await repositories.catalog.generationSource(
        active.source.certifications[0]?.id ?? "",
      );
      expect(generation).toMatchObject({ revisionId: active.revision.id });
      expect(generation?.questions).toHaveLength(75);
    });
  });

  it("ships the backend DOP-C02 fixture with exactly the required allocation pools", () => {
    const source = DOP_C02_CATALOG_FIXTURE.source;
    expect(source.questions).toHaveLength(75);
    expect(source.certifications[0]).toMatchObject({
      code: "DOP-C02",
      totalQuestions: 75,
      timeLimitMinutes: 180,
      scoringMode: "all_or_nothing",
    });
    expect(source.certifications[0]?.passThreshold.displayDecimal(0)).toBe("75");
    expect(source.domains.map((domain) => domain.weightBasisPoints)).toEqual([
      2200, 1700, 1700, 1500, 1500, 1400,
    ]);
    expect(
      source.domains.map(
        (domain) => source.questions.filter((item) => item.domainId === domain.id).length,
      ),
    ).toEqual([17, 13, 13, 11, 11, 10]);
  });
});

describe("atomic imported catalog activation", () => {
  it("binds validation to actor/content/token/TTL and restores head/token on faults", async () => {
    const { ImportService, SequenceRandomSource, SequenceUuidFactory, sha256Hex } =
      await import("@cert-quiz/domain");
    const database = new InMemoryUnitOfWork();
    const ids = [
      "00000000-0000-4000-8000-000000000701",
      "00000000-0000-4000-8000-000000000702",
      "00000000-0000-4000-8000-000000000703",
      "00000000-0000-4000-8000-000000000704",
    ];
    const service = new ImportService({
      ids: new SequenceUuidFactory(ids),
      random: new SequenceRandomSource([7]),
      now: () => new Date(now),
    });
    const content = JSON.stringify({
      provider: { id: "provider", name: "Provider" },
      certification: {
        id: "cert",
        code: "CERT-IMPORT",
        name: "Import",
        totalQuestions: 1,
        timeLimitMinutes: 10,
        passThreshold: "75",
        scoringMode: "all_or_nothing",
        domains: [{ id: "domain", name: "Domain", weightPercent: "100" }],
        questions: [
          {
            id: "question",
            domainId: "domain",
            stemEn: "Stem",
            explanationEn: "Explanation",
            requiredChoiceCount: 1,
            correctChoiceIds: ["a"],
            choices: [{ id: "a", textEn: "A" }],
          },
        ],
      },
    });
    const dryRun = await service.dryRun(content, "admin-a");
    if (!dryRun.materialization?.validation || !dryRun.response.commitToken)
      throw new Error("fixture must validate");
    await database.transaction((repos) =>
      repos.catalog.saveValidation(dryRun.materialization!.validation!),
    );
    const commit = await service.materializeCommit(content, "admin-a");
    const command = {
      validationId: dryRun.materialization.validation.id,
      actorUserId: "admin-a",
      tokenDigest: await sha256Hex(dryRun.response.commitToken),
      contentHash: commit.contentHash,
      materialization: commit.materialization,
      now,
    };
    database.failNext("catalog-switch");
    await expect(
      database.transaction((repos) => repos.catalog.commitValidatedImport(command)),
    ).rejects.toThrow("catalog-switch");
    await database.transaction(async (repos) =>
      expect(await repos.catalog.activeRevision("CERT-IMPORT")).toBeNull(),
    );
    await expect(
      database.transaction((repos) => repos.catalog.commitValidatedImport(command)),
    ).resolves.toBeUndefined();
    await database.transaction(async (repos) => {
      expect((await repos.catalog.activeRevision("CERT-IMPORT"))?.contentHash).toBe(
        commit.contentHash,
      );
      expect(
        await repos.catalog.fullGenerationSource(
          commit.materialization.source.certifications[0]!.id,
        ),
      ).not.toBeNull();
    });
    const { SessionFactory } = await import("@cert-quiz/domain");
    const generation = await database.transaction((repos) =>
      repos.catalog.fullGenerationSource(
        commit.materialization.source.certifications[0]!.id,
      ),
    );
    if (!generation) throw new Error("generation fixture must be present");
    const sessions = new SessionFactory({
      ids: new SequenceUuidFactory([
        "00000000-0000-4000-8000-000000000706",
        "00000000-0000-4000-8000-000000000707",
      ]),
      random: new SequenceRandomSource([0]),
      now: () => now,
    });
    await database.transaction((repos) => sessions.createPractice(repos, "user-a", generation));
    database.failNext("practice-replace");
    await expect(
      database.transaction((repos) => sessions.createPractice(repos, "user-a", generation)),
    ).rejects.toThrow("practice-replace");
    await database.transaction(async (repos) =>
      expect((await repos.practice.findActiveOwned("user-a", "CERT-IMPORT"))?.id).toBe(
        "00000000-0000-4000-8000-000000000706",
      ),
    );
    await expect(
      database.transaction((repos) => repos.catalog.commitValidatedImport(command)),
    ).rejects.toThrow("not consumable");
    await expect(
      database.transaction((repos) =>
        repos.catalog.commitValidatedImport({ ...command, actorUserId: "admin-b" }),
      ),
    ).rejects.toThrow("not consumable");
  });
});


type ImportCommitCase = {
  actorMatches: boolean;
  tokenMatches: boolean;
  content: "same" | "canonical-equivalent" | "changed";
  expires: boolean;
  alreadyConsumed: boolean;
  fault: boolean;
};

const PROPERTY_24_RUNS = 200;
const PROPERTY_24_SEED = 20_260_319;
const importCommitCaseArbitrary = (await import("fast-check")).default.record({
  actorMatches: (await import("fast-check")).default.boolean(),
  tokenMatches: (await import("fast-check")).default.boolean(),
  content: (await import("fast-check")).default.constantFrom<ImportCommitCase["content"]>(
    "same",
    "canonical-equivalent",
    "changed",
  ),
  expires: (await import("fast-check")).default.boolean(),
  alreadyConsumed: (await import("fast-check")).default.boolean(),
  fault: (await import("fast-check")).default.boolean(),
});

function importContent(name: string): string {
  return JSON.stringify({
    provider: { id: "provider", name: "Provider" },
    certification: {
      id: "cert",
      code: "CERT-IMPORT",
      name,
      totalQuestions: 1,
      timeLimitMinutes: 10,
      passThreshold: "75",
      scoringMode: "all_or_nothing",
      domains: [{ id: "domain", name: "Domain", weightPercent: "100" }],
      questions: [
        {
          id: "question",
          domainId: "domain",
          stemEn: "Stem",
          explanationEn: "Explanation",
          requiredChoiceCount: 1,
          correctChoiceIds: ["a"],
          choices: [{ id: "a", textEn: "A" }],
        },
      ],
    },
  });
}

function canonicalEquivalentImportContent(content: string): string {
  const parsed = JSON.parse(content) as {
    provider: unknown;
    certification: unknown;
  };
  return JSON.stringify({
    certification: parsed.certification,
    provider: parsed.provider,
  });
}

// Feature: cert-quiz-mvp, Property 24: validation binding and atomic catalog switch
// **Validates: Requirements 15.20-15.28**
describe("Property 24: validation binding and atomic catalog switch", () => {
  it("commits only a matching unexpired actor-bound token once, rolls every fault back, and preserves Attempt snapshots", async () => {
    const { default: fc } = await import("fast-check");
    const { ImportService, SequenceRandomSource, SequenceUuidFactory, sha256Hex } =
      await import("@cert-quiz/domain");

    const createService = (clock: { now: Date }) =>
      new ImportService({
        ids: new SequenceUuidFactory([
          "00000000-0000-4000-8000-000000000801",
          "00000000-0000-4000-8000-000000000802",
          "00000000-0000-4000-8000-000000000803",
          "00000000-0000-4000-8000-000000000804",
          "00000000-0000-4000-8000-000000000805",
          "00000000-0000-4000-8000-000000000806",
          "00000000-0000-4000-8000-000000000807",
          "00000000-0000-4000-8000-000000000808",
          "00000000-0000-4000-8000-000000000809",
          "00000000-0000-4000-8000-000000000810",
          "00000000-0000-4000-8000-000000000811",
          "00000000-0000-4000-8000-000000000812",
        ]),
        random: new SequenceRandomSource(
          Array.from({ length: 64 }, (_, index) => (index + 7) % 256),
        ),
        now: () => new Date(clock.now),
      });

    await fc.assert(
      fc.asyncProperty(importCommitCaseArbitrary, async (input) => {
        const database = new InMemoryUnitOfWork();
        const clock = { now: new Date(now) };
        const service = createService(clock);
        const actor = "admin-a";
        const initialContent = importContent("Initial revision");
        const targetContent = importContent("Target revision");
        const changedContent = importContent("Changed revision");

        const prepare = async (content: string) => {
          const dryRun = await service.dryRun(content, actor);
          if (!dryRun.materialization?.validation || !dryRun.response.commitToken)
            throw new Error("The generated import fixture must validate.");
          await database.transaction((repos) =>
            repos.catalog.saveValidation(dryRun.materialization!.validation!),
          );
          const materialized = await service.materializeCommit(content, actor);
          return {
            command: {
              validationId: dryRun.materialization.validation.id,
              actorUserId: actor,
              tokenDigest: await sha256Hex(dryRun.response.commitToken),
              contentHash: materialized.contentHash,
              materialization: materialized.materialization,
              now: new Date(clock.now),
            },
          };
        };

        const initial = await prepare(initialContent);
        await database.transaction((repos) => repos.catalog.commitValidatedImport(initial.command));
        await database.transaction((repos) =>
          repos.exams.createWithSnapshots({
            id: "property-24-exam",
            userId: "learner",
            certificationKey: "CERT-IMPORT",
            startRequestKey: "property-24-request",
            currentIndex: 0,
            startedAt: now,
            expiresAt: later(1),
            questions: [question("property-24-snapshot")],
          }),
        );
        await database.transaction((repos) =>
          repos.exams.finalizeOnce({
            id: "property-24-attempt",
            userId: "learner",
            sessionId: "property-24-exam",
            rawScore: Fraction.of(1n),
            accuracyRate: Fraction.of(100n),
            passThreshold: Fraction.of(75n),
            passed: true,
            reference1000Score: 1000,
            submittedAt: later(1),
            submissionReason: "manual",
          }),
        );
        const attemptBefore = await database.transaction((repos) =>
          repos.history.getAttemptOwned("learner", "property-24-attempt"),
        );
        if (!attemptBefore) throw new Error("Attempt fixture must persist its snapshot.");

        const target = await prepare(targetContent);
        if (input.alreadyConsumed)
          await database.transaction((repos) =>
            repos.catalog.commitValidatedImport(target.command),
          );

        const alternate =
          input.content === "changed"
            ? await service.materializeCommit(changedContent, actor)
            : input.content === "canonical-equivalent"
              ? await service.materializeCommit(
                  canonicalEquivalentImportContent(targetContent),
                  actor,
                )
              : null;
        const command = {
          ...target.command,
          actorUserId: input.actorMatches ? actor : "admin-b",
          tokenDigest: input.tokenMatches ? target.command.tokenDigest : "f".repeat(64),
          contentHash: alternate?.contentHash ?? target.command.contentHash,
          materialization: alternate?.materialization ?? target.command.materialization,
          now: input.expires
            ? later(0.25)
            : new Date(now.getTime() + 15 * 60 * 1_000 - 1),
        };
        if (input.expires) command.now = new Date(now.getTime() + 15 * 60 * 1_000);

        const headBefore = await database.transaction((repos) =>
          repos.catalog.activeRevision("CERT-IMPORT"),
        );
        const reachesCatalogSwitch =
          input.actorMatches &&
          input.tokenMatches &&
          input.content !== "changed" &&
          !input.expires &&
          !input.alreadyConsumed;
        const expectedSuccess = reachesCatalogSwitch && !input.fault;
        if (input.fault && reachesCatalogSwitch)
          database.failNext("catalog-switch");

        const commit = database.transaction((repos) =>
          repos.catalog.commitValidatedImport(command),
        );
        if (expectedSuccess) await expect(commit).resolves.toBeUndefined();
        else await expect(commit).rejects.toThrow();

        const headAfter = await database.transaction((repos) =>
          repos.catalog.activeRevision("CERT-IMPORT"),
        );
        const sources = await database.transaction((repos) =>
          repos.catalog.activeCatalogSources(),
        );
        const attemptAfter = await database.transaction((repos) =>
          repos.history.getAttemptOwned("learner", "property-24-attempt"),
        );
        expect(attemptAfter).toEqual(attemptBefore);
        expect(sources).toHaveLength(1);
        expect(sources[0]?.revisionId).toBe(headAfter?.id);

        if (expectedSuccess) {
          expect(headAfter?.id).toBe(command.materialization.revision.id);
          await expect(
            database.transaction((repos) => repos.catalog.commitValidatedImport(command)),
          ).rejects.toThrow("not consumable");
          return;
        }

        expect(headAfter).toEqual(headBefore);
        if (input.expires || input.alreadyConsumed) {
          await expect(
            database.transaction((repos) => repos.catalog.commitValidatedImport(command)),
          ).rejects.toThrow("not consumable");
          return;
        }

        // Rejected binding and injected-fault paths retain the unused validation for one valid retry.
        await expect(
          database.transaction((repos) => repos.catalog.commitValidatedImport(target.command)),
        ).resolves.toBeUndefined();
      }),
      { numRuns: PROPERTY_24_RUNS, seed: PROPERTY_24_SEED },
    );
  }, 120_000);
});
