import type {
  CommitImportResponse,
  DryRunImportResponse,
  ExamResultDto,
  ExamStateResponse,
  GetExamResponse,
  PatchExamStateRequest,
  PatchPracticeStateRequest,
  PracticeResultDto,
  PracticeSessionDto,
  PracticeStateResponse,
  PracticeSubmittedQuestion,
  ReviewQuestion,
  StartExamResponse,
  SubmissionPreviewDto,
  SubmitPracticeQuestionResponse,
  TransportError,
} from "@cert-quiz/contracts";

/**
 * This in-memory model exists only to make frontend UI states reproducible.
 * It is not evidence of backend persistence, authentication, authorization,
 * transaction atomicity, concurrency control, server-time accuracy, or security.
 */

export const MOCK_IDS = {
  user: "00000000-0000-4000-8000-000000000001",
  otherUser: "00000000-0000-4000-8000-000000000002",
  certification: "00000000-0000-4000-8000-000000000003",
  practice: "00000000-0000-4000-8000-000000000008",
  replacementPractice: "00000000-0000-4000-8000-000000000018",
  exam: "00000000-0000-4000-8000-000000000009",
  attempt: "00000000-0000-4000-8000-00000000000a",
  practiceResult: "00000000-0000-4000-8000-00000000000b",
  validation: "00000000-0000-4000-8000-00000000000c",
  revision: "00000000-0000-4000-8000-00000000000d",
  questionOne: "00000000-0000-4000-8000-000000000101",
  questionTwo: "00000000-0000-4000-8000-000000000102",
  choiceOneA: "00000000-0000-4000-8000-000000000111",
  choiceOneB: "00000000-0000-4000-8000-000000000112",
  choiceTwoA: "00000000-0000-4000-8000-000000000121",
  choiceTwoB: "00000000-0000-4000-8000-000000000122",
} as const;

export type MockErrorCode =
  | "answer-locked"
  | "content-changed"
  | "exam-expired"
  | "invalid-choice-count"
  | "not-found"
  | "ownership-denied"
  | "stale-version"
  | "token-used"
  | "validation-expired"
  | "validation-failed"
  | "validation-required";

const ERROR_STATUS: Record<MockErrorCode, number> = {
  "answer-locked": 409,
  "content-changed": 409,
  "exam-expired": 409,
  "invalid-choice-count": 422,
  "not-found": 404,
  "ownership-denied": 403,
  "stale-version": 409,
  "token-used": 409,
  "validation-expired": 409,
  "validation-failed": 422,
  "validation-required": 409,
};

export class MockStateError extends Error {
  readonly code: MockErrorCode;
  readonly status: number;
  readonly details?: TransportError["details"];

