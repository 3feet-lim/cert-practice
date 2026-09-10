import {
  leaderboardDtoSchema,
  patchExamStateRequestSchema,
  patchPracticeStateRequestSchema,
  practiceResultDtoSchema,
  practiceSessionDtoSchema,
  replacePracticeRequestSchema,
  startExamRequestSchema,
  startExamResponseSchema,
  startPracticeRequestSchema,
  startPracticeResponseSchema,
  submissionPreviewDtoSchema,
  submitExamRequestSchema,
  submitExamResponseSchema,
  submitPracticeQuestionRequestSchema,
  submitPracticeQuestionResponseSchema,
  historyPageDtoSchema,
  historyTrendsDtoSchema,
  getExamResponseSchema,
  examStateResponseSchema,
  practiceStateResponseSchema,
  examResultDtoSchema,
  approvalStatusDtoSchema,
  approveUserResponseSchema,
  commitImportRequestSchema,
  commitImportResponseSchema,
  dryRunImportRequestSchema,
  dryRunImportResponseSchema,
  catalogDtoSchema,
  currentUserDtoSchema,
  healthSuccessEnvelopeSchema,
  pendingUsersDtoSchema,
  successEnvelopeSchema,
  updateScoreVisibilityRequestSchema,
  updateScoreVisibilityResponseSchema,
  uuidSchema,
} from "@cert-quiz/contracts";
import {
  domainFailure,
  isDomainFailure,
  projectActiveCatalog,
  sha256Hex,
  type ImportService,
  type LifecycleServices,
  type TransactionRepositories,
  type UserProfile,
} from "@cert-quiz/domain";
import { Hono, type Context, type MiddlewareHandler } from "hono";

import {
  adminPolicy,
  approvalPolicy,
  authenticationPolicy,
  type ApiEnvironment,
  type AuthenticationDependencies,
  type CognitoTokenVerifier,
} from "./authentication.js";
import { mapError } from "./error-mapper.js";
import { requestContext, requestIdFromContextHeader } from "./request-context.js";

const healthResponse = healthSuccessEnvelopeSchema.parse({
  data: {
    status: "ok",
    service: "cert-quiz-api",
    contractVersion: "v1",
  },
  meta: { requestId: "api:health" },
});

export type CreateAppDependencies = AuthenticationDependencies & {
  /** Optional while composition roots migrate; import routes fail closed without it. */
  importService?: ImportService;
  /** Offline-safe lifecycle composition; absent production adapters fail closed. */
  lifecycle?: LifecycleServices;
};
export type { CognitoTokenVerifier };

function toStateVersion(version: bigint): number {
  const value = Number(version);
  if (!Number.isSafeInteger(value) || value < 0)
    throw domainFailure("dependency-unavailable");
  return value;
}

function currentUser(profile: UserProfile) {
  return currentUserDtoSchema.parse({
    id: profile.id,
    displayName: profile.displayName,
    email: profile.email,
    role: profile.role,
    approvalStatus: profile.approvalStatus,
    scorePublic: profile.scorePublic,
    stateVersion: toStateVersion(profile.version),
  });
}

function responseMeta(context: Context<ApiEnvironment>) {
  return { requestId: requestIdFromContextHeader(context) };
}

async function parseVisibilityRequest(context: Context<ApiEnvironment>) {
  try {
    return updateScoreVisibilityRequestSchema.parse(await context.req.json());
  } catch {
    throw domainFailure("validation-failed");
  }
}

async function parseImportRequest<Schema extends { parse(input: unknown): unknown }>(
  context: Context<ApiEnvironment>,
  schema: Schema,
): Promise<ReturnType<Schema["parse"]>> {
  try {
    return schema.parse(await context.req.json()) as ReturnType<Schema["parse"]>;
  } catch {
    throw domainFailure("validation-failed");
  }
}

