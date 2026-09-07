import { describe, expect, it } from "vitest";

import { resolveDatabaseAdapter } from "../database-adapter.js";
import { endpointParameterNameForAdapter, parseLiveCliOptions } from "./live-cli.js";
import { isValidLambdaLifecycleEvidence } from "./live-connection.js";
import { splitSqlStatements } from "./live-migration.js";
import {
  aggregateOverallStatus,
  deploymentInstructionForAdapter,
} from "./live-report.js";

describe("live DSQL spike configuration", () => {
  it("accepts an endpoint that matches the configured region", () => {
    const options = parseLiveCliOptions([], {
      DSQL_ENDPOINT: "cluster.dsql.ap-northeast-2.on.aws",
      AWS_REGION: "ap-northeast-2",
    });

    expect(options).toMatchObject({
      endpoint: "cluster.dsql.ap-northeast-2.on.aws",
      region: "ap-northeast-2",
      user: "admin",
      keepData: false,
    });
  });

  it("rejects a missing or cross-region endpoint", () => {
    expect(() => parseLiveCliOptions([], {})).toThrow("matching");
    expect(() =>
      parseLiveCliOptions([], {
        DSQL_ENDPOINT: "cluster.dsql.us-east-1.on.aws",
        AWS_REGION: "ap-northeast-2",
      }),
    ).toThrow("matching");
  });

  it("keeps runtime adapter selection explicit", () => {
    expect(resolveDatabaseAdapter("dsql")).toBe("dsql");
    expect(resolveDatabaseAdapter("postgres")).toBe("postgres");
    expect(() => resolveDatabaseAdapter(undefined)).toThrow(
      "CERT_QUIZ_DATABASE_ADAPTER",
    );
  });

  it("uses an adapter-specific endpoint parameter in the selection artifact", () => {
    expect(endpointParameterNameForAdapter("dsql")).toBe("/certquiz/dev/dsql-endpoint");
    expect(endpointParameterNameForAdapter("postgres")).toBe(
      "/certquiz/dev/postgres-endpoint",
    );
    expect(endpointParameterNameForAdapter("unselected")).toBeNull();
  });

  it("keeps incomplete connector evidence fail-closed without calling it a failure", () => {
    expect(aggregateOverallStatus(["pass", "inconclusive", "pass"])).toBe(
      "inconclusive",
    );
    expect(endpointParameterNameForAdapter("unselected")).toBeNull();
    expect(deploymentInstructionForAdapter("unselected")).toContain("Do not deploy");
    expect(deploymentInstructionForAdapter("unselected")).not.toContain(
      "CERT_QUIZ_DATABASE_ADAPTER=unselected",
    );
  });

  it("rejects incomplete or mismatched Lambda lifecycle evidence", () => {
    const expected = {
      endpoint: "cluster.dsql.ap-northeast-2.on.aws",
      region: "ap-northeast-2",
    };
    const evidence = {
      schemaVersion: 1,
      kind: "aurora-dsql-lambda-lifecycle-evidence",
      status: "pass",
      run: {
        endpoint: expected.endpoint,
        region: expected.region,
        runtime: "nodejs22.x",
        nodeVersion: "v22.23.1",
      },
      firstInvocation: {
        environmentId: "environment-1",
        processId: 101,
      },
      warmInvocation: {
        environmentId: "environment-1",
        processId: 101,
        coldStart: false,
      },
      rolloverInvocation: {
        environmentId: "environment-1",
        coldStart: false,
        elapsedSinceFirstConnectMs: 900_001,
        tokenValidityWindowMs: 900_000,
        processIdBeforeEviction: 101,
        processIdAfterEviction: 202,
      },
      assertions: {
        sameLambdaEnvironment: true,
        warmPoolConnectionReused: true,
        tokenWindowElapsed: true,
        freshIamAuthenticatedConnectionAfterTokenWindow: true,
        tlsHostnameAndCaVerified: true,
        nodeDefaultRootStoreUsed: true,
      },
      cleanup: {
        lambdaDeleted: true,
        iamRoleDeleted: true,
        logGroupDeleted: true,
      },
    };

    expect(isValidLambdaLifecycleEvidence(evidence, expected)).toBe(true);

    const invalidEvidence = [
      {
        ...evidence,
        rolloverInvocation: {
          ...evidence.rolloverInvocation,
          processIdBeforeEviction: 303,
        },
      },
      {
        ...evidence,
        rolloverInvocation: {
          ...evidence.rolloverInvocation,
          tokenValidityWindowMs: 899_999,
        },
      },
      { ...evidence, assertions: {} },
      { ...evidence, assertions: { sameLambdaEnvironment: true } },
      {
        ...evidence,
        assertions: { ...evidence.assertions, tokenWindowElapsed: false },
      },
      {
        ...evidence,
        assertions: { ...evidence.assertions, unexpectedAssertion: true },
      },
      { ...evidence, cleanup: { lambdaDeleted: true } },
      { ...evidence, cleanup: { ...evidence.cleanup, iamRoleDeleted: false } },
      {
        ...evidence,
        cleanup: { ...evidence.cleanup, unexpectedCleanup: true },
      },
    ];

    for (const invalid of invalidEvidence) {
      expect(isValidLambdaLifecycleEvidence(invalid, expected)).toBe(false);
    }
    expect(
      isValidLambdaLifecycleEvidence(evidence, {
        ...expected,
        endpoint: "other.dsql.ap-northeast-2.on.aws",
      }),
    ).toBe(false);
    expect(
      isValidLambdaLifecycleEvidence(evidence, {
        ...expected,
        region: "us-east-1",
      }),
    ).toBe(false);
  });

  it("splits the candidate migration into deterministic statements", () => {
    expect(
      splitSqlStatements("CREATE TABLE a (id int);\nCREATE INDEX b ON a(id);"),
    ).toEqual(["CREATE TABLE a (id int)", "CREATE INDEX b ON a(id)"]);
  });
});
