import type {
  ApprovalStatusDto,
  CatalogDto,
  CommitImportResponse,
  HealthDto,
} from "@cert-quiz/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { CertQuizCompositionRoot } from "../app/CertQuizCompositionRoot";
import { useCertQuizApi } from "./useCertQuizApi";
import type { CertQuizApi, CertQuizApiResult, StartPracticeInput } from "./port";
import { createUnavailableCertQuizApi } from "./unavailable-adapter";

const certificationId = "00000000-0000-4000-8000-000000000003";

const operationNames = [
  "getHealth",
  "getApprovalStatus",
  "getCurrentUser",
  "getCatalog",
  "listActivePracticeSessions",
  "startPractice",
  "startExam",
  "resumePractice",
  "replacePractice",
  "patchPracticeState",
  "submitPracticeQuestion",
  "getExam",
  "patchExamState",
  "getExamSubmissionPreview",
  "submitExam",
  "getPracticeResult",
  "getAttempt",
  "getHistory",
  "getHistoryTrends",
  "updateScoreVisibility",
  "getLeaderboard",
  "getPendingUsers",
  "approveUser",
  "dryRunImport",
  "commitImport",
] as const satisfies ReadonlyArray<keyof CertQuizApi>;

function ApprovalProbe() {
  const api = useCertQuizApi();
  const [status, setStatus] = useState("unknown");

  const refresh = async () => {
    const result = await api.getApprovalStatus();
    setStatus(result.ok ? result.data.approvalStatus : result.error.code);
  };

  return <button onClick={() => void refresh()}>{status}</button>;
}

type HealthCallResult = Awaited<ReturnType<CertQuizApi["getHealth"]>>;
type CatalogCallResult = Awaited<ReturnType<CertQuizApi["getCatalog"]>>;
type ApprovalCallResult = Awaited<ReturnType<CertQuizApi["getApprovalStatus"]>>;
type CommitImportCallResult = Awaited<ReturnType<CertQuizApi["commitImport"]>>;

describe("CertQuizApi port", () => {
  it("types route parameters, request DTO fields, result data, and shared errors", () => {
    expectTypeOf<
      Parameters<CertQuizApi["startPractice"]>[0]
    >().toEqualTypeOf<StartPracticeInput>();
    expectTypeOf<StartPracticeInput>().toMatchTypeOf<{
      certificationId: string;
    }>();
    expectTypeOf<HealthCallResult>().toEqualTypeOf<CertQuizApiResult<HealthDto>>();
    expectTypeOf<CatalogCallResult>().toEqualTypeOf<CertQuizApiResult<CatalogDto>>();
    expectTypeOf<ApprovalCallResult>().toEqualTypeOf<
      CertQuizApiResult<ApprovalStatusDto>
    >();
    expectTypeOf<CommitImportCallResult>().toEqualTypeOf<
      CertQuizApiResult<CommitImportResponse>
    >();
  });

  it("provides every S1-S10 operation through the bootstrap fallback", async () => {
    const api = createUnavailableCertQuizApi();

    expect(Object.keys(api)).toEqual(operationNames);

    for (const operationName of operationNames) {
      const operation = api[operationName] as (
        input?: unknown,
      ) => Promise<CertQuizApiResult<unknown>>;
      await expect(operation()).resolves.toEqual({
        ok: false,
        error: {
          code: "dependency-unavailable",
          message: "The CertQuiz API adapter is not configured.",
          requestId: "frontend-api-not-configured",
          retryable: true,
          nextAction: "Configure a mock or HTTP adapter and retry.",
        },
      });
    }
  });

  it("injects and replaces adapters only through the composition root", async () => {
    const user = userEvent.setup();
    const pending = vi.fn(async () => ({
      ok: true as const,
      data: { approvalStatus: "pending" as const },
    }));
    const approved = vi.fn(async () => ({
      ok: true as const,
      data: { approvalStatus: "approved" as const },
    }));
    const firstApi: CertQuizApi = {
      ...createUnavailableCertQuizApi(),
      getApprovalStatus: pending,
    };
    const secondApi: CertQuizApi = {
      ...createUnavailableCertQuizApi(),
      getApprovalStatus: approved,
    };

    const view = render(
      <CertQuizCompositionRoot api={firstApi}>
        <ApprovalProbe />
      </CertQuizCompositionRoot>,
    );

    await user.click(screen.getByRole("button", { name: "unknown" }));
    expect(await screen.findByRole("button", { name: "pending" })).toBeVisible();
    expect(pending).toHaveBeenCalledOnce();

    view.rerender(
      <CertQuizCompositionRoot api={secondApi}>
        <ApprovalProbe />
      </CertQuizCompositionRoot>,
    );
    await user.click(screen.getByRole("button", { name: "pending" }));
    expect(await screen.findByRole("button", { name: "approved" })).toBeVisible();
    expect(approved).toHaveBeenCalledOnce();
  });

  it("fails fast when a component bypasses the provider", () => {
    expect(() => render(<ApprovalProbe />)).toThrow(
      "useCertQuizApi must be used within CertQuizApiProvider",
    );
  });

  it("accepts certification IDs as transport-independent operation input", () => {
    const input: StartPracticeInput = { certificationId };
    expect(input).toEqual({ certificationId });
  });
});
