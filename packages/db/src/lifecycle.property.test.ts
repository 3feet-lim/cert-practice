import fc from "fast-check";
import {
  FixedClock,
  Fraction,
  isDomainFailure,
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

type SourceOptions = {
  revisionId?: string;
  certificationId?: string;
  certificationKey?: string;
  providerId?: string;
  domainId?: string;
  questionId?: string;
  choiceA?: string;
  choiceB?: string;
  code?: string;
  name?: string;
  providerName?: string;
  domainName?: string;
  stem?: string;
  explanation?: string;
};

function source(options: SourceOptions = {}): FullCatalogGenerationSource {
  const revisionId = options.revisionId ?? id(1);
  const certificationId = options.certificationId ?? CERTIFICATION_ID;
  const providerId = options.providerId ?? id(3);
  const domainId = options.domainId ?? id(4);
  const questionId = options.questionId ?? QUESTION_ID;
  const choiceA = options.choiceA ?? CHOICE_A;
  const choiceB = options.choiceB ?? CHOICE_B;
  return {
    revisionId,
    certification: {
      id: certificationId,
      revisionId,
      providerId,
      externalKey: options.certificationKey ?? "CERT",
      code: options.code ?? "CERT",
      name: options.name ?? "Offline certification",
      totalQuestions: 1,
      timeLimitMinutes: 1,
      passThreshold: Fraction.fromInteger(75n),
      scoringMode: "all_or_nothing",
    },
    provider: {
      id: providerId,
      revisionId,
      name: options.providerName ?? "Provider",
      logoUrl: null,
    },
    domains: [
      {
        id: domainId,
        revisionId,
        certificationId,
        name: options.domainName ?? "Domain",
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
        domainName: options.domainName ?? "Domain",
        stem: { en: options.stem ?? "Question", ko: null },
        explanation: { en: options.explanation ?? "Explanation", ko: null },
        choices: [
          { id: choiceA, externalId: "a", text: { en: "A", ko: null } },
          { id: choiceB, externalId: "b", text: { en: "B", ko: null } },
        ],
        correctChoiceIndexes: [0],
        requiredChoiceCount: 1,
        translationStatus: "en_only",
      },
    ],
  };
}

function seedCatalog(
  database: InMemoryUnitOfWork,
  catalog: FullCatalogGenerationSource,
): void {
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
      certificationKey: catalog.certification.externalKey,
      contentHash: catalog.revisionId.replaceAll("-", "").padEnd(64, "a").slice(0, 64),
      importedBy: USER_A,
      importedAt: base,
      document: {},
    },
  );
  database.seedFullGenerationSource(catalog);
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

