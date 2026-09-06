# Implementation Plan: CertQuiz MVP

## Overview

TypeScript 모노레포에서 **정적 UI를 가장 먼저 만들고 사용자가 화면 구성·시각 디자인·정보 구조·S1~S10 흐름을 직접 검토해 승인한 뒤** 상태ful 동작을 연결한다. 첫 프론트엔드 단계는 최소 결정적 fixture, route skeleton, navigation, design token, Tailwind/shadcn shell과 재사용 가능한 presentational component만 사용한다. 이 단계의 화면은 loading/empty/error/success 대표 변형을 정적으로 선택해 볼 수 있어야 하며 TanStack Query, Zustand mutation, MSW 상태 머신, 실제 HTTP, Cognito, DB 또는 backend 동작에 의존하지 않는다. `pnpm ui:preview:export`는 이 화면을 실제 multipage HTML과 상대 local asset으로 export하고, 검토 시작점은 repository root 기준 `artifacts/ui-preview/index.html`로 고정한다.

필수 `Static UI review checkpoint`에서 `artifacts/ui-preview/index.html`에서 시작하는 browsable S1~S10 HTML gallery와 exported-artifact visual smoke/accessibility 검증 결과를 제공한 뒤 실행을 중단하고 사용자 시각 승인을 기다린다. 승인 후에만 query client/store/API port와 async boundary를 연결하고, auth·pending·catalog·admin/import → practice → exam → result/history/leaderboard 순서로 mock 동작과 테스트를 작은 slice별로 추가한다. 모든 frontend mock checkpoint가 끝난 뒤에만 backend·도메인·DB·auth·Hono API·AWS 인프라를 기존 contracts의 호환 구현으로 추가한다. mock 통과는 backend 인증·인가·소유권, 영속성, 원자성, 정확한 서버 시간, 동시성, 보안 또는 인프라 요구사항의 증거가 아니며, 후반 real adapter, contract, repository, integration, 실제 E2E와 release gate가 이를 별도로 검증한다. 설계의 Correctness Properties 1~25와 Requirements 1~16은 구현 및 자동화 테스트 작업에 완전히 추적된다.

## Tasks

- [x] 1. 최소 프론트엔드 workspace, transport contracts와 mock 경계 구성
  - [x] 1.1 최소 pnpm/TypeScript 모노레포와 `apps/web` 기반을 생성한다
    - pnpm workspace, 루트 TypeScript project reference, `apps/web`, `packages/contracts`, `tests/e2e`를 만들고 React/Vite 진입점과 단일 실행 build/typecheck 명령을 구성한다.
    - `packages/domain`, `packages/db`, `apps/api`, 인프라는 후속 단계에서 추가할 수 있도록 의존 방향만 예약하고 프론트엔드 bootstrap이 Hono Lambda를 요구하지 않게 한다.
    - _Requirements: 16.1, 16.2_
  - [x] 1.2 프론트엔드 lint·format·test·build 품질 게이트를 구성한다
    - Vitest, fast-check, React Testing Library, Playwright, coverage와 watch가 아닌 CI 단일 실행 명령을 추가한다.
    - web이 DB row, AWS SDK, Hono 구현을 import하지 못하고 contracts와 frontend API port만 사용하도록 lint boundary를 설정한다.
    - _Requirements: 16.1, 16.2, 16.8, 16.9_
  - [x] 1.3 UI 선행 개발용 shared transport contracts와 strict schema를 구현한다
    - 성공/오류 envelope, request ID, retryability, UUID, UTC timestamp, decimal string, State_Version과 인증·승인·카탈로그·practice·exam·result·history·leaderboard·admin import DTO를 Zod로 정의한다.
    - practice-unsubmitted, practice-submitted, exam-active, review DTO를 서로 다른 `.strict()` schema로 만들어 공개 전 정답·정오답·점수·해설 필드가 타입과 JSON에 존재하지 않게 한다.
    - _Requirements: 1.7-1.12, 2.4-2.6, 3.6-3.11, 5.6-5.8, 8.8-8.10, 10.7, 13.1-13.3, 16.3-16.7_
  - [x] 1.4 교체 가능한 typed frontend API port를 구현한다
    - S1~S10이 필요한 query/mutation을 `CertQuizApi` 인터페이스로 정의하고 mock adapter와 향후 HTTP adapter가 같은 입력·출력·오류 union을 구현하게 한다.
    - React component와 store가 `fetch`, MSW, Hono route 또는 DB 세부사항을 직접 알지 않도록 provider/composition root에서 adapter를 주입한다.
    - _Requirements: 1.7-1.12, 2.5, 2.6, 3.6, 5.5, 6.7-6.12, 7.1-7.12, 8.1-8.12, 10.1-10.13, 13.1-14.15, 15.18-15.27, 16.1-16.9_
  - [x] 1.5 정적 UI preview용 최소 결정적 fixture를 구현한다
    - unauthenticated, pending, approved user, admin actor와 catalog, practice, exam, result, history, leaderboard, admin import의 화면 표시용 read-only fixture를 성공·빈 상태·오류 대표 사례로 만든다.
    - 모든 ID, 시각, 점수, 문항 순서와 DOP-C02 75문항 메타데이터를 고정해 screenshot과 screen gallery가 실행마다 동일하게 보이게 하며, 이 작업에는 handler, timer, mutation, 상태 전이 또는 backend 보장을 구현하지 않는다.
    - fixture를 shared schema로 검증하되 정적 UI 단계에서는 MSW 상태 머신과 실제 API port를 호출하지 않는다.
    - _Requirements: 1.7-1.10, 2.5, 2.6, 3.6-3.11, 5.1-5.13, 8.8-8.10, 10.7, 13.1-15.19, 16.1-16.7_
  - [x] 1.6 MSW 상태 머신과 오류 scenario handler를 구현한다
    - loading 지연, empty, retryable/non-retryable 오류, stale version, 저장 rollback, owner/role denial, import validation 오류, token 만료·재사용, duplicate submission과 idempotent result를 scenario별 handler로 제공한다.
    - practice/exam version 증가, 최초 제출 잠금, preview count, serverNow/expiresAt, 동일 submit 결과를 메모리 상태 머신으로 모사하되 backend 보장의 대체물이 아님을 코드 주석과 테스트 이름에 명시한다.
    - _Requirements: 1.7-1.12, 2.4, 6.7-6.12, 7.5-8.12, 10.3-11.12, 15.17-15.27, 16.1-16.9_
  - [x] 1.7 mock health contract로 프론트엔드 bootstrap을 완성한다
    - shared health DTO를 API port와 MSW handler로 제공하고 웹 진입 화면이 mock adapter를 통해 workspace·번들·schema validation을 실제 사용하게 한다.
    - 실제 Hono health route와 HTTP wiring은 후속 backend 작업으로 분리해 프론트엔드 bootstrap의 선행 조건에서 제거한다.
    - _Requirements: 16.1, 16.2, 16.4_

- [x] 2. 정적 UI foundation과 export 가능한 review shell 구성
  - [x] 2.1 S1~S10 route skeleton, export manifest와 정적 navigation을 구현한다
    - `/login`, `/auth/callback`, `/pending`, `/app`, certification mode, practice, exam, practice result, attempt result, history, leaderboard, admin users/import 경로를 React Router에 등록한다.
    - 각 route는 정적 fixture key 또는 preview query만으로 화면을 선택하고 auth guard, redirect 복원, TanStack Query, Zustand, API 호출, Cognito callback 처리 또는 mutation을 구현하지 않는다.
    - S1~S10과 대표 loading/empty/error/success fixture를 결정적 `.html` 상대 경로에 연결하는 export manifest를 정의하고, 상단·측면 navigation 및 gallery/이전/다음 링크가 생성 HTML 파일 사이의 상대 링크가 되게 한다.
    - _Requirements: 1.7, 1.8, 1.11, 2.1-2.4, 16.1-16.7_
  - [x] 2.2 design token과 Tailwind/shadcn 정적 application shell을 구현한다
    - 색상, typography, spacing, radius, elevation, focus, status token을 정의하고 라이트 데스크톱 `AppShell`, public/pending/app/admin layout을 만든다.
    - loading/empty/error/success panel, page header, card, table, badge, dialog, form field와 navigation의 presentational variant를 만들되 비동기 로직이나 mutation을 연결하지 않는다.
    - export된 HTML이 `artifacts/ui-preview/assets/` 아래의 상대 local CSS/JS/image/font만 참조하고 외부 CDN, 절대 asset URL 또는 runtime network request를 요구하지 않게 build asset 경계를 구성한다.
    - _Requirements: 5.9-5.13, 16.1-16.7_
  - [x] 2.3 재사용 가능한 정적 presentational component와 안전한 Markdown 표현을 구현한다
    - certification card, score summary, domain breakdown, data table, status banner, question navigator, timer face, file summary와 validation error list를 props-only component로 구현한다.
    - Markdown은 Raw_HTML escape, Safe_URL allowlist, 외부 링크 속성, image failure fallback을 정적 fixture로 표현하고 semantic landmark/heading, keyboard focus, label, table/dialog semantics와 chart 대체 표를 제공한다.
    - component는 API port, query cache, store 또는 MSW handler를 import하지 않게 정적 preview 경계를 유지한다.
    - _Requirements: 5.9-5.13, 16.3-16.7_
  - [x] 2.4 단일 명령 static HTML export pipeline을 구현한다
    - repository root에서 실행하는 `pnpm ui:preview:export`가 output을 재생성하고 정확히 `artifacts/ui-preview/index.html` 및 `artifacts/ui-preview/screens/.../*.html`, `artifacts/ui-preview/assets/...`를 출력하도록 build/export script를 구성한다.
    - export renderer는 Task 1.5의 고정 read-only fixture와 presentational component만 사용하고 API, MSW, auth, 진행 timer, mutation, DB 또는 backend 없이 기본 static server에서 제공 가능한 multipage artifact를 생성한다.
    - 명령과 exact output path를 package script 설명 및 gallery metadata에 표시하고 동일 source/fixture의 반복 export에서 파일 경로, 내용, navigation과 asset reference가 결정적으로 유지되게 한다.
    - _Requirements: 1.7-16.7_

