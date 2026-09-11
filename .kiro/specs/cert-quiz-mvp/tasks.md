# Implementation Plan: CertQuiz MVP

## Overview

이 계획은 현재 저장소 구현과 자동화 테스트를 기준으로 갱신한 requirements-first 실행 기록이다. TypeScript/pnpm 모노레포, 정적 UI 승인본, mock 기반 S1~S10 흐름, shared contracts, 순수 도메인 로직, in-memory UnitOfWork, Hono route, versioned migration SQL과 Aurora DSQL compatibility spike는 구현되어 있다. 라이브 DSQL spike는 connector lifecycle, migration replay, query plan/p95, 동시성·rollback gate를 통과해 DSQL을 선택했지만, 애플리케이션 migration을 실행하고 aggregate를 영속화하는 production DSQL repository/UnitOfWork는 아직 없다. 실제 Lambda export와 Serverless route도 health-only이며 Cognito JWKS verifier, Google OAuth 배선, 전체 HTTP frontend adapter, real API E2E와 release automation이 남아 있다.

상태 표기는 `[x]` 완료, `[~]` 일부 구현 또는 외부 환경 검증 대기, `[ ]` 미착수다. 부분 완료 항목에는 저장소에서 확인한 완료 근거와 남은 코딩·테스트·구성 작업을 함께 기록한다. 테스트는 release gate의 일부이므로 선택 작업으로 표시하지 않는다.

## Tasks

- [x] 1. 최소 프론트엔드 workspace, transport contracts와 mock 경계 구성
  - [x] 1.1 pnpm/TypeScript workspace와 React/Vite 앱 기반을 구성한다. _Requirements: 16.1, 16.2_
  - [x] 1.2 lint·format·Vitest·Playwright·coverage 단일 실행 품질 게이트를 구성한다. _Requirements: 16.1, 16.2, 16.8, 16.9_
  - [x] 1.3 strict transport contracts와 공개 시점별 question projection schema를 구현한다. _Requirements: 1.7-1.12, 3.6-3.11, 8.8-8.10, 10.7, 13.1-13.3_
  - [x] 1.4 교체 가능한 `CertQuizApi` frontend port와 provider 경계를 구현한다. _Requirements: 1.7-16.9_
  - [x] 1.5 결정적 정적 UI fixture를 구현한다. _Requirements: 1.7-16.7_
  - [x] 1.6 MSW/mock 상태 머신과 오류 scenario를 구현한다. _Requirements: 6.7-16.9_
  - [x] 1.7 shared health contract로 frontend bootstrap을 검증한다. _Requirements: 16.1, 16.2, 16.4_

- [x] 2. 정적 UI foundation과 export 가능한 review shell 구성
  - [x] 2.1 S1~S10 route skeleton, export manifest와 정적 navigation을 구현한다. _Requirements: 1.7-2.4, 16.1-16.7_
  - [x] 2.2 Tailwind/shadcn 기반 design token과 application shell을 구현한다. _Requirements: 5.9-5.13, 16.1-16.7_
  - [x] 2.3 props-only presentational component와 안전한 Markdown 표현을 구현한다. _Requirements: 5.9-5.13, 16.3-16.7_
  - [x] 2.4 `pnpm ui:preview:export` multipage static HTML pipeline을 구현한다. _Requirements: 1.7-16.7_

- [x] 3. S1~S10 정적 fixture 화면과 HTML 상태 변형 구현
  - [x] 3.1 로그인·pending·홈·mode select 화면과 상태 변형을 구현한다. _Requirements: 1.7, 1.8, 3.6-3.9, 7.5-7.9, 10.1, 16.1-16.7_
  - [x] 3.2 공통 quiz presenter와 Practice·Exam 정적 화면을 구현한다. _Requirements: 5.1-6.16, 8.8-8.10, 10.3-10.13_
  - [x] 3.3 result·history·leaderboard 정적 화면을 구현한다. _Requirements: 9.1-14.15, 16.3-16.7_
  - [x] 3.4 관리자 pending 사용자와 import 정적 화면을 구현한다. _Requirements: 1.9, 1.10, 2.5, 2.6, 15.1-15.27_
  - [x] 3.5 결정적 S1~S10 multipage gallery를 생성한다. _Requirements: 1.7-16.7_
  - [x] 3.6 exported HTML visual smoke와 accessibility 검사를 구현한다. _Requirements: 5.1-6.16, 16.1-16.7_

