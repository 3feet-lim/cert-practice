import type { Uuid } from "@cert-quiz/contracts";
import { useState } from "react";

import { useApproveUserMutation, usePendingUsersQuery } from "../api/queries";
import { CertQuizRequestError } from "../api/query-result";
import { AsyncBoundary, toQueryAsyncBoundaryState } from "../components";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/Table";

function safeApprovalErrorMessage(error: unknown): string {
  return error instanceof CertQuizRequestError
    ? error.detail.message
    : "사용자 승인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

/** Runtime-only admin pending-user interaction; static previews keep their disabled controls. */
export function PendingUsersPage() {
  const pendingUsers = usePendingUsersQuery();
  const approveUser = useApproveUserMutation();
  const [approvingUserIds, setApprovingUserIds] = useState<ReadonlySet<Uuid>>(
    () => new Set(),
  );
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const approve = (userId: Uuid) => {
    setApprovalError(null);
    setApprovingUserIds((ids) => new Set(ids).add(userId));
    approveUser.mutate(
      { userId },
      {
        onError: (error) => setApprovalError(safeApprovalErrorMessage(error)),
        onSettled: () => {
          setApprovingUserIds((ids) => {
            const next = new Set(ids);
            next.delete(userId);
            return next;
          });
        },
      },
    );
  };

  const state = toQueryAsyncBoundaryState(pendingUsers, {
    loadingLabel: "승인 대기 사용자를 불러오는 중입니다.",
    isEmpty: ({ users }) => users.length === 0,
    empty: {
      title: "승인 대기 사용자가 없습니다",
      message: "현재 검토할 신규 사용자가 없습니다.",
      action: { label: "새로 고침", onAction: () => void pendingUsers.refetch() },
    },
    nextAction: { label: "학습 홈으로 돌아가기", onAction: () => undefined },
  });

  return (
    <AsyncBoundary state={state}>
      {({ users }) => (
        <section aria-labelledby="pending-users-title" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="pending-users-title" className="text-xl font-bold">
                승인 대기 사용자
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                신규 로그인 사용자만 표시합니다.
              </p>
            </div>
            <Badge tone="warning">{users.length}명 대기</Badge>
          </div>
          {approvalError ? <p role="alert">{approvalError}</p> : null}
          <Table>
            <TableCaption>승인 대기 사용자 목록</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>최초 로그인</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>승인</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isApproving = approvingUserIds.has(user.id);
                return (
                  <TableRow key={user.id}>
                    <th scope="row" className="px-4 py-3 font-medium">
                      {user.displayName}
                    </th>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <time dateTime={user.firstLoginAt}>
                        {user.firstLoginAt.replace("T", " ").replace(".000Z", " UTC")}
                      </time>
                    </TableCell>
                    <TableCell>
                      <Badge tone="warning">대기 중</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        aria-label={`${user.displayName} 승인`}
                        disabled={isApproving}
                        onClick={() => approve(user.id)}
                      >
                        {isApproving ? "승인 중" : "승인"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}
    </AsyncBoundary>
  );
}
