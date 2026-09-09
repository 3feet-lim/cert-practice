import {
  domainFailure,
  isDomainFailure,
  type UnitOfWork,
  type UserProfile,
} from "@cert-quiz/domain";
import type { Context, MiddlewareHandler } from "hono";

export type VerifiedCognitoClaims = {
  /** The verified Cognito `identities` claim; the extractor accepts its JSON form. */
  identities: unknown;
  email?: unknown;
  name?: unknown;
};

/**
 * Infrastructure boundary: implementations must verify JWT signature, issuer,
 * audience/client, expiry, and token use before returning any claims.
 */
export interface CognitoTokenVerifier {
  verify(accessToken: string): Promise<VerifiedCognitoClaims>;
}

export type AuthenticatedActor = {
  userId: string;
  role: UserProfile["role"];
  approvalStatus: UserProfile["approvalStatus"];
};

export type ApiVariables = {
  actor: AuthenticatedActor;
  profile: UserProfile;
};

export type ApiEnvironment = { Variables: ApiVariables };

export type AuthenticationDependencies = {
  tokenVerifier: CognitoTokenVerifier;
  unitOfWork: UnitOfWork;
  now: () => Date;
  createUserId: () => string;
};

type CognitoIdentity = { providerName: string; userId: string };

/**
 * Extracts the sole Google subject from Cognito's verified identities claim.
 * It intentionally does not accept body/query identity fields or log claims.
 */
export function extractGoogleSub(identitiesClaim: unknown): string {
  if (typeof identitiesClaim !== "string")
    throw domainFailure("invalid-google-identity");

  let identities: unknown;
  try {
    identities = JSON.parse(identitiesClaim);
  } catch {
    throw domainFailure("invalid-google-identity");
  }
  if (!Array.isArray(identities)) throw domainFailure("invalid-google-identity");

  const parsed = identities.map(toCognitoIdentity);
  const google = parsed.filter((identity) => identity.providerName === "Google");
  if (google.length !== 1) throw domainFailure("invalid-google-identity");
  const subject = google[0]?.userId;
  if (!subject || !isGoogleSubject(subject))
    throw domainFailure("invalid-google-identity");
  return subject;
}

function toCognitoIdentity(value: unknown): CognitoIdentity {
  if (!value || typeof value !== "object")
    throw domainFailure("invalid-google-identity");
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.providerName !== "string" ||
    typeof candidate.userId !== "string"
  )
    throw domainFailure("invalid-google-identity");
  return { providerName: candidate.providerName, userId: candidate.userId };
}

function isGoogleSubject(value: string): boolean {
  return value.length > 0 && value.length <= 512 && value.trim() === value;
}

function bearerToken(context: Context<ApiEnvironment>): string {
  const authorization = context.req.header("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match?.[1]) throw domainFailure("unauthenticated");
  return match[1];
}

function identityField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, 200)
    : fallback;
}

export function authenticationPolicy(
  dependencies: AuthenticationDependencies,
): MiddlewareHandler<ApiEnvironment> {
  return async (context, next) => {
    let claims: VerifiedCognitoClaims;
    try {
      claims = await dependencies.tokenVerifier.verify(bearerToken(context));
    } catch (error) {
      if (isDomainFailure(error)) throw error;
      throw domainFailure("unauthenticated");
    }

    // Identity extraction happens before entering a transaction or mutating a profile.
    const googleSub = extractGoogleSub(claims.identities);
    let profile: UserProfile;
    try {
      profile = await dependencies.unitOfWork.transaction((repositories) =>
        repositories.users.getOrCreatePendingByGoogleSub({
          id: dependencies.createUserId(),
          googleSub,
          displayName: identityField(claims.name, "Google user"),
          email: identityField(claims.email, "unknown@identity.invalid"),
          now: dependencies.now(),
        }),
      );
    } catch {
      // Profile persistence failures fail closed and never expose persistence detail.
      throw domainFailure("dependency-unavailable");
    }

    context.set("profile", profile);
    context.set("actor", {
      userId: profile.id,
      role: profile.role,
      approvalStatus: profile.approvalStatus,
    });
    await next();
  };
}

export const approvalPolicy: MiddlewareHandler<ApiEnvironment> = async (
  context,
  next,
) => {
  if (context.get("actor").approvalStatus !== "approved")
    throw domainFailure("approval-required");
  await next();
};

export const adminPolicy: MiddlewareHandler<ApiEnvironment> = async (context, next) => {
  const actor = context.get("actor");
  if (actor.approvalStatus !== "approved" || actor.role !== "admin")
    throw domainFailure("admin-required");
  await next();
};

/** Future owner-scoped handlers must pass this actor ID to repository predicates. */
export function requireOwnedActor(
  actor: AuthenticatedActor,
  resourceOwnerId: string | null,
): string {
  if (resourceOwnerId !== actor.userId) throw domainFailure("ownership-denied");
  return actor.userId;
}