- [x] 4. Static UI review checkpoint
  - `artifacts/ui-preview/index.html`의 사용자 시각 승인과 exported-artifact 검사를 완료했다.

- [x] 5. 승인된 UI에 mock 상태 기반과 비동기 경계 연결
  - [x] 5.1 TanStack Query, Zustand와 typed API port를 composition root에 연결한다. _Requirements: 5.5, 6.9, 6.12, 16.1, 16.2_
  - [x] 5.2 AsyncBoundary, canonical mutation reconciliation과 duplicate lock을 구현한다. _Requirements: 6.7-6.12, 16.1-16.9_
  - [x] 5.3 Property 25 비동기 UI 상태 머신 테스트를 구현한다. _Requirements: 16.1-16.9_
  - [x] 5.4 mock state foundation checkpoint를 통과한다.

- [x] 6. auth·pending·catalog·admin/import mock interaction slice 구현
  - [x] 6.1 mock login/callback/pending interaction을 구현한다. _Requirements: 1.1-1.8, 16.1-16.9_
  - [x] 6.2 catalog와 mode select interaction을 구현한다. _Requirements: 3.6-3.9, 7.5-7.9, 10.1_
  - [x] 6.3 관리자 pending 사용자 interaction을 구현한다. _Requirements: 1.9, 1.10, 2.5, 2.6_
  - [x] 6.4 import dry-run/commit mock interaction을 구현한다. _Requirements: 15.1-15.27_
  - [x] 6.5 auth/catalog/admin/import component·browser test를 구현한다. _Requirements: 1.7-3.6, 7.5-7.9, 15.18-15.26_
  - [x] 6.6 slice checkpoint를 통과한다.

- [x] 7. practice → exam → result/history/leaderboard mock interaction slice 구현
  - [x] 7.1 공통 QuestionPresenter와 navigator interaction을 구현한다. _Requirements: 5.1-6.16_
  - [x] 7.2 Practice interaction을 구현한다. _Requirements: 6.7-8.12, 16.5-16.9_
  - [x] 7.3 Property 8 문제 입력·언어 상태 테스트를 구현한다. _Requirements: 5.1-5.8_
  - [x] 7.4 Property 9 탐색 경계·상태 분류 테스트를 구현한다. _Requirements: 6.1-6.6, 6.13-6.16_
  - [x] 7.5 Property 10 Flag version commit/rollback 테스트를 구현한다. _Requirements: 6.7-6.12_
  - [x] 7.6 Practice component/browser test를 구현한다. _Requirements: 5.1-8.12, 16.8, 16.9_
  - [x] 7.7 Practice checkpoint를 통과한다.
  - [x] 7.8 ExamPage와 ServerTimer interaction을 구현한다. _Requirements: 10.3-11.12_
  - [x] 7.9 Exam component/browser test를 구현한다. _Requirements: 10.3-11.12, 16.1-16.9_
  - [x] 7.10 Exam checkpoint를 통과한다.
  - [x] 7.11 result/history/leaderboard interaction을 구현한다. _Requirements: 9.1-14.15_
  - [x] 7.12 result/history/leaderboard component·browser test를 구현한다. _Requirements: 9.1-14.15_
  - [x] 7.13 shared schema contract와 mock S1~S10 E2E를 구현한다. _Requirements: 1.7-16.9_
  - [x] 7.14 frontend mock checkpoint를 통과한다.

- [x] 8. Backend workspace와 Hono API bootstrap 구성
  - [x] 8.1 `apps/api`, `packages/domain`, `packages/db`, infra workspace를 추가한다. _Requirements: 16.1, 16.2_
  - [x] 8.2 backend boundary와 root quality 명령을 구성한다. _Requirements: 16.1, 16.2, 16.8, 16.9_
  - [x] 8.3 shared health contract를 Hono Lambda adapter에 연결한다. _Requirements: 16.1, 16.2, 16.4_