- [x] 3. S1~S10 정적 fixture 화면과 실제 HTML 상태 변형 구현
  - [x] 3.1 S1 로그인·callback·pending, S2 홈과 S3 mode select 정적 화면을 구현한다
    - 로그인, 안전한 callback 오류, 승인 대기, Provider grouping, certification metadata, active practice banner, practice resume/replace 선택과 exam 시작 확인의 시각 구조를 구현한다.
    - 각 데이터 영역의 대표 loading/empty/error/success fixture variant를 screen gallery와 해당 screen별 실제 `.html` 파일에서 독립적으로 볼 수 있게 한다.
    - _Requirements: 1.7, 1.8, 3.6-3.9, 7.5-7.9, 10.1, 16.1-16.7_
  - [x] 3.2 공통 quiz presenter visual과 S4 Practice·S5 Exam 정적 화면을 구현한다
    - radio/checkbox, 필수 선택 수, 언어 toggle, 번호·domain, `1..N` navigator, answered/unanswered/Flag/reveal 시각 상태와 safe Markdown 설명 영역을 props-only로 표현한다.
    - Practice의 제출 전/후 feedback과 Exam의 고정 server timer 모양, preview dialog, unanswered/flag count, 만료·finalized 안내를 실제 `.html` variant로 보여 주되 선택 저장, timer 진행, 제출, 상태 머신 또는 API 호출은 구현하지 않는다.
    - _Requirements: 5.1-6.6, 6.13-6.16, 8.8-8.10, 10.3-10.7, 10.13, 16.1-16.7_
  - [x] 3.3 S6 Practice result, S7 Exam result, S8 History와 S9 Leaderboard 정적 화면을 구현한다
    - Raw_Score/Accuracy_Rate 우선 표시, domain/question review, pass badge, 참고 Reference_1000, 168시간 만료, attempt table, trend chart+대체 표, visibility control, rank/tie/current marker를 정적으로 표현한다.
    - 결과 없음, 만료, 비공개, 빈 history/leaderboard, 오류와 정상 데이터를 각각 결정적 fixture와 screen별 실제 `.html` variant로 제공한다.
    - _Requirements: 9.1-9.11, 12.9-12.12, 13.1-13.14, 14.2-14.15, 16.3-16.7_
  - [x] 3.4 관리자 pending 사용자와 S10 import 정적 화면을 구현한다
    - pending user table, approve 상태 모양, 10 MiB JSON dropzone, dry-run summary, 계산 불가 값, validation error list, commit 확인 dialog와 token 만료·재검증 안내를 props-only로 구현한다.
    - pending 없음, 파일 없음, validating 모양, validation 성공/실패, commit 확인·완료·오류 대표 variant를 실제 `.html` 파일로 제공하되 파일 parsing, 승인, token 또는 commit 동작은 구현하지 않는다.
    - _Requirements: 1.9, 1.10, 2.5, 2.6, 15.1-15.27, 16.1-16.7_
  - [x] 3.5 S1~S10 multipage HTML gallery와 deterministic export를 완성한다
    - 개발 전용 `/__preview`와 별도로 `pnpm ui:preview:export`를 실행해 gallery `artifacts/ui-preview/index.html`과 S1~S10 각각의 success 및 적용 가능한 loading/empty/error 대표 variant를 `artifacts/ui-preview/screens/` 아래 실제 `.html` 파일로 생성한다.
    - gallery index, 각 screen variant의 gallery/이전/다음 링크와 모든 CSS/JS/image/font 참조를 artifact 내부 상대 경로로 만들고, 각 HTML 직접 URL을 기본 static server에서 열 수 있게 한다.
    - 생성 artifact가 Task 1.5의 고정 fixture만 포함하고 API, MSW, auth, 진행 timer, mutation, persistence, DB, backend 또는 외부 network에 의존하지 않음을 export manifest 검사로 보장한다.
    - _Requirements: 1.7-16.7_
  - [x] 3.6 exported HTML visual smoke와 accessibility 자동 검사를 작성한다
    - `artifacts/ui-preview/index.html`에서 모든 내부 `.html` 링크와 local asset을 순회해 누락 파일·깨진 상대 링크·외부/절대 URL 없이 모든 대표 variant가 예외 없이 제공되는지 검사한다.
    - export된 각 문서의 unintended horizontal overflow, landmark/heading/label/table 누락, keyboard focus, dialog semantics, chart 대체 표, 색상 contrast와 Markdown unsafe URL 회귀를 자동 검사한다.
    - 이 검사는 exported artifact의 layout, presentation, HTML semantics와 접근성만 검증하며 auth, mutation, timer, persistence, backend 또는 API 동작을 검증한다고 주장하지 않는다.
    - _Requirements: 5.1-5.13, 6.1-6.6, 6.13-6.16, 16.1-16.7_

- [x] 4. Static UI review checkpoint - exact HTML path 제시 후 사용자 시각 승인 전 실행 중단
  - repository root에서 `pnpm ui:preview:export`를 실행하고 exact review entry인 `artifacts/ui-preview/index.html`과 S1~S10 실제 HTML variant가 생성되었는지 확인한다.
  - frontend lint, typecheck, build와 exported-artifact visual smoke/accessibility 검사를 통과시킨 뒤 화면 구성, design token, layout, 정보 계층, 상대 HTML navigation, loading/empty/error/success 표현과 desktop 흐름을 `artifacts/ui-preview/index.html` 경로와 함께 사용자에게 제시한다.
  - artifact가 local relative CSS/JS/assets만 사용하고 API, MSW, auth, 진행 timer, mutation, DB 또는 backend 없이 기본 static server에서 열리는지 확인한다.
  - **여기서 반드시 STOP하고 `artifacts/ui-preview/index.html`의 사용자 시각 승인을 기다린다. 승인 전에는 Task 5~7의 TanStack Query, Zustand, API-port wiring, MSW interaction, mutation 또는 상태 머신 작업을 시작하지 않는다.**

- [x] 5. 승인된 UI에 mock 상태 기반과 비동기 경계 연결
  - [x] 5.1 TanStack Query client와 Zustand transient store를 typed API port에 연결한다
    - 승인된 component markup/layout을 유지한 채 query key, local draft/current index/dialog state, logout cache purge와 adapter injection을 composition root에 추가한다.
    - mock/real adapter 전환이 component 또는 store 변경을 요구하지 않게 하고, 이 단계에서는 real HTTP와 backend를 연결하지 않는다.
    - _Requirements: 5.5, 6.9, 6.12, 16.1, 16.2, 16.5, 16.8, 16.9_
  - [x] 5.2 AsyncBoundary와 mutation 공통 상태를 API port 응답에 연결한다
    - query별 독립 loading/error/empty/success, retryable과 next-action 분리, 입력 보존, canonical mutation reconciliation, optimistic Flag rollback과 duplicate submit lock을 구현한다.
    - 정적 variant component를 재사용하고 승인된 visual contract가 상태 wiring 때문에 임의로 바뀌지 않게 한다.
    - _Requirements: 6.7-6.12, 16.1-16.9_
  - [x] 5.3 비동기 UI 요청 상태 property/component test를 작성한다
    - **Property 25: 비동기 UI 요청 상태 머신**
    - 임의 성공/retryable/non-retryable/중복 제출 시퀀스에서 독립 loading, 입력 보존, retry/next-action 분리와 단일 action/result 수렴을 검증한다.
    - **Validates: Requirements 16.1-16.9**
    - _Requirements: 16.1-16.9_
  - [x] 5.4 Mock state foundation checkpoint - 공통 상태 검증
    - lint, typecheck, Property 25와 AsyncBoundary component test를 통과시키고 정적 UI 승인본과 layout 회귀가 없는지 screen gallery smoke를 다시 실행한다.

