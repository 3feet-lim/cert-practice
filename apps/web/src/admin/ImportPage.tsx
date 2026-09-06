import type { DryRunImportResponse, ImportSummaryValue } from "@cert-quiz/contracts";
import { useRef, useState } from "react";

import { useCommitImportMutation, useDryRunImportMutation } from "../api/queries";
import { CertQuizRequestError } from "../api/query-result";
import {
  Badge,
  Button,
  FileSummary,
  StaticDialog,
  ValidationErrorList,
} from "../components";

const MAX_IMPORT_BYTES = 10 * 1_048_576;

type ImportFeedback = {
  readonly message: string;
  readonly retryable: boolean;
  readonly requiresRevalidation: boolean;
};

function formatFileSize(bytes: number): string {
  return `${(bytes / 1_024).toFixed(1)} KiB / 10 MiB`;
}

function summaryValue(value: ImportSummaryValue): string {
  return value.status === "available"
    ? String(value.value)
    : `계산 불가: ${value.reason}`;
}

function safeImportFeedback(error: unknown): ImportFeedback {
  if (!(error instanceof CertQuizRequestError)) {
    return {
      message: "임포트 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      retryable: true,
      requiresRevalidation: false,
    };
  }

  const requiresRevalidation = [
    "content-changed",
    "token-used",
    "validation-expired",
    "validation-required",
  ].includes(error.detail.code);

  return {
    message: error.detail.message,
    retryable: error.detail.retryable,
    requiresRevalidation,
  };
}

