import type {
  ActivePracticeSessionsDto,
  CatalogDto,
  ExamActiveSessionDto,
  PracticeSessionDto,
} from "@cert-quiz/contracts";

import {
  AppShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CertificationCard,
  PageHeader,
  PendingShell,
  PublicShell,
  StatePanel,
  StaticDialog,
  StatusBanner,
} from "../components";
import type { StaticScreenFixture } from "../mocks/static-preview-fixtures";
import { CERT_QUIZ_STATIC_PREVIEW_FIXTURES } from "../mocks/static-preview-fixtures";
import type { StaticPreviewExportEntry } from "./export-manifest";

const appNavigation = [
  { label: "홈", href: "#home", active: true },
  { label: "이력", href: "#history" },
  { label: "리더보드", href: "#leaderboard" },
];

function ReadOnlyAction({
  children,
  variant = "primary",
}: {
  children: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Button disabled variant={variant}>
      {children}
    </Button>
  );
}

function CatalogLoading() {
  return (
    <Card aria-busy="true" className="max-w-3xl">
      <CardHeader>
        <Badge tone="info">Loading</Badge>
        <CardTitle>자격증 카탈로그를 준비하고 있습니다</CardTitle>
        <CardDescription>
          이 화면은 고정 fixture의 loading 표현이며 데이터를 요청하지 않습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3" aria-label="카탈로그 loading placeholder">
        <div className="h-5 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </CardContent>
    </Card>
  );
}