- [x] 9. Aurora DSQL compatibility spike와 데이터베이스 선택 게이트 구현
  - [x] 9.1 connector·migration·query live spike와 machine-readable report를 구현·실행한다. _Requirements: 3.1-3.5, 9.4-9.7, 12.5-12.8, 13.10-13.13_
  - [x] 9.2 live barrier/fault probe로 profile, practice, finalize와 import atomicity를 검증한다. _Requirements: 1.5, 1.6, 4.10, 7.4, 11.6-11.10, 15.21, 15.27_
  - [x] 9.3 모든 live gate 통과 결과와 ADR로 DSQL adapter를 선택한다. _Requirements: 1.6, 4.10-4.12, 11.8-11.10, 15.27, 15.28_

- [x] 10. Backend foundation checkpoint
  - workspace, contract와 live DSQL compatibility gate를 통과했다.

- [x] 11. Shared backend primitive와 contract-compatible projection 구현
  - [x] 11.1 exact `Fraction`과 점수 primitive를 구현한다. _Requirements: 9.1, 9.2, 12.1-12.14_
  - [x] 11.2 Clock, RNG, UUID와 시간 경계 primitive를 구현한다. _Requirements: 4.6, 4.7, 9.4-10.9_
  - [x] 11.3 domain error와 안전한 HTTP error mapper를 구현한다. _Requirements: 1.2, 1.3, 1.8, 1.12, 2.4, 16.3-16.7_
  - [x] 11.4 strict SnapshotProjector와 provider contract test를 구현한다. _Requirements: 5.6-5.8, 8.8-8.10, 10.7, 13.1-13.3_
  - [x] 11.5 Property 19 exact 채점 테스트를 구현한다. _Requirements: 12.1-12.8_
  - [x] 11.6 Property 20 표시값·판정값 분리 테스트를 구현한다. _Requirements: 12.9-12.17_

- [x] 12. Production DSQL migration과 repository adapter 완성
  - [x] 12.1 identity, revisioned catalog와 import validation migration을 구현한다. _Requirements: 1.5, 1.6, 2.5, 3.1-3.5, 14.1, 15.20-15.27_
  - [x] 12.2 practice session, snapshot과 completed result migration을 구현한다. _Requirements: 4.10-4.12, 7.1-9.7_
  - [x] 12.3 exam session, Attempt와 immutable item migration을 구현한다. _Requirements: 10.1-11.10, 13.4-14.12_
  - [x] 12.4 DSQL connector 기반 production `UnitOfWork`와 aggregate repository를 구현한다
    - **완료 근거:** aggregate port, copy-on-write in-memory adapter, migration manifest/checksum assertion, explicit DSQL selection과 live compatibility report가 있다.
    - **남은 작업:** application migration runner, pooled DSQL connection factory, OCC retry, row↔domain mapper와 users/catalog/practice/exam/history repository의 owner-scoped·conditional SQL을 구현하고 Lambda freeze/thaw 시 pool lifecycle을 composition root에서 관리한다.
    - _Requirements: 1.5, 1.6, 1.12, 4.10-4.12, 7.4-7.12, 10.9-11.10, 13.8-13.14, 15.21-15.28_
  - [x] 12.5 공통 repository contract suite를 production DSQL adapter에도 실행한다
    - **완료 근거:** in-memory aggregate contract, exact fraction, owner scope, ordering과 rollback 테스트가 통과한다.
    - **남은 작업:** 동일 suite를 adapter factory로 parameterize하고 disposable DSQL schema에 migration→seed→assert→cleanup 순서로 실행한다.
    - _Requirements: 1.12, 7.4, 9.4-9.11, 11.8, 13.8-13.14, 15.27_
  - [x] 12.6 production table 대상 concurrency·fault suite를 구현한다
    - **완료 근거:** spike table live barrier probe와 in-memory fault injection은 통과했다.
    - **남은 작업:** application repository의 profile singleton, active practice slot, first submit, finalize, import switch를 실제 migration table에서 충돌시키고 각 write 단계 rollback을 검증한다.
    - _Requirements: 1.6, 1.14, 4.10, 7.9, 8.11, 11.6-11.10, 15.27_