  constructor(
    code: MockErrorCode,
    message: string,
    details?: TransportError["details"],
  ) {
    super(message);
    this.name = "MockStateError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

type MockQuestionState = {
  id: string;
  displayNumber: number;
  domainName: string;
  stem: { en: string; ko: string };
  choices: Array<{
    id: string;
    text: { en: string; ko: string };
  }>;
  correctChoiceIds: string[];
  requiredChoiceCount: number;
  explanation: { en: string; ko: string };
  selectedChoiceIds: string[];
  flagged: boolean;
  finalChoiceIds?: string[];
  earnedScore?: "0" | "1";
};

type PracticeState = {
  id: string;
  readonly ownerId: string;
  stateVersion: number;
  currentIndex: number;
  status: "active" | "completed";
  questions: MockQuestionState[];
  result?: PracticeResultDto;
};

type ExamState = {
  readonly id: string;
  readonly ownerId: string;
  stateVersion: number;
  currentIndex: number;
  readonly startedAt: string;
  readonly expiresAt: string;
  readonly startIdempotencyKey: string;
  status: "active" | "submitted";
  questions: MockQuestionState[];
  attempt?: ExamResultDto;
};

type ImportValidationState = {
  readonly id: string;
  readonly actorId: string;
  readonly token: string;
  readonly content: string;
  readonly expiresAt: string;
  used: boolean;
};

export type MockStateSnapshot = {
  readonly practice: {
    readonly id: string;
    readonly stateVersion: number;
    readonly currentIndex: number;
    readonly status: "active" | "completed";
    readonly flags: readonly boolean[];
    readonly selectedChoiceIds: readonly (readonly string[])[];
    readonly lockedQuestionCount: number;
    readonly resultCount: number;
  };
  readonly exam: {
    readonly stateVersion: number;
    readonly currentIndex: number;
    readonly status: "active" | "submitted";
    readonly flags: readonly boolean[];
    readonly selectedChoiceIds: readonly (readonly string[])[];
    readonly attemptCount: number;
  };
  readonly validations: ReadonlyArray<{
    readonly id: string;
    readonly used: boolean;
    readonly expiresAt: string;
  }>;
};

export type MockStateMachineOptions = {
  now?: string;
  examStartedAt?: string;
  examDurationMinutes?: number;
};

const CERTIFICATION = {
  code: "DOP-C02",
  name: "AWS Certified DevOps Engineer – Professional",
  scoringMode: "all_or_nothing" as const,
  passThreshold: "75",
};

function createQuestions(): MockQuestionState[] {
  return [
    {
      id: MOCK_IDS.questionOne,
      displayNumber: 1,
      domainName: "SDLC Automation",
      stem: {
        en: "Which deployment strategy minimizes production risk?",
        ko: "프로덕션 위험을 최소화하는 배포 전략은 무엇입니까?",
      },
      choices: [
        {
          id: MOCK_IDS.choiceOneA,
          text: { en: "Blue/green deployment", ko: "블루/그린 배포" },
        },
        {
          id: MOCK_IDS.choiceOneB,
          text: { en: "Manual replacement", ko: "수동 교체" },
        },
      ],
      correctChoiceIds: [MOCK_IDS.choiceOneA],
      requiredChoiceCount: 1,
      explanation: {
        en: "Blue/green keeps a separate production-ready environment.",
        ko: "블루/그린은 별도의 프로덕션 준비 환경을 유지합니다.",
      },
      selectedChoiceIds: [],
      flagged: false,
    },
    {
      id: MOCK_IDS.questionTwo,
      displayNumber: 2,
      domainName: "Monitoring and Logging",
      stem: {
        en: "Which signal should trigger an operational alert?",
        ko: "어떤 신호가 운영 경고를 발생시켜야 합니까?",
      },
      choices: [
        {
          id: MOCK_IDS.choiceTwoA,
          text: { en: "Sustained error-rate breach", ko: "지속적인 오류율 초과" },
        },
        {
          id: MOCK_IDS.choiceTwoB,
          text: { en: "A successful health check", ko: "성공한 상태 확인" },
        },
      ],
      correctChoiceIds: [MOCK_IDS.choiceTwoA],
      requiredChoiceCount: 1,
      explanation: {
        en: "Alerts should represent sustained actionable failures.",
        ko: "경고는 지속적이고 조치 가능한 장애를 나타내야 합니다.",
      },
      selectedChoiceIds: [],
      flagged: true,
    },
  ];
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function toIso(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function scoreQuestion(
  question: MockQuestionState,
  selected: readonly string[],
): "0" | "1" {
  return sameSet(question.correctChoiceIds, selected) ? "1" : "0";
}

function publicQuestionFields(question: MockQuestionState) {
  return {
    id: question.id,
    displayNumber: question.displayNumber,
    domainName: question.domainName,
    stem: question.stem,
    choices: question.choices,
    requiredChoiceCount: question.requiredChoiceCount,
    selectedChoiceIds: question.finalChoiceIds ?? question.selectedChoiceIds,
    flagged: question.flagged,
    translationStatus: "translated" as const,
  };
}

function toPracticeSubmittedQuestion(
  question: MockQuestionState,
): PracticeSubmittedQuestion {
  if (!question.finalChoiceIds || question.earnedScore === undefined) {
    throw new Error("A practice question must be locked before projection");
  }

  return {
    kind: "practice-submitted",
    ...publicQuestionFields(question),
    selectedChoiceIds: question.finalChoiceIds,
    correctChoiceIds: [...question.correctChoiceIds],
    isCorrect: question.earnedScore === "1",
    earnedScore: question.earnedScore,
    explanation: question.explanation,
  };
}

function toReviewQuestion(question: MockQuestionState): ReviewQuestion {
  const selectedChoiceIds = question.finalChoiceIds ?? question.selectedChoiceIds;
  const earnedScore = scoreQuestion(question, selectedChoiceIds);

  return {
    kind: "review",
    ...publicQuestionFields(question),
    selectedChoiceIds,
    correctChoiceIds: [...question.correctChoiceIds],
    isCorrect: earnedScore === "1",
    earnedScore,
    explanation: question.explanation,
  };
}

function decimalPercentage(correctCount: number, questionCount: number): string {
  const value = (correctCount / questionCount) * 100;
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, "");
}

export class CertQuizMockStateMachine {
  private nowMilliseconds: number;
  private practice: PracticeState;
  private readonly exam: ExamState;
  private readonly validations = new Map<string, ImportValidationState>();

  constructor(options: MockStateMachineOptions = {}) {
    const startedAt = options.examStartedAt ?? "2026-03-23T12:00:00.000Z";
    const durationMinutes = options.examDurationMinutes ?? 180;
    this.nowMilliseconds = Date.parse(options.now ?? "2026-03-23T12:10:00.000Z");
    this.practice = {
      id: MOCK_IDS.practice,
      ownerId: MOCK_IDS.user,
      stateVersion: 0,
      currentIndex: 0,
      status: "active",
      questions: createQuestions(),
    };
    this.exam = {
      id: MOCK_IDS.exam,
      ownerId: MOCK_IDS.user,
      stateVersion: 0,
      currentIndex: 0,
      startedAt,
      expiresAt: toIso(Date.parse(startedAt) + durationMinutes * 60_000),
      startIdempotencyKey: "exam-start-1",
      status: "active",
      questions: createQuestions(),
    };
  }

  now(): string {
    return toIso(this.nowMilliseconds);
  }

  setNow(now: string): void {
    this.nowMilliseconds = Date.parse(now);
  }

  advanceTime(milliseconds: number): void {
    this.nowMilliseconds += milliseconds;
  }

  snapshot(): MockStateSnapshot {
    return {
      practice: {
        id: this.practice.id,
        stateVersion: this.practice.stateVersion,
        currentIndex: this.practice.currentIndex,
        status: this.practice.status,
        flags: this.practice.questions.map(({ flagged }) => flagged),
        selectedChoiceIds: this.practice.questions.map(({ selectedChoiceIds }) => [
          ...selectedChoiceIds,
        ]),
        lockedQuestionCount: this.practice.questions.filter(
          ({ finalChoiceIds }) => finalChoiceIds !== undefined,
        ).length,
        resultCount: this.practice.result ? 1 : 0,
      },
      exam: {
        stateVersion: this.exam.stateVersion,
        currentIndex: this.exam.currentIndex,
        status: this.exam.status,
        flags: this.exam.questions.map(({ flagged }) => flagged),
        selectedChoiceIds: this.exam.questions.map(({ selectedChoiceIds }) => [
          ...selectedChoiceIds,
        ]),
        attemptCount: this.exam.attempt ? 1 : 0,
      },
      validations: [...this.validations.values()].map(({ id, used, expiresAt }) => ({
        id,
        used,
        expiresAt,
      })),
    };
  }

  assertOwner(resourceOwnerId: string, actorId: string): void {
    if (resourceOwnerId !== actorId) {
      throw new MockStateError("ownership-denied", "You cannot access this resource.");
    }
  }

  getPracticeOwnerId(): string {
    return this.practice.ownerId;
  }

  getExamOwnerId(): string {
    return this.exam.ownerId;
  }

  getPracticeSession(practiceSessionId: string, actorId: string): PracticeSessionDto {
    this.requirePractice(practiceSessionId, actorId);
    return {
      practiceSessionId: this.practice.id,
      certificationId: MOCK_IDS.certification,
      certificationCode: CERTIFICATION.code,
      certificationName: CERTIFICATION.name,
      currentIndex: this.practice.currentIndex,
      stateVersion: this.practice.stateVersion,
      questions: this.practice.questions.map((question) =>
        question.finalChoiceIds
          ? toPracticeSubmittedQuestion(question)
          : {
              kind: "practice-unsubmitted" as const,
              ...publicQuestionFields(question),
            },
      ),
    };
  }

  replacePractice(practiceSessionId: string, actorId: string): PracticeSessionDto {
    this.requirePractice(practiceSessionId, actorId);
    this.practice = {
      id: MOCK_IDS.replacementPractice,
      ownerId: actorId,
      stateVersion: 0,
      currentIndex: 0,
      status: "active",
      questions: createQuestions(),
    };
    return this.getPracticeSession(this.practice.id, actorId);
  }

  patchPractice(
    practiceSessionId: string,
    actorId: string,
    request: PatchPracticeStateRequest,
  ): PracticeStateResponse {
    this.requirePractice(practiceSessionId, actorId);
    this.requireVersion(
      request.expectedVersion,
      this.practice.stateVersion,
      this.practice.id,
    );

    const answerQuestion = request.answer
      ? this.requireQuestion(this.practice.questions, request.answer.questionId)
      : undefined;
    const flagQuestion = request.flag
      ? this.requireQuestion(this.practice.questions, request.flag.questionId)
      : undefined;

    if (request.answer && answerQuestion) {
      this.requireOwnedChoices(answerQuestion, request.answer.selectedChoiceIds);
      if (answerQuestion.finalChoiceIds) {
        throw new MockStateError(
          "answer-locked",
          "The submitted practice answer cannot be changed.",
        );
      }
    }
    if (
      request.currentIndex !== undefined &&
      (request.currentIndex < 0 ||
        request.currentIndex >= this.practice.questions.length)
    ) {
      throw new MockStateError("validation-failed", "Current position is invalid.");
    }

    if (request.answer && answerQuestion) {
      answerQuestion.selectedChoiceIds = [...request.answer.selectedChoiceIds];
    }
    if (request.flag && flagQuestion) {
      flagQuestion.flagged = request.flag.flagged;
    }
    if (request.currentIndex !== undefined) {
      this.practice.currentIndex = request.currentIndex;
    }
    this.practice.stateVersion += 1;

    return {
      practiceSessionId: this.practice.id,
      stateVersion: this.practice.stateVersion,
      currentIndex: this.practice.currentIndex,
    };
  }

  submitPracticeQuestion(
    practiceSessionId: string,
    questionId: string,
    actorId: string,
    request: { expectedVersion: number; selectedChoiceIds: string[] },
  ): SubmitPracticeQuestionResponse {
    this.requirePractice(practiceSessionId, actorId);
    const question = this.requireQuestion(this.practice.questions, questionId);

    if (question.finalChoiceIds) {
      if (!sameSet(question.finalChoiceIds, request.selectedChoiceIds)) {
        throw new MockStateError(
          "answer-locked",
          "The first submitted answer is already locked.",
        );
      }
      return this.practiceSubmitResponse(question);
    }

    this.requireVersion(
      request.expectedVersion,
      this.practice.stateVersion,
      this.practice.id,
    );
    this.requireOwnedChoices(question, request.selectedChoiceIds);
    if (request.selectedChoiceIds.length !== question.requiredChoiceCount) {
      throw new MockStateError(
        "invalid-choice-count",
        `Select exactly ${question.requiredChoiceCount} choice(s).`,
        [
          {
            path: ["selectedChoiceIds"],
            reason: "The selected choice count does not match the requirement.",
            actual: request.selectedChoiceIds.length,
            expected: question.requiredChoiceCount,
          },
        ],
      );
    }

    question.finalChoiceIds = [...request.selectedChoiceIds];
    question.selectedChoiceIds = [...request.selectedChoiceIds];
    question.earnedScore = scoreQuestion(question, request.selectedChoiceIds);
    this.practice.stateVersion += 1;

    if (
      this.practice.questions.every(
        ({ finalChoiceIds }) => finalChoiceIds !== undefined,
      )
    ) {
      this.practice.status = "completed";
      this.practice.result ??= this.createPracticeResult();
    }

    return this.practiceSubmitResponse(question);
  }

  getPracticeResult(resultId: string, actorId: string): PracticeResultDto {
    this.assertOwner(this.practice.ownerId, actorId);
    if (!this.practice.result || this.practice.result.resultId !== resultId) {
      throw new MockStateError("not-found", "Practice result was not found.");
    }
    return this.practice.result;
  }

  startExam(idempotencyKey: string): StartExamResponse {
    if (idempotencyKey !== this.exam.startIdempotencyKey) {
      throw new MockStateError(
        "content-changed",
        "This mock seed already has an exam for a different start key.",
      );
    }
    return {
      examSessionId: this.exam.id,
      stateVersion: this.exam.stateVersion,
      startedAt: this.exam.startedAt,
      expiresAt: this.exam.expiresAt,
      serverNow: this.now(),
    };
  }

  getExam(examSessionId: string, actorId: string): GetExamResponse {
    this.requireExam(examSessionId, actorId);
    if (this.exam.attempt) {
      return {
        kind: "exam-finalized",
        examSessionId: this.exam.id,
        attemptId: this.exam.attempt.attemptId,
      };
    }

    return {
      kind: "exam-active-session",
      examSessionId: this.exam.id,
      certificationId: MOCK_IDS.certification,
      certificationCode: CERTIFICATION.code,
      certificationName: CERTIFICATION.name,
      currentIndex: this.exam.currentIndex,
      stateVersion: this.exam.stateVersion,
      startedAt: this.exam.startedAt,
      expiresAt: this.exam.expiresAt,
      serverNow: this.now(),
      remainingSeconds: this.remainingSeconds(),
      questions: this.exam.questions.map((question) => ({
        kind: "exam-active" as const,
        ...publicQuestionFields(question),
      })),
    };
  }

  patchExam(
    examSessionId: string,
    actorId: string,
    request: PatchExamStateRequest,
  ): ExamStateResponse {
    this.requireExam(examSessionId, actorId);
    this.requireExamActiveBeforeExpiry();
    this.requireVersion(request.expectedVersion, this.exam.stateVersion, this.exam.id);

    const answerQuestion = request.answer
      ? this.requireQuestion(this.exam.questions, request.answer.questionId)
      : undefined;
    const flagQuestion = request.flag
      ? this.requireQuestion(this.exam.questions, request.flag.questionId)
      : undefined;
    if (request.answer && answerQuestion) {
      this.requireOwnedChoices(answerQuestion, request.answer.selectedChoiceIds);
    }
    if (
      request.currentIndex !== undefined &&
      (request.currentIndex < 0 || request.currentIndex >= this.exam.questions.length)
    ) {
      throw new MockStateError("validation-failed", "Current position is invalid.");
    }

    if (request.answer && answerQuestion) {
      answerQuestion.selectedChoiceIds = [...request.answer.selectedChoiceIds];
    }
    if (request.flag && flagQuestion) {
      flagQuestion.flagged = request.flag.flagged;
    }
    if (request.currentIndex !== undefined) {
      this.exam.currentIndex = request.currentIndex;
    }
    this.exam.stateVersion += 1;

    return {
      examSessionId: this.exam.id,
      stateVersion: this.exam.stateVersion,
      currentIndex: this.exam.currentIndex,
      serverNow: this.now(),
      remainingSeconds: this.remainingSeconds(),
    };
  }

  getExamSubmissionPreview(
    examSessionId: string,
    actorId: string,
  ): SubmissionPreviewDto {
    this.requireExam(examSessionId, actorId);
    return {
      examSessionId: this.exam.id,
      unansweredQuestionCount: this.exam.questions.filter(
        ({ selectedChoiceIds, requiredChoiceCount }) =>
          selectedChoiceIds.length !== requiredChoiceCount,
      ).length,
      flaggedQuestionCount: this.exam.questions.filter(({ flagged }) => flagged).length,
      stateVersion: this.exam.stateVersion,
    };
  }

  submitExam(examSessionId: string, actorId: string): ExamResultDto {
    this.requireExam(examSessionId, actorId);
    if (this.exam.attempt) {
      return this.exam.attempt;
    }

    const questions = this.exam.questions.map(toReviewQuestion);
    const correctCount = questions.filter(({ isCorrect }) => isCorrect).length;
    const accuracyRate = decimalPercentage(correctCount, questions.length);
    const expired = this.nowMilliseconds >= Date.parse(this.exam.expiresAt);
    const submittedAt = expired ? this.exam.expiresAt : this.now();

    this.exam.attempt = {
      kind: "exam-result",
      attemptId: MOCK_IDS.attempt,
      examSessionId: this.exam.id,
      certification: CERTIFICATION,
      score: { rawScore: String(correctCount), accuracyRate },
      reference1000Score: Math.floor(Number(accuracyRate) * 10 + 0.5),
      passed: Number(accuracyRate) >= Number(CERTIFICATION.passThreshold),
      domains: [
        {
          domainName: "All mock domains",
          questionCount: questions.length,
          earnedScore: String(correctCount),
          accuracyRate,
        },
      ],
      questions,
      startedAt: this.exam.startedAt,
      expiresAt: this.exam.expiresAt,
      submittedAt,
      submissionReason: expired ? "expired" : "manual",
    };
    this.exam.status = "submitted";
    return this.exam.attempt;
  }

  getAttempt(attemptId: string, actorId: string): ExamResultDto {
    this.assertOwner(this.exam.ownerId, actorId);
    if (!this.exam.attempt || this.exam.attempt.attemptId !== attemptId) {
      throw new MockStateError("not-found", "Attempt was not found.");
    }
    return this.exam.attempt;
  }

  createImportValidation(content: string, actorId: string): DryRunImportResponse {
    const expiresAt = toIso(this.nowMilliseconds + 15 * 60_000);
    const validation: ImportValidationState = {
      id: MOCK_IDS.validation,
      actorId,
      token: "mock-commit-token-".padEnd(64, "0"),
      content,
      expiresAt,
      used: false,
    };
    this.validations.set(validation.id, validation);
    const availableOne = { status: "available" as const, value: 1 };
    return {
      valid: true,
      summary: {
        totalQuestions: availableOne,
        domainQuestionCounts: { mock: availableOne },
        translationStatusCounts: {
          translated: availableOne,
          enOnly: { status: "available", value: 0 },
        },
        errorCount: 0,
      },
      errors: [],
      validationId: validation.id,
      commitToken: validation.token,
      expiresAt,
    };
  }

  commitImport(
    request: { validationId: string; commitToken: string; content: string },
    actorId: string,
  ): CommitImportResponse {
    const validation = this.validations.get(request.validationId);
    if (!validation) {
      throw new MockStateError(
        "validation-required",
        "Validate this import before committing it.",
      );
    }
    if (validation.actorId !== actorId) {
      throw new MockStateError(
        "ownership-denied",
        "This validation belongs to another admin.",
      );
    }
    if (validation.used) {
      throw new MockStateError(
        "token-used",
        "This validation token has already been used.",
      );
    }
    if (this.nowMilliseconds >= Date.parse(validation.expiresAt)) {
      throw new MockStateError("validation-expired", "This validation has expired.");
    }
    if (
      validation.token !== request.commitToken ||
      validation.content !== request.content
    ) {
      throw new MockStateError(
        "content-changed",
        "The import content changed and must be validated again.",
      );
    }

    validation.used = true;
    return {
      validationId: validation.id,
      certificationId: MOCK_IDS.certification,
      activatedRevisionId: MOCK_IDS.revision,
      committedAt: this.now(),
    };
  }

  private requirePractice(practiceSessionId: string, actorId: string): void {
    if (practiceSessionId !== this.practice.id) {
      throw new MockStateError("not-found", "Practice session was not found.");
    }
    this.assertOwner(this.practice.ownerId, actorId);
  }

  private requireExam(examSessionId: string, actorId: string): void {
    if (examSessionId !== this.exam.id) {
      throw new MockStateError("not-found", "Exam session was not found.");
    }
    this.assertOwner(this.exam.ownerId, actorId);
  }

  private requireVersion(expected: number, actual: number, resourceId: string): void {
    if (expected !== actual) {
      throw new MockStateError(
        "stale-version",
        "Refresh the latest state before saving again.",
        [
          {
            path: ["expectedVersion"],
            reason: "The request version is stale.",
            identifier: resourceId,
            actual: expected,
            expected: actual,
          },
        ],
      );
    }
  }

  private requireQuestion(
    questions: MockQuestionState[],
    questionId: string,
  ): MockQuestionState {
    const question = questions.find(({ id }) => id === questionId);
    if (!question) {
      throw new MockStateError("not-found", "Question was not found in this session.");
    }
    return question;
  }

  private requireOwnedChoices(
    question: MockQuestionState,
    selectedChoiceIds: readonly string[],
  ): void {
    const choiceIds = question.choices.map(({ id }) => id);
    if (selectedChoiceIds.some((choiceId) => !choiceIds.includes(choiceId))) {
      throw new MockStateError(
        "validation-failed",
        "A selected choice does not belong to this question.",
      );
    }
  }

  private requireExamActiveBeforeExpiry(): void {
    if (
      this.exam.status !== "active" ||
      this.nowMilliseconds >= Date.parse(this.exam.expiresAt)
    ) {
      throw new MockStateError(
        "exam-expired",
        "The exam has expired and can no longer be changed.",
      );
    }
  }

  private remainingSeconds(): number {
    return Math.max(
      0,
      Math.floor((Date.parse(this.exam.expiresAt) - this.nowMilliseconds) / 1_000),
    );
  }

  private practiceSubmitResponse(
    question: MockQuestionState,
  ): SubmitPracticeQuestionResponse {
    return {
      practiceSessionId: this.practice.id,
      stateVersion: this.practice.stateVersion,
      question: toPracticeSubmittedQuestion(question),
      ...(this.practice.result
        ? { completedPracticeResultId: this.practice.result.resultId }
        : {}),
    };
  }

  private createPracticeResult(): PracticeResultDto {
    const questions = this.practice.questions.map(toReviewQuestion);
    const correctCount = questions.filter(({ isCorrect }) => isCorrect).length;
    const accuracyRate = decimalPercentage(correctCount, questions.length);
    const completedAt = this.now();
    return {
      kind: "practice-result",
      resultId: MOCK_IDS.practiceResult,
      certification: CERTIFICATION,
      score: { rawScore: String(correctCount), accuracyRate },
      domains: [
        {
          domainName: "All mock domains",
          questionCount: questions.length,
          earnedScore: String(correctCount),
          accuracyRate,
        },
      ],
      questions,
      completedAt,
      expiresAt: toIso(Date.parse(completedAt) + 168 * 60 * 60_000),
    };
  }
}

export function createCertQuizMockStateMachine(
  options?: MockStateMachineOptions,
): CertQuizMockStateMachine {
  return new CertQuizMockStateMachine(options);
}
