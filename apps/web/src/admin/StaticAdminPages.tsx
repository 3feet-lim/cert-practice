import type { DryRunImportResponse, PendingUsersDto } from "@cert-quiz/contracts";

import {
  Badge,
  Button,
  FileSummary,
  StatePanel,
  StaticDialog,
  ValidationErrorList,
} from "../components";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/Table";

export interface PendingUsersStaticPageProps {
  readonly state: "success" | "empty" | "error";
  readonly users?: PendingUsersDto["users"];
  readonly errorMessage?: string;
}

/** Read-only approval list presentation; approval controls deliberately have no behavior. */
export function PendingUsersStaticPage({
  state,
  users = [],
  errorMessage,
}: PendingUsersStaticPageProps) {
  if (state === "error") {
    return (
      <StatePanel
        status="error"
        title="승인 대기 사용자를 불러올 수 없습니다"
        message={errorMessage ?? "목록을 다시 확인해 주세요."}
        action={<Button disabled>다시 시도</Button>}
      />
    );
  }

  if (state === "empty") {
    return (
      <StatePanel
        status="empty"
        title="승인 대기 사용자가 없습니다"
        message="현재 검토할 신규 사용자가 없습니다."
        action={<Button variant="secondary" disabled>새로 고침</Button>}
      />
    );
  }

  return (
    <section aria-labelledby="pending-users-title" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="pending-users-title" className="text-xl font-bold">승인 대기 사용자</h2>
          <p className="mt-1 text-sm text-muted-foreground">신규 로그인 사용자만 표시합니다.</p>
        </div>
        <Badge tone="warning">{users.length}명 대기</Badge>
      </div>
      <Table>
        <TableCaption>승인 대기 사용자 목록</TableCaption>
        <TableHeader><TableRow><TableHead>이름</TableHead><TableHead>이메일</TableHead><TableHead>최초 로그인</TableHead><TableHead>상태</TableHead><TableHead>승인</TableHead></TableRow></TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <th scope="row" className="px-4 py-3 font-medium">{user.displayName}</th>
              <TableCell>{user.email}</TableCell>
              <TableCell><time dateTime={user.firstLoginAt}>{user.firstLoginAt.replace("T", " ").replace(".000Z", " UTC")}</time></TableCell>
              <TableCell><Badge tone="warning">대기 중</Badge></TableCell>
              <TableCell><Button disabled aria-label={`${user.displayName} 승인`}>승인</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">이 정적 검토 화면의 승인 버튼은 동작하지 않습니다.</p>
    </section>
  );
}

export type ImportStaticVariant = "empty" | "validating" | "valid" | "invalid" | "commit" | "completed" | "token-expired";

export interface ImportStaticPageProps {
  readonly variant: ImportStaticVariant;
  readonly validation?: DryRunImportResponse;
}

function summaryValue(value: { status: "available"; value: number } | { status: "unavailable"; reason: string }) {
  return value.status === "available" ? String(value.value) : `계산 불가: ${value.reason}`;
}