- [x] 6. auth·pending·catalog·admin/import mock interaction slice 구현
  - [x] 6.1 S1 login/callback과 pending interaction을 구현한다
    - API port의 unauthenticated/pending/approved 상태로 redirect intent, token 없는 안전한 callback 오류, `/me/approval` 새로고침과 approved 전환을 구현한다.
    - real Cognito code+PKCE는 후반 실연결 단계로 남기고 mock 상태가 승인된 정적 화면 variant를 선택하게 한다.
    - _Requirements: 1.1-1.8, 16.1-16.9_
  - [x] 6.2 S2 catalog와 S3 mode select interaction을 구현한다
    - Provider grouping query, catalog empty/error, active practice resume/replace 선택 전 비변경과 명시적 exam 시작 확인을 mock API port에 연결한다.
    - _Requirements: 3.6-3.9, 7.5-7.9, 10.1, 16.1-16.9_
  - [x] 6.3 관리자 pending 사용자 interaction을 구현한다
    - 목록 조회, 빈 상태, 개별 approve pending lock, idempotent 결과와 safe error를 연결한다.
    - _Requirements: 1.9, 1.10, 2.5, 2.6, 16.1-16.9_
  - [x] 6.4 S10 import interaction을 구현한다
    - 10 MiB JSON 선택, dry-run summary/error, 계산 불가 표시, memory-only token, content 변경 재검증, commit 확인과 mock replay 오류를 연결한다.
    - _Requirements: 15.1-15.27, 16.1-16.9_
  - [x] 6.5 auth/catalog/admin/import mock-backed component·browser test를 작성한다
    - pending route 제한, catalog empty/error, resume/replace 선택 전 비변경, approve replay, import 입력 보존과 token 재사용 오류를 검증한다.
    - 이 테스트는 UI 허용 행렬과 표시만 검증하며 실제 인증·인가·atomic import 증거로 사용하지 않는다.
    - _Requirements: 1.7-1.10, 2.5, 2.6, 3.6, 7.5-7.9, 15.18-15.26, 16.1-16.9_
  - [x] 6.6 Auth/catalog/admin/import checkpoint - slice 검증
    - 해당 route의 unit/component/browser test와 screen gallery 회귀 검사를 통과시키고 다음 quiz interaction slice 전에 사용자에게 현재 동작을 확인할 수 있는 deterministic preview를 제공한다.

- [x] 7. practice → exam → result/history/leaderboard mock interaction slice 구현
  - [x] 7.1 공통 QuestionPresenter와 navigator interaction을 연결한다
    - required count에 따른 radio/checkbox 선택 상한, 선택 수, 경계 이동, navigator, en/ko 전체 전환, en_only fallback과 위치/선택/Flag/reveal 보존을 reducer/store에 연결한다.
    - safe Markdown과 image failure presentation은 승인된 정적 component를 그대로 재사용한다.
    - _Requirements: 5.1-5.13, 6.1-6.6, 6.13-6.16_
  - [x] 7.2 S4 Practice interaction을 구현한다
    - resume canonical state, draft 저장, optimistic Flag rollback, 최초 제출 pending lock, 제출 후에만 feedback/reveal, 완료 후 S6 이동을 mock API port에 연결한다.
    - _Requirements: 6.7, 6.9, 6.10, 6.12, 7.7, 7.10-7.12, 8.1-8.12, 16.5-16.9_
  - [x] 7.3 문제 입력·언어 상태 property test를 작성한다
    - **Property 8: 문제 입력 종류와 언어 전환의 상태 보존**
    - 임의 presenter state에서 선택 상한, 언어별 일관 콘텐츠, en_only fallback과 위치/선택/Flag/reveal 보존을 검증한다.
    - **Validates: Requirements 5.1-5.8**
    - _Requirements: 5.1-5.8_
  - [x] 7.4 탐색 경계·상태 분류 property test를 작성한다
    - **Property 9: 문항 탐색 경계와 상태 분류**
    - 임의 N/index/응답/Flag에서 navigator 완전성, 이동 경계와 current/answered/flag 분류를 검증한다.
    - **Validates: Requirements 6.1-6.6, 6.13-6.16**
    - _Requirements: 6.1-6.6, 6.13-6.16_
  - [x] 7.5 Flag version commit/rollback property test를 작성한다
    - **Property 10: Flag 저장의 versioned commit/rollback**
    - mock API port의 practice/exam 성공, stale, 저장 실패 응답에서 canonical state와 UI optimistic state의 증가·복원을 검증한다.
    - **Validates: Requirements 6.7-6.12**
    - _Requirements: 6.7-6.12_
  - [x] 7.6 Practice component/browser test를 작성한다
    - radio/checkbox 접근성, reveal timing, Markdown XSS/Safe_URL/image failure, stale version, rollback과 duplicate submit lock을 검증한다.
    - _Requirements: 5.1-6.16, 7.7, 7.10-7.12, 8.1-8.12, 16.8, 16.9_
  - [x] 7.7 Practice interaction checkpoint - slice 검증
    - Practice unit/property/component/browser test와 승인된 S4 visual 회귀를 통과시키고 exam interaction 착수 전에 deterministic practice flow를 확인 가능하게 한다.
  - [x] 7.8 S5 ExamPage와 ServerTimer interaction을 구현한다
    - serverNow/expiresAt offset과 monotonic display timer, restore, preview dialog, unanswered/flag count, expiry/finalize/result 전환을 mock API port에 연결한다.
    - 0초에서 client 점수를 만들지 않고 API port로 lazy finalize 결과를 조회한다.
    - _Requirements: 10.3-10.13, 11.1-11.12, 16.5-16.9_
  - [x] 7.9 Exam component/browser test를 작성한다
    - reconnect timer, preview count, expiry 전환, stale version, duplicate submit lock과 exam DOM/serialized props의 정답·해설 필드 부재를 검증한다.
    - 이 테스트는 mock timer/상태만 검증하며 실제 server clock, persistence 또는 concurrent finalize 증거로 사용하지 않는다.
    - _Requirements: 10.3-11.12, 16.1-16.9_
  - [x] 7.10 Exam interaction checkpoint - slice 검증
    - Exam component/browser test와 승인된 S5 visual 회귀를 통과시키고 결과·이력 slice 착수 전에 deterministic exam flow를 확인 가능하게 한다.
  - [x] 7.11 S6~S9 result, history와 leaderboard interaction을 구현한다
    - practice/exam result 조회, 168시간 만료, Attempt-only history/trend, visibility 저장 실패 rollback, 서버 rank/tie/current marker와 privacy/empty 상태를 mock API port에 연결한다.
    - _Requirements: 9.1-9.11, 12.9-12.12, 13.1-13.14, 14.2-14.15, 16.1-16.9_
  - [x] 7.12 result/history/leaderboard mock-backed component·browser test를 작성한다
    - exact-vs-display 구분, immutable review, 만료, 빈 이력/count 0, visibility rollback, 공동 순위/current marker와 privacy를 검증한다.
    - _Requirements: 9.1-9.11, 12.9-12.12, 13.1-13.14, 14.2-14.15, 16.1-16.9_
  - [x] 7.13 frontend mock contract와 S1~S10 E2E suite를 완성한다
    - 모든 fixture를 shared Zod schema로 parse하고 endpoint request/response matrix와 forbidden field 부재를 contract test로 고정한다.
    - S1~S10의 approved mock flow와 대표 loading/empty/error/retry를 Playwright로 자동화하되 mock E2E를 real backend acceptance로 간주하지 않는다.
    - _Requirements: 1.7-16.9_
  - [x] 7.14 Frontend mock checkpoint - backend 착수 전 전체 검증
    - frontend lint, typecheck, build, unit, Properties 8~10·25, component, contract, static visual/accessibility, slice browser와 mock-backed Playwright test를 모두 통과시킨다.
    - 정적 UI 승인본의 의도적 변경만 허용되었는지 확인하고 사용자에게 frontend mock 흐름을 검토 가능하게 제공한 뒤에만 Task 8 이후 backend 작업을 시작한다.

