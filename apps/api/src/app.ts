import {
  approvalStatusDtoSchema,
  approveUserResponseSchema,
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
  type TransactionRepositories,
  type UserProfile,
} from "@cert-quiz/domain";
import { Hono, type Context } from "hono";

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

export type CreateAppDependencies = AuthenticationDependencies;
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

  return created;
}

/** Public health-only bootstrap retained for Lambda and existing probe callers. */
export const app = createApp();
