import type { Uuid } from "@cert-quiz/contracts";
import { Link, useNavigate, useParams } from "react-router-dom";

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
import { useDocumentTitle } from "../lib/use-document-title";
import {
  StaticExamResultScreen,
  StaticHistoryScreen,
  StaticLeaderboardScreen,
  StaticPracticeResultScreen,
} from "../preview/StaticResultHistoryLeaderboardScreens";

const startExamLinkClassName =
  "inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30";

function StartExamLink() {
  return (
    <Link className={startExamLinkClassName} to="/app">
      모의고사 시작하기
    </Link>
  );
}

/** Results carry only a certification snapshot, so resolve its id through the catalog. */
function useCertificationIdByCode() {
  const catalog = useCatalogQuery();
  return (code: string) =>
    catalog.data?.providers
      .flatMap((provider) => provider.certifications)
      .find((certification) => certification.code === code)?.id;
}

function certificationHref(certificationId: string | undefined) {
  return certificationId ? `/app/certifications/${certificationId}` : undefined;
}

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
  useDocumentTitle("연습 결과");
  const { id } = useParams();
  const query = usePracticeResultQuery(id as Uuid);
  const certificationIdForCode = useCertificationIdByCode();
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
          screenMarker={null}
          fixture={{ state: "success", data: { practice } }}
          practiceHref={certificationHref(
            certificationIdForCode(practice.certification.code),
          )}
        />
      )}
    </AsyncBoundary>
  );
}

export function AttemptResultPage() {
  useDocumentTitle("모의고사 결과");
  const { id } = useParams();
  const query = useAttemptQuery(id as Uuid);
  const certificationIdForCode = useCertificationIdByCode();
  return (
    <AsyncBoundary
      state={requestState(
        query,
        "모의고사 결과를 불러오는 중입니다.",
        "모의고사 결과를 열 수 없습니다",
      )}
    >
      {(exam) => (
        <StaticExamResultScreen
          screenMarker={null}
          fixture={{ state: "success", data: { exam } }}
          practiceHref={certificationHref(
            certificationIdForCode(exam.certification.code),
          )}
          historyHref="/app/history"
        />
      )}
    </AsyncBoundary>
  );
}

export function HistoryPage() {
  useDocumentTitle("모의고사 이력");
  const history = useHistoryQuery();
  const trends = useHistoryTrendsQuery();
  const catalog = useCatalogQuery();
  const passThresholds = Object.fromEntries(
    (catalog.data?.providers ?? [])
      .flatMap((provider) => provider.certifications)
      .map((certification) => [certification.id, certification.passThreshold]),
  );
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
              screenMarker={null}
              emptyAction={<StartExamLink />}
              attemptHref={(attemptId) => `/app/attempts/${attemptId}`}
              passThresholds={passThresholds}
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
  useDocumentTitle("리더보드");
  const { certId } = useParams();
  const navigate = useNavigate();
  const catalog = useCatalogQuery();
  const certifications =
    catalog.data?.providers.flatMap((provider) => provider.certifications) ?? [];
  const certificationId = (certId as Uuid | undefined) ?? certifications[0]?.id;
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
                screenMarker={null}
                emptyAction={<StartExamLink />}
                certificationPicker={
                  certifications.length > 1 ? (
                    <label className="grid gap-1 text-sm font-semibold">
                      자격증
                      <select
                        className="min-h-10 rounded-md border border-border bg-card px-3 text-sm"
                        value={certificationId}
                        onChange={(event) =>
                          navigate(`/app/leaderboards/${event.target.value}`)
                        }
                      >
                        {certifications.map((certification) => (
                          <option key={certification.id} value={certification.id}>
                            {certification.code} · {certification.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null
                }
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