async function runTransaction<T>(
  dependencies: CreateAppDependencies,
  work: (repositories: TransactionRepositories) => Promise<T>,
): Promise<T> {
  try {
    const unitOfWork = dependencies.unitOfWork;
    return await unitOfWork.transaction(work);
  } catch (error) {
    if (isDomainFailure(error)) throw error;
    throw domainFailure("dependency-unavailable");
  }
}

/**
 * Builds an HTTP app without side effects. Omit dependencies for public health
 * probes only; protected routes are installed only when their fail-closed auth
 * boundary and UnitOfWork have been explicitly supplied.
 */
export function createApp(dependencies?: CreateAppDependencies): Hono<ApiEnvironment> {
  const created = new Hono<ApiEnvironment>();
  created.use("/v1/*", requestContext);
  created.onError((error, context) => {
    const mapped = mapError(error, requestIdFromContextHeader(context));
    for (const [name, value] of Object.entries(mapped.headers ?? {}))
      context.header(name, value);
    return context.json(mapped.body, mapped.status);
  });
  created.get("/v1/health", (context) =>
    context.json(healthSuccessEnvelopeSchema.parse(healthResponse)),
  );

  if (!dependencies) return created;

  const authenticate = authenticationPolicy(dependencies);
  const inTransaction = <T>(
    work: (repositories: TransactionRepositories) => Promise<T>,
  ) => runTransaction(dependencies, work);
  created.use("/v1/me", authenticate);
  created.use("/v1/me/*", authenticate);
  created.use("/v1/catalog", authenticate);
  created.use("/v1/admin", authenticate);
  created.use("/v1/admin/*", authenticate);

  const requireLifecycle = (): LifecycleServices => {
    if (!dependencies.lifecycle) throw domainFailure("dependency-unavailable");
    return dependencies.lifecycle;
  };
  const finalizeExpiredExams: MiddlewareHandler<ApiEnvironment> = async (
    context,
    next,
  ) => {
    if (dependencies.lifecycle)
      await dependencies.lifecycle.finalizeExpiredOwned(
        context.get("actor").userId,
        dependencies.now(),
      );
    await next();
  };
  created.use("/v1/me", finalizeExpiredExams);
  created.use("/v1/me/*", finalizeExpiredExams);
  created.use("/v1/catalog", finalizeExpiredExams);
  created.use("/v1/admin/*", finalizeExpiredExams);
  created.use("/v1/certifications/*", authenticate, finalizeExpiredExams);
  created.use("/v1/practice/*", authenticate, finalizeExpiredExams);
  created.use("/v1/practice-results/*", authenticate, finalizeExpiredExams);
  created.use("/v1/exams/*", authenticate, finalizeExpiredExams);
  created.use("/v1/attempts/*", authenticate, finalizeExpiredExams);
  created.use("/v1/history", authenticate, finalizeExpiredExams);
  created.use("/v1/history/*", authenticate, finalizeExpiredExams);
  created.use("/v1/leaderboards/*", authenticate, finalizeExpiredExams);

  created.get("/v1/me/approval", (context) => {
    const body = successEnvelopeSchema(approvalStatusDtoSchema).parse({
      data: { approvalStatus: context.get("actor").approvalStatus },
      meta: responseMeta(context),
    });
    return context.json(body);
  });

  created.get("/v1/me", approvalPolicy, async (context) => {
    const profile = await inTransaction((repositories) =>
      repositories.users.findById(context.get("actor").userId),
    );
    if (!profile) throw domainFailure("not-found");
    return context.json(
      successEnvelopeSchema(currentUserDtoSchema).parse({
        data: currentUser(profile),
        meta: responseMeta(context),
      }),
    );
  });

  created.get("/v1/catalog", approvalPolicy, async (context) => {
    const projection = await inTransaction((repositories) =>
      repositories.catalog.activeCatalogSources(),
    );
    return context.json(
      successEnvelopeSchema(catalogDtoSchema).parse({
        data: projectActiveCatalog(projection),
        meta: responseMeta(context),
      }),
    );
  });

  created.patch("/v1/me/score-visibility", approvalPolicy, async (context) => {
    const request = await parseVisibilityRequest(context);
    const profile = await inTransaction((repositories) =>
      repositories.users.updateScoreVisibility({
        userId: context.get("actor").userId,
        scorePublic: request.scorePublic,
        expectedVersion: BigInt(request.expectedVersion),
      }),
    );
    if (!profile) throw domainFailure("stale-version");
    return context.json(
      successEnvelopeSchema(updateScoreVisibilityResponseSchema).parse({
        data: {
          scorePublic: profile.scorePublic,
          stateVersion: toStateVersion(profile.version),
        },
        meta: responseMeta(context),
      }),
    );
  });

  created.post("/v1/admin/imports/dry-run", adminPolicy, async (context) => {
    const request = await parseImportRequest(context, dryRunImportRequestSchema);
    const service = dependencies.importService;
    if (!service) throw domainFailure("dependency-unavailable");
    const result = await service.dryRun(request.content, context.get("actor").userId);
    if (result.materialization?.validation) {
      await inTransaction((repositories) =>
        repositories.catalog.saveValidation(result.materialization!.validation!),
      );
    }
    return context.json(
      successEnvelopeSchema(dryRunImportResponseSchema).parse({
        data: result.response,
        meta: responseMeta(context),
      }),
    );
  });

  created.post("/v1/admin/imports/commit", adminPolicy, async (context) => {
    const request = await parseImportRequest(context, commitImportRequestSchema);
    const service = dependencies.importService;
    if (!service) throw domainFailure("dependency-unavailable");
    let materialized: Awaited<ReturnType<ImportService["materializeCommit"]>>;
    try {
      materialized = await service.materializeCommit(
        request.content,
        context.get("actor").userId,
      );
    } catch {
      throw domainFailure("validation-failed");
    }
    const tokenDigest = await sha256Hex(request.commitToken);
    await inTransaction((repositories) =>
      repositories.catalog.commitValidatedImport({
        validationId: request.validationId,
        actorUserId: context.get("actor").userId,
        tokenDigest,
        contentHash: materialized.contentHash,
        materialization: materialized.materialization,
        now: dependencies.now(),
      }),
    );
    const certificationId = materialized.materialization.source.certifications[0]?.id;
    if (!certificationId) throw domainFailure("dependency-unavailable");
    return context.json(
      successEnvelopeSchema(commitImportResponseSchema).parse({
        data: {
          validationId: request.validationId,
          certificationId,
          activatedRevisionId: materialized.materialization.revision.id,
          committedAt: dependencies.now().toISOString(),
        },
        meta: responseMeta(context),
      }),
    );
  });

  created.get("/v1/admin/pending-users", adminPolicy, async (context) => {
    const profiles = await inTransaction((repositories) =>
      repositories.users.findPending(),
    );
    const body = successEnvelopeSchema(pendingUsersDtoSchema).parse({
      data: {
        users: profiles.map((profile) => ({
          id: profile.id,
          displayName: profile.displayName,
          email: profile.email,
          firstLoginAt: profile.firstLoginAt.toISOString(),
        })),
      },
      meta: responseMeta(context),
    });
    return context.json(body);
  });

  created.post("/v1/admin/users/:id/approve", adminPolicy, async (context) => {
    const parsedId = uuidSchema.safeParse(context.req.param("id"));
    if (!parsedId.success) throw domainFailure("validation-failed");
    const approved = await inTransaction((repositories) =>
      repositories.users.approvePending(parsedId.data, dependencies.now()),
    );
    if (!approved) throw domainFailure("not-found");
    return context.json(
      successEnvelopeSchema(approveUserResponseSchema).parse({
        data: { userId: approved.id, approvalStatus: "approved" },
        meta: responseMeta(context),
      }),
    );
  });

  created.get("/v1/leaderboards/:certificationId", approvalPolicy, async (context) => {
    const certificationId = uuidSchema.safeParse(context.req.param("certificationId"));
    if (!certificationId.success) throw domainFailure("validation-failed");
    const data = await requireLifecycle().leaderboard(
      certificationId.data,
      context.get("actor").userId,
    );
    return context.json(
      successEnvelopeSchema(leaderboardDtoSchema).parse({
        data,
        meta: responseMeta(context),
      }),
    );
  });

  created.get("/v1/history", approvalPolicy, async (context) => {
    const data = await requireLifecycle().history(context.get("actor").userId);
    return context.json(
      successEnvelopeSchema(historyPageDtoSchema).parse({
        data,
        meta: responseMeta(context),
      }),
    );
  });
  created.get("/v1/history/trends", approvalPolicy, async (context) => {
    const data = await requireLifecycle().trends(context.get("actor").userId);
    return context.json(
      successEnvelopeSchema(historyTrendsDtoSchema).parse({
        data,
        meta: responseMeta(context),
      }),
    );
  });
  created.get("/v1/attempts/:id", approvalPolicy, async (context) => {
    const id = uuidSchema.safeParse(context.req.param("id"));
    if (!id.success) throw domainFailure("validation-failed");
    const data = await requireLifecycle().getAttempt(
      context.get("actor").userId,
      id.data,
    );
    return context.json(
      successEnvelopeSchema(examResultDtoSchema).parse({
        data,
        meta: responseMeta(context),
      }),
    );
  });

  created.post(
    "/v1/certifications/:id/practice/start",
    approvalPolicy,
    async (context) => {
      const id = uuidSchema.safeParse(context.req.param("id"));
      if (!id.success) throw domainFailure("validation-failed");
      const request = await parseImportRequest(context, startPracticeRequestSchema);
      const data = await requireLifecycle().startPractice(
        context.get("actor").userId,
        id.data,
      );
      void request;
      return context.json(
        successEnvelopeSchema(startPracticeResponseSchema).parse({
          data,
          meta: responseMeta(context),
        }),
      );
    },
  );
  created.post("/v1/practice/:id/resume", approvalPolicy, async (context) => {
    const id = uuidSchema.safeParse(context.req.param("id"));
    if (!id.success) throw domainFailure("validation-failed");
    const data = await requireLifecycle().resumePractice(
      context.get("actor").userId,
      id.data,
    );
    return context.json(
      successEnvelopeSchema(practiceSessionDtoSchema).parse({
        data,
        meta: responseMeta(context),
      }),
    );
  });
  created.post("/v1/practice/:id/replace", approvalPolicy, async (context) => {
    const id = uuidSchema.safeParse(context.req.param("id"));
    if (!id.success) throw domainFailure("validation-failed");
    const request = await parseImportRequest(context, replacePracticeRequestSchema);
    const current = await requireLifecycle().resumePractice(
      context.get("actor").userId,
      id.data,
    );
    const data = await requireLifecycle().replacePractice(
      context.get("actor").userId,
      current.certificationId,
      request.confirmationNonce,
    );
    return context.json(
      successEnvelopeSchema(startPracticeResponseSchema).parse({
        data,
        meta: responseMeta(context),
      }),
    );
  });
  created.patch("/v1/practice/:id/state", approvalPolicy, async (context) => {
    const id = uuidSchema.safeParse(context.req.param("id"));
    if (!id.success) throw domainFailure("validation-failed");
    const request = await parseImportRequest(context, patchPracticeStateRequestSchema);
    const data = await requireLifecycle().patchPractice(
      context.get("actor").userId,
      id.data,
      request,
    );
    return context.json(
      successEnvelopeSchema(practiceStateResponseSchema).parse({
        data,
        meta: responseMeta(context),
      }),
    );
  });
  created.post(
    "/v1/practice/:id/questions/:questionId/submit",
    approvalPolicy,
    async (context) => {
      const id = uuidSchema.safeParse(context.req.param("id"));
      const questionId = uuidSchema.safeParse(context.req.param("questionId"));
      if (!id.success || !questionId.success) throw domainFailure("validation-failed");
      const request = await parseImportRequest(
        context,
        submitPracticeQuestionRequestSchema,
      );
      const data = await requireLifecycle().submitPractice(
        context.get("actor").userId,
        id.data,
        questionId.data,
        request.selectedChoiceIds,
        request.expectedVersion,
      );
      return context.json(
        successEnvelopeSchema(submitPracticeQuestionResponseSchema).parse({
          data,
          meta: responseMeta(context),
        }),
      );
    },
  );
  created.get("/v1/practice-results/:id", approvalPolicy, async (context) => {
    const id = uuidSchema.safeParse(context.req.param("id"));
    if (!id.success) throw domainFailure("validation-failed");
    const data = await requireLifecycle().getPracticeResult(
      context.get("actor").userId,
      id.data,
    );
    return context.json(
      successEnvelopeSchema(practiceResultDtoSchema).parse({
        data,
        meta: responseMeta(context),
      }),
    );
  });

  created.post("/v1/certifications/:id/exams", approvalPolicy, async (context) => {
    const id = uuidSchema.safeParse(context.req.param("id"));
    if (!id.success) throw domainFailure("validation-failed");
    const request = await parseImportRequest(context, startExamRequestSchema);
    const data = await requireLifecycle().startExam(
      context.get("actor").userId,
      id.data,
      request.idempotencyKey,
    );
    return context.json(
      successEnvelopeSchema(startExamResponseSchema).parse({
        data,
        meta: responseMeta(context),
      }),
    );
  });
  created.get("/v1/exams/:id", approvalPolicy, async (context) => {
    const id = uuidSchema.safeParse(context.req.param("id"));
    if (!id.success) throw domainFailure("validation-failed");
    const data = await requireLifecycle().getExam(context.get("actor").userId, id.data);
    return context.json(
      successEnvelopeSchema(getExamResponseSchema).parse({
        data,
        meta: responseMeta(context),
      }),
    );
  });
  created.patch("/v1/exams/:id/state", approvalPolicy, async (context) => {
    const id = uuidSchema.safeParse(context.req.param("id"));
    if (!id.success) throw domainFailure("validation-failed");
    const request = await parseImportRequest(context, patchExamStateRequestSchema);
    const data = await requireLifecycle().patchExam(
      context.get("actor").userId,
      id.data,
      request,
    );
    return context.json(
      successEnvelopeSchema(examStateResponseSchema).parse({
        data,
        meta: responseMeta(context),
      }),
    );
  });
  created.post("/v1/exams/:id/submission-preview", approvalPolicy, async (context) => {
    const id = uuidSchema.safeParse(context.req.param("id"));
    if (!id.success) throw domainFailure("validation-failed");
    const data = await requireLifecycle().previewExam(
      context.get("actor").userId,
      id.data,
    );
    return context.json(
      successEnvelopeSchema(submissionPreviewDtoSchema).parse({
        data,
        meta: responseMeta(context),
      }),
    );
  });
  created.post("/v1/exams/:id/submit", approvalPolicy, async (context) => {
    const id = uuidSchema.safeParse(context.req.param("id"));
    if (!id.success) throw domainFailure("validation-failed");
    await parseImportRequest(context, submitExamRequestSchema);
    const data = await requireLifecycle().submitExam(
      context.get("actor").userId,
      id.data,
      dependencies.now(),
    );
    return context.json(
      successEnvelopeSchema(submitExamResponseSchema).parse({
        data,
        meta: responseMeta(context),
      }),
    );
  });

  return created;
}

/** Public health-only bootstrap retained for Lambda and existing probe callers. */
export const app = createApp();
