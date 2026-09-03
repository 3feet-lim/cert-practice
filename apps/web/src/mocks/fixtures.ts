import type {
  ActivePracticeSessionsDto,
  CatalogDto,
  CommitImportRequest,
  CommitImportResponse,
  CurrentUserDto,
  DryRunImportRequest,
  DryRunImportResponse,
  ExamActiveQuestion,
  ExamActiveSessionDto,
  ExamFinalizedRedirectDto,
  ExamResultDto,
  HistoryPageDto,
  HistoryTrendsDto,
  ImportDocument,
  LeaderboardDto,
  PendingUsersDto,
  PracticeResultDto,
  PracticeSessionDto,
  PracticeSubmittedQuestion,
  PracticeUnsubmittedQuestion,
  ReviewQuestion,
  StartExamResponse,
} from "@cert-quiz/contracts";

import { HEALTH_FIXTURE } from "./health-fixture";
import {
  DEFAULT_FIXTURE_SEED,
  FakeServerClock,
  SeededIdFactory,
  SeededRandomSource,
  shuffled,
} from "./deterministic";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const PRACTICE_RETENTION_MS = 168 * HOUR_MS;

export const DOP_C02_METADATA = Object.freeze({
  provider: "AWS",
  code: "DOP-C02",
  name: "AWS Certified DevOps Engineer – Professional",
  totalQuestions: 75,
  timeLimitMinutes: 180,
  passThreshold: "75",
  scoringMode: "all_or_nothing" as const,
});

export const DOP_C02_DOMAINS = Object.freeze([
  {
    key: "sdlc",
    name: "SDLC Automation",
    weightPercent: "22",
    allocatedQuestionCount: 17,
  },
  {
    key: "configuration",
    name: "Configuration Management and IaC",
    weightPercent: "17",
    allocatedQuestionCount: 13,
  },
  {
    key: "security",
    name: "Security and Compliance",
    weightPercent: "17",
    allocatedQuestionCount: 13,
  },
  {
    key: "resilience",
    name: "Resilient Cloud Solutions",
    weightPercent: "15",
    allocatedQuestionCount: 11,
  },
  {
    key: "monitoring",
    name: "Monitoring and Logging",
    weightPercent: "15",
    allocatedQuestionCount: 11,
  },
  {
    key: "incident",
    name: "Incident and Event Response",
    weightPercent: "14",
    allocatedQuestionCount: 10,
  },
] as const);

const DOMAIN_EARNED_SCORES = [14, 10, 10, 9, 9, 8] as const;
const DOMAIN_ACCURACY_RATES = [
  "82.3529411764705882",
  "76.9230769230769231",
  "76.9230769230769231",
  "81.8181818181818182",
  "81.8181818181818182",
  "80",
] as const;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
    Object.freeze(value);
  }
  return value;
}