function fixture(attemptIds: readonly string[] = []) {
  const database = new InMemoryUnitOfWork();
  const catalog = source();
  seedCatalog(database, catalog);
  database.seedUser(profile(USER_A, true));
  database.seedUser(profile(USER_B, true));
  const clock = new FixedClock(base);
  let next = 200;
  const ids = new SequenceUuidFactory(Array.from({ length: 2000 }, () => id(next++)));
  const queuedAttemptIds = [...attemptIds];
  const service = new LifecycleServices({
    unitOfWork: database,
    sessionFactory: new SessionFactory({
      ids,
      random: new SequenceRandomSource([0]),
      now: () => clock.now(),
    }),
    now: () => clock.now(),
    createId: () => queuedAttemptIds.shift() ?? id(next++),
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

async function analyticsSnapshot(service: LifecycleServices) {
  const [history, trends, leaderboard] = await Promise.all([
    service.history(USER_A),
    service.trends(USER_A),
    service.leaderboard(CERTIFICATION_ID, USER_A),
  ]);
  return { history, trends, leaderboard };
}

function expectExactPracticeResult(
  result: Awaited<ReturnType<LifecycleServices["getPracticeResult"]>>,
  selectedChoiceId: string,
) {
  const questionScores = result.questions.map((question) =>
    Fraction.parseDecimal(question.earnedScore),
  );
  const rawScore = questionScores.reduce(
    (total, score) => total.add(score),
    Fraction.fromInteger(0n),
  );
  const accuracyRate = rawScore
    .divide(Fraction.fromInteger(BigInt(result.questions.length)))
    .multiply(Fraction.fromInteger(100n));

  expect(Fraction.parseDecimal(result.score.rawScore).equals(rawScore)).toBe(true);
  expect(Fraction.parseDecimal(result.score.accuracyRate).equals(accuracyRate)).toBe(
    true,
  );
  expect(
    new Date(result.expiresAt).getTime() - new Date(result.completedAt).getTime(),
  ).toBe(168 * 60 * 60 * 1000);

  for (const domain of result.domains) {
    const questions = result.questions.filter(
      (question) => question.domainName === domain.domainName,
    );
    const earnedScore = questions.reduce(
      (total, question) => total.add(Fraction.parseDecimal(question.earnedScore)),
      Fraction.fromInteger(0n),
    );
    const domainAccuracy = earnedScore
      .divide(Fraction.fromInteger(BigInt(questions.length)))
      .multiply(Fraction.fromInteger(100n));
    expect(domain.questionCount).toBe(questions.length);
    expect(Fraction.parseDecimal(domain.earnedScore).equals(earnedScore)).toBe(true);
    expect(Fraction.parseDecimal(domain.accuracyRate).equals(domainAccuracy)).toBe(
      true,
    );
  }

  const question = result.questions[0]!;
  const correct = selectedChoiceId === CHOICE_A;
  expect(question).toMatchObject({
    kind: "review",
    displayNumber: 1,
    selectedChoiceIds: [selectedChoiceId],
    correctChoiceIds: [CHOICE_A],
    isCorrect: correct,
    earnedScore: correct ? "1" : "0",
    explanation: { en: "Explanation", ko: null },
  });
}

type AttemptHistoryCase = {
  attemptRank: number;
  submittedOffset: number;
  answered: boolean;
  correct: boolean;
  flagged: boolean;
};

const property21Cases = fc.oneof(
  fc.constant<readonly AttemptHistoryCase[]>([]),
  fc
    .uniqueArray(
      fc.record({
        attemptRank: fc.integer({ min: 1, max: 900 }),
        submittedOffset: fc.integer({ min: 0, max: 2 }),
        answered: fc.boolean(),
        correct: fc.boolean(),
        flagged: fc.boolean(),
      }),
      { minLength: 2, maxLength: 8, selector: (item) => item.attemptRank },
    )
    .map(([first, second, ...rest]) => [
      { ...first!, submittedOffset: 0 },
      { ...second!, submittedOffset: 0 },
      ...rest,
    ]),
);

type GenerationMode = "practice" | "exam";
const generationModes: readonly GenerationMode[] = ["practice", "exam"];
const insufficientPoolCases: readonly (readonly ("left" | "right")[])[] = [
  [],
  ["left"],
  ["right"],
];

function twoDomainSource(
  availableDomains: readonly ("left" | "right")[] = ["left", "right"],
): FullCatalogGenerationSource {
  const catalog = source();
  const left = { ...catalog.domains[0]!, weightBasisPoints: 5_000 };
  const leftQuestion = catalog.questions[0]!;
  const rightDomain = {
    ...left,
    id: id(5),
    name: "Right",
    orderIndex: 1,
  };
  const rightQuestion = {
    ...leftQuestion,
    id: id(21),
    domainId: rightDomain.id,
    domainName: rightDomain.name,
    stem: { en: "Right question", ko: null },
    explanation: { en: "Right explanation", ko: null },
    choices: [
      { id: id(32), externalId: "a", text: { en: "Right A", ko: null } },
      { id: id(33), externalId: "b", text: { en: "Right B", ko: null } },
    ],
  };
  return {
    ...catalog,
    certification: { ...catalog.certification, totalQuestions: 2 },
    domains: [left, rightDomain],
    questions: [
      ...(availableDomains.includes("left") ? [leftQuestion] : []),
      ...(availableDomains.includes("right") ? [rightQuestion] : []),
    ],
  };
}

async function createGeneratedSession(
  factory: SessionFactory,
  repositories: Parameters<SessionFactory["createPractice"]>[0],
  mode: GenerationMode,
  generation: FullCatalogGenerationSource,
) {
  return mode === "practice"
    ? factory.createPractice(repositories, USER_A, generation)
    : factory.createExam(repositories, {
        userId: USER_A,
        startRequestKey: "property-7-start",
        source: generation,
      });
}

async function generatedSession(
  database: InMemoryUnitOfWork,
  mode: GenerationMode,
  sessionId: string,
) {
  return database.transaction((repositories) =>
    mode === "practice"
      ? repositories.practice.getOwned(USER_A, sessionId)
      : repositories.exams.getOwned(USER_A, sessionId),
  );
}

function mutateSourceRevision(source: FullCatalogGenerationSource, marker: string): void {
  source.certification.name = `Replaced certification ${marker}`;
  source.domains[0]!.name = `Replaced domain ${marker}`;
  source.questions[0]!.stem.en = `Replaced question ${marker}`;
  source.questions[0]!.choices[0]!.text.en = `Replaced choice ${marker}`;
}

// This is an in-memory adapter model test; it does not establish SQL/production transaction semantics.
describe("offline lifecycle properties", () => {
  // Feature: cert-quiz-mvp, Property 7: 회차 생성의 all-or-nothing과 snapshot 불변성
  // **Validates: Requirements 4.9-4.12**
  it("P7 gathers every insufficient domain, rolls back every session write fault, and isolates snapshots from source revisions", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 40 }), async (revisionMarker) => {
        for (const mode of generationModes) {
          for (const availableDomains of insufficientPoolCases) {
            const database = new InMemoryUnitOfWork();
            const sessionId = id(mode === "practice" ? 701 : 702);
            const factory = new SessionFactory({
              ids: new SequenceUuidFactory([sessionId]),
              random: new SequenceRandomSource([0]),
              now: () => new Date(base),
            });
            const generation = twoDomainSource(availableDomains);
            let failure: unknown;
            try {
              await database.transaction((repositories) =>
                createGeneratedSession(factory, repositories, mode, generation),
              );
            } catch (error) {
              failure = error;
            }
            if (!isDomainFailure(failure))
              throw new Error("An insufficient pool must reject session generation.");
            const expectedDetails = generation.domains
              .filter(
                (_, index) =>
                  !availableDomains.includes(index === 0 ? "left" : "right"),
              )
              .map((domain) => ({
                path: ["domains", domain.name],
                reason: "Question pool is insufficient.",
                actual: 0,
                expected: 1,
              }));
            expect(failure.error).toEqual({
              code: "invalid-scoring-configuration",
              details: expectedDetails,
            });
            expect(await generatedSession(database, mode, sessionId)).toBeNull();
          }

          const faultDatabase = new InMemoryUnitOfWork();
          const faultSessionId = id(mode === "practice" ? 703 : 704);
          const faultFactory = new SessionFactory({
            ids: new SequenceUuidFactory([faultSessionId]),
            random: new SequenceRandomSource([0]),
            now: () => new Date(base),
          });
          faultDatabase.failNext(mode === "practice" ? "practice-replace" : "exam-create");
          await expect(
            faultDatabase.transaction((repositories) =>
              createGeneratedSession(
                faultFactory,
                repositories,
                mode,
                twoDomainSource(),
              ),
            ),
          ).rejects.toThrow("Injected persistence fault");
          expect(await generatedSession(faultDatabase, mode, faultSessionId)).toBeNull();

          const successDatabase = new InMemoryUnitOfWork();
          const successSessionId = id(mode === "practice" ? 705 : 706);
          const successFactory = new SessionFactory({
            ids: new SequenceUuidFactory([successSessionId]),
            random: new SequenceRandomSource([0]),
            now: () => new Date(base),
          });
          const generation = twoDomainSource();
          const created = await successDatabase.transaction((repositories) =>
            createGeneratedSession(successFactory, repositories, mode, generation),
          );
          const snapshotsBeforeRevisionMutation = structuredClone(created.questions);
          mutateSourceRevision(generation, revisionMarker);
          expect(
            (await generatedSession(successDatabase, mode, successSessionId))?.questions,
          ).toEqual(snapshotsBeforeRevisionMutation);
        }
      }),
      { numRuns: 200, seed: 20_260_407 },
    );
  }, 120_000);

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

  it("P14 preserves exact practice review values and excludes retained results from attempt analytics", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(CHOICE_A, CHOICE_B), {
          minLength: 1,
          maxLength: 3,
        }),
        async (practiceChoices) => {
          const { clock, service } = fixture();
          const attempt = await createdExam(service, "attempt-only-baseline");
          await service.submitExam(USER_A, attempt.examSessionId);
          const attemptAnalytics = await analyticsSnapshot(service);
          const resultIds: string[] = [];

          for (const choice of practiceChoices) {
            const sessionId = await createdPractice(service);
            const submitted = await service.submitPractice(
              USER_A,
              sessionId,
              QUESTION_ID,
              [choice],
              0,
            );
            const resultId = submitted.completedPracticeResultId!;
            resultIds.push(resultId);
            const result = await service.getPracticeResult(USER_A, resultId);
            expectExactPracticeResult(result, choice);
            expect(await analyticsSnapshot(service)).toEqual(attemptAnalytics);
          }

          clock.advance(168 * 60 * 60 * 1000 - 1);
          for (const resultId of resultIds)
            await expect(service.getPracticeResult(USER_A, resultId)).resolves.toMatchObject({
              resultId,
            });

          clock.advance(1);
          // Physical cleanup is deliberately delayed: logical expiry must already exclude
          // every completed practice result without changing Attempt-only analytics.
          expect(await analyticsSnapshot(service)).toEqual(attemptAnalytics);
          expect(await service.cleanupPracticeResults(resultIds.length)).toBe(resultIds.length);
          for (const resultId of resultIds)
            await expect(
              service.getPracticeResult(USER_A, resultId),
            ).rejects.toMatchObject({ error: { code: "expired" } });
          expect(await analyticsSnapshot(service)).toEqual(attemptAnalytics);
        },
      ),
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

  // Feature: cert-quiz-mvp, Property 21: Attempt 불변성과 이력 정렬
  // **Validates: Requirements 13.1-13.14**
  it("P21 preserves submitted Attempt snapshots across catalog replacement and orders owner history/trends", async () => {
    await fc.assert(
      fc.asyncProperty(
        property21Cases,
        fc.integer({ min: 1, max: 9_999 }),
        async (cases, catalogVersion) => {
          const attemptIds = [
            ...cases.map((item) => id(10_000 + item.attemptRank)),
            id(20_000),
          ];
          const { database, clock, service } = fixture(attemptIds);
          const secondCatalog = source({
            revisionId: id(300),
            certificationId: id(301),
            certificationKey: "CERT-SECOND",
            providerId: id(302),
            domainId: id(303),
            questionId: id(304),
            choiceA: id(305),
            choiceB: id(306),
            code: "CERT-SECOND",
            name: "Second certification",
            providerName: "Second provider",
            domainName: "Second domain",
          });
          seedCatalog(database, secondCatalog);

          const ownerAttempts: Array<{
            certificationId: string;
            result: Awaited<ReturnType<LifecycleServices["submitExam"]>>;
          }> = [];
          const submit = async (
            userId: string,
            catalog: FullCatalogGenerationSource,
            input: AttemptHistoryCase,
            key: string,
          ) => {
            clock.set(new Date(base.getTime() + input.submittedOffset));
            const started = await service.startExam(
              userId,
              catalog.certification.id,
              key,
            );
            const question = catalog.questions[0]!;
            if (input.answered || input.flagged)
              await service.patchExam(userId, started.examSessionId, {
                expectedVersion: 0,
                ...(input.answered
                  ? {
                      answer: {
                        questionId: question.id,
                        selectedChoiceIds: [
                          input.correct ? question.choices[0]!.id : question.choices[1]!.id,
                        ],
                      },
                    }
                  : {}),
                ...(input.flagged
                  ? { flag: { questionId: question.id, flagged: true } }
                  : {}),
              });
            return service.submitExam(userId, started.examSessionId);
          };

          for (const [index, input] of cases.entries()) {
            const catalog = index % 2 === 0 ? source() : secondCatalog;
            ownerAttempts.push({
              certificationId: catalog.certification.id,
              result: await submit(USER_A, catalog, input, `owner-${index}`),
            });
          }

          // A different owner's Attempt must never influence USER_A's history, including
          // the empty owner case.
          await submit(
            USER_B,
            source(),
            {
              attemptRank: 0,
              submittedOffset: 0,
              answered: true,
              correct: true,
              flagged: false,
            },
            "other-owner",
          );

          const beforeReplacement = new Map(
            await Promise.all(
              ownerAttempts.map(async ({ result }) => [
                result.attemptId,
                await service.getAttempt(USER_A, result.attemptId),
              ] as const),
            ),
          );
          const replacement = source({
            revisionId: id(400),
            providerId: id(401),
            domainId: id(402),
            questionId: id(403),
            choiceA: id(404),
            choiceB: id(405),
            code: `REPLACED-${catalogVersion}`,
            name: `Replacement certification ${catalogVersion}`,
            providerName: `Replacement provider ${catalogVersion}`,
            domainName: `Replacement domain ${catalogVersion}`,
            stem: `Replacement question ${catalogVersion}`,
            explanation: `Replacement explanation ${catalogVersion}`,
          });
          seedCatalog(database, replacement);
          await database.transaction(async (repos) => {
            expect(
              (await repos.catalog.fullGenerationSource(CERTIFICATION_ID))?.certification,
            ).toMatchObject({
              code: replacement.certification.code,
              name: replacement.certification.name,
            });
          });

          for (const { result } of ownerAttempts)
            await expect(service.getAttempt(USER_A, result.attemptId)).resolves.toEqual(
              beforeReplacement.get(result.attemptId),
            );

          const history = await service.history(USER_A);
          const expectedHistory = ownerAttempts
            .map(({ result }) => ({
              attemptId: result.attemptId,
              certificationCode: result.certification.code,
              certificationName: result.certification.name,
              rawScore: result.score.rawScore,
              accuracyRate: result.score.accuracyRate,
              reference1000Score: result.reference1000Score,
              passed: result.passed,
              submittedAt: result.submittedAt,
            }))
            .sort(
              (left, right) =>
                new Date(right.submittedAt).getTime() -
                  new Date(left.submittedAt).getTime() ||
                left.attemptId.localeCompare(right.attemptId),
            );
          expect(history.attempts).toEqual(expectedHistory);

          const trends = await service.trends(USER_A);
          const expectedByCertification = new Map<string, typeof ownerAttempts>();
          for (const item of ownerAttempts)
            expectedByCertification.set(item.certificationId, [
              ...(expectedByCertification.get(item.certificationId) ?? []),
              item,
            ]);
          expect(trends.certifications).toHaveLength(expectedByCertification.size);
          expect(
            trends.certifications.reduce(
              (count, trend) => count + trend.attemptCount,
              0,
            ),
          ).toBe(cases.length);
          if (cases.length === 0) {
            expect(history.attempts).toEqual([]);
            expect(trends.certifications).toEqual([]);
          }
          for (const [certificationId, expected] of expectedByCertification) {
            const trend = trends.certifications.find(
              (candidate) => candidate.certificationId === certificationId,
            );
            expect(trend).toBeDefined();
            const ordered = [...expected].sort(
              (left, right) =>
                new Date(left.result.submittedAt).getTime() -
                  new Date(right.result.submittedAt).getTime() ||
                left.result.attemptId.localeCompare(right.result.attemptId),
            );
            expect(trend).toMatchObject({
              attemptCount: ordered.length,
              points: ordered.map(({ result }) => ({
                attemptId: result.attemptId,
                accuracyRate: result.score.accuracyRate,
                submittedAt: result.submittedAt,
              })),
            });
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: cert-quiz-mvp, Property 22: 리더보드 후보·대표·동률 규칙
  // **Validates: Requirements 14.2-14.15**
  it("P22 matches an independent oracle for arbitrary profiles and attempts", async () => {
    await fc.assert(
      fc.asyncProperty(leaderboardCaseArbitrary, async (input) => {
        const { database, service } = leaderboardFixture();
        const targetTemplate = await leaderboardTemplate(
          database,
          service,
          CERTIFICATION_ID,
          "target-template",
        );
        const secondaryTemplate = await leaderboardTemplate(
          database,
          service,
          SECOND_CERTIFICATION_ID,
          "secondary-template",
        );
        const attempts: OracleAttempt[] = [];

        for (const [profileIndex, profileCase] of input.profiles.entries()) {
          const userId = leaderboardUserId(profileIndex);
          database.seedUser(leaderboardProfile(userId, profileCase));
          for (const attemptCase of profileCase.attempts) {
            const index = attempts.length;
            const attempt: OracleAttempt = {
              ...attemptCase,
              attemptId: id(20_000 + index),
              sessionId: id(30_000 + index),
              userId,
              submittedAt: new Date(base.getTime() + attemptCase.submittedOffset),
            };
            attempts.push(attempt);
            await seedLeaderboardAttempt(
              database,
              attempt,
              attempt.targetCertification ? targetTemplate : secondaryTemplate,
            );
          }
        }

        const currentUserId =
          input.currentProfileIndex === -1
            ? LEADERBOARD_OUTSIDER
            : leaderboardUserId(input.currentProfileIndex);
        expect(await service.leaderboard(CERTIFICATION_ID, currentUserId)).toEqual(
          leaderboardOracle(input.profiles, attempts, currentUserId),
        );
      }),
      { numRuns: 200 },
    );
  });
});


type LeaderboardFraction = {
  numerator: number;
  denominator: number;
  display: string;
};
type LeaderboardAttemptCase = {
  targetCertification: boolean;
  accuracy: LeaderboardFraction;
  rawScore: LeaderboardFraction;
  submittedOffset: number;
};
type LeaderboardProfileCase = {
  approvalStatus: "pending" | "approved";
  scorePublic: boolean;
  role: "user" | "admin";
  attempts: readonly LeaderboardAttemptCase[];
};
type LeaderboardCase = {
  profiles: readonly LeaderboardProfileCase[];
  currentProfileIndex: number;
};
type OracleAttempt = LeaderboardAttemptCase & {
  attemptId: string;
  sessionId: string;
  userId: string;
  submittedAt: Date;
};

const SECOND_CERTIFICATION_ID = id(501);
const LEADERBOARD_TEMPLATE_USER = id(900);
const LEADERBOARD_OUTSIDER = id(901);
const leaderboardFractions: readonly LeaderboardFraction[] = [
  { numerator: 0, denominator: 1, display: "0" },
  { numerator: 1, denominator: 4, display: "0.25" },
  { numerator: 1, denominator: 2, display: "0.5" },
  { numerator: 2, denominator: 4, display: "0.5" },
  { numerator: 3, denominator: 4, display: "0.75" },
  { numerator: 1, denominator: 1, display: "1" },
];
const leaderboardAttemptArbitrary = fc.record({
  targetCertification: fc.boolean(),
  accuracy: fc.constantFrom(...leaderboardFractions),
  rawScore: fc.constantFrom(...leaderboardFractions),
  submittedOffset: fc.integer({ min: 0, max: 2 }),
});
const leaderboardProfileArbitrary = fc.record({
  approvalStatus: fc.constantFrom<"pending" | "approved">("pending", "approved"),
  scorePublic: fc.boolean(),
  role: fc.constantFrom<"user" | "admin">("user", "admin"),
  attempts: fc.array(leaderboardAttemptArbitrary, { maxLength: 4 }),
});
const leaderboardCaseArbitrary: fc.Arbitrary<LeaderboardCase> = fc
  .array(leaderboardProfileArbitrary, { maxLength: 6 })
  .chain((profiles) =>
    fc
      .constantFrom(-1, ...profiles.map((_, index) => index))
      .map((currentProfileIndex) => ({ profiles, currentProfileIndex })),
  );

function leaderboardFixture() {
  const database = new InMemoryUnitOfWork();
  seedCatalog(database, source());
  seedCatalog(
    database,
    source({
      revisionId: id(500),
      certificationId: SECOND_CERTIFICATION_ID,
      certificationKey: "CERT-SECOND",
      providerId: id(502),
      domainId: id(503),
      questionId: id(504),
      choiceA: id(505),
      choiceB: id(506),
      code: "CERT-SECOND",
      name: "Secondary certification",
    }),
  );
  const clock = new FixedClock(base);
  let next = 1_000;
  const ids = new SequenceUuidFactory(Array.from({ length: 2_000 }, () => id(next++)));
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
  return { database, service };
}

async function leaderboardTemplate(
  database: InMemoryUnitOfWork,
  service: LifecycleServices,
  certificationId: string,
  key: string,
) {
  const started = await service.startExam(
    LEADERBOARD_TEMPLATE_USER,
    certificationId,
    key,
  );
  const exam = await database.transaction((repos) =>
    repos.exams.getOwned(LEADERBOARD_TEMPLATE_USER, started.examSessionId),
  );
  if (!exam) throw new Error("Leaderboard template exam must exist.");
  return exam.questions;
}

function leaderboardUserId(index: number): string {
  return id(1_000 + index);
}

function leaderboardProfile(
  userId: string,
  input: LeaderboardProfileCase,
): UserProfile {
  return {
    id: userId,
    googleSub: userId,
    displayName: `Leaderboard user ${userId.slice(-4)}`,
    email: `${userId}@example.test`,
    role: input.role,
    approvalStatus: input.approvalStatus,
    scorePublic: input.scorePublic,
    firstLoginAt: base,
    approvedAt: input.approvalStatus === "approved" ? base : null,
    version: 0n,
  };
}

async function seedLeaderboardAttempt(
  database: InMemoryUnitOfWork,
  input: OracleAttempt,
  template: Awaited<ReturnType<typeof leaderboardTemplate>>,
): Promise<void> {
  await database.transaction(async (repos) => {
    await repos.exams.createWithSnapshots({
      id: input.sessionId,
      userId: input.userId,
      certificationKey: input.targetCertification ? "CERT" : "CERT-SECOND",
      startRequestKey: `leaderboard-${input.sessionId}`,
      currentIndex: 0,
      startedAt: base,
      expiresAt: new Date(base.getTime() + 60_000),
      questions: template,
    });
    await repos.exams.finalizeOnce({
      id: input.attemptId,
      userId: input.userId,
      sessionId: input.sessionId,
      rawScore: Fraction.of(BigInt(input.rawScore.numerator), BigInt(input.rawScore.denominator)),
      accuracyRate: Fraction.of(
        BigInt(input.accuracy.numerator),
        BigInt(input.accuracy.denominator),
      ),
      passThreshold: Fraction.fromInteger(75n),
      passed: false,
      reference1000Score: 0,
      submittedAt: input.submittedAt,
      submissionReason: "manual",
    });
  });
}

function leaderboardOracle(
  profiles: readonly LeaderboardProfileCase[],
  attempts: readonly OracleAttempt[],
  currentUserId: string,
) {
  const representatives = profiles.flatMap((profile, index) => {
    const userId = leaderboardUserId(index);
    if (profile.approvalStatus !== "approved" || !profile.scorePublic) return [];
    const representative = attempts
      .filter((attempt) => attempt.userId === userId && attempt.targetCertification)
      .sort(compareOracleRepresentative)[0];
    return representative ? [{ userId, representative }] : [];
  });
  const ordered = representatives.sort(
    (left, right) =>
      compareOracleAccuracy(right.representative.accuracy, left.representative.accuracy) ||
      left.representative.submittedAt.getTime() -
        right.representative.submittedAt.getTime() ||
      left.userId.localeCompare(right.userId),
  );
  return {
    certificationId: CERTIFICATION_ID,
    certificationCode: "CERT",
    certificationName: "Offline certification",
    entries: ordered.map(({ userId, representative }) => ({
      rank:
        1 +
        ordered.filter(
          (other) =>
            compareOracleAccuracy(other.representative.accuracy, representative.accuracy) >
            0,
        ).length,
      userId,
      displayName: `Leaderboard user ${userId.slice(-4)}`,
      accuracyRate: representative.accuracy.display,
      rawScore: representative.rawScore.display,
      attemptId: representative.attemptId,
      submittedAt: representative.submittedAt.toISOString(),
      isCurrentUser: userId === currentUserId,
    })),
  };
}

function compareOracleRepresentative(left: OracleAttempt, right: OracleAttempt): number {
  return (
    compareOracleAccuracy(right.accuracy, left.accuracy) ||
    left.submittedAt.getTime() - right.submittedAt.getTime() ||
    left.attemptId.localeCompare(right.attemptId)
  );
}

function compareOracleAccuracy(
  left: LeaderboardFraction,
  right: LeaderboardFraction,
): number {
  const difference =
    BigInt(left.numerator) * BigInt(right.denominator) -
    BigInt(right.numerator) * BigInt(left.denominator);
  return difference === 0n ? 0 : difference < 0n ? -1 : 1;
}
