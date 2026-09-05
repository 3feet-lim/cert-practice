import type { DryRunImportResponse, PendingUsersDto } from "@cert-quiz/contracts";
import { Route, Routes, useSearchParams } from "react-router-dom";

import { ImportStaticPage, PendingUsersStaticPage } from "../admin/StaticAdminPages";

import { QuestionPresenter } from "../quiz/QuestionPresenter";
import { StaticDialog } from "../components/ui/StaticDialog";
import { StatusBanner, TimerFace, type QuestionNavigatorItem } from "../components/StaticPresentation";
import { Button } from "../components/ui/Button";
import {
  STATIC_PREVIEW_GALLERY_LINKS,
  STATIC_PREVIEW_ROUTE_PATTERNS,
  createStaticArtifactNavigation,
  getStaticPreviewRouteEntries,
  type StaticPreviewExportEntry,
} from "./export-manifest";
import { getStaticPreviewFixture } from "./route-fixtures";
import { CERT_QUIZ_STATIC_PREVIEW_FIXTURES } from "../mocks/static-preview-fixtures";
import { StaticS1S3Screen } from "./StaticS1S3Screens";
import {
  StaticExamResultScreen,
  StaticHistoryScreen,
  StaticLeaderboardScreen,
  StaticPracticeResultScreen,
} from "./StaticResultHistoryLeaderboardScreens";

function selectEntry(
  entries: readonly StaticPreviewExportEntry[],
  preview: string | null,
  fixture: string | null,
): StaticPreviewExportEntry {
  const selected = entries.find(
    (candidate) =>
      (preview !== null && candidate.variant === preview) ||
      (fixture !== null && candidate.fixtureKey === fixture),
  );
  const fallback = entries[0];
  if (selected !== undefined) return selected;
  if (fallback !== undefined) return fallback;
  throw new Error("A static preview route must have at least one manifest entry.");
}

