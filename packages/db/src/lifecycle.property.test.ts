import fc from "fast-check";
import {
  FixedClock,
  Fraction,
  LifecycleServices,
  SequenceRandomSource,
  SequenceUuidFactory,
  SessionFactory,
  type FullCatalogGenerationSource,
  type UserProfile,
} from "@cert-quiz/domain";
import { describe, expect, it } from "vitest";

import { InMemoryUnitOfWork } from "./in-memory-unit-of-work.js";

const base = new Date("2026-01-01T00:00:00.000Z");
const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const CERTIFICATION_ID = id(2);
const QUESTION_ID = id(20);
const CHOICE_A = id(30);
const CHOICE_B = id(31);
const USER_A = id(100);
const USER_B = id(101);

function source(): FullCatalogGenerationSource {
  return {
    revisionId: id(1),
    certification: {
      id: CERTIFICATION_ID,
      revisionId: id(1),
      providerId: id(3),
      externalKey: "CERT",
      code: "CERT",
      name: "Offline certification",
      totalQuestions: 1,
      timeLimitMinutes: 1,
      passThreshold: Fraction.fromInteger(75n),
      scoringMode: "all_or_nothing",
    },
    provider: { id: id(3), revisionId: id(1), name: "Provider", logoUrl: null },
    domains: [
      {
        id: id(4),
        revisionId: id(1),
        certificationId: CERTIFICATION_ID,
        name: "Domain",
        weightBasisPoints: 10_000,
        orderIndex: 0,
      },
    ],
    questions: [
      {
        id: QUESTION_ID,
        revisionId: id(1),
        certificationId: CERTIFICATION_ID,
        domainId: id(4),
        domainName: "Domain",
        stem: { en: "Question", ko: null },
        explanation: { en: "Explanation", ko: null },
        choices: [
          { id: CHOICE_A, externalId: "a", text: { en: "A", ko: null } },
          { id: CHOICE_B, externalId: "b", text: { en: "B", ko: null } },
        ],
        correctChoiceIndexes: [0],
        requiredChoiceCount: 1,
        translationStatus: "en_only",
      },
    ],
  };
}

function profile(userId: string, visible = false): UserProfile {
  return {
    id: userId,
    googleSub: userId,
    displayName: `User ${userId.slice(-1)}`,
    email: `${userId}@example.test`,
    role: "user",
    approvalStatus: "approved",
    scorePublic: visible,
    firstLoginAt: base,
    approvedAt: base,
    version: 0n,
  };
}

function fixture() {
  const database = new InMemoryUnitOfWork();
  const catalog = source();
  database.seedCatalogSource(
    {
      revisionId: catalog.revisionId,
      certificationKey: catalog.certification.externalKey,
      providers: [catalog.provider],
      certifications: [catalog.certification],
      domains: catalog.domains,
      questions: catalog.questions.map(
        ({ id: questionId, revisionId, certificationId, domainId }) => ({
          id: questionId,
          revisionId,
          certificationId,
          domainId,
        }),
      ),
    },
    {
      id: catalog.revisionId,
      certificationKey: "CERT",
      contentHash: "a".repeat(64),
      importedBy: USER_A,
      importedAt: base,
      document: {},
    },
  );
  database.seedFullGenerationSource(catalog);
  database.seedUser(profile(USER_A, true));
  database.seedUser(profile(USER_B, true));
  const clock = new FixedClock(base);
  let next = 200;
  const ids = new SequenceUuidFactory(Array.from({ length: 2000 }, () => id(next++)));
  const service = new LifecycleServices({
    unitOfWork: database,
    sessionFactory: new SessionFactory({
      ids,
      random: new SequenceRandomSource([0]),
      now: () => clock.now(),
    }),
    now: () => clock.now(),
    createId: () => id(next++),
  });
  return { database, clock, service };
}

async function createdPractice(service: LifecycleServices) {
  const started = await service.startPractice(USER_A, CERTIFICATION_ID);
  if (started.kind !== "created") throw new Error("expected created practice");
  return started.practiceSessionId;
}
async function createdExam(service: LifecycleServices, key = "exam-key") {
  return service.startExam(USER_A, CERTIFICATION_ID, key);
}