- [x] 8. Backend workspace와 실제 Hono API bootstrap 구성
  - [x] 8.1 backend/domain/DB/infra workspace 구조를 추가한다
    - `apps/api`, `packages/domain`, `packages/db`, `infra/terraform`, `infra/serverless`를 기존 pnpm workspace와 TypeScript project reference에 추가한다.
    - 의존 방향을 `apps/* → contracts|domain|db`, `db → domain`으로 제한하고 기존 web/contracts build를 깨지 않게 한다.
    - _Requirements: 16.1, 16.2_
  - [x] 8.2 backend lint·test·build 경계와 루트 명령을 확장한다
    - domain이 React, Hono, AWS SDK, SQL driver를 import하지 못하게 하고 unit/property/repository/integration 명령을 watch 없는 단일 실행으로 추가한다.
    - frontend gate를 유지하면서 전체 monorepo build/typecheck/lint를 구성한다.
    - _Requirements: 16.1, 16.2, 16.8, 16.9_
  - [x] 8.3 실제 Hono Lambda와 shared health contract를 연결한다
    - 기존 health DTO와 envelope를 그대로 구현하는 Hono route, Lambda entry와 frontend HTTP adapter용 endpoint를 추가한다.
    - mock health와 real health에 동일 provider contract를 실행해 frontend bootstrap 때 확정한 contract를 비호환 변경하지 못하게 한다.
    - _Requirements: 16.1, 16.2, 16.4_

- [ ] 9. Aurora DSQL compatibility spike와 데이터베이스 선택 게이트 구현
  - [~] 9.1 실제 DSQL에서 실행 가능한 connector·migration·query spike를 작성한다
    - Node.js DSQL connector의 IAM token/TLS/pool freeze-thaw, UUID, `timestamptz`, exact score 정수쌍, JSON 후보 타입, index, 제약과 migration checksum을 검사하는 CLI를 구현한다.
    - history, leaderboard, cleanup query plan과 p95 500ms 게이트를 machine-readable 결과로 출력한다.
    - _Requirements: 3.1-3.5, 9.4-9.7, 12.5-12.8, 13.10-13.13_
  - [~] 9.2 핵심 원자성과 동시성 probe를 spike에 추가한다
    - 동시 profile get-or-create, active practice slot, practice replace, manual/expired finalize와 import head switch를 barrier와 fault injection으로 실행한다.
    - 중복 profile/session/Attempt, partial snapshot 또는 mixed catalog revision이 관찰되면 gate를 실패시킨다.
    - _Requirements: 1.5, 1.6, 1.14, 4.10, 7.4, 7.8, 7.9, 11.6-11.10, 15.21, 15.27_
  - [~] 9.3 spike 결과로 DSQL 또는 Aurora Serverless v2 adapter를 선택하도록 구성한다
    - 통과 시 DSQL adapter, 실패 시 PostgreSQL adapter를 선택하는 명시적 runtime/build 설정을 구현하고 동일 repository contract를 유지한다.
    - 측정 결과와 실패 gate에서 선택 근거를 생성하는 ADR 산출 단계를 spike 명령에 연결한다.
    - _Requirements: 1.6, 4.10-4.12, 11.8-11.10, 15.27, 15.28_

- [~] 10. Backend foundation checkpoint - Ensure all foundation tests pass
  - Ensure workspace, contract compatibility and database spike gates pass; ask the user if questions arise.

- [ ] 11. Shared backend primitive와 contract-compatible projection 구현
  - [~] 11.1 exact `Fraction`과 점수 계산 primitive를 구현한다
    - bigint 기약분수, 사칙연산, cross multiplication 비교, decimal parsing, 둘째 자리 half-up 표시와 Reference_1000 half-up을 구현한다.
    - binary floating point와 중간 반올림이 판정·정렬 source of truth에 들어가지 않게 한다.
    - _Requirements: 9.1, 9.2, 12.1-12.12, 12.14_
  - [~] 11.2 `Clock`, `RandomSource`, UUID와 canonical 시간 primitive를 구현한다
    - 주입 가능한 UTC clock, `nextInt(maxExclusive)` RNG port, crypto rejection-sampling adapter와 deterministic fake를 제공한다.
    - 만료·보관 경계를 반개구간으로 표현하는 helper를 추가한다.
    - _Requirements: 4.6, 4.7, 9.4-9.7, 10.1-10.3, 10.6, 10.9_
  - [~] 11.3 domain error와 안전한 HTTP error mapper를 구현한다
    - 인증, 승인, 소유권, stale version, 만료, validation과 retryable dependency 오류를 discriminated union으로 정의한다.
    - 중앙 mapper가 기존 shared error schema의 allowlist details와 request ID만 생성하게 한다.
    - _Requirements: 1.2, 1.3, 1.8, 1.12, 2.4, 16.3-16.7_
  - [~] 11.4 strict SnapshotProjector와 backend contract provider test를 구현한다
    - mode/reveal 상태를 기존 practice-unsubmitted, practice-submitted, exam-active, review DTO에만 투영하고 response 직전에 `.strict()` 검증을 수행한다.
    - backend DTO가 frontend mock fixture corpus와 endpoint contract matrix를 호환하며 새 필수 필드나 유출 필드를 추가하지 않는지 CI에서 검사한다.
    - _Requirements: 5.6-5.8, 8.8-8.10, 10.7, 13.1-13.3, 16.4_
  - [~] 11.5 exact 채점 의미 property test를 작성한다
    - **Property 19: exact 채점 의미**
    - 유효한 집합과 scoring mode를 생성해 all-or-nothing, partial, 합계, 정답률, 합격과 Reference_1000을 독립 oracle과 비교한다.
    - **Validates: Requirements 12.1-12.8**
  - [~] 11.6 표시값·판정값 분리와 설정 오류 property test를 작성한다
    - **Property 20: 표시값과 판정값의 분리 및 설정 오류 비원자성 방지**
    - 표시 반올림이 exact 비교를 바꾸지 않고 잘못된 mode/threshold/choice 설정에서 결과가 확정되지 않음을 검증한다.
    - **Validates: Requirements 12.9-12.17**

- [ ] 12. Migration과 repository contract 구현
  - [~] 12.1 identity, revisioned catalog와 import validation migration을 구현한다
    - user uniqueness, active revision head, import token digest/actor/TTL/status, exact threshold 분자·분모와 필요한 index·제약을 versioned SQL로 만든다.
    - 선택 DB adapter에서 migration checksum과 schema version fail-fast를 구현한다.
    - _Requirements: 1.5, 1.6, 2.5, 3.1-3.5, 14.1, 15.20-15.27_
  - [~] 12.2 practice session, snapshot과 completed result migration을 구현한다
    - 사용자+자격증 active slot uniqueness, optimistic version, immutable snapshot, session당 단일 completed result, exact score와 168시간 index를 구성한다.
    - _Requirements: 4.10-4.12, 7.1-7.4, 7.8-7.12, 8.11, 8.12, 9.1-9.7_
  - [~] 12.3 exam session, Attempt와 immutable item migration을 구현한다
    - start idempotency key, state version, `attempt.exam_session_id` uniqueness, cutoff timestamps, exact score와 이력/리더보드 index를 구성한다.
    - _Requirements: 10.1, 10.2, 10.10-10.12, 11.4-11.10, 13.4-13.9, 14.7-14.12_
  - [~] 12.4 repository ports, UnitOfWork와 DSQL/PostgreSQL adapter를 배선한다
    - owner-scoped aggregate methods, conditional update, short transaction, retry policy와 startup schema assertion을 구현한다.
    - route가 SQL primitive나 DB row를 직접 조합하지 못하게 한다.
    - _Requirements: 1.12, 4.10-4.12, 7.8-7.12, 10.9-10.12, 11.8-11.10, 15.27_
  - [~] 12.5 공통 repository contract suite를 작성한다
    - in-memory fake와 선택된 실제 DB adapter에 같은 aggregate contract를 실행해 owner scoping, exact value, ordering과 rollback을 검증한다.
    - _Requirements: 1.12, 7.4, 11.8, 13.8-13.14, 15.27_
  - [~] 12.6 repository concurrency와 fault-injection suite를 작성한다
    - barrier로 profile singleton, active practice slot, first submit, finalize, import switch를 충돌시키고 각 write 지점 실패 시 rollback을 검증한다.
    - _Requirements: 1.6, 1.14, 4.10, 7.9, 8.11, 11.6-11.10, 15.27_