- [x] 13. Cognito 인증, 승인, 관리자와 소유권 경계 완성
  - [x] 13.1 실제 Cognito JWKS token verifier를 구현한다
    - **완료 근거:** injected verifier interface, Google identity extractor, authentication/approval/admin middleware와 fail-closed tests가 있다.
    - **남은 작업:** issuer, audience/client ID, signature, expiry, token use와 unknown-`kid` 1회 refresh를 검증하는 cached JWKS adapter를 추가하고 raw token/claims logging을 금지한다.
    - _Requirements: 1.1-1.4, 1.13_
  - [x] 13.2 profile get-or-create와 pending approval route를 구현한다. _Requirements: 1.4-1.8, 1.13, 1.14, 14.1_
  - [x] 13.3 approval/admin/ownership middleware와 관리자 사용자 API를 구현한다. _Requirements: 1.9-1.12, 1.15, 2.1-2.6_
  - [x] 13.4 본인 profile과 점수 공개 설정 API를 구현한다. _Requirements: 1.11, 14.1-14.3_
  - [x] 13.5 Property 1 외부 신원·신규 profile 테스트를 구현한다. _Requirements: 1.4-1.6, 1.13, 1.14, 14.1_
  - [x] 13.6 Property 2 인증·인가 비간섭 테스트를 구현한다. _Requirements: 1.1-1.3, 1.7, 1.8, 1.11, 1.12, 2.1-2.4_
  - [x] 13.7 Property 3 승인 전이·pending 목록 테스트를 구현한다. _Requirements: 1.9, 1.10, 1.15, 2.5, 2.6_
  - [x] 13.8 Cognito와 production repository 인증 integration test를 구현한다
    - injected claim fixtures는 통과한다. 실제 JWKS fixture/server 또는 dev Cognito token으로 valid, expired, wrong issuer/audience/token-use, missing Google identity, role bypass와 IDOR를 production composition에 대해 검증한다.
    - **외부 게이트:** Cognito app client/Google IdP 설정과 live test credentials가 필요한 사례는 환경변수 기반 opt-in suite로 분리한다.
    - _Requirements: 1.1-1.15, 2.1-2.6_

- [x] 14. Revisioned certification catalog 구현
  - [x] 14.1 active revision catalog validator, DOP-C02 fixture와 repository query를 구현한다. _Requirements: 3.1-3.5, 3.9-3.11_
  - [x] 14.2 approved catalog API를 Provider별 strict projection에 연결한다. _Requirements: 3.6-3.8, 3.10, 3.11_
  - [x] 14.3 Property 4 catalog 관계·노출 테스트를 구현한다. _Requirements: 3.1-3.8, 3.10, 3.11_

- [x] 15. JSON import dry-run과 atomic revision commit 완성
  - [x] 15.1 byte-limit parser와 구조/schema validation pipeline을 구현한다. _Requirements: 15.1-15.3, 15.15-15.17_
  - [x] 15.2 semantic validator와 summary 계산을 구현한다. _Requirements: 15.4-15.19_
  - [x] 15.3 canonical JSON, SHA-256와 actor-bound single-use token을 구현한다. _Requirements: 15.20, 15.22-15.26_
  - [x] 15.4 production DSQL에서 revision insert·head switch·token consume을 원자적으로 구현한다
    - in-memory commit과 rollback은 동작한다. Task 12.4 repository에 source/head 재검증, 전체 row insert, active head 전환과 validation consume SQL을 하나의 짧은 transaction으로 추가한다.
    - _Requirements: 15.21, 15.27, 15.28_
  - [x] 15.5 관리자 dry-run/commit API와 strict contract를 구현한다. _Requirements: 2.2-2.4, 15.1-15.28, 16.4-16.7_
  - [x] 15.6 Property 23 import dry-run 테스트를 설계 속성 전체로 확장한다
    - 현재 size 선검사, canonical key-order와 일부 복합 semantic 오류 예제는 통과한다. fast-check로 syntax/schema/depth/cardinality/중복/관계/언어/pool 조합을 생성하고 독립 oracle, active catalog 비변경과 summary unavailable 규칙을 200회 검증한다.
    - _Requirements: 15.1-15.19_
  - [x] 15.7 Property 24 validation binding·atomic switch 테스트를 확장한다
    - 현재 in-memory happy path, replay와 한 fault point가 있다. actor/content/token/TTL 경계/use 상태와 모든 transaction fault point를 생성해 head·validation·Attempt snapshot 불변성을 검증한다.
    - _Requirements: 15.20-15.28_
  - [x] 15.8 production DSQL import integration suite를 구현한다
    - canonical number 동치, Domain 배열 순서 차이, 정확한 15분 경계, 다른 admin, replay와 insert/head/consume fault를 실제 application repository에서 검증한다.
    - _Requirements: 15.20-15.28_

