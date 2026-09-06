import type { Uuid } from "@cert-quiz/contracts";
import { useParams } from "react-router-dom";

import {
  useAttemptQuery,
  useCatalogQuery,
  useCurrentUserQuery,
  useHistoryQuery,
  useHistoryTrendsQuery,
  useLeaderboardQuery,
  usePracticeResultQuery,
  useScoreVisibilityMutation,
} from "../api/queries";
import { AsyncBoundary, StatePanel, StatusBanner } from "../components";
import {
  StaticExamResultScreen,
  StaticHistoryScreen,
  StaticLeaderboardScreen,
  StaticPracticeResultScreen,
} from "../preview/StaticResultHistoryLeaderboardScreens";

type QuerySnapshot<Data> = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: Data | undefined;
  refetch: () => Promise<unknown>;
};

function requestState<Data>(
  query: QuerySnapshot<Data>,
  loadingLabel: string,
  errorTitle: string,
) {
  if (query.isPending) return { status: "loading" as const, label: loadingLabel };
  if (query.isError) {
    return {
      status: "error" as const,
      title: errorTitle,
      message:
        query.error instanceof Error
          ? query.error.message
          : "요청을 완료하지 못했습니다.",
      retryable: true as const,
      retry: { onRetry: () => void query.refetch() },
    };
  }
  if (query.data === undefined) {
    return {
      status: "error" as const,
      title: errorTitle,
      message: "응답 데이터가 없습니다.",
      retryable: true as const,
      retry: { onRetry: () => void query.refetch() },
    };
  }
  return { status: "success" as const, data: query.data };
}

export function PracticeResultPage() {
  const { id } = useParams();
  const query = usePracticeResultQuery(id as Uuid);
  return (
    <AsyncBoundary
      state={requestState(
        query,
        "연습 결과를 불러오는 중입니다.",
        "연습 결과를 열 수 없습니다",
      )}
    >
      {(practice) => (
        <StaticPracticeResultScreen
          fixture={{ state: "success", data: { practice } }}
        />
      )}
    </AsyncBoundary>
  );
}

export function AttemptResultPage() {
  const { id } = useParams();
  const query = useAttemptQuery(id as Uuid);
  return (
    <AsyncBoundary
      state={requestState(
        query,
        "모의고사 결과를 불러오는 중입니다.",
        "모의고사 결과를 열 수 없습니다",
      )}
    >
      {(exam) => (
        <StaticExamResultScreen fixture={{ state: "success", data: { exam } }} />
      )}
    </AsyncBoundary>
  );
}

export function HistoryPage() {
  const history = useHistoryQuery();
  const trends = useHistoryTrendsQuery();
  const historyState = requestState(
    history,
    "모의고사 이력을 불러오는 중입니다.",
    "모의고사 이력을 불러올 수 없습니다",
  );
  const trendsState = requestState(
    trends,
    "점수 추이를 불러오는 중입니다.",
    "점수 추이를 불러올 수 없습니다",
  );

  return (
    <AsyncBoundary state={historyState}>
      {(page) => (
        <AsyncBoundary state={trendsState}>
          {(trendData) => (
            <StaticHistoryScreen
              fixture={
                page.attempts.length === 0
                  ? {
                      state: "empty",
                      title: "모의고사 응시 이력이 없습니다",
                      message: "연습 결과는 이력과 추이에 포함되지 않습니다.",
                      nextAction: "모의고사를 완료하면 여기에 기록됩니다.",
                      data: { page, trends: trendData },
                    }
                  : { state: "success", data: { page, trends: trendData } }
              }
            />
          )}
        </AsyncBoundary>
      )}
    </AsyncBoundary>
  );
}

export function LeaderboardPage() {
  const { certId } = useParams();
  const catalog = useCatalogQuery();
  const certificationId =
    (certId as Uuid | undefined) ?? catalog.data?.providers[0]?.certifications[0]?.id;
  const leaderboard = useLeaderboardQuery(certificationId);
  const currentUser = useCurrentUserQuery();
  const visibility = useScoreVisibilityMutation();

  if (!certificationId) {
    return (
      <AsyncBoundary
        state={requestState(
          catalog,
          "리더보드 자격증을 불러오는 중입니다.",
          "리더보드를 열 수 없습니다",
        )}
      >
        {() => (
          <StatePanel
            status="empty"
            title="리더보드 자격증이 없습니다"
            message="순위를 표시할 수 있는 자격증을 찾지 못했습니다."
          />
        )}
      </AsyncBoundary>
    );
  }

  return (
    <AsyncBoundary
      state={requestState(
        currentUser,
        "공개 설정을 불러오는 중입니다.",
        "공개 설정을 불러올 수 없습니다",
      )}
    >
      {(user) => (
        <AsyncBoundary
          state={requestState(
            leaderboard,
            "리더보드를 불러오는 중입니다.",
            "리더보드를 불러올 수 없습니다",
          )}
        >
          {(data) => (
            <div className="grid gap-4">
              <StaticLeaderboardScreen
                fixture={
                  data.entries.length === 0
                    ? {
                        state: "empty",
                        title: "공개된 모의고사 성과가 없습니다",
                        message:
                          "점수를 공개한 사용자의 모의고사 최고 성과가 표시됩니다.",
                        nextAction: "모의고사를 완료하거나 나중에 다시 확인하세요.",
                        data,
                      }
                    : { state: "success", data }
                }
                scorePublic={user.scorePublic}
                visibilityPending={visibility.isPending}
                onScorePublicChange={(scorePublic) =>
                  visibility.mutate({ scorePublic })
                }
              />
              {visibility.isError ? (
                <StatusBanner
                  title="점수 공개 설정을 저장하지 못했습니다"
                  message={
                    visibility.error instanceof Error
                      ? visibility.error.message
                      : "잠시 후 다시 시도하세요."
                  }
                  tone="danger"
                />
              ) : null}
            </div>
          )}
        </AsyncBoundary>
      )}
    </AsyncBoundary>
  );
}
