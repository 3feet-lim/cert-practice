import * as contracts from "@cert-quiz/contracts";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  DOP_C02_DOMAINS,
  DOP_C02_METADATA,
  FakeServerClock,
  SeededIdFactory,
  SeededRandomSource,
  createCertQuizFixtureHandlers,
  createCertQuizFixtures,
} from "./index";

const fixtures = createCertQuizFixtures();
const server = setupServer(...createCertQuizFixtureHandlers(fixtures));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function expectParses(schema: { parse: (value: unknown) => unknown }, value: unknown) {
  expect(() => schema.parse(value)).not.toThrow();
}

async function requestData(path: string, init?: RequestInit): Promise<unknown> {
  const response = await globalThis.fetch(`http://certquiz.test${path}`, init);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: unknown };
  return body.data;
}

describe("deterministic fixture primitives", () => {
  it("replays named IDs and RNG output from a seed", () => {
    const firstIds = new SeededIdFactory(1234);
    const secondIds = new SeededIdFactory(1234);
    const firstRandom = new SeededRandomSource(9876);
    const secondRandom = new SeededRandomSource(9876);

    expect(firstIds.named("attempt")).toBe(secondIds.named("attempt"));
    expect(firstIds.named("attempt")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(Array.from({ length: 12 }, () => firstRandom.nextInt(75))).toEqual(
      Array.from({ length: 12 }, () => secondRandom.nextInt(75)),
    );
    expect(new SeededIdFactory(1235).named("attempt")).not.toBe(
      firstIds.named("attempt"),
    );
  });

  it("controls the fake server clock without exposing a mutable Date", () => {
    const clock = new FakeServerClock("2026-03-23T12:00:00.000Z");
    const snapshot = clock.now();
    snapshot.setUTCFullYear(2030);

    expect(clock.iso()).toBe("2026-03-23T12:00:00.000Z");
    clock.advance(1_000);
    expect(clock.iso()).toBe("2026-03-23T12:00:01.000Z");
    clock.set("2026-03-24T00:00:00.000Z");
    expect(clock.iso()).toBe("2026-03-24T00:00:00.000Z");
  });
});

describe("deterministic CertQuiz fixture corpus", () => {
  it("builds the same corpus for the same seed and different IDs for another seed", () => {
    const first = createCertQuizFixtures({ seed: 100 });
    const replay = createCertQuizFixtures({ seed: 100 });
    const other = createCertQuizFixtures({ seed: 101 });

    expect(first.ids).toEqual(replay.ids);
    expect(first.catalog.valid).toEqual(replay.catalog.valid);
    expect(first.ids.attemptId).not.toBe(other.ids.attemptId);
  });

  it("provides schema-valid fixture DTOs including health", () => {
    expectParses(contracts.healthDtoSchema, fixtures.health);
    expectParses(contracts.approvalStatusDtoSchema, fixtures.auth.pending.approval);
    expectParses(contracts.currentUserDtoSchema, fixtures.auth.approved.user);
    expectParses(contracts.currentUserDtoSchema, fixtures.auth.admin.user);
    for (const catalog of Object.values(fixtures.catalog)) {
      expectParses(contracts.catalogDtoSchema, catalog);
    }
    expectParses(
      contracts.activePracticeSessionsDtoSchema,
      fixtures.practice.activeSessions,
    );
    expectParses(contracts.practiceSessionDtoSchema, fixtures.practice.active);
    expectParses(contracts.practiceSessionDtoSchema, fixtures.practice.submitted);
    expectParses(contracts.practiceResultDtoSchema, fixtures.practice.immutableResult);
    expectParses(contracts.startExamResponseSchema, fixtures.exam.start);
    expectParses(contracts.examActiveSessionDtoSchema, fixtures.exam.active);
    expectParses(contracts.examActiveSessionDtoSchema, fixtures.exam.expired);
    expectParses(contracts.getExamResponseSchema, fixtures.exam.finalized);
    expectParses(contracts.examResultDtoSchema, fixtures.exam.immutableResult);
    expectParses(contracts.historyPageDtoSchema, fixtures.history.empty);
    expectParses(contracts.historyPageDtoSchema, fixtures.history.populated);
    expectParses(contracts.historyTrendsDtoSchema, fixtures.history.trends);
    expectParses(contracts.leaderboardDtoSchema, fixtures.leaderboard.empty);
    expectParses(contracts.leaderboardDtoSchema, fixtures.leaderboard.tied);
    expectParses(contracts.pendingUsersDtoSchema, fixtures.admin.pendingUsers);
    expectParses(contracts.importDocumentSchema, fixtures.import.document);
    expectParses(contracts.dryRunImportRequestSchema, fixtures.import.dryRunRequest);
    expectParses(contracts.dryRunImportResponseSchema, fixtures.import.dryRunValid);
    expectParses(contracts.dryRunImportResponseSchema, fixtures.import.dryRunInvalid);
    expectParses(contracts.commitImportRequestSchema, fixtures.import.commitRequest);
    expectParses(contracts.commitImportResponseSchema, fixtures.import.commitResponse);
  });

  it("reproduces DOP-C02 metadata, largest-remainder counts, and translation states", () => {
    const certification = fixtures.catalog.valid.providers[0]?.certifications[0];
    expect(certification).toMatchObject({
      code: DOP_C02_METADATA.code,
      name: DOP_C02_METADATA.name,
      totalQuestions: 75,
      timeLimitMinutes: 180,
      passThreshold: "75",
      scoringMode: "all_or_nothing",
    });
    expect(
      certification?.domains.map(
        ({ allocatedQuestionCount }) => allocatedQuestionCount,
      ),
    ).toEqual([17, 13, 13, 11, 11, 10]);
    expect(
      DOP_C02_DOMAINS.reduce(
        (total, domain) => total + domain.allocatedQuestionCount,
        0,
      ),
    ).toBe(75);
    expect(fixtures.practice.active.questions).toHaveLength(75);
    expect(
      fixtures.practice.active.questions.filter(
        ({ translationStatus }) => translationStatus === "en_only",
      ),
    ).toHaveLength(15);
    const englishOnly = fixtures.practice.active.questions.find(
      ({ translationStatus }) => translationStatus === "en_only",
    );
    expect(englishOnly?.stem.ko).toBeNull();
    expect(englishOnly?.choices.every(({ text }) => text.ko === null)).toBe(true);
  });

  it("keeps all pre-reveal questions free of answer and explanation fields", () => {
    for (const question of [
      ...fixtures.practice.active.questions,
      ...fixtures.exam.active.questions,
    ]) {
      expect(question).not.toHaveProperty("correctChoiceIds");
      expect(question).not.toHaveProperty("isCorrect");
      expect(question).not.toHaveProperty("earnedScore");
      expect(question).not.toHaveProperty("explanation");
    }
    expect(fixtures.practice.submitted.questions[0]?.kind).toBe("practice-submitted");
  });

  it("reproduces exam expiry and the exact 168-hour half-open retention boundary", () => {
    expect(fixtures.exam.active.remainingSeconds).toBe(9_000);
    expect(fixtures.exam.expired.remainingSeconds).toBe(0);
    expect(fixtures.exam.expired.serverNow).toBe(fixtures.exam.expired.expiresAt);
    expect(fixtures.exam.timerBoundary.beforeExpiry).toBe("2026-03-23T11:59:59.999Z");
    expect(fixtures.exam.timerBoundary.atExpiry).toBe(
      fixtures.exam.timerBoundary.expiresAt,
    );

    const retention = fixtures.practice.retentionBoundary;
    expect(
      new Date(retention.expiresAt).getTime() -
        new Date(retention.completedAt).getTime(),
    ).toBe(168 * 60 * 60 * 1_000);
    expect(new Date(retention.beforeExpiry).getTime()).toBe(
      new Date(retention.expiresAt).getTime() - 1,
    );
    expect(retention.atExpiry).toBe(retention.expiresAt);
  });

  it("fixes history ties, competition ranking ties, privacy, and immutable snapshots", () => {
    const historyTie = fixtures.history.populated.attempts.slice(1);
    expect(historyTie[0]?.submittedAt).toBe(historyTie[1]?.submittedAt);
    expect(historyTie.map(({ attemptId }) => attemptId)).toEqual(
      [...historyTie.map(({ attemptId }) => attemptId)].sort(),
    );

    expect(fixtures.leaderboard.tied.entries.map(({ rank }) => rank)).toEqual([
      1, 2, 2, 4,
    ]);
    const tiedEntries = fixtures.leaderboard.tied.entries.filter(
      ({ rank }) => rank === 2,
    );
    expect(tiedEntries.map(({ userId }) => userId)).toEqual(
      [...tiedEntries.map(({ userId }) => userId)].sort(),
    );
    expect(
      fixtures.leaderboard.tied.entries.filter(({ isCurrentUser }) => isCurrentUser),
    ).toHaveLength(1);
    expect(fixtures.leaderboard.tied.entries[0]).not.toHaveProperty("email");
    expect(fixtures.leaderboard.tied.entries[0]).not.toHaveProperty("googleSub");

    expect(Object.isFrozen(fixtures.exam.immutableResult)).toBe(true);
    expect(Object.isFrozen(fixtures.exam.immutableResult.questions)).toBe(true);
    expect(fixtures.exam.immutableResult.certification).not.toBe(
      fixtures.catalog.valid.providers[0]?.certifications[0],
    );
  });

  it("provides a 75-question dry-run, deterministic 15-minute token, and commit", () => {
    expect(fixtures.import.document.certification.questions).toHaveLength(75);
    expect(fixtures.import.dryRunValid.summary.totalQuestions).toEqual({
      status: "available",
      value: 75,
    });
    expect(fixtures.import.dryRunValid.summary.translationStatusCounts).toEqual({
      translated: { status: "available", value: 60 },
      enOnly: { status: "available", value: 15 },
    });
    expect(
      new Date(fixtures.import.dryRunValid.expiresAt ?? 0).getTime() -
        fixtures.clock.now().getTime(),
    ).toBe(15 * 60 * 1_000);
    expect(fixtures.import.commitRequest.content).toBe(fixtures.import.validContent);
    expect(fixtures.import.commitResponse.validationId).toBe(
      fixtures.import.dryRunValid.validationId,
    );
  });
});

describe("MSW fixture handlers", () => {
  it("serves every approved-user static fixture through transport envelopes", async () => {
    const cases: Array<[string, RequestInit | undefined, unknown]> = [
      ["/v1/health", undefined, fixtures.health],
      ["/v1/me/approval", undefined, fixtures.auth.approved.approval],
      ["/v1/me", undefined, fixtures.auth.approved.user],
      ["/v1/catalog", undefined, fixtures.catalog.valid],
      ["/v1/practice-sessions/active", undefined, fixtures.practice.activeSessions],
      [
        `/v1/practice/${fixtures.ids.practiceSessionId}/resume`,
        { method: "POST" },
        fixtures.practice.active,
      ],
      [
        `/v1/practice-results/${fixtures.ids.practiceResultId}`,
        undefined,
        fixtures.practice.immutableResult,
      ],
      [
        `/v1/exams/${fixtures.ids.activeExamSessionId}`,
        undefined,
        fixtures.exam.active,
      ],
      [
        `/v1/attempts/${fixtures.ids.attemptId}`,
        undefined,
        fixtures.exam.immutableResult,
      ],
      ["/v1/history", undefined, fixtures.history.populated],
      ["/v1/history/trends", undefined, fixtures.history.trends],
      [
        `/v1/leaderboards/${fixtures.ids.certificationId}`,
        undefined,
        fixtures.leaderboard.tied,
      ],
    ];

    for (const [path, init, expected] of cases) {
      await expect(requestData(path, init)).resolves.toEqual(expected);
    }
  });

  it("selects pending/unauthenticated and alternate catalog/quiz scenarios", async () => {
    server.use(
      ...createCertQuizFixtureHandlers(fixtures, {
        actor: "pending",
        catalog: "invalid",
        practice: "submitted",
        exam: "expired",
        history: "empty",
        leaderboard: "empty",
      }),
    );
    await expect(requestData("/v1/me/approval")).resolves.toEqual(
      fixtures.auth.pending.approval,
    );
    const pendingCatalog = await globalThis.fetch("http://certquiz.test/v1/catalog");
    expect(pendingCatalog.status).toBe(403);

    server.use(
      ...createCertQuizFixtureHandlers(fixtures, {
        actor: "approved",
        catalog: "invalid",
        practice: "submitted",
        exam: "expired",
        history: "empty",
        leaderboard: "empty",
      }),
    );
    await expect(requestData("/v1/catalog")).resolves.toEqual(fixtures.catalog.invalid);
    await expect(
      requestData(`/v1/practice/${fixtures.ids.practiceSessionId}/resume`, {
        method: "POST",
      }),
    ).resolves.toEqual(fixtures.practice.submitted);
    await expect(
      requestData(`/v1/exams/${fixtures.ids.expiredExamSessionId}`),
    ).resolves.toEqual(fixtures.exam.expired);
    await expect(requestData("/v1/history")).resolves.toEqual(fixtures.history.empty);

    server.use(
      ...createCertQuizFixtureHandlers(fixtures, { actor: "unauthenticated" }),
    );
    const unauthenticated = await globalThis.fetch(
      "http://certquiz.test/v1/me/approval",
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("serves admin pending-user and dry-run/commit fixture variants", async () => {
    server.use(
      ...createCertQuizFixtureHandlers(fixtures, {
        actor: "admin",
        pendingUsers: "populated",
        dryRun: "valid",
      }),
    );
    await expect(requestData("/v1/admin/pending-users")).resolves.toEqual(
      fixtures.admin.pendingUsers,
    );
    await expect(
      requestData("/v1/admin/imports/dry-run", { method: "POST" }),
    ).resolves.toEqual(fixtures.import.dryRunValid);
    await expect(
      requestData("/v1/admin/imports/commit", { method: "POST" }),
    ).resolves.toEqual(fixtures.import.commitResponse);

    server.use(
      ...createCertQuizFixtureHandlers(fixtures, {
        actor: "admin",
        pendingUsers: "empty",
        dryRun: "invalid",
      }),
    );
    await expect(requestData("/v1/admin/pending-users")).resolves.toEqual(
      fixtures.admin.emptyPendingUsers,
    );
    await expect(
      requestData("/v1/admin/imports/dry-run", { method: "POST" }),
    ).resolves.toEqual(fixtures.import.dryRunInvalid);
  });

  it("serves finalized exam redirects and safe not-found errors", async () => {
    server.use(
      ...createCertQuizFixtureHandlers(fixtures, {
        actor: "approved",
        exam: "finalized",
      }),
    );
    await expect(
      requestData(`/v1/exams/${fixtures.ids.finalizedExamSessionId}`),
    ).resolves.toEqual(fixtures.exam.finalized);

    const missing = await globalThis.fetch(
      "http://certquiz.test/v1/attempts/00000000-0000-4000-8000-000000000000",
    );
    expect(missing.status).toBe(404);
    const body = (await missing.json()) as { error: Record<string, unknown> };
    expect(body.error).toMatchObject({
      code: "not-found",
      retryable: false,
    });
    expect(body.error).not.toHaveProperty("email");
    expect(body.error).not.toHaveProperty("googleSub");
  });
});