- [x] 16. Domain allocation, sampling과 immutable snapshot 검증 완성
  - [x] 16.1 largest-remainder allocator를 exact arithmetic으로 구현한다. _Requirements: 4.1-4.4, 4.8_
  - [x] 16.2 unbiased sampling과 전체 shuffle을 구현한다. _Requirements: 4.5-4.7_
  - [x] 16.3 SessionFactory와 repository transaction 기반 immutable snapshot 생성을 구현한다. _Requirements: 3.7, 4.9-4.12, 7.3, 10.5_
  - [x] 16.4 generation API와 strict projection을 연결한다. _Requirements: 8.8-8.10, 10.7, 13.3, 16.4_
  - [x] 16.5 Property 5 largest-remainder 테스트를 일반 domain 목록으로 확장한다
    - 현재 2-domain 합·floor 범위와 tie 예제는 통과한다. 임의 양수 weight partition/domain 수에서 floor/floor+1, 총합, remainder DESC/import order ASC 수혜 집합과 practice/exam 공용 allocator 사용을 검증한다.
    - _Requirements: 4.1-4.4, 4.8_
  - [x] 16.6 Property 6 uniform sampling·permutation 테스트를 구현한다. _Requirements: 4.5-4.7_
  - [x] 16.7 Property 7 all-or-nothing·snapshot 불변성 테스트를 확장한다
    - 현재 중복/순서/부족 pool 예제와 in-memory replace rollback이 있다. 생성 각 write 지점 fault, 전체 부족 domain 수집과 성공 후 source revision mutation에도 snapshot deep equality를 검증한다.
    - _Requirements: 4.9-4.12_
  - [x] 16.8 strict projection leak contract test를 구현한다. _Requirements: 8.8-8.10, 10.7, 16.4_

- [x] 17. Backend domain/repository checkpoint
  - offline unit/property/API/in-memory repository gate와 live DSQL compatibility spike는 통과했다. production DSQL application repository와 그 contract/concurrency suite가 통과하면 완료한다.

- [x] 18. Practice session, result와 retention 수직 기능 완성
  - [x] 18.1 start/resume/replace lifecycle을 구현한다. _Requirements: 7.1-7.9_
  - [x] 18.2 answer/Flag/position versioned state mutation을 구현한다. _Requirements: 6.7-7.12_
  - [x] 18.3 최초 question submit 잠금과 exact scoring을 구현한다. _Requirements: 8.1-8.7, 12.1-12.17_
  - [x] 18.4 마지막 제출과 Completed_Practice_Result 생성을 구현한다. _Requirements: 8.8-9.3_
  - [x] 18.5 168시간 visibility와 retention cleanup command를 구현한다. _Requirements: 9.4-9.7_
  - [x] 18.6 practice API route를 strict contracts에 연결한다. _Requirements: 6.7-9.7, 16.6-16.9_
  - [x] 18.7 Property 11 practice lifecycle 테스트를 구현한다. _Requirements: 7.1-7.12_
  - [x] 18.8 Property 12 최초 제출 잠금 테스트를 구현한다. _Requirements: 8.1-8.7_
  - [x] 18.9 Property 13 공개 격리·단일 완료 테스트를 구현한다. _Requirements: 8.8-8.12_
  - [x] 18.10 Property 14 보관 경계·통계 격리 테스트를 완성한다
    - 현재 `[completedAt,+168h)` 경계는 검증한다. 완료 연습 결과를 임의 추가·삭제하고 cleanup을 지연해도 history/trend/leaderboard 출력이 동일한 metamorphic assertion과 domain/question exact result 일관성을 추가한다.
    - _Requirements: 9.1-9.11_

