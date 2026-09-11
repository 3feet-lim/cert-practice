import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createProductionIntegrationHarness,
  type ProductionIntegrationHarness,
} from "./production-integration-harness.js";

const enabled = process.env.RUN_DSQL_API_ACCEPTANCE_SUITE === "true";
const describeLive = enabled ? describe : describe.skip;
const START = new Date("2026-03-20T12:00:00.000Z");
const TEN_MINUTES = 10 * 60 * 1_000;
const ONE_HUNDRED_SIXTY_EIGHT_HOURS = 168 * 60 * 60 * 1_000;

type Envelope<T> = { data: T };
type Catalog = {
  providers: Array<{
    certifications: Array<{ id: string; code: string }>;
  }>;
};
type DryRun = { validationId: string; commitToken: string; valid: boolean };
type Question = { id: string; choices: Array<{ id: string }> };
type PracticeResume = { questions: Question[] };
type ExamActive = { kind: "exam-active"; questions: Question[] };
type StartedSession = { practiceSessionId?: string; examSessionId?: string };
type Submission = {
  completedPracticeResultId?: string;
  attemptId?: string;
  rawScore?: string;
  accuracyRate?: string;
  reference1000Score?: number;
};

/**
 * Production-composed API acceptance evidence. It is deliberately opt-in: every
 * case creates and drops a disposable schema in the configured Aurora DSQL cluster.
 */
