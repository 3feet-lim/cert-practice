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

const now = new Date("2026-01-01T00:00:00.000Z");
const later = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000);

function question(id: string, displayIndex = 0): PersistedQuestionSnapshot {
  return {
    id,
    displayIndex,
    content: { id, stem: "immutable" },
    selectedChoiceIds: [],
    finalChoiceIds: null,
    earnedScore: null,
    flagged: false,
    version: 0n,
  };
}

function practice(
  id: string,
  userId = "user-a",
  certificationKey = "cert-a",
): NewPracticeSession {
  return {
    id,
    userId,
    certificationKey,
    currentIndex: 0,
    questions: [question(`${id}-q`)],
    createdAt: now,
  };
}

async function identity(
  db: InMemoryUnitOfWork,
  id = "user-a",
  googleSub = id,
): Promise<void> {
  await db.transaction((repos) =>
    repos.users.getOrCreatePendingByGoogleSub({
      id,
      googleSub,
      displayName: id,
      email: `${id}@example.test`,
      now,
    }),
  );
}

describe("in-memory aggregate repository contract", () => {
  it("converges concurrent profile creation to one pending/private profile", async () => {
    const db = new InMemoryUnitOfWork();
    const profiles = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        db.transaction((repos) =>
          repos.users.getOrCreatePendingByGoogleSub({
            id: `candidate-${index}`,
            googleSub: "google-subject",
            displayName: `Name ${index}`,
            email: `name-${index}@example.test`,
            now,
          }),
        ),
      ),
    );
    expect(new Set(profiles.map((profile) => profile.id))).toEqual(
      new Set(["candidate-0"]),
    );
    expect(profiles[0]).toMatchObject({
      approvalStatus: "pending",
      role: "user",
      scorePublic: false,
    });
  });

  it("enforces owner scope and one active practice slot", async () => {
    const db = new InMemoryUnitOfWork();
    await Promise.all([identity(db, "user-a"), identity(db, "user-b")]);
    const [first, replacement] = await Promise.all([
      db.transaction((repos) =>
        repos.practice.replaceAtomically(practice("practice-old")),
      ),
      db.transaction((repos) =>
        repos.practice.replaceAtomically(practice("practice-new")),
      ),
    ]);
    expect(first.id).toBe("practice-old");
    expect(replacement.id).toBe("practice-new");
    await db.transaction(async (repos) => {
      expect(await repos.practice.findActiveOwned("user-a", "cert-a")).toMatchObject({
        id: "practice-new",
      });
      expect(await repos.practice.findActiveOwned("user-b", "cert-a")).toBeNull();
    });
  });

  it("persists exact fractions and locks the first submitted practice answer", async () => {
    const db = new InMemoryUnitOfWork();
    await identity(db);
    await db.transaction((repos) =>
      repos.practice.replaceAtomically(practice("practice-1")),
    );
    const completedAt = later(1);
    const first = await db.transaction((repos) =>
      repos.practice.submitFirstAnswer({
        userId: "user-a",
        sessionId: "practice-1",
        expectedVersion: 0n,
        questionId: "practice-1-q",
        selectedChoiceIds: ["a"],
        earnedScore: Fraction.of(1n, 3n),
        completedResult: {
          id: "result-1",
          rawScore: Fraction.of(1n, 3n),
          accuracyRate: Fraction.of(100n, 3n),
          completedAt,
          expiresAt: later(169),
          payload: { stable: true },
        },
      }),
    );
    expect(first?.result?.rawScore.equals(Fraction.of(1n, 3n))).toBe(true);
    const replay = await db.transaction((repos) =>
      repos.practice.submitFirstAnswer({
        userId: "user-a",
        sessionId: "practice-1",
        expectedVersion: 1n,
        questionId: "practice-1-q",
        selectedChoiceIds: ["b"],
        earnedScore: Fraction.of(0n),
      }),
    );
    expect(replay).toMatchObject({ firstSubmission: false });
    expect(replay?.session.questions[0]?.finalChoiceIds).toEqual(["a"]);
    await db.transaction(async (repos) => {
      expect(
        await repos.practice.getCompletedOwned("user-b", "result-1", later(2)),
      ).toBeNull();
      expect(
        await repos.practice.getCompletedOwned("user-a", "result-1", later(2)),
      ).toMatchObject({ id: "result-1" });
      expect(
        await repos.practice.getCompletedOwned("user-a", "result-1", later(169)),
      ).toBeNull();
    });
  });

  it("returns a single idempotent attempt under concurrent finalization", async () => {
    const db = new InMemoryUnitOfWork();
    await identity(db);
    await db.transaction((repos) =>
      repos.exams.createWithSnapshots({
        id: "exam-1",
        userId: "user-a",
        certificationKey: "cert-a",
        startRequestKey: "request-1",
        currentIndex: 0,
        startedAt: now,
        expiresAt: later(3),
        questions: [question("exam-q")],
      }),
    );
    const finalize = (id: string) =>
      db.transaction((repos) =>
        repos.exams.finalizeOnce({
          id,
          userId: "user-a",
          sessionId: "exam-1",
          rawScore: Fraction.of(1n, 3n),
          accuracyRate: Fraction.of(100n, 3n),
          passThreshold: Fraction.of(75n),
          passed: false,
          reference1000Score: 333,
          submittedAt: later(1),
          submissionReason: "manual",
        }),
      );
    const [first, second] = await Promise.all([
      finalize("attempt-1"),
      finalize("attempt-2"),
    ]);
    expect(first?.id).toBe("attempt-1");
    expect(second?.id).toBe("attempt-1");
    await db.transaction(async (repos) => {
      expect(await repos.exams.getOwned("user-b", "exam-1")).toBeNull();
      expect(await repos.exams.getOwned("user-a", "exam-1")).toMatchObject({
        status: "submitted",
        attemptId: "attempt-1",
      });
    });
  });

  it("rolls back each injected write failure, including an atomic catalog-head switch", async () => {
    const db = new InMemoryUnitOfWork();
    db.failNext("profile-write");
    await expect(identity(db)).rejects.toThrow("profile-write");
    await db.transaction(async (repos) =>
      expect(await repos.users.findPending()).toEqual([]),
    );
    await identity(db);

    await db.transaction((repos) =>
      repos.practice.replaceAtomically(practice("practice-old")),
    );
    db.failNext("practice-replace");
    await expect(
      db.transaction((repos) =>
        repos.practice.replaceAtomically(practice("practice-new")),
      ),
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
    await expect(
      db.transaction((repos) => repos.exams.finalizeOnce(command)),
    ).rejects.toThrow("exam-finalize");
    await db.transaction(async (repos) =>
      expect(await repos.exams.getOwned("user-a", "exam-fault")).toMatchObject({
        status: "active",
        attemptId: null,
      }),
    );
    await expect(
      db.transaction((repos) => repos.exams.finalizeOnce(command)),
    ).resolves.toMatchObject({ id: "attempt-fault" });
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
    inactive.source.questions.forEach((question) => {
      question.revisionId = inactive.revision.id;
      question.certificationId = inactive.source.certifications[0]?.id ?? "";
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
      expect(
        generation?.questions.every(
          (question) =>
            question.revisionId === active.revision.id &&
            question.certificationId === active.source.certifications[0]?.id,
        ),
      ).toBe(true);
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
        (domain) =>
          source.questions.filter((question) => question.domainId === domain.id).length,
      ),
    ).toEqual([17, 13, 13, 11, 11, 10]);
  });
});

describe("atomic imported catalog activation", () => {
  it("binds the validation to actor/content/token/TTL and restores head/token on faults", async () => {
    const { ImportService, SequenceRandomSource, SequenceUuidFactory } =
      await import("@cert-quiz/domain");
    const database = new InMemoryUnitOfWork();
    const now = new Date("2026-01-01T00:00:00.000Z");
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
    const { sha256Hex } = await import("@cert-quiz/domain");
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
    await database.transaction((repos) =>
      sessions.createPractice(repos, "user-a", generation),
    );
    database.failNext("practice-replace");
    await expect(
      database.transaction((repos) =>
        sessions.createPractice(repos, "user-a", generation),
      ),
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