- [x] 19. Exam timer, lazy expiration과 idempotent finalize 수직 기능 완성
  - [x] 19.1 idempotent exam start와 server-clock state mutation을 구현한다. _Requirements: 10.1-10.3, 10.6, 10.8-10.12_
  - [x] 19.2 exam restore와 submission preview를 구현한다. _Requirements: 10.4, 10.5, 10.7, 10.13_
  - [x] 19.3 production Lambda의 모든 인증 요청에 `OwnedExpiredExamFinalizer`를 배선한다
    - dependency-injected Hono 앱에는 route-family pre-handler가 있다. Task 12/13 production dependencies를 Lambda composition에 주입하고 `/v1/me/approval`을 포함한 모든 인증 route에서 approval/role/handler 전에 실행되도록 route manifest test로 고정한다.
    - _Requirements: 11.2, 11.3, 11.11, 11.12_
  - [x] 19.4 cutoff 기반 `finalizeOnce`와 immutable Attempt 생성을 구현한다. _Requirements: 11.1, 11.4-11.10, 12.1-13.7_
  - [x] 19.5 exam API를 strict contracts에 연결한다. _Requirements: 10.1-11.12, 16.6-16.9_
  - [x] 19.6 Property 15 exam 시간 함수 테스트를 구현한다. _Requirements: 10.1-10.3, 10.6, 10.8, 10.9_
  - [x] 19.7 Property 16 exam 저장·복원 테스트를 구현한다. _Requirements: 10.4, 10.5, 10.7, 10.10-10.13_
  - [x] 19.8 Property 17 lazy expiration·cutoff 테스트를 구현한다. _Requirements: 11.1-11.5, 11.11, 11.12_
  - [x] 19.9 Property 18 concurrent finalize 모델 테스트를 구현한다. _Requirements: 11.6-11.10_
  - [x] 19.10 all-route lazy expiration production integration suite를 구현한다
    - 현재 exam route의 offline 만료 전환만 검증한다. `/me/approval`, `/me`, catalog, practice, exam, result, history, leaderboard, admin route에서 handler 선행 순서, `(expiresAt,id)` committed prefix, 중간 실패 중단과 manual/expired 충돌을 production repository barrier로 검증한다.
    - _Requirements: 11.1-11.12_

- [x] 20. Immutable result, history와 leaderboard 검증 완성
  - [x] 20.1 Attempt detail, owner history와 trend query service를 구현한다. _Requirements: 13.1-13.14_
  - [x] 20.2 score visibility 기반 exact leaderboard service를 구현한다. _Requirements: 9.10, 9.11, 12.12, 14.4-14.15_
  - [x] 20.3 result/history/trend/leaderboard API와 privacy projection을 구현한다. _Requirements: 1.12, 13.1-14.15, 16.3-16.7_
  - [x] 20.4 Property 21 Attempt 불변성·이력 테스트를 확장한다
    - 현재 owner filtering과 단순 chronological history가 있다. 임의 catalog 교체, 같은 submittedAt/다른 attemptId, multi-certification trend와 empty count 0을 생성해 snapshot deep equality와 양방향 정렬을 검증한다.
    - _Requirements: 13.1-13.14_
  - [x] 20.5 Property 22 leaderboard 테스트를 일반 profile/Attempt 집합으로 확장한다
    - 현재 2-user 공개 후보 예제가 있다. approved/public/attempt 조합, exact 동률, 대표 tie-break, competition rank, output order와 current marker를 독립 oracle과 200회 비교한다.
    - _Requirements: 14.2-14.15_
  - [x] 20.6 production DSQL history·leaderboard integration test를 구현한다
    - live spike query plan은 통과했다. application repository에서 표시값은 같지만 exact 값이 다른 점수, 같은 시각, cursor page, visibility toggle, practice result 혼입과 p95/index 사용을 검증한다.
    - _Requirements: 9.8-9.11, 12.12, 13.8-14.15_