function StaticArtifactNavigation({ entry }: { entry: StaticPreviewExportEntry }) {
  const navigation = createStaticArtifactNavigation(entry.id);

  return (
    <>
      <header>
        <a href={navigation.galleryHref}>CERTQUIZ UI gallery</a>
        <nav aria-label="주요 정적 화면">
          {navigation.primary.map((item) => (
            <a href={item.href} key={item.targetId}>
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <aside aria-label="화면 바로가기">
        <nav>
          {navigation.secondary.map((item) => (
            <a href={item.href} key={item.targetId}>
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
    </>
  );
}

function quizNavigatorItems(
  questions: readonly { displayNumber: number; selectedChoiceIds: readonly string[]; flagged: boolean }[],
  currentIndex: number,
): QuestionNavigatorItem[] {
  return questions.map((question, index) => ({
    number: question.displayNumber,
    href: `#question-${question.displayNumber}`,
    state: index === currentIndex ? "current" : question.selectedChoiceIds.length > 0 ? "answered" : "unanswered",
    flagged: question.flagged,
  }));
}

function staticQuestionAt<
  Question extends { displayNumber: number },
>(questions: readonly Question[], currentIndex: number): Question {
  const question = questions[currentIndex];
  if (question === undefined) throw new Error("Static quiz fixture has no current question.");
  return question;
}

function StaticQuizVisual({ entryId }: { entryId: string }) {
  if (entryId === "s4-practice-error") {
    const fixture = CERT_QUIZ_STATIC_PREVIEW_FIXTURES.practice.error;
    return <StatusBanner message={fixture.error.message} title="연습 세션을 표시할 수 없습니다" tone="danger" />;
  }

  const practiceFixture = entryId === "s4-practice-submitted"
    ? CERT_QUIZ_STATIC_PREVIEW_FIXTURES.practice.submittedFeedback
    : CERT_QUIZ_STATIC_PREVIEW_FIXTURES.practice.success;
  if (entryId.startsWith("s4-practice")) {
    if (practiceFixture.state !== "success") return null;
    const session = "session" in practiceFixture.data ? practiceFixture.data.session : practiceFixture.data;
    const question = staticQuestionAt(session.questions, session.currentIndex);
    return (
      <section aria-label="연습 문제 정적 화면" className="grid gap-6">
        <StatusBanner
          message={question.kind === "practice-submitted" ? "이 문항은 최초 제출 후 잠겼으며 해설이 공개되었습니다." : "제출 전에는 정답과 해설이 표시되지 않습니다."}
          title={question.kind === "practice-submitted" ? "제출 완료" : "연습 진행 중"}
          tone={question.kind === "practice-submitted" ? "success" : "info"}
        />
        <QuestionPresenter
          language={question.kind === "practice-submitted" ? "ko" : "en"}
          navigatorItems={quizNavigatorItems(session.questions, session.currentIndex)}
          nextDisabled={session.currentIndex === session.questions.length - 1}
          previousDisabled={session.currentIndex === 0}
          question={question}
          totalQuestions={session.questions.length}
        />
        <Button disabled>{question.kind === "practice-submitted" ? "제출 완료" : "답변 제출"}</Button>
      </section>
    );
  }

  if (entryId === "s5-exam-finalized") {
    return <StatusBanner message="이 모의고사는 이미 제출되어 결과 화면으로 이동합니다." title="모의고사 확정 완료" tone="success"><a className="font-semibold underline" href="#attempt-result">결과 보기</a></StatusBanner>;
  }

  const isExpired = entryId === "s5-exam-expired";
  const fixture = isExpired
    ? CERT_QUIZ_STATIC_PREVIEW_FIXTURES.exam.expired
    : CERT_QUIZ_STATIC_PREVIEW_FIXTURES.exam.success;
  if (fixture.state !== "success") return null;
  const session = "session" in fixture.data ? fixture.data.session : fixture.data;
  const question = staticQuestionAt(session.questions, session.currentIndex);
  const preview = "submissionPreview" in fixture.data ? fixture.data.submissionPreview : undefined;

  return (
    <section aria-label="모의고사 정적 화면" className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-semibold text-muted-foreground">{session.certificationCode}</p><h2 className="text-xl font-bold">{session.certificationName}</h2></div>
        <TimerFace expired={isExpired} remaining={isExpired ? "00:00:00" : "02:30:00"} label="서버 기준 남은 시간" />
      </div>
      {isExpired ? <StatusBanner message="만료 시점 이후에는 답변, Flag, 문항 위치를 변경할 수 없습니다." title="시간이 만료되었습니다" tone="danger" /> : null}
      <QuestionPresenter
        language="en"
        navigatorItems={quizNavigatorItems(session.questions, session.currentIndex)}
        nextDisabled={session.currentIndex === session.questions.length - 1 || isExpired}
        previousDisabled={session.currentIndex === 0 || isExpired}
        question={question}
        totalQuestions={session.questions.length}
      />
      <Button disabled={isExpired}>{isExpired ? "만료됨" : "제출 미리보기"}</Button>
      {entryId === "s5-exam-preview" && preview !== undefined ? (
        <StaticDialog
          actions={<><Button disabled variant="secondary">취소</Button><Button disabled>제출 확정</Button></>}
          description="정답과 해설은 제출 결과에서만 표시됩니다."
          id="exam-submission-preview"
          title="모의고사를 제출하시겠습니까?"
        >
          <dl className="grid grid-cols-2 gap-4"><div><dt className="text-sm text-muted-foreground">미응답</dt><dd className="text-2xl font-bold">{preview.unansweredQuestionCount}</dd></div><div><dt className="text-sm text-muted-foreground">Flag</dt><dd className="text-2xl font-bold">{preview.flaggedQuestionCount}</dd></div></dl>
        </StaticDialog>
      ) : null}
    </section>
  );
}

function AdminStaticContent({ entry, fixture }: { entry: StaticPreviewExportEntry; fixture: unknown }) {
  if (entry.screen === "ADMIN-USERS") {
    const record = fixture as { state: "success" | "empty" | "error"; data?: PendingUsersDto; error?: { message: string } };
    return <PendingUsersStaticPage state={record.state} users={record.data?.users} errorMessage={record.error?.message} />;
  }

  if (entry.screen === "S10") {
    const record = fixture as { data?: DryRunImportResponse; message?: string };
    const variant = entry.variant === "token-expired" ? "token-expired" : entry.variant;
    return <ImportStaticPage variant={variant as Parameters<typeof ImportStaticPage>[0]["variant"]} validation={record.data} />;
  }

  return null;
}

function StaticScreenSkeleton({ routePattern }: { routePattern: string }) {
  const [searchParams] = useSearchParams();
  const entry = selectEntry(
    getStaticPreviewRouteEntries(routePattern),
    searchParams.get("preview"),
    searchParams.get("fixture"),
  );
  const fixture = getStaticPreviewFixture(entry.fixtureKey);
  const navigation = createStaticArtifactNavigation(entry.id);
  const fixtureState =
    typeof fixture === "object" && fixture !== null && "state" in fixture
      ? String(fixture.state)
      : "success";

  const screenContent = (() => {
    switch (entry.screen) {
      case "S1":
      case "S2":
      case "S3":
        return <StaticS1S3Screen entry={entry} fixture={fixture} />;
      case "S6":
        return <StaticPracticeResultScreen fixture={fixture as never} />;
      case "S7":
        return <StaticExamResultScreen fixture={fixture as never} />;
      case "S8":
        return <StaticHistoryScreen fixture={fixture as never} />;
      case "S9":
        return (
          <StaticLeaderboardScreen
            fixture={fixture as never}
            privateVisibility={entry.variant === "private"}
          />
        );
      default:
        return (
          <section aria-labelledby="static-screen-title">
            <p>{entry.screen}</p>
            <h1 id="static-screen-title">{entry.title}</h1>
            <p>
              정적 fixture: <code>{entry.fixtureKey}</code>
            </p>
            <p role="status">표현 상태: {fixtureState}</p>
            <p>Variant: {entry.variant}</p>
            {entry.screen === "S4" || entry.screen === "S5" ? (
              <StaticQuizVisual entryId={entry.id} />
            ) : null}
            <AdminStaticContent entry={entry} fixture={fixture} />
          </section>
        );
    }
  })();

  const usesScreenShell = entry.screen === "S1" || entry.screen === "S2" || entry.screen === "S3";

  return (
    <div data-preview-entry={entry.id} data-fixture-key={entry.fixtureKey}>
      {usesScreenShell ? (
        <>
          <StaticArtifactNavigation entry={entry} />
          {screenContent}
        </>
      ) : (
        <>
          <StaticArtifactNavigation entry={entry} />
          <main id="main-content">{screenContent}</main>
        </>
      )}
      <footer>
        <nav aria-label="정적 화면 순서">
          <a href={navigation.previous.href}>이전 화면</a>
          <a href={navigation.galleryHref}>Gallery</a>
          <a href={navigation.next.href}>다음 화면</a>
        </nav>
      </footer>
    </div>
  );
}

function StaticPreviewGallery() {
  return (
    <main>
      <section aria-labelledby="preview-gallery-title">
        <p>DETERMINISTIC STATIC REVIEW</p>
        <h1 id="preview-gallery-title">CertQuiz S1-S10 UI gallery</h1>
        <ul>
          {STATIC_PREVIEW_GALLERY_LINKS.map((item) => (
            <li key={item.id}>
              <a href={item.href}>
                {item.screen} · {item.title} · {item.variant}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

/**
 * Fixture-only route skeleton for static review and export. It deliberately has
 * no auth provider/guard, redirect restoration, API port, query/store, Cognito,
 * MSW, timer, or mutation dependency.
 */
export function StaticPreviewRoutes() {
  return (
    <Routes>
      <Route index element={<StaticPreviewGallery />} />
      {STATIC_PREVIEW_ROUTE_PATTERNS.map((routePattern) => (
        <Route
          element={<StaticScreenSkeleton routePattern={routePattern} />}
          key={routePattern}
          path={routePattern}
        />
      ))}
      <Route path="*" element={<StaticPreviewGallery />} />
    </Routes>
  );
}