function iso(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function canonicalToken(id: string): string {
  return id.replaceAll("-", "").repeat(2);
}

interface QuestionSource {
  publicQuestion: Omit<
    PracticeUnsubmittedQuestion,
    "kind" | "selectedChoiceIds" | "flagged"
  >;
  correctChoiceIds: string[];
  explanation: { en: string; ko: string | null };
  domainIndex: number;
  domainQuestionIndex: number;
}

function createQuestionSources(
  ids: SeededIdFactory,
  random: SeededRandomSource,
): QuestionSource[] {
  const sources: QuestionSource[] = [];
  let globalIndex = 0;

  for (const [domainIndex, domain] of DOP_C02_DOMAINS.entries()) {
    for (
      let domainQuestionIndex = 0;
      domainQuestionIndex < domain.allocatedQuestionCount;
      domainQuestionIndex += 1
    ) {
      const questionNumber = globalIndex + 1;
      const questionId = ids.named(`question-${questionNumber}`);
      const requiredChoiceCount = questionNumber % 6 === 0 ? 2 : 1;
      const translationStatus =
        questionNumber % 5 === 0 ? ("en_only" as const) : ("translated" as const);
      const sourceChoices = Array.from({ length: 4 }, (_, choiceIndex) => {
        const choiceId = ids.named(
          `question-${questionNumber}-choice-${choiceIndex + 1}`,
        );
        return {
          id: choiceId,
          text: {
            en: `Question ${questionNumber} choice ${choiceIndex + 1}`,
            ko:
              translationStatus === "translated"
                ? `${questionNumber}번 문제 선지 ${choiceIndex + 1}`
                : null,
          },
        };
      });
      const correctChoiceIds = sourceChoices
        .slice(0, requiredChoiceCount)
        .map(({ id }) => id);
      const choices = shuffled(sourceChoices, random);

      sources.push({
        publicQuestion: {
          id: questionId,
          displayNumber: questionNumber,
          domainName: domain.name,
          stem: {
            en: `Deterministic DOP-C02 question ${questionNumber}`,
            ko:
              translationStatus === "translated"
                ? `결정적 DOP-C02 문제 ${questionNumber}`
                : null,
          },
          choices,
          requiredChoiceCount,
          translationStatus,
        },
        correctChoiceIds,
        explanation: {
          en: `Explanation for deterministic question ${questionNumber}.`,
          ko:
            translationStatus === "translated"
              ? `결정적 문제 ${questionNumber} 해설입니다.`
              : null,
        },
        domainIndex,
        domainQuestionIndex,
      });
      globalIndex += 1;
    }
  }

  return shuffled(sources, random).map((source, index) => ({
    ...source,
    publicQuestion: { ...source.publicQuestion, displayNumber: index + 1 },
  }));
}

function wrongSelection(source: QuestionSource): string[] {
  const correct = new Set(source.correctChoiceIds);
  return source.publicQuestion.choices
    .map(({ id }) => id)
    .filter((id) => !correct.has(id))
    .slice(0, source.publicQuestion.requiredChoiceCount);
}

function selectedForReview(source: QuestionSource): {
  selectedChoiceIds: string[];
  isCorrect: boolean;
} {
  const earnedInDomain = DOMAIN_EARNED_SCORES[source.domainIndex];
  if (earnedInDomain === undefined) {
    throw new Error("Question source has an unknown DOP-C02 domain.");
  }
  const isCorrect = source.domainQuestionIndex < earnedInDomain;
  return {
    selectedChoiceIds: isCorrect
      ? [...source.correctChoiceIds]
      : wrongSelection(source),
    isCorrect,
  };
}

function createImportDocument(sources: readonly QuestionSource[]): ImportDocument {
  return {
    provider: { id: "aws", name: DOP_C02_METADATA.provider, logoUrl: null },
    certification: {
      id: "dop-c02",
      code: DOP_C02_METADATA.code,
      name: DOP_C02_METADATA.name,
      totalQuestions: DOP_C02_METADATA.totalQuestions,
      timeLimitMinutes: DOP_C02_METADATA.timeLimitMinutes,
      passThreshold: DOP_C02_METADATA.passThreshold,
      scoringMode: DOP_C02_METADATA.scoringMode,
      domains: DOP_C02_DOMAINS.map((domain) => ({
        id: domain.key,
        name: domain.name,
        weightPercent: domain.weightPercent,
      })),
      questions: sources.map((source, index) => ({
        id: `dop-c02-q-${String(index + 1).padStart(3, "0")}`,
        domainId: DOP_C02_DOMAINS[source.domainIndex]?.key ?? "unknown",
        stemEn: source.publicQuestion.stem.en,
        ...(source.publicQuestion.stem.ko === null
          ? {}
          : { stemKo: source.publicQuestion.stem.ko }),
        explanationEn: source.explanation.en,
        ...(source.explanation.ko === null
          ? {}
          : { explanationKo: source.explanation.ko }),
        requiredChoiceCount: source.publicQuestion.requiredChoiceCount,
        correctChoiceIds: source.correctChoiceIds.map(
          (choiceId) => `choice-${choiceId.replaceAll("-", "").slice(0, 8)}`,
        ),
        choices: source.publicQuestion.choices.map((choice) => ({
          id: `choice-${choice.id.replaceAll("-", "").slice(0, 8)}`,
          textEn: choice.text.en,
          ...(choice.text.ko === null ? {} : { textKo: choice.text.ko }),
        })),
      })),
    },
  };
}

export interface CertQuizFixtureOptions {
  seed?: number;
  clock?: FakeServerClock;
}

/**
 * Builds the complete deterministic corpus consumed by MSW and future backend
 * contract providers. It models UI data only; it is not an auth, transaction,
 * ownership, or concurrency implementation.
 */
export function createCertQuizFixtures(options: CertQuizFixtureOptions = {}) {
  const seed = options.seed ?? DEFAULT_FIXTURE_SEED;
  const clock = options.clock ?? new FakeServerClock();
  const ids = new SeededIdFactory(seed);
  const random = new SeededRandomSource(seed);
  const nowMs = clock.now().getTime();
  const sources = createQuestionSources(ids, random);

  const providerId = ids.named("provider-aws");
  const certificationId = ids.named("certification-dop-c02");
  const practiceSessionId = ids.named("practice-active");
  const practiceResultId = ids.named("practice-result");
  const activeExamSessionId = ids.named("exam-active");
  const expiredExamSessionId = ids.named("exam-expired");
  const finalizedExamSessionId = ids.named("exam-finalized");
  const attemptId = ids.named("attempt-immutable");
  const validationId = ids.named("import-validation");
  const revisionId = ids.named("catalog-revision");

  const approvedUser: CurrentUserDto = {
    id: ids.named("user-approved"),
    displayName: "Approved Learner",
    email: "approved@example.test",
    role: "user",
    approvalStatus: "approved",
    scorePublic: true,
    stateVersion: 3,
  };
  const adminUser: CurrentUserDto = {
    id: ids.named("user-admin"),
    displayName: "Catalog Admin",
    email: "admin@example.test",
    role: "admin",
    approvalStatus: "approved",
    scorePublic: false,
    stateVersion: 7,
  };

  const domains = DOP_C02_DOMAINS.map((domain) => ({
    id: ids.named(`domain-${domain.key}`),
    name: domain.name,
    weightPercent: domain.weightPercent,
    questionCount: domain.allocatedQuestionCount,
    allocatedQuestionCount: domain.allocatedQuestionCount,
  }));
  const certification = {
    id: certificationId,
    code: DOP_C02_METADATA.code,
    name: DOP_C02_METADATA.name,
    totalQuestions: DOP_C02_METADATA.totalQuestions,
    timeLimitMinutes: DOP_C02_METADATA.timeLimitMinutes,
    passThreshold: DOP_C02_METADATA.passThreshold,
    scoringMode: DOP_C02_METADATA.scoringMode,
    domains,
  };
  const validCatalog: CatalogDto = {
    providers: [
      {
        id: providerId,
        name: DOP_C02_METADATA.provider,
        logoUrl: null,
        certifications: [certification],
      },
    ],
    dataErrors: [],
  };
  const emptyCatalog: CatalogDto = { providers: [], dataErrors: [] };
  const invalidCatalog: CatalogDto = {
    providers: [],
    dataErrors: [
      {
        kind: "invalid-certification",
        certificationId: ids.named("invalid-certification"),
        reason: "Domain weights sum to 95 instead of 100.",
      },
      {
        kind: "insufficient-domain",
        certificationId,
        domainName: DOP_C02_DOMAINS[5].name,
        availableQuestionCount: 9,
        requiredQuestionCount: 10,
      },
    ],
  };

  const activePracticeQuestions: PracticeUnsubmittedQuestion[] = sources.map(
    (source, index) => ({
      kind: "practice-unsubmitted",
      ...source.publicQuestion,
      selectedChoiceIds: index === 0 ? [...source.correctChoiceIds] : [],
      flagged: index === 1,
    }),
  );
  const submittedFirstSource = sources[0];
  if (submittedFirstSource === undefined) {
    throw new Error("The DOP-C02 fixture must include at least one question.");
  }
  const submittedFirstSelection = selectedForReview(submittedFirstSource);
  const submittedFirstQuestion: PracticeSubmittedQuestion = {
    kind: "practice-submitted",
    ...submittedFirstSource.publicQuestion,
    selectedChoiceIds: submittedFirstSelection.selectedChoiceIds,
    flagged: false,
    correctChoiceIds: [...submittedFirstSource.correctChoiceIds],
    isCorrect: submittedFirstSelection.isCorrect,
    earnedScore: submittedFirstSelection.isCorrect ? "1" : "0",
    explanation: submittedFirstSource.explanation,
  };
  const activePractice: PracticeSessionDto = {
    practiceSessionId,
    certificationId,
    certificationCode: DOP_C02_METADATA.code,
    certificationName: DOP_C02_METADATA.name,
    currentIndex: 7,
    stateVersion: 12,
    questions: activePracticeQuestions,
  };
  const submittedPractice: PracticeSessionDto = {
    ...activePractice,
    currentIndex: 1,
    stateVersion: 13,
    questions: [submittedFirstQuestion, ...activePracticeQuestions.slice(1)],
  };
  const activePracticeSessions: ActivePracticeSessionsDto = {
    sessions: [
      {
        practiceSessionId,
        certificationId,
        certificationCode: DOP_C02_METADATA.code,
        currentQuestionNumber: activePractice.currentIndex + 1,
        totalQuestions: DOP_C02_METADATA.totalQuestions,
        stateVersion: activePractice.stateVersion,
        updatedAt: iso(nowMs - 5 * MINUTE_MS),
      },
    ],
  };

  const activeExamStartedAtMs = nowMs - 30 * MINUTE_MS;
  const activeExamExpiresAtMs =
    activeExamStartedAtMs + DOP_C02_METADATA.timeLimitMinutes * MINUTE_MS;
  const examQuestions: ExamActiveQuestion[] = sources.map((source, index) => ({
    kind: "exam-active",
    ...source.publicQuestion,
    selectedChoiceIds: index < 45 ? [...source.correctChoiceIds] : [],
    flagged: index === 2 || index === 10 || index === 20,
  }));
  const activeExam: ExamActiveSessionDto = {
    kind: "exam-active-session",
    examSessionId: activeExamSessionId,
    certificationId,
    certificationCode: DOP_C02_METADATA.code,
    certificationName: DOP_C02_METADATA.name,
    currentIndex: 20,
    stateVersion: 21,
    startedAt: iso(activeExamStartedAtMs),
    expiresAt: iso(activeExamExpiresAtMs),
    serverNow: clock.iso(),
    remainingSeconds: Math.max(0, Math.floor((activeExamExpiresAtMs - nowMs) / 1000)),
    questions: examQuestions,
  };
  const expiredExam: ExamActiveSessionDto = {
    ...activeExam,
    examSessionId: expiredExamSessionId,
    startedAt: iso(nowMs - DOP_C02_METADATA.timeLimitMinutes * MINUTE_MS),
    expiresAt: clock.iso(),
    remainingSeconds: 0,
  };
  const finalizedExam: ExamFinalizedRedirectDto = {
    kind: "exam-finalized",
    examSessionId: finalizedExamSessionId,
    attemptId,
  };
  const startExam: StartExamResponse = {
    examSessionId: activeExamSessionId,
    stateVersion: activeExam.stateVersion,
    startedAt: activeExam.startedAt,
    expiresAt: activeExam.expiresAt,
    serverNow: activeExam.serverNow,
  };

  const reviewQuestions: ReviewQuestion[] = sources.map((source) => {
    const selection = selectedForReview(source);
    return {
      kind: "review",
      ...source.publicQuestion,
      selectedChoiceIds: selection.selectedChoiceIds,
      flagged: false,
      correctChoiceIds: [...source.correctChoiceIds],
      isCorrect: selection.isCorrect,
      earnedScore: selection.isCorrect ? "1" : "0",
      explanation: source.explanation,
    };
  });
  const domainPerformance = DOP_C02_DOMAINS.map((domain, index) => ({
    domainName: domain.name,
    questionCount: domain.allocatedQuestionCount,
    earnedScore: String(DOMAIN_EARNED_SCORES[index]),
    accuracyRate: DOMAIN_ACCURACY_RATES[index] ?? "0",
  }));
  const certificationSnapshot = {
    code: DOP_C02_METADATA.code,
    name: DOP_C02_METADATA.name,
    scoringMode: DOP_C02_METADATA.scoringMode,
    passThreshold: DOP_C02_METADATA.passThreshold,
  };
  const completedAtMs = nowMs - 2 * HOUR_MS;
  const practiceResult: PracticeResultDto = deepFreeze({
    kind: "practice-result",
    resultId: practiceResultId,
    certification: certificationSnapshot,
    score: { rawScore: "60", accuracyRate: "80" },
    domains: domainPerformance,
    questions: reviewQuestions,
    completedAt: iso(completedAtMs),
    expiresAt: iso(completedAtMs + PRACTICE_RETENTION_MS),
  });
  const examResult: ExamResultDto = deepFreeze({
    kind: "exam-result",
    attemptId,
    examSessionId: finalizedExamSessionId,
    certification: certificationSnapshot,
    score: { rawScore: "60", accuracyRate: "80" },
    reference1000Score: 800,
    passed: true,
    domains: domainPerformance,
    questions: reviewQuestions,
    startedAt: iso(nowMs - 4 * HOUR_MS),
    expiresAt: iso(nowMs - HOUR_MS),
    submittedAt: iso(nowMs - HOUR_MS),
    submissionReason: "expired",
  });

  const historyTieTime = iso(nowMs - 24 * HOUR_MS);
  const historyTieAttempts = [
    {
      attemptId: ids.named("history-tie-a"),
      certificationCode: DOP_C02_METADATA.code,
      certificationName: DOP_C02_METADATA.name,
      rawScore: "57",
      accuracyRate: "76",
      reference1000Score: 760,
      passed: true,
      submittedAt: historyTieTime,
    },
    {
      attemptId: ids.named("history-tie-b"),
      certificationCode: DOP_C02_METADATA.code,
      certificationName: DOP_C02_METADATA.name,
      rawScore: "54",
      accuracyRate: "72",
      reference1000Score: 720,
      passed: false,
      submittedAt: historyTieTime,
    },
  ].sort((left, right) => left.attemptId.localeCompare(right.attemptId));
  const currentAttemptSummary = {
    attemptId,
    certificationCode: DOP_C02_METADATA.code,
    certificationName: DOP_C02_METADATA.name,
    rawScore: examResult.score.rawScore,
    accuracyRate: examResult.score.accuracyRate,
    reference1000Score: examResult.reference1000Score,
    passed: examResult.passed,
    submittedAt: examResult.submittedAt,
  };
  const history: HistoryPageDto = {
    attempts: [currentAttemptSummary, ...historyTieAttempts],
    nextCursor: null,
  };
  const historyTrends: HistoryTrendsDto = {
    certifications: [
      {
        certificationId,
        certificationCode: DOP_C02_METADATA.code,
        certificationName: DOP_C02_METADATA.name,
        attemptCount: history.attempts.length,
        points: [...historyTieAttempts, currentAttemptSummary]
          .sort(
            (left, right) =>
              left.submittedAt.localeCompare(right.submittedAt) ||
              left.attemptId.localeCompare(right.attemptId),
          )
          .map(({ attemptId: pointAttemptId, accuracyRate, submittedAt }) => ({
            attemptId: pointAttemptId,
            accuracyRate,
            submittedAt,
          })),
      },
    ],
  };

  const tieSubmittedAt = iso(nowMs - 48 * HOUR_MS);
  const tiedUsers = [
    { userId: approvedUser.id, displayName: approvedUser.displayName },
    { userId: ids.named("leaderboard-user-tie"), displayName: "Tie Breaker" },
  ].sort((left, right) => left.userId.localeCompare(right.userId));
  const leaderboard: LeaderboardDto = {
    certificationId,
    certificationCode: DOP_C02_METADATA.code,
    certificationName: DOP_C02_METADATA.name,
    entries: [
      {
        rank: 1,
        userId: ids.named("leaderboard-user-first"),
        displayName: "First Place",
        accuracyRate: "90.6666666666666667",
        rawScore: "68",
        attemptId: ids.named("leaderboard-attempt-first"),
        submittedAt: iso(nowMs - 72 * HOUR_MS),
        isCurrentUser: false,
      },
      ...tiedUsers.map(({ userId, displayName }) => ({
        rank: 2,
        userId,
        displayName,
        accuracyRate: "80",
        rawScore: "60",
        attemptId: ids.named(`leaderboard-attempt-${userId}`),
        submittedAt: tieSubmittedAt,
        isCurrentUser: userId === approvedUser.id,
      })),
      {
        rank: 4,
        userId: ids.named("leaderboard-user-fourth"),
        displayName: "Fourth Place",
        accuracyRate: "60",
        rawScore: "45",
        attemptId: ids.named("leaderboard-attempt-fourth"),
        submittedAt: iso(nowMs - 12 * HOUR_MS),
        isCurrentUser: false,
      },
    ],
  };

  const pendingUsers: PendingUsersDto = {
    users: [
      {
        id: ids.named("pending-user-one"),
        displayName: "Pending One",
        email: "pending.one@example.test",
        firstLoginAt: iso(nowMs - 2 * HOUR_MS),
      },
      {
        id: ids.named("pending-user-two"),
        displayName: "Pending Two",
        email: "pending.two@example.test",
        firstLoginAt: iso(nowMs - HOUR_MS),
      },
    ],
  };

  const importDocument = createImportDocument(sources);
  const importContent = JSON.stringify(importDocument);
  const dryRunRequest: DryRunImportRequest = { content: importContent };
  const dryRunValid: DryRunImportResponse = {
    valid: true,
    summary: {
      totalQuestions: { status: "available", value: 75 },
      domainQuestionCounts: Object.fromEntries(
        DOP_C02_DOMAINS.map((domain) => [
          domain.key,
          { status: "available" as const, value: domain.allocatedQuestionCount },
        ]),
      ),
      translationStatusCounts: {
        translated: { status: "available", value: 60 },
        enOnly: { status: "available", value: 15 },
      },
      errorCount: 0,
    },
    errors: [],
    validationId,
    commitToken: canonicalToken(validationId),
    expiresAt: iso(nowMs + 15 * MINUTE_MS),
  };
  const invalidImportContent = JSON.stringify({
    provider: { id: "aws", name: "AWS" },
    certification: { id: "broken-dop-c02", domains: [] },
  });
  const dryRunInvalid: DryRunImportResponse = {
    valid: false,
    summary: {
      totalQuestions: {
        status: "unavailable",
        reason: "The questions array is missing.",
      },
      domainQuestionCounts: {},
      translationStatusCounts: {
        translated: {
          status: "unavailable",
          reason: "Translation counts require valid questions.",
        },
        enOnly: {
          status: "unavailable",
          reason: "Translation counts require valid questions.",
        },
      },
      errorCount: 2,
    },
    errors: [
      {
        code: "required-field",
        path: ["certification", "questions"],
        message: "Questions are required.",
        relatedIdentifiers: ["broken-dop-c02"],
      },
      {
        code: "invalid-domain-weight",
        path: ["certification", "domains"],
        message: "Domain weights must sum exactly to 100.",
        relatedIdentifiers: ["broken-dop-c02"],
      },
    ],
  };
  const commitRequest: CommitImportRequest = {
    validationId,
    commitToken: dryRunValid.commitToken ?? canonicalToken(validationId),
    content: importContent,
  };
  const commitResponse: CommitImportResponse = {
    validationId,
    certificationId,
    activatedRevisionId: revisionId,
    committedAt: clock.iso(),
  };

  return {
    health: HEALTH_FIXTURE,
    seed,
    clock,
    ids: deepFreeze({
      providerId,
      certificationId,
      practiceSessionId,
      practiceResultId,
      activeExamSessionId,
      expiredExamSessionId,
      finalizedExamSessionId,
      attemptId,
      validationId,
      revisionId,
      questionIds: sources.map(({ publicQuestion }) => publicQuestion.id),
    }),
    auth: deepFreeze({
      unauthenticated: { kind: "unauthenticated" as const },
      pending: {
        kind: "pending" as const,
        approval: { approvalStatus: "pending" as const },
      },
      approved: {
        kind: "approved" as const,
        approval: { approvalStatus: "approved" as const },
        user: approvedUser,
      },
      admin: {
        kind: "admin" as const,
        approval: { approvalStatus: "approved" as const },
        user: adminUser,
      },
    }),
    catalog: deepFreeze({
      empty: emptyCatalog,
      valid: validCatalog,
      invalid: invalidCatalog,
    }),
    practice: deepFreeze({
      activeSessions: activePracticeSessions,
      active: activePractice,
      submitted: submittedPractice,
      immutableResult: practiceResult,
      retentionBoundary: {
        completedAt: iso(nowMs - PRACTICE_RETENTION_MS),
        beforeExpiry: iso(nowMs - 1),
        expiresAt: clock.iso(),
        atExpiry: clock.iso(),
        afterExpiry: iso(nowMs + 1),
      },
    }),
    exam: deepFreeze({
      start: startExam,
      active: activeExam,
      expired: expiredExam,
      finalized: finalizedExam,
      immutableResult: examResult,
      timerBoundary: {
        beforeExpiry: iso(nowMs - 1),
        expiresAt: clock.iso(),
        atExpiry: clock.iso(),
        afterExpiry: iso(nowMs + 1),
      },
    }),
    history: deepFreeze({
      empty: { attempts: [], nextCursor: null } satisfies HistoryPageDto,
      populated: history,
      trends: historyTrends,
      emptyTrends: { certifications: [] } satisfies HistoryTrendsDto,
    }),
    leaderboard: deepFreeze({
      empty: {
        certificationId,
        certificationCode: DOP_C02_METADATA.code,
        certificationName: DOP_C02_METADATA.name,
        entries: [],
      } satisfies LeaderboardDto,
      tied: leaderboard,
    }),
    admin: deepFreeze({ pendingUsers, emptyPendingUsers: { users: [] } }),
    import: deepFreeze({
      document: importDocument,
      validContent: importContent,
      invalidContent: invalidImportContent,
      dryRunRequest,
      dryRunValid,
      dryRunInvalid,
      commitRequest,
      commitResponse,
    }),
  };
}

export type CertQuizFixtures = ReturnType<typeof createCertQuizFixtures>;