- [ ] 13. Cognito 인증, 승인, 관리자와 소유권 경계 구현
  - [~] 13.1 Cognito token verifier와 Google identity extractor middleware를 구현한다
    - signature, issuer, audience/client, expiry, token use를 검증하고 Google provider subject만 정규화한다.
    - JWT와 전체 claim을 로그에 남기지 않고 identity 오류에서는 profile mutation 전에 종료한다.
    - _Requirements: 1.1-1.4, 1.13_
  - [~] 13.2 원자적 profile get-or-create와 승인 상태 조회를 구현한다
    - `google_sub` conflict 재조회로 단일 pending/user/private profile을 만들고 `/v1/me/approval`만 pending에 허용한다.
    - 생성 실패 시 모든 보호 상태를 유지한다.
    - _Requirements: 1.4-1.8, 1.13, 1.14, 14.1_
  - [~] 13.3 approval, admin, ownership middleware와 관리자 사용자 API를 구현한다
    - approved/user/admin route matrix, owner predicate, pending 목록, idempotent approve와 atomic failure 처리를 구현한다.
    - 권한 오류에서 존재 여부와 보호 데이터를 노출하지 않고 기존 frontend contracts를 반환한다.
    - _Requirements: 1.9-1.12, 1.15, 2.1-2.6_
  - [~] 13.4 본인 profile과 점수 공개 설정 API를 구현한다
    - approved 사용자만 visibility를 변경하고 pending 요청은 profile을 변경하지 않게 한다.
    - _Requirements: 1.11, 14.1-14.3_
  - [~] 13.5 외부 신원·신규 profile property test를 작성한다
    - **Property 1: 외부 신원과 신규 프로필 불변식**
    - 동시 로그인, 이메일 변화와 transaction 실패를 model과 비교한다.
    - **Validates: Requirements 1.4-1.6, 1.13, 1.14, 14.1**
  - [~] 13.6 인증·인가 비간섭 property test를 작성한다
    - **Property 2: 인증·인가 실패의 비간섭성과 역할 경계**
    - 임의 token/role/owner 요청에서 허용 행렬과 거부 전후 aggregate 동일성·오류 redaction을 검증한다.
    - **Validates: Requirements 1.1-1.3, 1.7, 1.8, 1.11, 1.12, 2.1-2.4**
  - [~] 13.7 승인 전이·pending 목록 property test를 작성한다
    - **Property 3: 승인 전이와 pending 목록의 결정성**
    - 목록 유일성, 빈 목록, approve replay와 rollback을 검증한다.
    - **Validates: Requirements 1.9, 1.10, 1.15, 2.5, 2.6**
  - [~] 13.8 Cognito와 인증 route integration test를 작성한다
    - 유효/만료/wrong issuer/wrong audience/missing Google identity fixture와 IDOR·role bypass를 실제 middleware/repository에 대해 검증한다.
    - _Requirements: 1.1-1.15, 2.1-2.6_

- [ ] 14. Revisioned certification catalog 구현
  - [~] 14.1 active revision 기반 catalog validator와 repository query를 구현한다
    - Provider→Certification→Domain→Question 관계, 설정·weight·pool 충분성과 invalid item 원인 수집을 구현한다.
    - DOP-C02 75문항, 180분, 75%, 도메인 비율 fixture를 seed/import 가능한 데이터로 제공한다.
    - _Requirements: 3.1-3.5, 3.9-3.11_
  - [~] 14.2 approved catalog API를 기존 Provider별 projection contract에 연결한다
    - 유효하고 출제 가능한 Certification만 그룹화하고 invalid certification은 노출하지 않으며 안전한 데이터 오류를 제공한다.
    - 모든 생성 source가 선택 certification의 active revision 관계 안에 있도록 한다.
    - _Requirements: 3.6-3.8, 3.10, 3.11_
  - [~] 14.3 catalog 관계·노출 property test를 작성한다
    - **Property 4: 카탈로그 관계 폐쇄성과 노출 안전성**
    - 임의 revision에서 관계·설정·weight·pool oracle과 노출 결과 및 모든 부족 domain 오류를 비교한다.
    - **Validates: Requirements 3.1-3.8, 3.10, 3.11**

- [ ] 15. JSON import dry-run과 atomic revision commit 구현
  - [~] 15.1 byte-limit parser와 구조/schema validation pipeline을 구현한다
    - 10 MiB를 parsing 전에 검사하고 JSON syntax 위치, depth 20, Question 10,000, Choice 20, 필수 필드·타입 오류를 가능한 범위에서 누적한다.
    - _Requirements: 15.1-15.3, 15.15-15.17_
  - [~] 15.2 semantic validator와 summary 계산을 구현한다
    - weight exact 합, 관계, 중복 ID, 정답 부분집합, 선택 수, 영어 필드, 번역 상태와 domain/전체 pool 크기를 검증한다.
    - 계산 가능한 전체/domain/translation/error summary를 유지하고 불가능한 값만 unavailable로 표시한다.
    - _Requirements: 15.4-15.14, 15.17-15.19_
  - [~] 15.3 RFC 8785 원칙의 canonical JSON, SHA-256와 commit token을 구현한다
    - object key/공백/동등 숫자 차이는 같은 hash, 배열 순서는 다른 hash가 되게 하고 256-bit token은 digest만 저장한다.
    - actor binding, constant-time hash 비교, `[createdAt, createdAt+15m)` TTL과 single-use 상태를 구현한다.
    - _Requirements: 15.20, 15.22-15.26_
  - [~] 15.4 staging revision insert와 active head atomic switch를 구현한다
    - transaction 직전 source/head와 row count를 재검증하고 revision 전체 insert, head 전환과 token consume을 한 transaction으로 처리한다.
    - 실패 시 head/token을 복원하고 기존 Attempt/snapshot을 변경하지 않는다.
    - _Requirements: 15.21, 15.27, 15.28_
  - [~] 15.5 관리자 dry-run/commit API를 기존 frontend contract에 구현한다
    - admin middleware, safe error list/summary, 동일 JSON+token commit을 contracts와 repository에 연결하고 원문·정답·token 로그를 차단한다.
    - mock fixture corpus와 provider contract를 실행해 UI가 기대하는 성공·오류 shape를 호환한다.
    - _Requirements: 2.2-2.4, 15.1-15.28, 16.4-16.7_
  - [~] 15.6 import dry-run property test를 작성한다
    - **Property 23: Import dry-run 순수성, 제한과 오류 완전성**
    - 임의 byte/구조/semantic 오류에서 active catalog 비변경, 제한 선행과 독립 오류·summary 완전성을 oracle과 비교한다.
    - **Validates: Requirements 15.1-15.19**
  - [~] 15.7 검증본 결합·catalog 교체 property test를 작성한다
    - **Property 24: 검증본 결합과 atomic catalog 교체**
    - actor/content/TTL/use/failure 조합에서 전체 revision과 consumed 상태가 함께 commit되거나 함께 rollback되는지 검증한다.
    - **Validates: Requirements 15.20-15.28**
  - [~] 15.8 canonicalization·token·fault integration test를 작성한다
    - key order/공백/숫자 표기 동치, domain 배열 순서 차이, 만료 경계, 다른 admin, replay와 각 insert/head/consume 실패 지점을 검증한다.
    - _Requirements: 15.20-15.28_