function CatalogContent({
  catalog,
  activeSessions,
}: {
  catalog: CatalogDto;
  activeSessions?: ActivePracticeSessionsDto;
}) {
  const activeSession = activeSessions?.sessions[0];
  return (
    <div className="space-y-8">
      {activeSession ? (
        <StatusBanner
          title="이어 풀 수 있는 연습이 있습니다"
          message={`${activeSession.certificationCode} · ${activeSession.currentQuestionNumber} / ${activeSession.totalQuestions}번 문항 · 마지막 저장 ${activeSession.updatedAt}`}
          tone="info"
        >
          <ReadOnlyAction>연습 이어 풀기</ReadOnlyAction>
        </StatusBanner>
      ) : null}
      {catalog.providers.map((provider) => (
        <section key={provider.id} aria-labelledby={`provider-${provider.id}`}>
          <div className="mb-4 flex items-center gap-3">
            <h2 id={`provider-${provider.id}`} className="text-xl font-bold">
              {provider.name}
            </h2>
            <Badge tone="neutral">Provider</Badge>
          </div>
          <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
            {provider.certifications.map((certification) => (
              <CertificationCard
                code={certification.code}
                domainCount={certification.domains.length}
                href={`#certification-${certification.id}`}
                key={certification.id}
                name={certification.name}
                passThreshold={`${certification.passThreshold}%`}
                provider={provider.name}
                status={{ label: "학습 가능", tone: "success" }}
                timeLimitMinutes={certification.timeLimitMinutes}
                totalQuestions={certification.totalQuestions}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LoginScreen() {
  return (
    <PublicShell
      aside={
        <>
          <h2 className="text-xl font-bold">학습 흐름</h2>
          <ol className="mt-5 grid gap-4 text-sm leading-6 text-muted-foreground">
            <li>
              <strong className="text-foreground">01.</strong> 자격증과 학습 모드를
              선택합니다.
            </li>
            <li>
              <strong className="text-foreground">02.</strong> 연습 또는 모의고사로
              풀이합니다.
            </li>
            <li>
              <strong className="text-foreground">03.</strong> 도메인별 성과를
              검토합니다.
            </li>
          </ol>
        </>
      }
    >
      <Badge tone="info">Private learning workspace</Badge>
      <h1 className="mt-5 text-4xl font-extrabold tracking-tight">
        클라우드 자격증 학습을 한 곳에서
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
        연습, 모의고사, 이력과 리더보드를 일관된 흐름으로 관리합니다.
      </p>
      <div className="mt-8">
        <ReadOnlyAction>Google로 계속하기</ReadOnlyAction>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        이 정적 preview는 로그인 동작이나 인증 정보를 처리하지 않습니다.
      </p>
    </PublicShell>
  );
}

function CallbackErrorScreen({ fixture }: { fixture: StaticScreenFixture<never> }) {
  const message =
    fixture.state === "error" ? fixture.error.message : "로그인을 완료할 수 없습니다.";
  const nextAction =
    fixture.state === "error"
      ? fixture.error.nextAction
      : "로그인 화면으로 돌아가세요.";
  return (
    <PublicShell>
      <StatePanel
        action={<ReadOnlyAction variant="secondary">로그인 화면으로</ReadOnlyAction>}
        message={message}
        status="error"
        title="로그인을 완료할 수 없습니다"
        details={<p>{nextAction} 인증 정보나 token은 이 화면에 표시하지 않습니다.</p>}
      />
    </PublicShell>
  );
}

function PendingScreen({
  fixture,
}: {
  fixture: StaticScreenFixture<{ approval: { approvalStatus: string } }>;
}) {
  const approval =
    fixture.state === "success" ? fixture.data.approval.approvalStatus : "pending";
  return (
    <PendingShell statusLabel={approval === "pending" ? "승인 대기" : approval}>
      <Badge tone="warning">Pending approval</Badge>
      <h1 className="mt-5 text-3xl font-extrabold tracking-tight">
        관리자 승인을 기다리고 있어요
      </h1>
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        현재 계정은 승인 상태만 확인할 수 있습니다. 보호된 학습 데이터는 표시하지
        않습니다.
      </p>
      <StatusBanner
        title="현재 상태"
        message="승인되면 홈에서 자격증 카탈로그와 학습 모드를 선택할 수 있습니다."
        tone="warning"
      />
      <div className="mt-7 flex flex-wrap gap-3">
        <ReadOnlyAction>승인 상태 새로고침</ReadOnlyAction>
        <ReadOnlyAction variant="secondary">로그아웃</ReadOnlyAction>
      </div>
    </PendingShell>
  );
}

function HomeScreen({
  entry,
  fixture,
}: {
  entry: StaticPreviewExportEntry;
  fixture:
    | StaticScreenFixture<CatalogDto>
    | { state: "loading"; title: string; message: string };
}) {
  const isLoading = fixture.state === "loading";
  const activeFixture = isLoading ? undefined : fixture;
  const catalog =
    activeFixture?.state === "success"
      ? activeFixture.data
      : activeFixture?.state === "error"
        ? activeFixture.data
        : undefined;
  const activeSessions =
    entry.fixtureKey === "catalog.success" &&
    CERT_QUIZ_STATIC_PREVIEW_FIXTURES.practice.success.state === "success"
      ? CERT_QUIZ_STATIC_PREVIEW_FIXTURES.practice.success.data.activeSessions
      : undefined;

  return (
    <AppShell
      navigation={appNavigation}
      userActions={<Badge tone="success">Approved learner</Badge>}
    >
      <PageHeader
        eyebrow="S2 · Home"
        headingId="s2-home-title"
        title="학습 홈"
        description="Provider별로 학습 가능한 자격증을 확인하고 모드를 선택합니다."
      />
      <div className="mt-8">
        {isLoading ? <CatalogLoading /> : null}
        {fixture.state === "empty" ? (
          <StatePanel
            action={
              <ReadOnlyAction variant="secondary">나중에 다시 확인</ReadOnlyAction>
            }
            message={fixture.message}
            status="empty"
            title={fixture.title}
          />
        ) : null}
        {fixture.state === "error" ? (
          <StatePanel
            action={
              <ReadOnlyAction variant="secondary">관리자에게 문의</ReadOnlyAction>
            }
            details={<p>요청 ID: {fixture.error.requestId}</p>}
            message={fixture.error.message}
            status="error"
            title="카탈로그를 표시할 수 없습니다"
          />
        ) : null}
        {catalog ? (
          <CatalogContent catalog={catalog} activeSessions={activeSessions} />
        ) : null}
      </div>
    </AppShell>
  );
}

function ModeMetadata({
  certification,
}: {
  certification: {
    code: string;
    name: string;
    totalQuestions: number;
    timeLimitMinutes: number;
    passThreshold: string;
    scoringMode: string;
  };
}) {
  return (
    <dl className="mt-5 grid gap-4 rounded-xl border border-border bg-muted p-5 text-sm sm:grid-cols-5">
      <div>
        <dt className="text-muted-foreground">시험 코드</dt>
        <dd className="mt-1 font-bold">{certification.code}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">문항 수</dt>
        <dd className="mt-1 font-bold">{certification.totalQuestions}문항</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">제한 시간</dt>
        <dd className="mt-1 font-bold">{certification.timeLimitMinutes}분</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">합격 기준</dt>
        <dd className="mt-1 font-bold">{certification.passThreshold}%</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">채점 방식</dt>
        <dd className="mt-1 font-bold">{certification.scoringMode}</dd>
      </div>
    </dl>
  );
}

function ModeSelectScreen({
  entry,
  fixture,
}: {
  entry: StaticPreviewExportEntry;
  fixture:
    | StaticScreenFixture<CatalogDto>
    | StaticScreenFixture<{
        session: PracticeSessionDto;
        activeSessions: ActivePracticeSessionsDto;
      }>
    | StaticScreenFixture<{ session: ExamActiveSessionDto }>
    | { state: "loading"; title: string; message: string };
}) {
  if (fixture.state === "loading") {
    return (
      <AppShell
        navigation={appNavigation}
        userActions={<Badge tone="success">Approved learner</Badge>}
      >
        <PageHeader
          eyebrow="S3 · Loading"
          headingId="s3-mode-select-title"
          title="학습 모드 선택"
          description="선택한 자격증 정보를 준비하고 있습니다."
        />
        <div className="mt-8">
          <CatalogLoading />
        </div>
      </AppShell>
    );
  }

  if (fixture.state === "empty") {
    return (
      <AppShell
        navigation={appNavigation}
        userActions={<Badge tone="success">Approved learner</Badge>}
      >
        <PageHeader
          eyebrow="S3 · Empty"
          headingId="s3-mode-select-title"
          title="학습 모드 선택"
          description="선택한 자격증의 학습 가능 여부를 확인합니다."
        />
        <div className="mt-8">
          <StatePanel
            action={
              <ReadOnlyAction variant="secondary">홈으로 돌아가기</ReadOnlyAction>
            }
            message={fixture.message}
            status="empty"
            title={fixture.title}
          />
        </div>
      </AppShell>
    );
  }

  if (fixture.state === "error") {
    return (
      <AppShell
        navigation={appNavigation}
        userActions={<Badge tone="success">Approved learner</Badge>}
      >
        <PageHeader
          eyebrow="S3 · Error"
          headingId="s3-mode-select-title"
          title="학습 모드 선택"
          description="선택한 자격증의 메타데이터를 표시할 수 없습니다."
        />
        <div className="mt-8">
          <StatePanel
            action={
              <ReadOnlyAction variant="secondary">홈으로 돌아가기</ReadOnlyAction>
            }
            message={fixture.error.message}
            status="error"
            title="학습 모드를 표시할 수 없습니다"
          />
        </div>
      </AppShell>
    );
  }

  const catalogFixture = fixture as StaticScreenFixture<CatalogDto>;
  const catalog =
    catalogFixture.state === "success" && "providers" in catalogFixture.data
      ? catalogFixture.data
      : undefined;
  const certification = catalog?.providers[0]?.certifications[0] ?? {
    code: "DOP-C02",
    name: "AWS Certified DevOps Engineer – Professional",
    totalQuestions: 75,
    timeLimitMinutes: 180,
    passThreshold: "75",
    scoringMode: "all_or_nothing",
  };
  const practiceFixture = fixture as StaticScreenFixture<{
    session: PracticeSessionDto;
    activeSessions: ActivePracticeSessionsDto;
  }>;
  const activePractice =
    entry.variant === "resume" && practiceFixture.state === "success"
      ? practiceFixture.data.session
      : undefined;

  return (
    <AppShell
      navigation={appNavigation}
      userActions={<Badge tone="success">Approved learner</Badge>}
    >
      <PageHeader
        eyebrow={`S3 · ${certification.code}`}
        headingId="s3-mode-select-title"
        title="학습 모드 선택"
        description={certification.name}
      />
      <ModeMetadata certification={certification} />
      <div className="mt-8 grid max-w-5xl gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Badge tone="success">시간 제한 없음</Badge>
            <CardTitle>연습 모드</CardTitle>
            <CardDescription>
              문항 제출 직후 답이 잠기고 정답과 해설을 확인합니다.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <ReadOnlyAction>연습 시작</ReadOnlyAction>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <Badge tone="warning">{certification.timeLimitMinutes}분</Badge>
            <CardTitle>모의고사</CardTitle>
            <CardDescription>
              {certification.totalQuestions}문항을 제한 시간 안에 풀고 제출 후 전체
              결과를 검토합니다.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <ReadOnlyAction>모의고사 시작</ReadOnlyAction>
          </CardFooter>
        </Card>
      </div>
      {activePractice ? (
        <div className="mt-8">
          <StaticDialog
            actions={
              <>
                <ReadOnlyAction variant="secondary">취소</ReadOnlyAction>
                <ReadOnlyAction>이어 풀기</ReadOnlyAction>
                <ReadOnlyAction variant="secondary">기존 세션 교체</ReadOnlyAction>
              </>
            }
            description={`${activePractice.certificationCode} ${activePractice.currentIndex + 1} / ${activePractice.questions.length}번 문항에서 이어갈 수 있습니다. 선택 전에는 기존 세션이 변경되지 않습니다.`}
            id="resume-practice"
            title="진행 중인 연습이 있습니다"
          >
            <p className="text-sm leading-6 text-muted-foreground">
              이어 풀기 또는 명시적 교체 중 하나를 선택하는 정적 dialog fixture입니다.
            </p>
          </StaticDialog>
        </div>
      ) : null}
      {entry.variant === "confirm" ? (
        <div className="mt-8">
          <StaticDialog
            actions={
              <>
                <ReadOnlyAction variant="secondary">취소</ReadOnlyAction>
                <ReadOnlyAction>확인하고 시작</ReadOnlyAction>
              </>
            }
            description={`확인 시점부터 서버 기준 ${certification.timeLimitMinutes}분이 시작된다는 고정 안내입니다.`}
            id="exam-confirmation"
            title="모의고사를 시작할까요?"
          >
            <p className="text-sm leading-6 text-muted-foreground">
              이 화면은 시작 요청, 타이머, 세션 생성을 수행하지 않습니다.
            </p>
          </StaticDialog>
        </div>
      ) : null}
    </AppShell>
  );
}

export function StaticS1S3Screen({
  entry,
  fixture,
}: {
  entry: StaticPreviewExportEntry;
  fixture: unknown;
}) {
  if (entry.id === "s1-login-success") return <LoginScreen />;
  if (entry.id === "s1-login-error")
    return <CallbackErrorScreen fixture={fixture as StaticScreenFixture<never>} />;
  if (entry.id === "s1-login-pending")
    return (
      <PendingScreen
        fixture={
          fixture as StaticScreenFixture<{ approval: { approvalStatus: string } }>
        }
      />
    );
  if (entry.screen === "S2")
    return (
      <HomeScreen
        entry={entry}
        fixture={
          fixture as
            | StaticScreenFixture<CatalogDto>
            | { state: "loading"; title: string; message: string }
        }
      />
    );
  if (entry.screen === "S3") {
    return (
      <ModeSelectScreen
        entry={entry}
        fixture={
          fixture as
            | StaticScreenFixture<CatalogDto>
            | StaticScreenFixture<{
                session: PracticeSessionDto;
                activeSessions: ActivePracticeSessionsDto;
              }>
            | StaticScreenFixture<{ session: ExamActiveSessionDto }>
            | { state: "loading"; title: string; message: string }
        }
      />
    );
  }
  return null;
}