- [x] 21. IaC, observability와 운영 보안 완성
  - [x] 21.1 Terraform 기반 전체 인프라를 구현한다
    - **완료 근거:** dev DSQL, endpoint/region SSM, 최소 `dsql:DbConnect`/logs Lambda role, ownership static test와 live spike가 있다.
    - **남은 작업:** Cognito+Google IdP, S3/CloudFront, stage별 full SSM contract, prod root/remote state, DNS/ACM 입력, backup/PITR 설정과 Terraform outputs를 코드화한다.
    - **외부 게이트:** Google OAuth credentials, 배포 domain/certificate와 AWS apply 권한은 변수/secret으로 주입한다.
    - _Requirements: 1.1, 1.13, 9.6, 15.28, 16.4_
  - [x] 21.2 Serverless production composition과 route/schedule을 구현한다
    - **완료 근거:** Terraform-owned role을 받는 stage-tagged health-only Lambda/log-retention 구성이 있다.
    - **남은 작업:** production DSQL UnitOfWork, Cognito verifier, lifecycle/import/security/telemetry를 Lambda에 조립하고 protected routes/JWT authorizer, SSM dynamic reference와 practice cleanup EventBridge handler를 배포한다. cleanup handler가 Exam Attempt를 만들지 않는 architecture test를 추가한다.
    - _Requirements: 9.6, 9.7, 11.2, 11.3_
  - [x] 21.3 durable rate limit와 배포 보안 설정을 구현한다
    - **완료 근거:** exact-origin CORS, CSP/HSTS/no-sniff/no-referrer/frame deny, Markdown image origin validation과 injected rate-limit port/429 테스트가 있다.
    - **남은 작업:** API Gateway trusted client-IP resolver, WAF 또는 shared durable limiter와 stage별 origin 값을 구성하고 login/start/submit/admin-import 정책을 배포 템플릿에 연결한다.
    - _Requirements: 1.1-1.3, 2.4, 5.10, 5.11, 16.4, 16.6_
  - [x] 21.4 CloudWatch telemetry, alarms와 runbook automation을 구현한다
    - **완료 근거:** request ID propagation, structured telemetry port와 token/email/Google_Sub/answer/explanation/import/SQL redaction 테스트가 있다.
    - **남은 작업:** DB/finalize/cleanup/import/projection metric emission, dashboard, 5xx/finalize/cleanup/import/projection-leak/DB latency/budget alarms와 machine-readable runbook links를 IaC에 추가한다.
    - _Requirements: 1.2, 1.12, 11.12, 15.23, 16.4_
  - [x] 21.5 인프라·보안 validation suite를 완성한다
    - **완료 근거:** ownership/IAM static assertion, CORS/CSP/header, injected 429, telemetry redaction, oversized import와 owner IDOR tests가 통과한다.
    - **남은 작업:** Terraform fmt/validate/plan, Serverless package, Cognito/SSM/IAM/EventBridge/CloudWatch template assertions와 opt-in deployed smoke를 CI에 추가한다.
    - _Requirements: 1.12, 2.4, 5.10, 5.11, 15.15, 16.4, 16.6_

- [x] 22. 실제 API·DB 통합 harness와 결정적 backend fixture 완성
  - [x] 22.1 production composition integration harness를 구현한다
    - in-memory DOP-C02/fake clock/RNG fixture와 live spike harness는 있다. application migration을 disposable DSQL namespace에 적용하고 Cognito claim/JWKS fixture, deterministic IDs, DB reset, barrier/fault injector, Hono Lambda composition을 하나의 test fixture로 제공한다.
    - _Requirements: 1.1-2.6, 3.9, 4.1-4.12, 10.1-10.13, 12.1-12.17, 15.20-15.28_