- [ ] 16. Domain allocation, sampling과 immutable snapshot 구현
  - [~] 16.1 largest-remainder allocator를 exact arithmetic으로 구현한다
    - floor 후 remainder 내림차순·import order 오름차순으로 잔여 문항을 배정하고 합을 회차 문항 수와 일치시킨다.
    - practice와 exam이 같은 allocator를 사용하게 한다.
    - _Requirements: 4.1-4.4, 4.8_
  - [~] 16.2 unbiased question sampling과 전체 shuffle을 구현한다
    - domain별 partial Fisher–Yates와 전체 Fisher–Yates를 주입된 rejection-sampling RNG에 연결한다.
    - 중복 없는 정확한 allocation과 고정 choice/display order를 만든다.
    - _Requirements: 4.5-4.7_
  - [~] 16.3 SessionFactory와 immutable snapshot transaction을 구현한다
    - 모든 부족 domain을 선검사하고 선택·shuffle·snapshot/session 저장을 원자적으로 수행한다.
    - bilingual content, 정답, 해설, domain과 certification scoring metadata를 원본 revision과 분리해 저장한다.
    - _Requirements: 3.7, 4.9-4.12, 7.3, 10.5_
  - [~] 16.4 generation API source와 strict projection을 연결한다
    - practice/exam 생성 service가 기존 contracts와 SnapshotProjector만 사용하고 route가 snapshot row를 직접 serialize하지 못하게 한다.
    - active DTO에 forbidden field가 주입되면 응답을 폐기한다.
    - _Requirements: 8.8-8.10, 10.7, 13.3, 16.4_
  - [~] 16.5 domain allocation property test를 작성한다
    - **Property 5: largest-remainder 배정 정확성**
    - 임의 양수 weight와 문항 수에서 floor/floor+1, 합과 remainder/import-order 수혜 domain을 검증한다.
    - **Validates: Requirements 4.1-4.4, 4.8**
  - [~] 16.6 uniform sampling·permutation property test를 작성한다
    - **Property 6: 중복 없는 균등 추출과 순열**
    - 작은 pool의 모든 deterministic RNG outcome을 전수 열거해 subset과 전체 순열 multiplicity가 같음을 검증한다.
    - **Validates: Requirements 4.5-4.7**
  - [~] 16.7 session 생성 원자성·snapshot property test를 작성한다
    - **Property 7: 회차 생성의 all-or-nothing과 snapshot 불변성**
    - 부족 pool과 각 실패 지점에서 row 수 비변경, 성공 후 원본 revision 변경에도 snapshot 동일성을 검증한다.
    - **Validates: Requirements 4.9-4.12**
  - [~] 16.8 strict projection leak contract test를 작성한다
    - active practice/exam DTO와 실제 JSON에 forbidden field가 없고 주입 시 `.strict()`가 응답을 폐기하는지 검증한다.
    - _Requirements: 8.8-8.10, 10.7, 16.4_

- [~] 17. Backend domain checkpoint - Ensure all domain and repository tests pass
  - Ensure backend unit, property, migration, repository contract, concurrency and contract-provider tests pass; ask the user if questions arise.

- [ ] 18. Practice session, result와 retention 수직 기능 구현
  - [~] 18.1 start/resume/replace lifecycle을 구현한다
    - active가 없으면 version 0 session을 만들고 있으면 선택 전 비변경 응답, resume round-trip과 확인 nonce 기반 atomic replace를 구현한다.
    - _Requirements: 7.1-7.9_
  - [~] 18.2 answer draft, Flag와 position의 versioned state mutation을 구현한다
    - owner와 question membership을 검증하고 expectedVersion 일치 시 한 번 증가시키며 저장 실패/stale에서는 기존 상태와 최신 ID/version을 반환한다.
    - _Requirements: 6.7-6.12, 7.10-7.12_
  - [~] 18.3 최초 question submit 잠금과 exact scoring을 구현한다
    - choice 소속·정확한 선택 수를 검증하고 최초 final answer/score를 잠그며 동일 집합 replay와 다른 집합 conflict를 구분한다.
    - _Requirements: 8.1-8.7, 12.1-12.8, 12.13-12.17_
  - [~] 18.4 마지막 제출과 Completed_Practice_Result 생성을 원자적으로 구현한다
    - session 완료, 단일 result/items, 전체·domain exact score와 immutable review snapshot을 함께 저장하고 replay에 기존 result를 반환한다.
    - _Requirements: 8.8-8.12, 9.1-9.3_
  - [~] 18.5 168시간 visibility와 idempotent retention cleanup을 구현한다
    - `[completedAt, completedAt+168h)` owner 조회, 경계 이후 inline conditional delete와 만료 응답, EventBridge용 batch cleanup command를 구현한다.
    - _Requirements: 9.4-9.7_
  - [~] 18.6 practice API routes를 기존 shared contracts에 연결한다
    - start/resume/replace/state/submit/result endpoint를 owner repository와 projector에 배선하고 mock adapter와 같은 성공·오류 union을 반환한다.
    - duplicate submit pending과 retry metadata가 일관되게 제공되게 한다.
    - _Requirements: 6.7-6.16, 7.1-7.12, 8.1-8.12, 9.1-9.7, 16.6-16.9_
  - [~] 18.7 practice lifecycle property test를 작성한다
    - **Property 11: 활성 연습 세션 단일성과 재개·상태 저장 round-trip**
    - 임의 start/resume/replace/save 순서를 model과 비교해 단일 active, atomic replace와 version 동작을 검증한다.
    - **Validates: Requirements 7.1-7.12**
  - [~] 18.8 최초 제출 잠금 property test를 작성한다
    - **Property 12: 연습 최초 제출 잠금 상태 머신**
    - 임의 선택 집합과 replay에서 유효 최초 제출만 commit되고 다른 요청은 locked state를 바꾸지 않음을 검증한다.
    - **Validates: Requirements 8.1-8.7**
  - [~] 18.9 공개 격리·단일 완료 property test를 작성한다
    - **Property 13: 연습 공개 격리와 단일 완료 결과**
    - question별 reveal 조건과 마지막 동시 제출에서 result가 정확히 하나임을 검증한다.
    - **Validates: Requirements 8.8-8.12**
  - [~] 18.10 168시간·연습 통계 격리 property test를 작성한다
    - **Property 14: 168시간 반개구간과 연습 결과 격리**
    - 경계 전/정확한 경계/이후 visibility와 cleanup 지연을 검증하고 practice result 변화가 Attempt 기반 분석에 영향을 주지 않음을 검증한다.
    - **Validates: Requirements 9.1-9.11**

- [ ] 19. Exam timer, lazy expiration과 idempotent finalize 수직 기능 구현
  - [~] 19.1 idempotent exam start와 server-clock state mutation을 구현한다
    - request 수신 시각으로 startedAt/expiresAt을 저장하고 `(userId, Idempotency-Key)` replay에 같은 session을 반환한다.
    - `remaining=max(0,floor(expiresAt-now))`와 만료 전 versioned save, 경계 이후 mutation 거부를 구현한다.
    - _Requirements: 10.1-10.3, 10.6, 10.8-10.12_
  - [~] 19.2 exam restore와 submission preview를 구현한다
    - snapshot/choice order/answer/Flag/index/version/remaining을 복원하고 실패 시 대체 세션을 만들지 않는다.
    - 서버 저장 상태의 unanswered/flagged count만 preview에 제공하고 active projection에서 답을 제거한다.
    - _Requirements: 10.4, 10.5, 10.7, 10.13_
  - [~] 19.3 모든 인증 요청에 OwnedExpiredExamFinalizer를 배선한다
    - authentication/user 식별 직후 approval·role·정상 handler 전에 소유자의 만료 미제출 세션을 `(expiresAt,id)` 순서로 처리한다.
    - 하나가 실패하면 이전 commit을 유지하고 이후 finalize와 원 요청을 중단하며 실패 session ID만 안전하게 반환한다.
    - _Requirements: 11.2, 11.3, 11.11, 11.12_
  - [~] 19.4 cutoff 기반 `finalizeOnce`와 immutable Attempt 생성을 구현한다
    - manual은 request 수신 전 commit된 최신 응답, expired는 `savedAt<=expiresAt`만 채점하고 미응답은 0점으로 처리한다.
    - Attempt/items와 session submitted를 한 transaction으로 commit하고 unique conflict/replay에는 같은 Attempt를 반환한다.
    - _Requirements: 11.1, 11.4-11.10, 12.1-12.17, 13.4-13.7_
  - [~] 19.5 exam start/get/state/preview/submit API를 기존 shared contracts에 연결한다
    - lazy finalizer, owner repository, strict projector와 result redirect를 Hono route pipeline에 배선하고 mock adapter의 contract를 호환한다.
    - _Requirements: 10.1-10.13, 11.1-11.12, 16.6-16.9_
  - [~] 19.6 exam 시간 함수 property test를 작성한다
    - **Property 15: 서버 시계 기반 exam 시간 함수**
    - 임의 시작/제한/조회 시각과 replay·재접속에서 timestamps/remaining 불변식 및 만료 경계 mutation 차단을 검증한다.
    - **Validates: Requirements 10.1-10.3, 10.6, 10.8, 10.9**
  - [~] 19.7 exam 저장·복원 property test를 작성한다
    - **Property 16: Exam 저장·복원의 versioned round-trip과 비공개 projection**
    - 저장 성공/실패/stale/복원 실패와 preview count를 model과 비교하고 forbidden field 부재를 검증한다.
    - **Validates: Requirements 10.4, 10.5, 10.7, 10.10-10.13**
  - [~] 19.8 lazy expiration·cutoff property test를 작성한다
    - **Property 17: lazy expiration, 순차 실패와 채점 cutoff**
    - 임의 세션/요청 시퀀스에서 시간 경과만으로 Attempt가 생기지 않고 정렬·cutoff·중단 규칙이 유지됨을 검증한다.
    - **Validates: Requirements 11.1-11.5, 11.11, 11.12**
  - [~] 19.9 concurrent finalize property test를 작성한다
    - **Property 18: 동시 finalize의 선형 가능 멱등성**
    - manual/expired/retry interleaving model에서 단일 Attempt·동일 결과 또는 완전 rollback만 관찰됨을 검증한다.
    - **Validates: Requirements 11.6-11.10**
  - [~] 19.10 all-owner-route lazy expiration concurrency integration test를 작성한다
    - `/me`, catalog, practice, exam, history, leaderboard와 admin 허용 route별로 만료 finalize가 원 handler보다 먼저 실행되는지 검증한다.
    - barrier로 manual/expired 충돌과 중간 실패를 만들고 committed prefix 보존, 이후 route 미실행과 retry 결과를 검증한다.
    - _Requirements: 11.1-11.12_