function ImportSummary({ validation }: { validation: DryRunImportResponse }) {
  const { summary } = validation;
  return (
    <section aria-labelledby="import-summary-title" className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3"><h2 id="import-summary-title" className="text-lg font-bold">Dry-run 요약</h2><Badge tone={validation.valid ? "success" : "danger"}>{validation.valid ? "검증 통과" : "검증 실패"}</Badge></div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">전체 문항</dt><dd className="mt-1 font-semibold">{summaryValue(summary.totalQuestions)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">오류 수</dt><dd className="mt-1 font-semibold">{summary.errorCount}</dd></div>
        <div><dt className="text-sm text-muted-foreground">번역 완료</dt><dd className="mt-1 font-semibold">{summaryValue(summary.translationStatusCounts.translated)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">영어 전용</dt><dd className="mt-1 font-semibold">{summaryValue(summary.translationStatusCounts.enOnly)}</dd></div>
      </dl>
      <h3 className="mt-5 text-sm font-bold">도메인별 문항 수</h3>
      {Object.keys(summary.domainQuestionCounts).length === 0 ? <p className="mt-2 text-sm text-muted-foreground">계산 불가: 유효한 도메인과 문항 구조가 필요합니다.</p> : <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">{Object.entries(summary.domainQuestionCounts).map(([domain, value]) => <li key={domain} className="rounded-md bg-muted px-3 py-2"><span className="font-medium">{domain}</span>: {summaryValue(value)}</li>)}</ul>}
    </section>
  );
}

function Dropzone({ disabled = false }: { disabled?: boolean }) {
  return <section aria-labelledby="json-dropzone-title" className="rounded-xl border-2 border-dashed border-border bg-muted p-8 text-center"><h2 id="json-dropzone-title" className="font-bold">JSON 문제 은행 파일</h2><p className="mt-2 text-sm text-muted-foreground">최대 10 MiB · JSON 형식만 허용</p><Button className="mt-5" variant="secondary" disabled={disabled}>JSON 파일 선택</Button><p className="mt-3 text-xs text-muted-foreground">이 정적 화면은 파일을 읽거나 업로드하지 않습니다.</p></section>;
}

/** Props-only S10 import presentation. It does not parse files, validate, issue tokens, or commit data. */
export function ImportStaticPage({ variant, validation }: ImportStaticPageProps) {
  const valid = validation?.valid === true ? validation : undefined;
  const invalid = validation?.valid === false ? validation : undefined;
  const selected = variant !== "empty";

  return (
    <section aria-labelledby="import-page-title" className="space-y-5">
      <div><h2 id="import-page-title" className="text-xl font-bold">JSON 문제 은행 임포트</h2><p className="mt-1 text-sm text-muted-foreground">검증 후에만 카탈로그 교체를 확인합니다.</p></div>
      {selected ? <FileSummary name={variant === "invalid" ? "broken-dop-c02.json" : "aws-dop-c02.json"} size="48.2 KiB / 10 MiB" status={variant === "validating" ? "검증 중" : variant === "invalid" ? "검증 실패" : "선택됨"} tone={variant === "invalid" ? "danger" : variant === "validating" ? "info" : "neutral"} details="정적 fixture 파일 요약" /> : <Dropzone />}
      {selected ? <Dropzone disabled={variant === "validating"} /> : null}
      {variant === "validating" ? <StatePanel status="loading" title="JSON을 검증하고 있습니다" message="구조, 필수 필드, 도메인 배정 및 번역 요약을 확인하는 모양입니다." /> : null}
      {valid ? <ImportSummary validation={valid} /> : null}
      {invalid ? <><ImportSummary validation={invalid} /><ValidationErrorList errors={invalid.errors.map((error, index) => ({ id: `${error.code}-${index}`, path: error.path.join("."), message: error.message }))} /></> : null}
      {variant === "valid" && valid ? <StatePanel status="success" title="확정 준비 완료" message={`검증 토큰은 ${valid.expiresAt ?? "정해진 시각"} 이전에 한 번만 사용할 수 있습니다.`} action={<Button disabled>임포트 확정</Button>} /> : null}
      {variant === "completed" ? <StatePanel status="success" title="문제 은행을 교체했습니다" message="새 revision이 활성화되었습니다. 이 정적 완료 화면은 실제 데이터를 변경하지 않습니다." /> : null}
      {variant === "token-expired" ? <StatePanel status="error" title="검증 토큰이 만료되었거나 이미 사용되었습니다" message="파일 내용이 바뀌었거나 15분 유효 시간이 지났습니다. 같은 파일을 다시 검증한 후 확정하세요." action={<Button disabled>다시 검증</Button>} /> : null}
      {variant === "commit" && valid ? <StaticDialog id="import-commit" title="문제 은행을 교체할까요?" description="검증된 동일 JSON과 아직 유효한 일회용 토큰으로만 확정할 수 있습니다." actions={<><Button variant="secondary" disabled>취소</Button><Button variant="danger" disabled>교체 확정</Button></>}><dl className="space-y-2 text-sm"><div><dt className="text-muted-foreground">검증 ID</dt><dd className="font-mono">{valid.validationId}</dd></div><div><dt className="text-muted-foreground">토큰 만료</dt><dd>{valid.expiresAt}</dd></div></dl><p className="mt-4 text-xs text-muted-foreground">이 dialog의 버튼은 동작하지 않습니다.</p></StaticDialog> : null}
    </section>
  );
}
