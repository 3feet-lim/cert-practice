import { afterEach, describe, expect, it } from "vitest";

import { CognitoJwksTokenVerifier } from "./cognito-jwks-verifier.js";
import {
  createLocalCognitoJwks,
  createProductionIntegrationHarness,
  DeterministicClock,
  DeterministicRandomSource,
  DeterministicUuidFactory,
  QueryHooks,
  type ProductionIntegrationHarness,
} from "./production-integration-harness.js";

const NOW = new Date("2026-03-20T12:00:00.000Z");

describe("production composition integration harness primitives", () => {
  it("uses locally signed Cognito claims with the production JWKS verifier and deterministic time", async () => {
    const clock = new DeterministicClock(NOW);
    const cognito = await createLocalCognitoJwks(clock);
    const verifier = new CognitoJwksTokenVerifier({
      issuer: cognito.issuer,
      clientId: cognito.clientId,
      tokenUse: "id",
      jwksUrl: cognito.jwksUrl,
      fetch: cognito.fetch,
      now: () => clock.now(),
    });

    await expect(verifier.verify(await cognito.sign())).resolves.toMatchObject({
      email: "production-integration@example.test",
      name: "Production integration user",
    });
    expect(cognito.requests).toEqual([cognito.jwksUrl]);

    clock.advance(60_000);
    await expect(verifier.verify(await cognito.sign({ exp: 0 }))).rejects.toMatchObject({
      error: { code: "unauthenticated" },
    });
  });

  it("provides resettable query barriers/faults and deterministic ID/RNG controls", async () => {
    const ids = new DeterministicUuidFactory(42);
    expect([ids.next(), ids.next()]).toEqual([
      "00000000-0000-4000-8000-000000000042",
      "00000000-0000-4000-8000-000000000043",
    ]);
    const random = new DeterministicRandomSource([2]);
    expect([random.nextInt(3), random.nextInt(3)]).toEqual([2, 0]);

    const hooks = new QueryHooks();
    const barrier = hooks.barrierBefore("UPDATE target", 2);
    await Promise.all([
      hooks.before("UPDATE target SET value = 1"),
      hooks.before("UPDATE target SET value = 2"),
    ]);
    expect(barrier.arrivals).toBe(2);
    hooks.failAfter("INSERT target");
    await expect(hooks.after("INSERT target VALUES (1)")).rejects.toThrow(
      "Injected post-write fault",
    );
    await expect(hooks.after("INSERT target VALUES (2)")).resolves.toBeUndefined();
  });
});

const describeLive =
  process.env.RUN_PRODUCTION_COMPOSITION_INTEGRATION === "true"
    ? describe
    : describe.skip;

describeLive("production composition integration harness", () => {
  let harness: ProductionIntegrationHarness | undefined;

  afterEach(async () => {
    await harness?.cleanup();
    harness = undefined;
  }, 60_000);

  it("migrates a disposable DSQL schema, seeds DOP-C02, and serves it through the composed Hono app", async () => {
    harness = await createProductionIntegrationHarness({ now: NOW });
    const user = await harness.seedUser({
      googleSub: "harness-approved-user",
      approvalStatus: "approved",
    });
    const catalog = await harness.seedDopC02();
    const token = await harness.cognito.sign({
      identities: JSON.stringify([{ providerName: "Google", userId: user.googleSub }]),
    });

    const response = await harness.app.request(
      "http://localhost/v1/catalog",
      harness.authorization(token),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        providers: [
          {
            certifications: [{ id: catalog.certificationId, code: "DOP-C02" }],
          },
        ],
      },
    });
    expect(harness.cognito.requests).toEqual([harness.cognito.jwksUrl]);

    await harness.reset();
    const remaining = await harness.database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM catalog_revisions",
    );
    expect(remaining.rows[0]?.count).toBe("0");
  }, 60_000);
});
