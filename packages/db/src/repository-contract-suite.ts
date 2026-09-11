import { afterEach, describe, expect, it } from "vitest";
import {
  Fraction,
  type NewPracticeSession,
  type PersistedQuestionSnapshot,
  type UnitOfWork,
} from "@cert-quiz/domain";

export type RepositoryContractHarness = {
  unitOfWork: UnitOfWork;
  /** Prepares the active certification row required by production session writes. */
  prepareActiveCertification(userId: string): Promise<void>;
  cleanup(): Promise<void>;
};

export type RepositoryContractHarnessFactory = () => Promise<RepositoryContractHarness>;

export type RepositoryContractSuiteOptions = Readonly<{
  /** Allows opt-in DSQL setup/migration/assert/cleanup without weakening assertions. */
  timeout?: number;
}>;

const now = new Date("2026-01-01T00:00:00.000Z");
const later = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000);
const uuid = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const ids = {
  userA: uuid(1),
  userB: uuid(2),
  practiceOld: uuid(11),
  practiceNew: uuid(12),
  practice: uuid(13),
  practiceQuestion: uuid(14),
  result: uuid(15),
  exam: uuid(21),
  examQuestion: uuid(22),
  attempt: uuid(23),
  rollbackUser: uuid(31),
} as const;

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
  userId = ids.userA,
  certificationKey = "cert-a",
  questionId = ids.practiceQuestion,
): NewPracticeSession {
  return {
    id,
    userId,
    certificationKey,
    currentIndex: 0,
    questions: [question(questionId)],
    createdAt: now,
  };
}

async function identity(
  unitOfWork: UnitOfWork,
  id = ids.userA,
  googleSub = id,
): Promise<void> {
  await unitOfWork.transaction((repos) =>
    repos.users.getOrCreatePendingByGoogleSub({
      id,
      googleSub,
      displayName: id,
      email: `${id}@example.test`,
      now,
    }),
  );
}

/**
 * Adapter-neutral aggregate behavior. Each adapter gets a freshly migrated and
 * seeded store, letting the same assertions cover copy-on-write and DSQL SQL
 * implementations without making normal unit test runs depend on AWS.
 */