describeLive("API · DSQL acceptance integration", () => {
  let harness: ProductionIntegrationHarness;

  beforeEach(async () => {
    harness = await createProductionIntegrationHarness({ now: START });
  }, 90_000);

  afterEach(async () => {
    await harness?.cleanup();
  }, 90_000);

  it("enforces pending approval, atomically activates validated imports, rolls back generation, and expires practice results", async () => {
    const admin = await harness.seedUser({
      googleSub: "acceptance-admin",
      role: "admin",
      approvalStatus: "approved",
    });
    const pending = await harness.seedUser({ googleSub: "acceptance-pending" });
    const pendingToken = await tokenFor(pending.googleSub);

    const approval = await request("/v1/me/approval", pendingToken);
    expect(approval.status).toBe(200);
    expect((await json<Envelope<{ approvalStatus: string }>>(approval)).data).toEqual({
      approvalStatus: "pending",
    });
    expect((await request("/v1/catalog", pendingToken)).status).toBe(403);

    const adminToken = await tokenFor(admin.googleSub);
    const approve = await request(`/v1/admin/users/${pending.id}/approve`, adminToken, {
      method: "POST",
    });
    expect(approve.status).toBe(200);

    const certificationId = await activateCertification(adminToken, "Question version one");
    const learnerToken = await tokenFor(pending.googleSub);
    const catalog = await request("/v1/catalog", learnerToken);
    expect(catalog.status).toBe(200);
    expect(certificationId).toBe(catalogCertificationId(await json<Envelope<Catalog>>(catalog)));

    harness.queries.failAfter("INSERT INTO practice_session_questions");
    const failedStart = await request(
      `/v1/certifications/${certificationId}/practice/start`,
      learnerToken,
      jsonRequest({}),
    );
    expect(failedStart.status).toBe(500);
    expect(await count("practice_sessions")).toBe(0);
    expect(await count("practice_session_questions")).toBe(0);

    const started = await request(
      `/v1/certifications/${certificationId}/practice/start`,
      learnerToken,
      jsonRequest({}),
    );
    expect(started.status).toBe(200);
    const practiceSessionId = (
      await json<Envelope<StartedSession>>(started)
    ).data.practiceSessionId;
    expect(practiceSessionId).toBeTruthy();

    const resumed = await request(`/v1/practice/${practiceSessionId}/resume`, learnerToken, {
      method: "POST",
    });
    const question = (await json<Envelope<PracticeResume>>(resumed)).data.questions[0]!;
    expect(question).not.toHaveProperty("correctChoiceIds");

    const submitted = await request(
      `/v1/practice/${practiceSessionId}/questions/${question.id}/submit`,
      learnerToken,
      jsonRequest({ expectedVersion: 0, selectedChoiceIds: [question.choices[0]!.id, question.choices[1]!.id] }),
    );
    expect(submitted.status).toBe(200);
    const resultId = (await json<Envelope<Submission>>(submitted)).data
      .completedPracticeResultId;
    expect(resultId).toBeTruthy();

    expect((await request(`/v1/practice-results/${resultId}`, learnerToken)).status).toBe(200);
    harness.clock.advance(ONE_HUNDRED_SIXTY_EIGHT_HOURS);
    const expired = await request(`/v1/practice-results/${resultId}`, await tokenFor(pending.googleSub));
    expect(expired.status).toBe(410);
    expect((await json<{ error: { code: string } }>(expired)).error.code).toBe(
      "practice-result-expired",
    );
  }, 90_000);

  it("preserves exact scored attempt snapshots across import replacement and excludes private or foreign data", async () => {
    const admin = await harness.seedUser({
      googleSub: "acceptance-import-admin",
      role: "admin",
      approvalStatus: "approved",
    });
    const publicUser = await harness.seedUser({
      googleSub: "acceptance-public",
      approvalStatus: "approved",
      scorePublic: true,
    });
    const privateUser = await harness.seedUser({
      googleSub: "acceptance-private",
      approvalStatus: "approved",
      scorePublic: false,
    });
    const adminToken = await tokenFor(admin.googleSub);
    const certificationId = await activateCertification(adminToken, "Question version one");

    const publicAttempt = await completePartialExam(await tokenFor(publicUser.googleSub), certificationId);
    expect(publicAttempt).toMatchObject({
      rawScore: "0.5",
      accuracyRate: "50",
      reference1000Score: 500,
    });
    const privateAttempt = await completePartialExam(await tokenFor(privateUser.googleSub), certificationId);
    expect(privateAttempt.attemptId).toBeTruthy();

    const originalReview = await request(
      `/v1/attempts/${publicAttempt.attemptId}`,
      await tokenFor(publicUser.googleSub),
    );
    expect(originalReview.status).toBe(200);
    const originalReviewText = JSON.stringify(await originalReview.json());
    expect(originalReviewText).toContain("Question version one");

    await activateCertification(adminToken, "Question version two");
    const preservedReview = await request(
      `/v1/attempts/${publicAttempt.attemptId}`,
      await tokenFor(publicUser.googleSub),
    );
    expect(preservedReview.status).toBe(200);
    const preservedReviewText = JSON.stringify(await preservedReview.json());
    expect(preservedReviewText).toContain("Question version one");
    expect(preservedReviewText).not.toContain("Question version two");

    const foreignReview = await request(
      `/v1/attempts/${publicAttempt.attemptId}`,
      await tokenFor(privateUser.googleSub),
    );
    expect(foreignReview.status).toBe(404);
    expect(JSON.stringify(await foreignReview.json())).not.toContain(publicAttempt.attemptId!);

    const history = await request("/v1/history", await tokenFor(publicUser.googleSub));
    expect(history.status).toBe(200);
    expect(JSON.stringify(await history.json())).toContain(publicAttempt.attemptId!);

    const leaderboard = await request(
      `/v1/leaderboards/${certificationId}`,
      await tokenFor(publicUser.googleSub),
    );
    expect(leaderboard.status).toBe(200);
    const leaderboardPayload = await json<Envelope<{ entries: unknown[] }>>(leaderboard);
    expect(leaderboardPayload.data.entries).toHaveLength(1);
  }, 90_000);

  it("finalizes every authenticated route family before its handler and linearizes concurrent submission", async () => {
    const admin = await harness.seedUser({
      googleSub: "acceptance-lazy-admin",
      role: "admin",
      approvalStatus: "approved",
    });
    const adminToken = await tokenFor(admin.googleSub);
    const certificationId = await activateCertification(adminToken, "Question for lazy finalization");
    const unknownId = "00000000-0000-4000-8000-000000099999";
    const routes: ReadonlyArray<readonly [string, RequestInit?]> = [
      ["/v1/me/approval"],
      ["/v1/me"],
      ["/v1/catalog"],
      ["/v1/admin/pending-users"],
      [`/v1/certifications/${certificationId}/practice/start`, jsonRequest({})],
      [`/v1/practice/${unknownId}/resume`, { method: "POST" }],
      [`/v1/practice-results/${unknownId}`],
      [`/v1/exams/${unknownId}`],
      [`/v1/attempts/${unknownId}`],
      ["/v1/history"],
      ["/v1/history/trends"],
      [`/v1/leaderboards/${certificationId}`],
    ];

    for (const [path, init] of routes) {
      const expiredSessionId = await startExam(await tokenFor(admin.googleSub), certificationId);
      harness.clock.advance(TEN_MINUTES);
      const response = await request(path, await tokenFor(admin.googleSub), init);
      expect(response.status, path).toBeLessThan(500);
      expect(await count("attempts", "exam_session_id = $1", [expiredSessionId])).toBe(1);
    }

    const concurrentSessionId = await startExam(await tokenFor(admin.googleSub), certificationId);
    const barrier = harness.queries.barrierBefore(
      "UPDATE exam_sessions SET status = 'submitted'",
      2,
    );
    const [first, second] = await Promise.all([
      request(`/v1/exams/${concurrentSessionId}/submit`, await tokenFor(admin.googleSub), {
        method: "POST",
      }),
      request(`/v1/exams/${concurrentSessionId}/submit`, await tokenFor(admin.googleSub), {
        method: "POST",
      }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(barrier.arrivals).toBe(2);
    expect(await count("attempts", "exam_session_id = $1", [concurrentSessionId])).toBe(1);
  }, 90_000);

  async function tokenFor(googleSub: string): Promise<string> {
    return harness.cognito.sign({
      identities: JSON.stringify([{ providerName: "Google", userId: googleSub }]),
    });
  }

  async function request(path: string, token: string, init: RequestInit = {}): Promise<Response> {
    return harness.app.request(
      `http://localhost${path}`,
      harness.authorization(token, init),
    );
  }

  async function activateCertification(adminToken: string, stem: string): Promise<string> {
    const content = importContent(stem);
    const dryRun = await request(
      "/v1/admin/imports/dry-run",
      adminToken,
      jsonRequest({ content }),
    );
    expect(dryRun.status).toBe(200);
    const dry = (await json<Envelope<DryRun>>(dryRun)).data;
    expect(dry.valid).toBe(true);

    const commit = await request(
      "/v1/admin/imports/commit",
      adminToken,
      jsonRequest({
        validationId: dry.validationId,
        commitToken: dry.commitToken,
        content,
      }),
    );
    expect(commit.status).toBe(200);

    const catalog = await request("/v1/catalog", adminToken);
    expect(catalog.status).toBe(200);
    return catalogCertificationId(await json<Envelope<Catalog>>(catalog));
  }

  async function startExam(token: string, certificationId: string): Promise<string> {
    const response = await request(
      `/v1/certifications/${certificationId}/exams`,
      token,
      jsonRequest({ idempotencyKey: `acceptance-${harness.ids.next()}` }),
    );
    expect(response.status).toBe(200);
    const sessionId = (await json<Envelope<StartedSession>>(response)).data.examSessionId;
    expect(sessionId).toBeTruthy();
    return sessionId!;
  }

  async function completePartialExam(token: string, certificationId: string): Promise<Submission> {
    const sessionId = await startExam(token, certificationId);
    const active = await request(`/v1/exams/${sessionId}`, token);
    expect(active.status).toBe(200);
    const activeExam = (await json<Envelope<ExamActive>>(active)).data;
    expect(activeExam.kind).toBe("exam-active");
    const question = activeExam.questions[0]!;

    const patch = await request(
      `/v1/exams/${sessionId}/state`,
      token,
      jsonRequest({
        expectedVersion: 0,
        questionId: question.id,
        selectedChoiceIds: [question.choices[0]!.id, question.choices[2]!.id],
        flagged: false,
        currentIndex: 0,
      }),
    );
    expect(patch.status).toBe(200);

    const submitted = await request(`/v1/exams/${sessionId}/submit`, token, {
      method: "POST",
    });
    expect(submitted.status).toBe(200);
    return (await json<Envelope<Submission>>(submitted)).data;
  }

  async function count(
    table: "attempts" | "practice_sessions" | "practice_session_questions",
    predicate = "true",
    values: readonly unknown[] = [],
  ): Promise<number> {
    const result = await harness.database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${table} WHERE ${predicate}`,
      values,
    );
    return Number(result.rows[0]?.count ?? 0);
  }
});

function catalogCertificationId(catalog: Envelope<Catalog>): string {
  const certification = catalog.data.providers[0]?.certifications.find(
    (item) => item.code === "ACCEPTANCE-CERT",
  );
  if (!certification) throw new Error("Acceptance certification was not returned by the catalog.");
  return certification.id;
}

function importContent(stem: string): string {
  return JSON.stringify({
    provider: { id: "acceptance-provider", name: "Acceptance Provider" },
    certification: {
      id: "acceptance-certification",
      code: "ACCEPTANCE-CERT",
      name: "API DSQL Acceptance Certification",
      totalQuestions: 1,
      timeLimitMinutes: 10,
      passThreshold: "75",
      scoringMode: "partial",
      domains: [{ id: "acceptance-domain", name: "Acceptance Domain", weightPercent: "100" }],
      questions: [
        {
          id: "acceptance-question",
          domainId: "acceptance-domain",
          stemEn: stem,
          explanationEn: "Acceptance explanation",
          requiredChoiceCount: 2,
          correctChoiceIds: ["choice-a", "choice-b"],
          choices: [
            { id: "choice-a", textEn: "Correct A" },
            { id: "choice-b", textEn: "Correct B" },
            { id: "choice-c", textEn: "Incorrect C" },
          ],
        },
      ],
    },
  });
}

function jsonRequest(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