- [x] 23. Mock를 실제 API로 교체하고 통합·E2E·release gate 완성
  - [x] 23.1 frontend real HTTP adapter를 전체 `CertQuizApi`로 확장한다
    - **완료 근거:** strict health transport와 network/contract 오류 변환 test가 있다.
    - **남은 작업:** bearer token provider, 모든 endpoint method/path/body/envelope parsing, request ID, retry metadata, Idempotency-Key와 stale-version 처리를 구현하고 `main.tsx`가 환경 설정으로 mock/real adapter를 선택하게 한다.
    - _Requirements: 1.1-2.6, 3.6-3.11, 6.7-16.9_
  - [x] 23.2 frontend consumer/backend provider compatibility gate를 전체 endpoint로 확장한다
    - health와 shared schema 단위 gate는 있다. mock fixture corpus와 production-composed Hono response를 endpoint matrix로 비교하고 incompatible field/type/error/retryability와 forbidden reveal field를 CI에서 차단한다.
    - _Requirements: 1.7-2.6, 3.6-3.11, 7.1-16.9_
  - [x] 23.3 API·DSQL acceptance integration suite를 구현한다
    - live compatibility probe와 offline API integration은 있다. Task 22 harness로 인증/승인, import switch, generation rollback, practice expiry, exact score, all-route lazy finalize, concurrent finalize, immutable history와 privacy를 application tables에서 검증한다.
    - _Requirements: 1.1-2.6, 3.1-4.12, 7.1-15.28_
  - [x] 23.4 real API 기반 Playwright S1~S10 E2E를 구현한다
    - Cognito test login 이후 pending→approve, catalog/mode, practice, exam, result/history/leaderboard, admin import와 loading/empty/error/retry를 deployed API에 연결하고 mock/real flow parity를 검증한다.
    - _Requirements: 1.1-16.9_
  - [x] 23.5 PR·DB adapter·배포 후보 CI gate를 완성한다
    - local lint/typecheck/unit/property/component/contracts/mock-E2E gate는 있다. DSQL repository/concurrency, Cognito/API integration, real Playwright, Terraform plan/Serverless package와 migration/live-spike artifact freshness를 단계별 required job으로 구성한다.
    - _Requirements: 1.6, 4.10, 11.6-11.10, 15.27, 16.1, 16.2_
  - [x] 23.6 migration·Lambda alias·web·catalog release와 rollback automation을 구현한다
    - expand migration, unpublished Lambda smoke, alias switch, versioned S3/CloudFront deploy, admin dry-run/commit, post-deploy smoke와 API/web/catalog rollback script를 구현하고 Attempt/snapshot 수정 명령을 금지한다.
    - _Requirements: 4.12, 13.8, 13.9, 15.21, 15.27, 15.28_

- [~] 24. Final integration checkpoint
  - Task 12~23의 production adapter, live integration, real E2E, infrastructure와 release gate가 모두 통과하면 완료한다. 현재 `pnpm lint`, `pnpm typecheck`, `pnpm test:ci`, `pnpm ui:preview:check`는 통과한다.

## Notes

- 정적 UI 승인 이력과 Task 1~11의 완료 상태는 유지했다. mock UI/E2E는 frontend behavior와 consumer contract 증거이며 production 인증, 영속성, 원자성, 서버 시간 또는 AWS 배포 증거가 아니다.
- live DSQL compatibility spike와 ADR은 완료됐으며 adapter는 DSQL로 선택됐다. 남은 DB 작업은 spike 재실행이 아니라 application migration/repository를 DSQL에 구현하고 동일 contract/concurrency suite를 통과시키는 것이다.
- Correctness Properties 중 P1~P23과 P25는 번호가 있는 테스트를 갖고 P24는 in-memory commit 예제만 있다. P5, P7, P14, P21, P22, P23은 현재 설계의 전체 입력 공간·불변식을 충분히 검증하지 않으며 P24는 독립 property suite 자체가 없어 해당 확장 작업을 부분 완료로 유지했다.
- `apps/api/src/lambda.ts`가 export하는 앱과 Serverless 구성은 현재 public health-only다. protected Hono route 구현은 dependency-injected offline tests에서 동작하지만 production composition 전에는 배포된 기능으로 간주하지 않는다.
- 현재 uncommitted Task 21 작업의 CORS/CSP/security header, rate-limit port, telemetry redaction, infrastructure ownership test와 frontend lazy-loading 변경은 완료 근거로 보존했다. 이후 구현은 이 경계를 교체하지 않고 production adapter와 IaC를 주입한다.
- 모든 남은 leaf task는 코드 작성, 자동화 테스트, build/configuration 또는 deployment automation으로 제한했다.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["12.4", "13.1", "15.6", "18.10", "21.1"] },
    { "id": 1, "tasks": ["12.5", "15.4", "16.5", "20.4", "21.2"] },
    { "id": 2, "tasks": ["12.6", "13.8", "15.7", "20.5", "21.3"] },
    { "id": 3, "tasks": ["15.8", "16.7", "19.3", "20.6", "21.4"] },
    { "id": 4, "tasks": ["19.10", "21.5", "22.1"] },
    { "id": 5, "tasks": ["23.1"] },
    { "id": 6, "tasks": ["23.2"] },
    { "id": 7, "tasks": ["23.3"] },
    { "id": 8, "tasks": ["23.4"] },
    { "id": 9, "tasks": ["23.5"] },
    { "id": 10, "tasks": ["23.6"] }
  ]
}
```