function ImportSummary({ validation }: { validation: DryRunImportResponse }) {
  const { summary } = validation;
  return (
    <section
      aria-labelledby="runtime-import-summary-title"
      className="rounded-xl border border-border bg-card p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="runtime-import-summary-title" className="text-lg font-bold">
          Dry-run 요약
        </h2>
        <Badge tone={validation.valid ? "success" : "danger"}>
          {validation.valid ? "검증 통과" : "검증 실패"}
        </Badge>
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">전체 문항</dt>
          <dd className="mt-1 font-semibold">{summaryValue(summary.totalQuestions)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">오류 수</dt>
          <dd className="mt-1 font-semibold">{summary.errorCount}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">번역 완료</dt>
          <dd className="mt-1 font-semibold">
            {summaryValue(summary.translationStatusCounts.translated)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">영어 전용</dt>
          <dd className="mt-1 font-semibold">
            {summaryValue(summary.translationStatusCounts.enOnly)}
          </dd>
        </div>
      </dl>
      <h3 className="mt-5 text-sm font-bold">도메인별 문항 수</h3>
      {Object.keys(summary.domainQuestionCounts).length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          계산 불가: 유효한 도메인과 문항 구조가 필요합니다.
        </p>
      ) : (
        <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(summary.domainQuestionCounts).map(([domain, value]) => (
            <li key={domain} className="rounded-md bg-muted px-3 py-2">
              <span className="font-medium">{domain}</span>: {summaryValue(value)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Runtime-only S10 interaction. Commit credentials are held only in component memory. */
export function ImportPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const contentVersion = useRef(0);
  const dryRunImport = useDryRunImportMutation();
  const commitImport = useCommitImportMutation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [validation, setValidation] = useState<DryRunImportResponse | null>(null);
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null);
  const [isCommitDialogOpen, setCommitDialogOpen] = useState(false);
  const [committedAt, setCommittedAt] = useState<string | null>(null);

  const resetValidationForChangedContent = () => {
    setValidation(null);
    setCommitDialogOpen(false);
    setCommittedAt(null);
  };

  const selectFile = async (file: File | undefined) => {
    if (!file) return;

    const selectionVersion = contentVersion.current + 1;
    contentVersion.current = selectionVersion;
    resetValidationForChangedContent();
    setSelectedFile(file);
    setContent(null);
    setFeedback(null);

    if (file.size > MAX_IMPORT_BYTES) {
      setFeedback({
        message: `파일 크기 ${file.size.toLocaleString()} bytes가 10 MiB 제한을 초과합니다.`,
        retryable: false,
        requiresRevalidation: false,
      });
      return;
    }
    if (
      !file.name.toLowerCase().endsWith(".json") &&
      file.type !== "application/json"
    ) {
      setFeedback({
        message: "JSON 형식 파일만 선택할 수 있습니다.",
        retryable: false,
        requiresRevalidation: false,
      });
      return;
    }

    try {
      const nextContent = await file.text();
      if (selectionVersion !== contentVersion.current) return;
      if (nextContent.length === 0) {
        setFeedback({
          message: "비어 있지 않은 JSON 파일을 선택하세요.",
          retryable: false,
          requiresRevalidation: false,
        });
        return;
      }
      setContent(nextContent);
    } catch {
      if (selectionVersion !== contentVersion.current) return;
      setFeedback({
        message: "선택한 파일 내용을 읽을 수 없습니다. 파일을 다시 선택하세요.",
        retryable: true,
        requiresRevalidation: false,
      });
    }
  };

  const runDryRun = () => {
    if (content === null) {
      setFeedback({
        message: "검증할 JSON 파일 내용을 준비하지 못했습니다. 파일을 다시 선택하세요.",
        retryable: false,
        requiresRevalidation: false,
      });
      return;
    }
    setFeedback(null);
    setCommittedAt(null);
    const dryRunContentVersion = contentVersion.current;
    dryRunImport.mutate(
      { content },
      {
        onSuccess: (result) => {
          if (dryRunContentVersion === contentVersion.current) setValidation(result);
        },
        onError: (error) => {
          if (dryRunContentVersion === contentVersion.current) {
            setFeedback(safeImportFeedback(error));
          }
        },
      },
    );
  };

  const commit = () => {
    if (
      content === null ||
      !validation?.valid ||
      !validation.validationId ||
      !validation.commitToken
    ) {
      setCommitDialogOpen(false);
      setFeedback({
        message: "확정 전에 현재 파일을 다시 검증하세요.",
        retryable: false,
        requiresRevalidation: true,
      });
      return;
    }

    setFeedback(null);
    commitImport.mutate(
      {
        validationId: validation.validationId,
        commitToken: validation.commitToken,
        content,
      },
      {
        onSuccess: (result) => {
          setValidation(null);
          setCommitDialogOpen(false);
          setCommittedAt(result.committedAt);
        },
        onError: (error) => {
          const nextFeedback = safeImportFeedback(error);
          if (nextFeedback.requiresRevalidation) setValidation(null);
          setCommitDialogOpen(false);
          setFeedback(nextFeedback);
        },
      },
    );
  };

  const readyToCommit =
    validation?.valid === true &&
    validation.validationId !== undefined &&
    validation.commitToken !== undefined;
  const canDryRun = content !== null && !dryRunImport.isPending;

  return (
    <section
      aria-labelledby="import-page-title"
      className="space-y-5"
      data-screen="S10"
    >
      <div>
        <h2 id="import-page-title" className="text-xl font-bold">
          JSON 문제 은행 임포트
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          JSON 파일을 dry-run으로 검증한 뒤, 동일한 내용만 확정할 수 있습니다.
        </p>
      </div>

      <section
        aria-labelledby="json-dropzone-title"
        className="rounded-xl border-2 border-dashed border-border bg-muted p-8 text-center"
      >
        <h2 id="json-dropzone-title" className="font-bold">
          JSON 문제 은행 파일
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          최대 10 MiB · JSON 형식만 허용
        </p>
        <input
          ref={fileInput}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          aria-label="JSON 문제 은행 파일 선택"
          disabled={dryRunImport.isPending || commitImport.isPending}
          onChange={(event) => {
            const [file] = Array.from(event.target.files ?? []);
            event.target.value = "";
            void selectFile(file);
          }}
        />
        <Button
          className="mt-5"
          variant="secondary"
          disabled={dryRunImport.isPending || commitImport.isPending}
          onClick={() => fileInput.current?.click()}
        >
          JSON 파일 선택
        </Button>
      </section>

      {selectedFile ? (
        <FileSummary
          name={selectedFile.name}
          size={formatFileSize(selectedFile.size)}
          status={
            dryRunImport.isPending
              ? "검증 중"
              : validation?.valid
                ? "검증 통과"
                : validation
                  ? "검증 실패"
                  : "선택됨"
          }
          tone={
            dryRunImport.isPending
              ? "info"
              : validation?.valid
                ? "success"
                : validation
                  ? "danger"
                  : "neutral"
          }
          details={
            readyToCommit
              ? "검증 토큰은 이 화면의 메모리에만 보관되며 파일을 바꾸면 즉시 폐기됩니다."
              : "파일을 바꾸면 이전 검증 결과와 확정 자격 증명이 폐기됩니다."
          }
        />
      ) : null}

      {feedback ? (
        <section
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-danger"
        >
          <p className="font-semibold">{feedback.message}</p>
          <p className="mt-1 text-sm">
            {feedback.requiresRevalidation
              ? "선택한 파일을 다시 검증한 후 확정하세요."
              : feedback.retryable
                ? "같은 파일로 다시 시도할 수 있습니다."
                : "파일을 수정하거나 다시 선택한 후 진행하세요."}
          </p>
        </section>
      ) : null}

      {dryRunImport.isPending ? (
        <p role="status" aria-live="polite">
          JSON을 검증하고 있습니다.
        </p>
      ) : null}
      {validation ? <ImportSummary validation={validation} /> : null}
      {validation && !validation.valid ? (
        <ValidationErrorList
          errors={validation.errors.map((error, index) => ({
            id: `${error.code}-${index}`,
            path: error.path.join("."),
            message: error.message,
          }))}
        />
      ) : null}

      {selectedFile ? (
        <div className="flex flex-wrap gap-3">
          <Button disabled={!canDryRun || commitImport.isPending} onClick={runDryRun}>
            {dryRunImport.isPending ? "검증 중" : "Dry-run 검증"}
          </Button>
          {readyToCommit ? (
            <Button
              variant="danger"
              disabled={commitImport.isPending}
              onClick={() => setCommitDialogOpen(true)}
            >
              임포트 확정
            </Button>
          ) : null}
        </div>
      ) : null}

      {committedAt ? (
        <section
          role="status"
          className="rounded-xl border border-success/20 bg-success-soft p-4"
        >
          <h2 className="font-bold">문제 은행을 교체했습니다</h2>
          <p className="mt-1 text-sm">활성 revision 전환 시각: {committedAt}</p>
        </section>
      ) : null}

      <StaticDialog
        id="runtime-import-commit"
        open={isCommitDialogOpen}
        title="문제 은행을 교체할까요?"
        description="검증된 동일 JSON과 아직 유효한 일회용 토큰으로만 확정할 수 있습니다."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={commitImport.isPending}
              onClick={() => setCommitDialogOpen(false)}
            >
              취소
            </Button>
            <Button variant="danger" disabled={commitImport.isPending} onClick={commit}>
              {commitImport.isPending ? "교체 중" : "교체 확정"}
            </Button>
          </>
        }
      >
        <p className="text-sm">
          선택한 <strong>{selectedFile?.name}</strong>의 검증 결과만 사용합니다. 확정
          후에는 같은 검증 토큰을 다시 사용할 수 없습니다.
        </p>
      </StaticDialog>
    </section>
  );
}