// Feature: cert-quiz-mvp, Property 11: active practice singleton, resume, replace, and versioned state
// This is an in-memory adapter model test; it does not establish SQL/production transaction semantics.
describe("offline lifecycle properties", () => {
  it("P11 keeps one active practice and rejects stale state writes", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (replace) => {
        const { service } = fixture();
        const first = await service.startPractice(USER_A, CERTIFICATION_ID);
        expect(first.kind).toBe("created");
        const resumed = await service.startPractice(USER_A, CERTIFICATION_ID);
        expect(resumed.kind).toBe("resume-or-replace-required");
        if (replace) {
          const replacement = await service.replacePractice(
            USER_A,
            CERTIFICATION_ID,
            "confirm",
          );
          expect(replacement.kind).toBe("created");
          expect(replacement).not.toMatchObject(first);
        }
        const sessionId =
          replace && first.kind === "created"
            ? (
                (await service.startPractice(USER_A, CERTIFICATION_ID)) as {
                  kind: "resume-or-replace-required";
                  session: { practiceSessionId: string };
                }
              ).session.practiceSessionId
            : first.kind === "created"
              ? first.practiceSessionId
              : "";
        const resumedState = await service.resumePractice(USER_A, sessionId);
        await service.patchPractice(USER_A, sessionId, {
          expectedVersion: resumedState.stateVersion,
          currentIndex: 0,
        });
        await expect(
          service.patchPractice(USER_A, sessionId, {
            expectedVersion: resumedState.stateVersion,
            currentIndex: 0,
          }),
        ).rejects.toMatchObject({ error: { code: "stale-version" } });
      }),
      { numRuns: 200 },
    );
  });

  it("P12 locks an exact first practice answer and only allows same-set replay", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(CHOICE_A, CHOICE_B), async (choice) => {
        const { service } = fixture();
        const sessionId = await createdPractice(service);
        const first = await service.submitPractice(
          USER_A,
          sessionId,
          QUESTION_ID,
          [choice],
          0,
        );
        const replay = await service.submitPractice(
          USER_A,
          sessionId,
          QUESTION_ID,
          [choice],
          1,
        );
        expect(replay.question).toEqual(first.question);
        const different = choice === CHOICE_A ? CHOICE_B : CHOICE_A;
        await expect(
          service.submitPractice(USER_A, sessionId, QUESTION_ID, [different], 1),
        ).rejects.toMatchObject({ error: { code: "conflict" } });
      }),
      { numRuns: 200 },
    );
  });

  it("P13 projects reveal only after submit and commits one completed result", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(CHOICE_A), async (choice) => {
        const { service } = fixture();
        const sessionId = await createdPractice(service);
        const before = await service.resumePractice(USER_A, sessionId);
        expect(before.questions[0]).not.toHaveProperty("correctChoiceIds");
        const submitted = await service.submitPractice(
          USER_A,
          sessionId,
          QUESTION_ID,
          [choice],
          0,
        );
        expect(submitted.question).toHaveProperty("correctChoiceIds");
        expect(submitted.completedPracticeResultId).toBeDefined();
        const replay = await service.submitPractice(
          USER_A,
          sessionId,
          QUESTION_ID,
          [choice],
          1,
        );
        expect(replay.completedPracticeResultId).toBe(
          submitted.completedPracticeResultId,
        );
      }),
      { numRuns: 200 },
    );
  });

  it("P14 enforces the [completedAt, completedAt+168h) practice-result window", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 1 }), async (boundary) => {
        const { clock, service } = fixture();
        const sessionId = await createdPractice(service);
        const submitted = await service.submitPractice(
          USER_A,
          sessionId,
          QUESTION_ID,
          [CHOICE_A],
          0,
        );
        const resultId = submitted.completedPracticeResultId!;
        clock.advance(168 * 60 * 60 * 1000 - boundary);
        if (boundary === 1)
          await expect(
            service.getPracticeResult(USER_A, resultId),
          ).resolves.toMatchObject({ resultId });
        else
          await expect(
            service.getPracticeResult(USER_A, resultId),
          ).rejects.toMatchObject({ error: { code: "expired" } });
      }),
      { numRuns: 200 },
    );
  });

  it("P15 uses server timestamps and idempotent exam start", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 61_000 }), async (elapsed) => {
        const { clock, service } = fixture();
        const first = await createdExam(service, "same-key");
        clock.advance(elapsed);
        const replay = await createdExam(service, "same-key");
        expect(replay.examSessionId).toBe(first.examSessionId);
        const restored = await service.getExam(USER_A, first.examSessionId);
        if (restored.kind === "exam-active-session")
          expect(restored.remainingSeconds).toBe(
            Math.max(0, Math.floor((60_000 - elapsed) / 1000)),
          );
      }),
      { numRuns: 200 },
    );
  });

  it("P16 restores only active-safe exam projections and server preview counts", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (flagged) => {
        const { service } = fixture();
        const started = await createdExam(service);
        const saved = await service.patchExam(USER_A, started.examSessionId, {
          expectedVersion: 0,
          answer: { questionId: QUESTION_ID, selectedChoiceIds: [CHOICE_A] },
          flag: { questionId: QUESTION_ID, flagged },
        });
        expect(saved.stateVersion).toBe(1);
        const preview = await service.previewExam(USER_A, started.examSessionId);
        expect(preview).toMatchObject({
          unansweredQuestionCount: 0,
          flaggedQuestionCount: flagged ? 1 : 0,
        });
        const restored = await service.getExam(USER_A, started.examSessionId);
        if (restored.kind === "exam-active-session")
          expect(restored.questions[0]).not.toHaveProperty("correctChoiceIds");
      }),
      { numRuns: 200 },
    );
  });

  it("P17 lazily finalizes only when an owner request invokes the finalizer", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(undefined), async () => {
        const { clock, service } = fixture();
        const started = await createdExam(service);
        clock.advance(60_000);
        const before = await service.getExam(USER_A, started.examSessionId);
        expect(before.kind).toBe("exam-active-session");
        await service.finalizeExpiredOwned(USER_A);
        const after = await service.getExam(USER_A, started.examSessionId);
        expect(after.kind).toBe("exam-finalized");
      }),
      { numRuns: 200 },
    );
  });

  it("P18 converges concurrent manual finalize calls on one immutable attempt", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(undefined), async () => {
        const { service } = fixture();
        const started = await createdExam(service);
        const [left, right] = await Promise.all([
          service.submitExam(USER_A, started.examSessionId),
          service.submitExam(USER_A, started.examSessionId),
        ]);
        expect(left.attemptId).toBe(right.attemptId);
      }),
      { numRuns: 200 },
    );
  });

  it("P21 keeps owner history ordered independently from practice results", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 3 }), async (count) => {
        const { clock, service } = fixture();
        for (let index = 0; index < count; index += 1) {
          const started = await createdExam(service, `history-${index}`);
          await service.submitExam(USER_A, started.examSessionId);
          clock.advance(1);
        }
        const history = await service.history(USER_A);
        expect(history.attempts).toHaveLength(count);
        expect(history.attempts.map((item) => item.submittedAt)).toEqual(
          [...history.attempts.map((item) => item.submittedAt)].sort().reverse(),
        );
      }),
      { numRuns: 200 },
    );
  });

  it("P22 selects public candidates by exact score and marks only the current user", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(undefined), async () => {
        const { database, service } = fixture();
        const started = await createdExam(service, "leader-a");
        await service.submitExam(USER_A, started.examSessionId);
        const ownerExam = await database.transaction((repos) =>
          repos.exams.getOwned(USER_A, started.examSessionId),
        );
        if (!ownerExam) throw new Error("owner exam must exist");
        await database.transaction((repos) =>
          repos.exams.createWithSnapshots({
            id: id(700),
            userId: USER_B,
            certificationKey: "CERT",
            startRequestKey: "leader-b",
            currentIndex: 0,
            startedAt: base,
            expiresAt: new Date(base.getTime() + 60_000),
            questions: [
              {
                id: QUESTION_ID,
                displayIndex: 0,
                content: ownerExam.questions[0]!.content,
                selectedChoiceIds: [],
                finalChoiceIds: null,
                earnedScore: null,
                flagged: false,
                version: 0n,
              },
            ],
          }),
        );
        await database.transaction((repos) =>
          repos.exams.finalizeOnce({
            id: id(701),
            userId: USER_B,
            sessionId: id(700),
            rawScore: Fraction.fromInteger(0n),
            accuracyRate: Fraction.fromInteger(0n),
            passThreshold: Fraction.fromInteger(75n),
            passed: false,
            reference1000Score: 0,
            submittedAt: base,
            submissionReason: "manual",
          }),
        );
        const leaderboard = await service.leaderboard(CERTIFICATION_ID, USER_A);
        expect(leaderboard.entries).toHaveLength(2);
        expect(leaderboard.entries.filter((entry) => entry.isCurrentUser)).toHaveLength(
          1,
        );
        expect(leaderboard.entries[0]?.rank).toBe(1);
      }),
      { numRuns: 200 },
    );
  });
});