- [ ] 20. Immutable result, history와 leaderboard 구현
  - [~] 20.1 Attempt detail, history와 trend query를 구현한다
    - 원본 catalog join 없이 snapshot result를 제공하고 owner Attempt만 `(submittedAt DESC,id ASC)`, trend는 `(submittedAt ASC,id ASC)`로 반환한다.
    - 빈 사용자에게 빈 이력·추이와 certification별 count 0을 제공한다.
    - _Requirements: 13.1-13.14_
  - [~] 20.2 score visibility 기반 exact leaderboard를 구현한다
    - approved/public/Attempt 보유자만 후보로 만들고 대표를 exact accuracy DESC, submittedAt ASC, attemptId ASC로 선택한다.
    - standard competition rank와 동률 출력 순서, current marker와 빈 leaderboard를 구현한다.
    - _Requirements: 9.10, 9.11, 12.12, 14.4-14.15_
  - [~] 20.3 result/history/trend/leaderboard API를 기존 shared contracts에 연결한다
    - owner와 privacy projection을 적용하고 email, Google_Sub와 비공개 사용자 존재를 반환하지 않는다.
    - frontend mock fixture와 backend provider response를 contract test로 비교한다.
    - _Requirements: 1.12, 13.1-13.14, 14.4-14.15, 16.3-16.7_
  - [~] 20.4 Attempt 불변성·이력 property test를 작성한다
    - **Property 21: Attempt 불변성과 이력 정렬**
    - 임의 catalog 교체와 동률 시각에서 snapshot 불변성, owner filtering, 이력·추이 순서와 빈 상태를 검증한다.
    - **Validates: Requirements 13.1-13.14**
  - [~] 20.5 leaderboard property test를 작성한다
    - **Property 22: 리더보드 후보·대표·동률 규칙**
    - 임의 profile/Attempt 집합에서 후보, 대표, exact rank, 출력 tie-break와 marker를 독립 oracle과 비교한다.
    - **Validates: Requirements 14.2-14.15**
  - [~] 20.6 history·leaderboard repository integration test를 작성한다
    - exact 값은 다르지만 2자리 표시가 같은 Attempt, 같은 제출 시각, visibility toggle과 practice result 혼입을 검증한다.
    - _Requirements: 9.8-9.11, 12.12, 13.8-13.14, 14.4-14.15_

- [ ] 21. IaC, observability와 운영 보안 구현
  - [~] 21.1 Terraform 기반 인프라를 구현한다
    - Cognito+Google IdP, 선택 DB, S3/CloudFront, IAM role, SSM namespace, log retention, backup/PITR와 stage isolation을 코드화한다.
    - Terraform과 Serverless 소유 리소스가 겹치지 않게 output/SSM 계약을 만든다.
    - _Requirements: 1.1, 1.13, 9.6, 15.28, 16.4_
  - [~] 21.2 Serverless Framework 배포 구성을 구현한다
    - 단일 Hono Lambda, API Gateway JWT authorizer/routes, practice cleanup EventBridge mapping과 SSM dynamic reference를 연결한다.
    - background job은 practice 물리 cleanup만 수행하고 exam Attempt를 만들지 않게 한다.
    - _Requirements: 9.6, 9.7, 11.2, 11.3_
  - [~] 21.3 IAM, CORS, CSP, rate limit와 web 보안 header를 구현한다
    - 최소 DB/SSM/log 권한, prod SPA 단일 origin, HSTS, no-sniff, no-referrer, frame deny와 Markdown origin 정책을 적용한다.
    - login/start/submit/admin import에 사용자/IP 기반 제한과 안전한 429를 제공한다.
    - _Requirements: 1.1-1.3, 2.4, 5.10, 5.11, 16.4, 16.6_
  - [~] 21.4 structured telemetry와 alarm/runbook automation을 구현한다
    - request/DB/finalize/cleanup/import/projection metric과 JSON log redaction을 추가하고 request ID 상관관계를 연결한다.
    - token, email, Google_Sub, answers, explanations, import payload와 SQL bind를 로그·trace에서 제거한다.
    - _Requirements: 1.2, 1.12, 11.12, 15.23, 16.4_
  - [~] 21.5 인프라·보안 자동화 test를 작성한다
    - Terraform/Serverless ownership lint, IAM policy assertion, CORS/CSP, log redaction, oversized import, owner IDOR와 rate-limit 응답을 검증한다.
    - _Requirements: 1.12, 2.4, 5.10, 5.11, 15.15, 16.4, 16.6_

- [ ] 22. 실제 통합 test harness와 결정적 backend fixture 구현
  - [~] 22.1 API·DB 통합 harness를 구현한다
    - DOP-C02 catalog, Cognito claim, seeded RNG, fake Clock, barrier/fault injector와 DB reset/migration fixture를 실제 contracts, Hono composition root와 선택 DB adapter에 연결한다.
    - frontend MSW fixture의 의미상 대응 사례를 재사용하되 실제 persistence/transaction 결과를 별도로 검증할 수 있게 한다.
    - _Requirements: 3.9, 4.1-4.12, 10.1-10.13, 12.1-12.17_

- [ ] 23. Mock를 실제 API로 교체하고 통합·E2E·release gate 완성
  - [~] 23.1 frontend real HTTP API adapter와 환경별 adapter switch를 구현한다
    - `CertQuizApi`의 HTTP 구현에 bearer token, envelope parsing, request ID, retry metadata, idempotency key와 stale-version 처리를 추가한다.
    - 개발 mock, test mock, real API를 composition root 설정만으로 전환하고 component/store 코드를 변경하지 않게 한다.
    - _Requirements: 1.1-2.6, 6.7-16.9_
  - [~] 23.2 frontend consumer와 backend provider contract compatibility gate를 구현한다
    - 모든 endpoint에서 shared schema, mock fixture corpus와 실제 Hono response를 비교하고 additive optional 변경만 허용한다.
    - incompatible field/type/error/retryability 변경과 active projection forbidden field를 CI에서 차단한다.
    - _Requirements: 1.7-2.6, 3.6-3.11, 7.1-16.9_
  - [~] 23.3 API·DB integration suite를 작성한다
    - 인증/승인, import switch, generation rollback, practice 168시간 경계, exact score, all-owner-route lazy expiration, concurrent finalize와 immutable history를 실제 선택 DB에서 검증한다.
    - mock가 증명하지 못한 security, authorization, persistence, atomicity, server timing과 concurrency를 명시적 acceptance gate로 둔다.
    - _Requirements: 1.1-2.6, 3.1-4.12, 7.1-15.28_
  - [~] 23.4 real API 기반 Playwright S1~S10 E2E suite를 작성한다
    - Cognito login fixture 이후 pending→승인, catalog/mode, practice, exam, 결과, 이력, leaderboard와 admin import의 loading/empty/error/retry 흐름을 실제 API에 연결한다.
    - 정답 공개 시점, duplicate submit, timer reconnect, privacy와 mock/real 사용자 흐름 parity를 검증한다.
    - _Requirements: 1.1-16.9_
  - [~] 23.5 PR·DB adapter·배포 후보 CI gate를 구현한다
    - PR에 lint/typecheck/unit/property/component/mock-E2E/contract를, DB 변경에 실제 adapter contract/concurrency를, 후보에 Cognito/API/DB integration과 real Playwright smoke를 연결한다.
    - 실패 seed/path, migration checksum과 DSQL gate 결과를 artifact로 보존하고 실패 시 배포를 차단한다.
    - _Requirements: 1.6, 4.10, 11.6-11.10, 15.27, 16.1, 16.2_
  - [~] 23.6 migration·alias·web·catalog release와 rollback automation을 구현한다
    - expand migration, unpublished Lambda smoke, alias switch, versioned web deploy, admin dry-run/commit과 post-deploy smoke 순서를 자동화한다.
    - API/web rollback과 active catalog 이전 revision 재활성화 script를 제공하고 Attempt/snapshot을 수정하지 않는다.
    - _Requirements: 4.12, 13.8, 13.9, 15.21, 15.27, 15.28_

