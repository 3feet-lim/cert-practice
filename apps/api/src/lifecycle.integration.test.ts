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
import { InMemoryUnitOfWork } from "@cert-quiz/db";
import { describe, expect, it } from "vitest";

import {
  createApp,
  type CognitoTokenVerifier,
  type CreateAppDependencies,
} from "./app.js";
import type { VerifiedCognitoClaims } from "./authentication.js";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const USER_ID = id(100);
const CERTIFICATION_ID = id(2);
const QUESTION_ID = id(20);
const CHOICE_ID = id(30);

class Verifier implements CognitoTokenVerifier {
  async verify(token: string): Promise<VerifiedCognitoClaims> {
    if (token !== "approved") throw new Error("invalid token");
    return {
      identities: JSON.stringify([
        { providerName: "Google", userId: "google-approved" },
      ]),
      email: "approved@example.test",
      name: "Approved",
    };
  }
}

function generationSource(): FullCatalogGenerationSource {
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
          { id: CHOICE_ID, externalId: "choice", text: { en: "Choice", ko: null } },
        ],
        correctChoiceIndexes: [0],
        requiredChoiceCount: 1,
        translationStatus: "en_only",
      },
    ],
  };
}

function approvedUser(): UserProfile {
  return {
    id: USER_ID,
    googleSub: "google-approved",
    displayName: "Approved",
    email: "approved@example.test",
    role: "user",
    approvalStatus: "approved",
    scorePublic: true,
    firstLoginAt: NOW,
    approvedAt: NOW,
    version: 0n,
  };
}

function fixture() {
  const database = new InMemoryUnitOfWork();
  const source = generationSource();
  database.seedCatalogSource(
    {
      revisionId: source.revisionId,
      certificationKey: source.certification.externalKey,
      providers: [source.provider],
      certifications: [source.certification],
      domains: source.domains,
      questions: source.questions.map((question) => ({
        id: question.id,
        revisionId: question.revisionId,
        certificationId: question.certificationId,
        domainId: question.domainId,
      })),
    },
    {
      id: source.revisionId,
      certificationKey: "CERT",
      contentHash: "a".repeat(64),
      importedBy: USER_ID,
      importedAt: NOW,
      document: {},
    },
  );
  database.seedFullGenerationSource(source);
  database.seedUser(approvedUser());
  const clock = new FixedClock(NOW);
  let next = 200;
  const ids = new SequenceUuidFactory(Array.from({ length: 100 }, () => id(next++)));
  const lifecycle = new LifecycleServices({
    unitOfWork: database,
    sessionFactory: new SessionFactory({
      ids,
      random: new SequenceRandomSource([0]),
      now: () => clock.now(),
    }),
    now: () => clock.now(),
    createId: () => id(next++),
  });
  const dependencies: CreateAppDependencies = {
    tokenVerifier: new Verifier(),
    unitOfWork: database,
    lifecycle,
    now: () => clock.now(),
    createUserId: () => id(next++),
  };
  return { app: createApp(dependencies), clock };
}

const request = (app: ReturnType<typeof createApp>, path: string, init?: RequestInit) =>
  app.request(path, {
    ...init,
    headers: {
      authorization: "Bearer approved",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

describe("offline lifecycle Hono integration", () => {
  it("runs practice start/resume/patch/submit through strict projections", async () => {
    const { app } = fixture();
    const started = await request(
      app,
      `/v1/certifications/${CERTIFICATION_ID}/practice/start`,
      { method: "POST", body: "{}" },
    );
    expect(started.status).toBe(200);
    const start = ((await started.json()) as { data: { practiceSessionId: string } })
      .data;
    const resumed = await request(
      app,
      `/v1/practice/${start.practiceSessionId}/resume`,
      { method: "POST" },
    );
    const session = (
      (await resumed.json()) as { data: { questions: Array<Record<string, unknown>> } }
    ).data;
    expect(session.questions[0]).not.toHaveProperty("correctChoiceIds");
    const submitted = await request(
      app,
      `/v1/practice/${start.practiceSessionId}/questions/${QUESTION_ID}/submit`,
      {
        method: "POST",
        body: JSON.stringify({ expectedVersion: 0, selectedChoiceIds: [CHOICE_ID] }),
      },
    );
    expect(submitted.status).toBe(200);
    const response = (
      (await submitted.json()) as {
        data: { question: Record<string, unknown>; completedPracticeResultId: string };
      }
    ).data;
    expect(response.question).toHaveProperty("correctChoiceIds");
    expect(response.completedPracticeResultId).toBeTruthy();
  });

  it("uses server state for exam preview and lazily redirects an expired session", async () => {
    const { app, clock } = fixture();
    const started = await request(app, `/v1/certifications/${CERTIFICATION_ID}/exams`, {
      method: "POST",
      body: JSON.stringify({ idempotencyKey: "request-1" }),
    });
    const start = ((await started.json()) as { data: { examSessionId: string } }).data;
    const preview = await request(
      app,
      `/v1/exams/${start.examSessionId}/submission-preview`,
      { method: "POST", body: "{}" },
    );
    expect(
      ((await preview.json()) as { data: { unansweredQuestionCount: number } }).data
        .unansweredQuestionCount,
    ).toBe(1);
    clock.advance(60_000);
    const restored = await request(app, `/v1/exams/${start.examSessionId}`);
    expect(((await restored.json()) as { data: { kind: string } }).data.kind).toBe(
      "exam-finalized",
    );
  });
});