export function describeRepositoryContractSuite(
  adapterName: string,
  createHarness: RepositoryContractHarnessFactory,
  options: RepositoryContractSuiteOptions = {},
): void {
  describe(`${adapterName} aggregate repository contract`, { timeout: options.timeout }, () => {
    let harness: RepositoryContractHarness | undefined;

    async function fresh(): Promise<RepositoryContractHarness> {
      harness = await createHarness();
      return harness;
    }

    afterEach(
      async () => {
        await harness?.cleanup();
        harness = undefined;
      },
      options.timeout,
    );

    it("converges repeated profile creation to one pending/private profile", async () => {
      const { unitOfWork } = await fresh();
      const profiles = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          unitOfWork.transaction((repos) =>
            repos.users.getOrCreatePendingByGoogleSub({
              id: uuid(100 + index),
              googleSub: "google-subject",
              displayName: `Name ${index}`,
              email: `name-${index}@example.test`,
              now,
            }),
          ),
        ),
      );
      const profileIds = new Set(profiles.map((profile) => profile.id));
      expect(profileIds).toHaveLength(1);
      expect(profiles[0]).toMatchObject({
        approvalStatus: "pending",
        role: "user",
        scorePublic: false,
      });
    });

    it("enforces owner scope and maintains one active practice slot", async () => {
      const { unitOfWork, prepareActiveCertification } = await fresh();
      await identity(unitOfWork, ids.userA);
      await identity(unitOfWork, ids.userB);
      await prepareActiveCertification(ids.userA);
      const first = await unitOfWork.transaction((repos) =>
        repos.practice.replaceAtomically(practice(ids.practiceOld)),
      );
      const replacement = await unitOfWork.transaction((repos) =>
        repos.practice.replaceAtomically(practice(ids.practiceNew)),
      );
      expect(first.id).toBe(ids.practiceOld);
      expect(replacement.id).toBe(ids.practiceNew);
      await unitOfWork.transaction(async (repos) => {
        expect(await repos.practice.findActiveOwned(ids.userA, "cert-a")).toMatchObject({
          id: ids.practiceNew,
        });
        expect(await repos.practice.findActiveOwned(ids.userB, "cert-a")).toBeNull();
        expect(await repos.practice.listActiveOwned(ids.userA)).toMatchObject([
          { id: ids.practiceNew, certificationKey: "cert-a", status: "active" },
        ]);
        expect(await repos.practice.listActiveOwned(ids.userB)).toEqual([]);
      });
    });

    it("persists exact fractions, locks the first answer, and hides expired results", async () => {
      const { unitOfWork, prepareActiveCertification } = await fresh();
      await identity(unitOfWork);
      await prepareActiveCertification(ids.userA);
      await unitOfWork.transaction((repos) =>
        repos.practice.replaceAtomically(practice(ids.practice)),
      );
      const completedAt = later(1);
      const first = await unitOfWork.transaction((repos) =>
        repos.practice.submitFirstAnswer({
          userId: ids.userA,
          sessionId: ids.practice,
          expectedVersion: 0n,
          questionId: ids.practiceQuestion,
          selectedChoiceIds: ["a"],
          earnedScore: Fraction.of(1n, 3n),
          completedResult: {
            id: ids.result,
            rawScore: Fraction.of(1n, 3n),
            accuracyRate: Fraction.of(100n, 3n),
            completedAt,
            expiresAt: later(169),
            payload: { stable: true },
          },
        }),
      );
      expect(first?.result?.rawScore.equals(Fraction.of(1n, 3n))).toBe(true);
      const replay = await unitOfWork.transaction((repos) =>
        repos.practice.submitFirstAnswer({
          userId: ids.userA,
          sessionId: ids.practice,
          expectedVersion: 1n,
          questionId: ids.practiceQuestion,
          selectedChoiceIds: ["b"],
          earnedScore: Fraction.of(0n),
        }),
      );
      expect(replay).toMatchObject({ firstSubmission: false });
      expect(replay?.session.questions[0]?.finalChoiceIds).toEqual(["a"]);
      await unitOfWork.transaction(async (repos) => {
        expect(await repos.practice.getCompletedOwned(ids.userB, ids.result, later(2))).toBeNull();
        expect(await repos.practice.getCompletedOwned(ids.userA, ids.result, later(2))).toMatchObject({
          id: ids.result,
        });
        expect(await repos.practice.getCompletedOwned(ids.userA, ids.result, later(169))).toBeNull();
      });
    });

    it("finalizes each exam once and returns its immutable attempt on replay", async () => {
      const { unitOfWork, prepareActiveCertification } = await fresh();
      await identity(unitOfWork);
      await prepareActiveCertification(ids.userA);
      await unitOfWork.transaction((repos) =>
        repos.exams.createWithSnapshots({
          id: ids.exam,
          userId: ids.userA,
          certificationKey: "cert-a",
          startRequestKey: "request-1",
          currentIndex: 0,
          startedAt: now,
          expiresAt: later(3),
          questions: [question(ids.examQuestion)],
        }),
      );
      const command = {
        id: ids.attempt,
        userId: ids.userA,
        sessionId: ids.exam,
        rawScore: Fraction.of(1n, 3n),
        accuracyRate: Fraction.of(100n, 3n),
        passThreshold: Fraction.of(75n),
        passed: false,
        reference1000Score: 333,
        submittedAt: later(1),
        submissionReason: "manual" as const,
      };
      const first = await unitOfWork.transaction((repos) => repos.exams.finalizeOnce(command));
      const replay = await unitOfWork.transaction((repos) =>
        repos.exams.finalizeOnce({ ...command, id: uuid(24) }),
      );
      expect(first?.id).toBe(ids.attempt);
      expect(replay?.id).toBe(ids.attempt);
      await unitOfWork.transaction(async (repos) => {
        expect(await repos.exams.getOwned(ids.userB, ids.exam)).toBeNull();
        expect(await repos.exams.getOwned(ids.userA, ids.exam)).toMatchObject({
          status: "submitted",
          attemptId: ids.attempt,
        });
      });
    });

    it("rolls back an aborted aggregate transaction", async () => {
      const { unitOfWork } = await fresh();
      await expect(
        unitOfWork.transaction(async (repos) => {
          await repos.users.getOrCreatePendingByGoogleSub({
            id: ids.rollbackUser,
            googleSub: "rollback-user",
            displayName: "Rollback",
            email: "rollback@example.test",
            now,
          });
          throw new Error("abort aggregate transaction");
        }),
      ).rejects.toThrow("abort aggregate transaction");
      await unitOfWork.transaction(async (repos) => {
        expect(await repos.users.findPending()).toEqual([]);
      });
    });
  });
}