- [~] 24. Final integration checkpoint - Ensure all tests pass
  - Ensure frontend and backend lint, typecheck, unit, all 25 property tests, component, contract, repository, concurrency, integration, mock/real Playwright, infrastructure and release gates pass; ask the user if questions arise.

## Notes

- 완료 상태는 기존 실행 기록을 그대로 보존한다. Task `1`과 `1.1`~`1.7`은 모두 `[x]`이며 재작성한 Task `2` 이후는 `[ ]`이다. Task 1.5는 결정적 read-only fixture만 제공하며 HTML 화면 rendering/export는 미완료 Task 2~3에서 수행한다. 선택 작업을 뜻하는 별표 표기나 생략 가능한 테스트 작업은 없다.
- Task 2~3은 **정적 UI 전용**이다. props와 Task 1.5의 read-only fixture만 사용하며 `pnpm ui:preview:export`로 `artifacts/ui-preview/index.html`, S1~S10 실제 `.html` variant와 상대 local assets를 생성한다. 생성 artifact는 TanStack Query, Zustand mutation, MSW 상태 머신, real HTTP, Cognito, 진행 timer, DB와 backend 동작 또는 외부 network에 의존하지 않는다.
- Task 4 `Static UI review checkpoint`는 강제 승인 게이트다. `artifacts/ui-preview/index.html`과 exported-artifact visual/accessibility 검증을 제공한 뒤 반드시 실행을 중단하고 사용자 시각 승인을 받아야 Task 5 이후를 시작할 수 있다.
- mock fixture와 interaction은 UI 개발과 frontend consumer contract 검증만 담당한다. backend 보안, 인증·인가, 소유권, 영속성, transaction 원자성, 서버 시간, 동시성, 실제 AWS/DB 배선을 충족하거나 대체하지 않는다.
- Task 5~7은 승인된 markup/layout을 유지하면서 공통 async 기반 → auth/catalog/admin/import → practice → exam → result/history/leaderboard 순서로 연결하며 각 slice checkpoint를 통과한 뒤 다음 slice로 진행한다. Task 7.14 전에는 Task 8 이후 backend 작업을 시작하지 않는다.
- frontend는 `CertQuizApi`와 `packages/contracts`에만 의존한다. backend는 이미 확정된 schema를 consumer로 사용하고 provider contract gate 없이 비호환 변경하지 않는다.
- Correctness Properties 1~25는 각각 정확히 하나의 독립 property-test 작업에 연결한다: P1~P3 `13.5-13.7`, P4 `14.3`, P5~P7 `16.5-16.7`, P8~P10 `7.3-7.5`, P11~P14 `18.7-18.10`, P15~P18 `19.6-19.9`, P19~P20 `11.5-11.6`, P21~P22 `20.4-20.5`, P23~P24 `15.6-15.7`, P25 `5.3`.
- 모든 property test는 TypeScript `fast-check`를 사용하고 기본 `numRuns: 200`과 재현 가능한 seed/path를 기록한다. 각 파일에는 `Feature: cert-quiz-mvp, Property N` 주석을 둔다.
- repository concurrency/fault-injection과 실제 DB barrier test는 순수/model-based property test를 보완하며, frontend mock test와 중복되는 것이 아니라 서로 다른 trust boundary를 검증한다.
- 각 작업은 앞 단계의 실제 contracts와 composition root를 수정해 연결하며 사용되지 않는 대체 구현이나 고립된 scaffold를 만들지 않는다.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.2"] },
    { "id": 1, "tasks": ["2.3"] },
    { "id": 2, "tasks": ["2.4"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 4, "tasks": ["3.5"] },
    { "id": 5, "tasks": ["3.6"] },
    { "id": 6, "tasks": ["4"] },
    { "id": 7, "tasks": ["5.1"] },
    { "id": 8, "tasks": ["5.2"] },
    { "id": 9, "tasks": ["5.3"] },
    { "id": 10, "tasks": ["5.4"] },
    { "id": 11, "tasks": ["6.1", "6.2", "6.3", "6.4"] },
    { "id": 12, "tasks": ["6.5"] },
    { "id": 13, "tasks": ["6.6"] },
    { "id": 14, "tasks": ["7.1"] },
    { "id": 15, "tasks": ["7.2"] },
    { "id": 16, "tasks": ["7.3", "7.4", "7.5", "7.6"] },
    { "id": 17, "tasks": ["7.7"] },
    { "id": 18, "tasks": ["7.8"] },
    { "id": 19, "tasks": ["7.9"] },
    { "id": 20, "tasks": ["7.10"] },
    { "id": 21, "tasks": ["7.11"] },
    { "id": 22, "tasks": ["7.12"] },
    { "id": 23, "tasks": ["7.13"] },
    { "id": 24, "tasks": ["7.14"] },
    { "id": 25, "tasks": ["8.1"] },
    { "id": 26, "tasks": ["8.2", "8.3"] },
    { "id": 27, "tasks": ["9.1"] },
    { "id": 28, "tasks": ["9.2"] },
    { "id": 29, "tasks": ["9.3"] },
    { "id": 30, "tasks": ["10"] },
    { "id": 31, "tasks": ["11.1", "11.2", "11.3"] },
    { "id": 32, "tasks": ["11.4"] },
    { "id": 33, "tasks": ["11.5", "11.6"] },
    { "id": 34, "tasks": ["12.1", "12.2", "12.3"] },
    { "id": 35, "tasks": ["12.4"] },
    { "id": 36, "tasks": ["12.5", "12.6"] },
    { "id": 37, "tasks": ["13.1", "13.2"] },
    { "id": 38, "tasks": ["13.3", "13.4"] },
    { "id": 39, "tasks": ["13.5", "13.6", "13.7", "13.8"] },
    { "id": 40, "tasks": ["14.1"] },
    { "id": 41, "tasks": ["14.2", "14.3"] },
    { "id": 42, "tasks": ["15.1", "15.3"] },
    { "id": 43, "tasks": ["15.2"] },
    { "id": 44, "tasks": ["15.4"] },
    { "id": 45, "tasks": ["15.5"] },
    { "id": 46, "tasks": ["15.6", "15.7", "15.8"] },
    { "id": 47, "tasks": ["16.1", "16.2"] },
    { "id": 48, "tasks": ["16.3"] },
    { "id": 49, "tasks": ["16.4"] },
    { "id": 50, "tasks": ["16.5", "16.6", "16.7", "16.8"] },
    { "id": 51, "tasks": ["17"] },
    { "id": 52, "tasks": ["18.1"] },
    { "id": 53, "tasks": ["18.2"] },
    { "id": 54, "tasks": ["18.3"] },
    { "id": 55, "tasks": ["18.4", "18.5"] },
    { "id": 56, "tasks": ["18.6"] },
    { "id": 57, "tasks": ["18.7", "18.8", "18.9"] },
    { "id": 58, "tasks": ["19.1"] },
    { "id": 59, "tasks": ["19.2", "19.3"] },
    { "id": 60, "tasks": ["19.4"] },
    { "id": 61, "tasks": ["19.5"] },
    { "id": 62, "tasks": ["19.6", "19.7", "19.8", "19.9"] },
    { "id": 63, "tasks": ["19.10"] },
    { "id": 64, "tasks": ["20.1", "20.2"] },
    { "id": 65, "tasks": ["20.3"] },
    { "id": 66, "tasks": ["18.10", "20.4", "20.5", "20.6"] },
    { "id": 67, "tasks": ["21.1"] },
    { "id": 68, "tasks": ["21.2", "21.3"] },
    { "id": 69, "tasks": ["21.4"] },
    { "id": 70, "tasks": ["21.5"] },
    { "id": 71, "tasks": ["22.1"] },
    { "id": 72, "tasks": ["23.1"] },
    { "id": 73, "tasks": ["23.2"] },
    { "id": 74, "tasks": ["23.3"] },
    { "id": 75, "tasks": ["23.4"] },
    { "id": 76, "tasks": ["23.5"] },
    { "id": 77, "tasks": ["23.6"] },
    { "id": 78, "tasks": ["24"] }
  ]
}
```
