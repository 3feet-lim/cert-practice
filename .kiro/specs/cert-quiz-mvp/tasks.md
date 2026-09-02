# Implementation Plan: CertQuiz MVP

## Overview

TypeScript 모노레포에서 계약과 순수 도메인 로직을 먼저 확정한 뒤, 실제 Aurora DSQL 호환성 게이트로 저장소를 선택하고 API·웹·인프라를 수직 증분으로 연결한다. 각 구현 단계는 앞 단계의 실행 가능한 계약을 사용하며, 세션·결과·임포트·UI가 고립된 scaffold로 남지 않도록 API와 영속 계층까지 배선한다. 설계의 Correctness Properties 1~25는 각각 하나의 독립 `fast-check` property test 작업으로 추적한다.

## Tasks

- [ ] 1. TypeScript 모노레포와 공통 품질 게이트 구성
  - [ ] 1.1 pnpm workspace와 배포 단위별 프로젝트 구조를 생성한다
    - `apps/web`, `apps/api`, `packages/contracts`, `packages/domain`, `packages/db`, `infra/terraform`, `infra/serverless`, `tests/e2e`를 만들고 TypeScript project reference와 의존 방향을 강제한다.
    - 루트 명령으로 build, typecheck, lint, unit, property, component, integration, e2e를 단일 실행 모드로 호출할 수 있게 한다.
    - _Requirements: 16.1, 16.2_
  - [ ] 1.2 재현 가능한 lint·format·test·build 설정을 추가한다
    - Vitest, fast-check, React Testing Library, Playwright와 coverage 구성을 분리하고 watch가 아닌 CI 단일 실행 명령을 제공한다.
    - domain 패키지가 React, Hono, AWS SDK, SQL driver를 import하지 못하도록 lint boundary를 설정한다.
    - _Requirements: 16.1, 16.2, 16.8, 16.9_
  - [ ] 1.3 최소 React SPA와 Hono Lambda를 shared health contract로 연결한다
    - API 성공/오류 envelope를 사용하는 health route와 이를 조회하는 웹 진입 화면을 구현해 workspace, 번들, 타입 공유가 실제로 동작하도록 한다.
    - 임시 scaffold가 후속 앱과 분리되지 않도록 최종 composition root와 router에 직접 배선한다.
    - _Requirements: 16.1, 16.2, 16.4_

- [ ] 2. Aurora DSQL compatibility spike와 데이터베이스 선택 게이트 구현
  - [ ] 2.1 실제 DSQL에서 실행 가능한 connector·migration·query spike를 작성한다
    - Node.js DSQL connector의 IAM token/TLS/pool freeze-thaw, UUID, `timestamptz`, exact score 정수쌍, JSON 후보 타입, index, 제약, migration checksum을 검사하는 CLI를 구현한다.
    - history, leaderboard, cleanup query의 plan과 p95 500ms 게이트를 machine-readable 결과로 출력한다.
    - _Requirements: 3.1-3.5, 9.4-9.7, 12.5-12.8, 13.10-13.13_
  - [ ] 2.2 핵심 원자성과 동시성 probe를 spike에 추가한다
    - 동시 profile get-or-create, active practice slot, practice replace, manual/expired finalize, import head switch를 barrier와 fault injection으로 실행한다.
    - 중복 profile/session/Attempt, partial snapshot, mixed catalog revision이 관찰되면 gate를 실패시킨다.
    - _Requirements: 1.5, 1.6, 1.14, 4.10, 7.4, 7.8, 7.9, 11.6-11.10, 15.21, 15.27_
  - [ ] 2.3 spike 결과로 DSQL 또는 Aurora Serverless v2 adapter를 선택하도록 구성한다
    - 통과 시 DSQL adapter, 실패 시 PostgreSQL adapter를 선택하는 명시적 runtime/build 설정을 구현하고 동일 repository contract를 유지한다.
    - 측정 결과와 실패 gate에서 선택 근거를 생성하는 ADR 산출 단계를 spike 명령에 연결한다.
    - _Requirements: 1.6, 4.10-4.12, 11.8-11.10, 15.27, 15.28_

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Shared contracts와 순수 domain primitive 구현
  - [ ] 4.1 exact `Fraction`과 점수 계산 primitive를 구현한다
    - bigint 기약분수, 사칙연산, cross multiplication 비교, decimal parsing, 둘째 자리 half-up 표시, Reference_1000 half-up을 구현한다.
    - binary floating point와 중간 반올림이 판정·정렬 source of truth에 들어가지 않게 한다.
    - _Requirements: 9.1, 9.2, 12.1-12.12, 12.14_
  - [ ] 4.2 `Clock`, `RandomSource`, UUID, canonical 시간 primitive를 구현한다
    - 주입 가능한 UTC clock, `nextInt(maxExclusive)` RNG port, crypto rejection-sampling adapter와 deterministic fake를 제공한다.
    - 만료·보관 경계를 반개구간으로 표현하는 helper를 추가한다.
    - _Requirements: 4.6, 4.7, 9.4-9.7, 10.1-10.3, 10.6, 10.9_
  - [ ] 4.3 domain error와 안전한 HTTP envelope를 구현한다
    - 인증, 승인, 소유권, stale version, 만료, validation, retryable dependency 오류를 discriminated union으로 정의한다.
    - 중앙 error mapper가 allowlist details와 request ID만 노출하게 한다.
    - _Requirements: 1.2, 1.3, 1.8, 1.12, 2.4, 16.3-16.7_
  - [ ] 4.4 Zod 기반 API 계약과 strict question projection을 구현한다
    - practice-unsubmitted, practice-submitted, exam-active, review DTO를 서로 다른 타입과 `.strict()` schema로 정의한다.
    - decimal string, UUID, UTC timestamp, state version, 성공/오류 envelope를 공유 계약으로 만든다.
    - _Requirements: 5.6-5.8, 8.8-8.10, 10.7, 13.1-13.3_
  - [ ]* 4.5 exact 채점 의미 property test를 작성한다
    - **Property 19: exact 채점 의미**
    - 유효한 집합과 scoring mode를 생성해 all-or-nothing, partial, 합계, 정답률, 합격, Reference_1000을 독립 oracle과 비교한다.
    - **Validates: Requirements 12.1-12.8**
  - [ ]* 4.6 표시값·판정값 분리와 설정 오류 property test를 작성한다
    - **Property 20: 표시값과 판정값의 분리 및 설정 오류 비원자성 방지**
    - 표시 반올림이 exact 비교를 바꾸지 않고 잘못된 mode/threshold/choice 설정에서 결과가 확정되지 않음을 검증한다.
    - **Validates: Requirements 12.9-12.17**

- [ ] 5. Migration과 repository contract 구현
  - [ ] 5.1 identity, revisioned catalog, import validation migration을 구현한다
    - user uniqueness, active revision head, import token digest/actor/TTL/status, exact threshold 분자·분모와 필요한 index·제약을 versioned SQL로 만든다.
    - 선택 DB adapter에서 migration checksum과 schema version fail-fast를 구현한다.
    - _Requirements: 1.5, 1.6, 2.5, 3.1-3.5, 14.1, 15.20-15.27_
  - [ ] 5.2 practice session, snapshot, completed result migration을 구현한다
    - 사용자+자격증 active slot uniqueness, optimistic version, immutable snapshot, session당 단일 completed result, exact score와 168시간 index를 구성한다.
    - _Requirements: 4.10-4.12, 7.1-7.4, 7.8-7.12, 8.11, 8.12, 9.1-9.7_
  - [ ] 5.3 exam session, Attempt, immutable item migration을 구현한다
    - start idempotency key, state version, `attempt.exam_session_id` uniqueness, cutoff timestamps, exact score와 이력/리더보드 index를 구성한다.
    - _Requirements: 10.1, 10.2, 10.10-10.12, 11.4-11.10, 13.4-13.9, 14.7-14.12_
  - [ ] 5.4 repository ports, UnitOfWork와 DSQL/PostgreSQL adapter를 배선한다
    - owner-scoped aggregate methods, conditional update, short transaction, retry policy, startup schema assertion을 구현한다.
    - route가 SQL primitive나 DB row를 직접 조합하지 못하게 한다.
    - _Requirements: 1.12, 4.10-4.12, 7.8-7.12, 10.9-10.12, 11.8-11.10, 15.27_
  - [ ]* 5.5 공통 repository contract suite를 작성한다
    - in-memory fake와 선택된 실제 DB adapter에 같은 aggregate contract를 실행해 owner scoping, exact value, ordering, rollback을 검증한다.
    - _Requirements: 1.12, 7.4, 11.8, 13.8-13.14, 15.27_
  - [ ]* 5.6 repository concurrency와 fault-injection suite를 작성한다
    - barrier로 profile singleton, active practice slot, first submit, finalize, import switch를 충돌시키고 각 write 지점 실패 시 rollback을 검증한다.
    - _Requirements: 1.6, 1.14, 4.10, 7.9, 8.11, 11.6-11.10, 15.27_

- [ ] 6. Cognito 인증, 승인, 관리자·소유권 경계 구현
  - [ ] 6.1 Cognito token verifier와 Google identity extractor middleware를 구현한다
    - signature, issuer, audience/client, expiry, token use를 검증하고 Google provider subject만 정규화한다.
    - JWT와 전체 claim을 로그에 남기지 않고 identity 오류에서는 profile mutation 전에 종료한다.
    - _Requirements: 1.1-1.4, 1.13_
  - [ ] 6.2 원자적 profile get-or-create와 승인 상태 조회를 구현한다
    - `google_sub` conflict 재조회로 단일 pending/user/private profile을 만들고 `/v1/me/approval`만 pending에 허용한다.
    - 생성 실패 시 모든 보호 상태를 유지한다.
    - _Requirements: 1.4-1.8, 1.13, 1.14, 14.1_
  - [ ] 6.3 approval, admin, ownership middleware와 관리자 사용자 API를 구현한다
    - approved/user/admin route matrix, owner predicate, pending 목록, idempotent approve와 atomic failure 처리를 구현한다.
    - 권한 오류에서 존재 여부와 보호 데이터를 노출하지 않는다.
    - _Requirements: 1.9-1.12, 1.15, 2.1-2.6_
  - [ ] 6.4 본인 profile과 점수 공개 설정 API를 구현한다
    - approved 사용자만 visibility를 변경하고 pending 요청은 profile을 변경하지 않게 한다.
    - _Requirements: 1.11, 14.1-14.3_
  - [ ]* 6.5 외부 신원·신규 profile property test를 작성한다
    - **Property 1: 외부 신원과 신규 프로필 불변식**
    - 동시 로그인, 이메일 변화, transaction 실패를 model과 비교한다.
    - **Validates: Requirements 1.4-1.6, 1.13, 1.14, 14.1**
  - [ ]* 6.6 인증·인가 비간섭 property test를 작성한다
    - **Property 2: 인증·인가 실패의 비간섭성과 역할 경계**
    - 임의 token/role/owner 요청에서 허용 행렬과 거부 전후 aggregate 동일성·오류 redaction을 검증한다.
    - **Validates: Requirements 1.1-1.3, 1.7, 1.8, 1.11, 1.12, 2.1-2.4**
  - [ ]* 6.7 승인 전이·pending 목록 property test를 작성한다
    - **Property 3: 승인 전이와 pending 목록의 결정성**
    - 목록 유일성, 빈 목록, approve replay와 rollback을 검증한다.
    - **Validates: Requirements 1.9, 1.10, 1.15, 2.5, 2.6**
  - [ ]* 6.8 Cognito와 인증 route integration test를 작성한다
    - 유효/만료/wrong issuer/wrong audience/missing Google identity fixture와 IDOR·role bypass를 검증한다.
    - _Requirements: 1.1-1.15, 2.1-2.6_

- [ ] 7. Revisioned certification catalog 구현
  - [ ] 7.1 active revision 기반 catalog validator와 repository query를 구현한다
    - Provider→Certification→Domain→Question 관계, 설정·weight·pool 충분성, invalid item 원인 수집을 구현한다.
    - DOP-C02 75문항, 180분, 75%, 도메인 비율 fixture를 seed/import 가능한 데이터로 제공한다.
    - _Requirements: 3.1-3.5, 3.9-3.11_
  - [ ] 7.2 approved catalog API를 Provider별 projection에 연결한다
    - 유효하고 출제 가능한 Certification만 그룹화하고 invalid certification은 노출하지 않으며 안전한 데이터 오류를 제공한다.
    - 모든 생성 source가 선택 certification의 active revision 관계 안에 있도록 한다.
    - _Requirements: 3.6-3.8, 3.10, 3.11_
  - [ ]* 7.3 catalog 관계·노출 property test를 작성한다
    - **Property 4: 카탈로그 관계 폐쇄성과 노출 안전성**
    - 임의 revision에서 관계·설정·weight·pool oracle과 노출 결과 및 모든 부족 domain 오류를 비교한다.
    - **Validates: Requirements 3.1-3.8, 3.10, 3.11**

- [ ] 8. JSON import dry-run과 atomic revision commit 구현
  - [ ] 8.1 byte-limit parser와 구조/schema validation pipeline을 구현한다
    - 10 MiB를 parsing 전에 검사하고 JSON syntax 위치, depth 20, Question 10,000, Choice 20, 필수 필드·타입 오류를 가능한 범위에서 누적한다.
    - _Requirements: 15.1-15.3, 15.15-15.17_
  - [ ] 8.2 semantic validator와 summary 계산을 구현한다
    - weight exact 합, 관계, 중복 ID, 정답 부분집합, 선택 수, 영어 필드, 번역 상태, domain/전체 pool 크기를 검증한다.
    - 계산 가능한 전체/domain/translation/error summary를 유지하고 불가능한 값만 unavailable로 표시한다.
    - _Requirements: 15.4-15.14, 15.17-15.19_
  - [ ] 8.3 RFC 8785 원칙의 canonical JSON, SHA-256와 commit token을 구현한다
    - object key/공백/동등 숫자 차이는 같은 hash, 배열 순서는 다른 hash가 되게 하고 256-bit token은 digest만 저장한다.
    - actor binding, constant-time hash 비교, `[createdAt, createdAt+15m)` TTL, single-use 상태를 구현한다.
    - _Requirements: 15.20, 15.22-15.26_
  - [ ] 8.4 staging revision insert와 active head atomic switch를 구현한다
    - transaction 직전 source/head와 row count를 재검증하고 revision 전체 insert, head 전환, token consume을 한 transaction으로 처리한다.
    - 실패 시 head/token을 복원하고 기존 Attempt/snapshot을 변경하지 않는다.
    - _Requirements: 15.21, 15.27, 15.28_
  - [ ] 8.5 관리자 dry-run/commit API를 구현한다
    - admin middleware, safe error list/summary, 동일 JSON+token commit을 contracts와 repository에 연결하고 원문·정답·token 로그를 차단한다.
    - _Requirements: 2.2-2.4, 15.1-15.28, 16.4-16.7_
  - [ ]* 8.6 import dry-run property test를 작성한다
    - **Property 23: Import dry-run 순수성, 제한과 오류 완전성**
    - 임의 byte/구조/semantic 오류에서 active catalog 비변경, 제한 선행, 독립 오류·summary 완전성을 oracle과 비교한다.
    - **Validates: Requirements 15.1-15.19**
  - [ ]* 8.7 검증본 결합·catalog 교체 property test를 작성한다
    - **Property 24: 검증본 결합과 atomic catalog 교체**
    - actor/content/TTL/use/failure 조합에서 전체 revision과 consumed 상태가 함께 commit되거나 함께 rollback되는지 검증한다.
    - **Validates: Requirements 15.20-15.28**
  - [ ]* 8.8 canonicalization·token·fault integration test를 작성한다
    - key order/공백/숫자 표기 동치, domain 배열 순서 차이, 만료 경계, 다른 admin, replay, 각 insert/head/consume 실패 지점을 검증한다.
    - _Requirements: 15.20-15.28_

- [ ] 9. Domain allocation, sampling, snapshot, projection 구현
  - [ ] 9.1 largest-remainder allocator를 exact arithmetic으로 구현한다
    - floor 후 remainder 내림차순·import order 오름차순으로 잔여 문항을 배정하고 합을 회차 문항 수와 일치시킨다.
    - practice와 exam이 같은 allocator를 사용하게 한다.
    - _Requirements: 4.1-4.4, 4.8_
  - [ ] 9.2 unbiased question sampling과 전체 shuffle을 구현한다
    - domain별 partial Fisher–Yates와 전체 Fisher–Yates를 주입된 rejection-sampling RNG에 연결한다.
    - 중복 없는 정확한 allocation과 고정 choice/display order를 만든다.
    - _Requirements: 4.5-4.7_
  - [ ] 9.3 SessionFactory와 immutable snapshot transaction을 구현한다
    - 모든 부족 domain을 선검사하고 선택·shuffle·snapshot/session 저장을 원자적으로 수행한다.
    - bilingual content, 정답, 해설, domain, certification scoring metadata를 원본 revision과 분리해 저장한다.
    - _Requirements: 3.7, 4.9-4.12, 7.3, 10.5_
  - [ ] 9.4 mode/reveal 상태별 strict SnapshotProjector를 구현한다
    - active exam과 미제출 practice JSON에는 정답·정오답·점수·해설 필드 자체가 없고 제출/review에서만 allowlist로 추가한다.
    - route가 snapshot row를 직접 serialize하지 못하게 projection schema validation을 response 직전에 적용한다.
    - _Requirements: 8.8-8.10, 10.7, 13.3, 16.4_
  - [ ]* 9.5 domain allocation property test를 작성한다
    - **Property 5: largest-remainder 배정 정확성**
    - 임의 양수 weight와 문항 수에서 floor/floor+1, 합, remainder/import-order 수혜 domain을 검증한다.
    - **Validates: Requirements 4.1-4.4, 4.8**
  - [ ]* 9.6 uniform sampling·permutation property test를 작성한다
    - **Property 6: 중복 없는 균등 추출과 순열**
    - 작은 pool의 모든 deterministic RNG outcome을 전수 열거해 subset과 전체 순열 multiplicity가 같음을 검증한다.
    - **Validates: Requirements 4.5-4.7**
  - [ ]* 9.7 session 생성 원자성·snapshot property test를 작성한다
    - **Property 7: 회차 생성의 all-or-nothing과 snapshot 불변성**
    - 부족 pool과 각 실패 지점에서 row 수 비변경, 성공 후 원본 revision 변경에도 snapshot 동일성을 검증한다.
    - **Validates: Requirements 4.9-4.12**
  - [ ]* 9.8 strict projection leak contract test를 작성한다
    - active practice/exam DTO와 실제 JSON에 forbidden field가 없고 주입 시 `.strict()`가 응답을 폐기하는지 검증한다.
    - _Requirements: 8.8-8.10, 10.7, 16.4_

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Practice session, result, retention 수직 기능 구현
  - [ ] 11.1 start/resume/replace lifecycle을 구현한다
    - active가 없으면 version 0 session을 만들고 있으면 선택 전 비변경 응답, resume round-trip, 확인 nonce 기반 atomic replace를 구현한다.
    - _Requirements: 7.1-7.9_
  - [ ] 11.2 answer draft, flag, position의 versioned state mutation을 구현한다
    - owner와 question membership을 검증하고 expectedVersion 일치 시 한 번 증가시키며 저장 실패/stale에서는 기존 상태와 최신 ID/version을 반환한다.
    - _Requirements: 6.7-6.12, 7.10-7.12_
  - [ ] 11.3 최초 question submit 잠금과 exact scoring을 구현한다
    - choice 소속·정확한 선택 수를 검증하고 최초 final answer/score를 잠그며 동일 집합 replay와 다른 집합 conflict를 구분한다.
    - _Requirements: 8.1-8.7, 12.1-12.8, 12.13-12.17_
  - [ ] 11.4 마지막 제출과 Completed_Practice_Result 생성을 원자적으로 구현한다
    - session 완료, 단일 result/items, 전체·domain exact score, immutable review snapshot을 함께 저장하고 replay에 기존 result를 반환한다.
    - _Requirements: 8.8-8.12, 9.1-9.3_
  - [ ] 11.5 168시간 visibility와 idempotent retention cleanup을 구현한다
    - `[completedAt, completedAt+168h)` owner 조회, 경계 이후 inline conditional delete와 만료 응답, EventBridge용 batch cleanup command를 구현한다.
    - _Requirements: 9.4-9.7_
  - [ ] 11.6 practice API routes와 안전한 projections를 연결한다
    - start/resume/replace/state/submit/result endpoints를 shared contract, owner repository, projector에 배선한다.
    - duplicate submit pending과 retry metadata가 서버 응답에서 일관되게 제공되게 한다.
    - _Requirements: 6.7-6.16, 7.1-7.12, 8.1-8.12, 9.1-9.7, 16.6-16.9_
  - [ ]* 11.7 practice lifecycle property test를 작성한다
    - **Property 11: 활성 연습 세션 단일성과 재개·상태 저장 round-trip**
    - 임의 start/resume/replace/save 순서를 model과 비교해 단일 active, atomic replace, version 동작을 검증한다.
    - **Validates: Requirements 7.1-7.12**
  - [ ]* 11.8 최초 제출 잠금 property test를 작성한다
    - **Property 12: 연습 최초 제출 잠금 상태 머신**
    - 임의 선택 집합과 replay에서 유효 최초 제출만 commit되고 다른 요청은 locked state를 바꾸지 않음을 검증한다.
    - **Validates: Requirements 8.1-8.7**
  - [ ]* 11.9 공개 격리·단일 완료 property test를 작성한다
    - **Property 13: 연습 공개 격리와 단일 완료 결과**
    - question별 reveal 조건과 마지막 동시 제출에서 result가 정확히 하나임을 검증한다.
    - **Validates: Requirements 8.8-8.12**
  - [ ]* 11.10 168시간·연습 통계 격리 property test를 작성한다
    - **Property 14: 168시간 반개구간과 연습 결과 격리**
    - 경계 전/정확한 경계/이후 visibility와 cleanup 지연을 검증하고 practice result 변화가 Attempt 기반 분석에 영향을 주지 않음을 검증한다.
    - **Validates: Requirements 9.1-9.11**

- [ ] 12. Exam timer, lazy expiration, idempotent finalize 수직 기능 구현
  - [ ] 12.1 idempotent exam start와 server-clock state mutation을 구현한다
    - request 수신 시각으로 startedAt/expiresAt을 저장하고 `(userId, Idempotency-Key)` replay에 같은 session을 반환한다.
    - `remaining=max(0,floor(expiresAt-now))`와 만료 전 versioned save, 경계 이후 mutation 거부를 구현한다.
    - _Requirements: 10.1-10.3, 10.6, 10.8-10.12_
  - [ ] 12.2 exam restore와 submission preview를 구현한다
    - snapshot/choice order/answer/flag/index/version/remaining을 복원하고 실패 시 대체 세션을 만들지 않는다.
    - 서버 저장 상태의 unanswered/flagged count만 preview에 제공하고 active projection에서 답을 제거한다.
    - _Requirements: 10.4, 10.5, 10.7, 10.13_
  - [ ] 12.3 모든 인증 요청에 OwnedExpiredExamFinalizer를 배선한다
    - authentication/user 식별 직후 approval·role·정상 handler 전에 소유자의 만료 미제출 세션을 `(expiresAt,id)` 순서로 처리한다.
    - 하나가 실패하면 이전 commit을 유지하고 이후 finalize와 원 요청을 중단하며 실패 session ID만 안전하게 반환한다.
    - _Requirements: 11.2, 11.3, 11.11, 11.12_
  - [ ] 12.4 cutoff 기반 `finalizeOnce`와 immutable Attempt 생성을 구현한다
    - manual은 request 수신 전 commit된 최신 응답, expired는 `savedAt<=expiresAt`만 채점하고 미응답은 0점으로 처리한다.
    - Attempt/items와 session submitted를 한 transaction으로 commit하고 unique conflict/replay에는 같은 Attempt를 반환한다.
    - _Requirements: 11.1, 11.4-11.10, 12.1-12.17, 13.4-13.7_
  - [ ] 12.5 exam start/get/state/preview/submit API를 연결한다
    - lazy finalizer, shared contracts, owner repository, strict projector, result redirect를 Hono route pipeline에 배선한다.
    - _Requirements: 10.1-10.13, 11.1-11.12, 16.6-16.9_
  - [ ]* 12.6 exam 시간 함수 property test를 작성한다
    - **Property 15: 서버 시계 기반 exam 시간 함수**
    - 임의 시작/제한/조회 시각과 replay·재접속에서 timestamps/remaining 불변식 및 만료 경계 mutation 차단을 검증한다.
    - **Validates: Requirements 10.1-10.3, 10.6, 10.8, 10.9**
  - [ ]* 12.7 exam 저장·복원 property test를 작성한다
    - **Property 16: Exam 저장·복원의 versioned round-trip과 비공개 projection**
    - 저장 성공/실패/stale/복원 실패와 preview count를 model과 비교하고 forbidden field 부재를 검증한다.
    - **Validates: Requirements 10.4, 10.5, 10.7, 10.10-10.13**
  - [ ]* 12.8 lazy expiration·cutoff property test를 작성한다
    - **Property 17: lazy expiration, 순차 실패와 채점 cutoff**
    - 임의 세션/요청 시퀀스에서 시간 경과만으로 Attempt가 생기지 않고 정렬·cutoff·중단 규칙이 유지됨을 검증한다.
    - **Validates: Requirements 11.1-11.5, 11.11, 11.12**
  - [ ]* 12.9 concurrent finalize property test를 작성한다
    - **Property 18: 동시 finalize의 선형 가능 멱등성**
    - manual/expired/retry interleaving model에서 단일 Attempt·동일 결과 또는 완전 rollback만 관찰됨을 검증한다.
    - **Validates: Requirements 11.6-11.10**
  - [ ]* 12.10 all-owner-route lazy expiration concurrency integration test를 작성한다
    - `/me`, catalog, practice, exam, history, leaderboard, admin 허용 route별로 만료 finalize가 원 handler보다 먼저 실행되는지 검증한다.
    - barrier로 manual/expired 충돌과 중간 실패를 만들고 committed prefix 보존, 이후 route 미실행, retry 결과를 검증한다.
    - _Requirements: 11.1-11.12_

- [ ] 13. Immutable result, history, leaderboard 구현
  - [ ] 13.1 Attempt detail, history와 trend query를 구현한다
    - 원본 catalog join 없이 snapshot result를 제공하고 owner Attempt만 `(submittedAt DESC,id ASC)`, trend는 `(submittedAt ASC,id ASC)`로 반환한다.
    - 빈 사용자에게 빈 이력·추이와 certification별 count 0을 제공한다.
    - _Requirements: 13.1-13.14_
  - [ ] 13.2 score visibility 기반 exact leaderboard를 구현한다
    - approved/public/Attempt 보유자만 후보로 만들고 대표를 exact accuracy DESC, submittedAt ASC, attemptId ASC로 선택한다.
    - standard competition rank와 동률 출력 순서, current marker, 빈 leaderboard를 구현한다.
    - _Requirements: 9.10, 9.11, 12.12, 14.4-14.15_
  - [ ] 13.3 result/history/trend/leaderboard API를 shared contracts에 연결한다
    - owner와 privacy projection을 적용하고 email, Google_Sub, 비공개 사용자 존재를 반환하지 않는다.
    - _Requirements: 1.12, 13.1-13.14, 14.4-14.15, 16.3-16.7_
  - [ ]* 13.4 Attempt 불변성·이력 property test를 작성한다
    - **Property 21: Attempt 불변성과 이력 정렬**
    - 임의 catalog 교체와 동률 시각에서 snapshot 불변성, owner filtering, 이력·추이 순서와 빈 상태를 검증한다.
    - **Validates: Requirements 13.1-13.14**
  - [ ]* 13.5 leaderboard property test를 작성한다
    - **Property 22: 리더보드 후보·대표·동률 규칙**
    - 임의 profile/Attempt 집합에서 후보, 대표, exact rank, 출력 tie-break, marker를 독립 oracle과 비교한다.
    - **Validates: Requirements 14.2-14.15**
  - [ ]* 13.6 history·leaderboard repository integration test를 작성한다
    - exact 값은 다르지만 2자리 표시가 같은 Attempt, 같은 제출 시각, visibility toggle, practice result 혼입을 검증한다.
    - _Requirements: 9.8-9.11, 12.12, 13.8-13.14, 14.4-14.15_

- [ ] 14. React application foundation과 비동기 상태 모델 구현
  - [ ] 14.1 React Router route hierarchy와 auth/pending/approved/admin layout을 구현한다
    - `/login`, callback, `/pending`, `/app` 아래 S2~S10 route를 만들고 내부 allowlist return URL만 복원한다.
    - route guard는 UX로만 사용하고 API 권한 오류를 canonical 상태로 처리한다.
    - _Requirements: 1.7, 1.8, 1.11, 2.1-2.4_
  - [ ] 14.2 TanStack Query API client와 Zustand quiz transient store를 구현한다
    - query별 독립 loading/error, canonical mutation response reconciliation, logout cache purge, flag rollback, submit duplicate lock을 구현한다.
    - _Requirements: 5.5, 6.9, 6.12, 16.1, 16.2, 16.5, 16.8, 16.9_
  - [ ] 14.3 Tailwind/shadcn shell, AsyncBoundary와 safe Markdown renderer를 구현한다
    - 라이트 데스크톱 UI, loading/empty/error/retry/next-action, raw HTML escape, Safe_URL allowlist, image 실패 대체 상태를 공통 컴포넌트로 제공한다.
    - _Requirements: 5.9-5.12, 16.1-16.7_
  - [ ]* 14.4 비동기 UI 요청 상태 property test를 작성한다
    - **Property 25: 비동기 UI 요청 상태 머신**
    - 임의 성공/retryable/non-retryable/중복 제출 시퀀스에서 독립 loading, 입력 보존, 단일 action/result로 수렴함을 검증한다.
    - **Validates: Requirements 16.1-16.9**

- [ ] 15. 로그인, pending, catalog, mode select, admin 화면 구현
  - [ ] 15.1 S1 로그인/callback과 승인 대기 화면을 구현한다
    - Cognito code+PKCE redirect, token 없는 안전한 callback 오류, `/me/approval` 새로고침과 approved 전환을 구현한다.
    - _Requirements: 1.1-1.8, 16.1-16.7_
  - [ ] 15.2 S2 홈과 S3 mode select를 구현한다
    - Provider grouping, certification metadata, catalog empty/error, active practice resume/replace와 명시적 exam 시작 확인을 API에 연결한다.
    - _Requirements: 3.6-3.9, 7.5-7.9, 10.1, 16.3-16.7_
  - [ ] 15.3 관리자 pending 사용자 화면을 구현한다
    - 정확한 사용자 필드, 빈 상태, 개별 approve pending lock, idempotent 결과를 표시한다.
    - _Requirements: 1.9, 1.10, 2.5, 2.6, 16.1-16.9_
  - [ ] 15.4 S10 import 화면을 구현한다
    - 10 MiB JSON 선택, dry-run summary/error, 계산 불가 표시, memory-only token, content 변경 재검증과 commit 확인을 구현한다.
    - _Requirements: 15.1-15.27, 16.1-16.9_
  - [ ]* 15.5 auth/catalog/admin component test를 작성한다
    - pending route 제한, catalog 빈/오류, resume/replace 선택 전 비변경, approve replay, import 입력 보존과 token 재사용 오류를 검증한다.
    - _Requirements: 1.7-1.10, 2.5, 2.6, 3.6, 7.5-7.9, 15.18-15.26, 16.1-16.9_

- [ ] 16. 공통 quiz presenter와 S4/S5 화면 구현
  - [ ] 16.1 QuestionPresenter, navigator, language, Markdown UI를 구현한다
    - required count에 따른 radio/checkbox와 선택 상한, 선택 수, 번호/domain, `1..N` navigator, 경계 이동, 응답/flag 상태를 구현한다.
    - en/ko 전체 전환, en_only fallback, 공개 상태 보존, safe Markdown/image 실패를 처리한다.
    - _Requirements: 5.1-5.13, 6.1-6.6, 6.13-6.16_
  - [ ] 16.2 S4 PracticePage를 구현한다
    - resume canonical state, draft 저장, optimistic flag rollback, 최초 제출 pending lock, 제출 후에만 feedback/reveal, 완료 후 S6 이동을 구현한다.
    - _Requirements: 6.7, 6.9, 6.10, 6.12, 7.7, 7.10-7.12, 8.1-8.12, 16.5-16.9_
  - [ ] 16.3 S5 ExamPage와 ServerTimer를 구현한다
    - serverNow/expiresAt offset과 monotonic display timer, restore, preview dialog, unanswered/flag count, finalize/result 전환을 구현한다.
    - 0초에서 client 점수를 만들지 않고 server request로 lazy finalize 결과를 조회한다.
    - _Requirements: 10.3-10.13, 11.1-11.12, 16.5-16.9_
  - [ ]* 16.4 문제 입력·언어 상태 property test를 작성한다
    - **Property 8: 문제 입력 종류와 언어 전환의 상태 보존**
    - 임의 presenter state에서 선택 상한, 언어별 일관 콘텐츠, en_only fallback과 위치/선택/flag/reveal 보존을 검증한다.
    - **Validates: Requirements 5.1-5.8**
  - [ ]* 16.5 탐색 경계·상태 분류 property test를 작성한다
    - **Property 9: 문항 탐색 경계와 상태 분류**
    - 임의 N/index/응답/flag에서 navigator 완전성, 이동 경계, current/answered/flag 분류를 검증한다.
    - **Validates: Requirements 6.1-6.6, 6.13-6.16**
  - [ ]* 16.6 Flag version commit/rollback property test를 작성한다
    - **Property 10: Flag 저장의 versioned commit/rollback**
    - practice/exam 성공, stale, 저장 실패에서 DB canonical state와 UI optimistic state의 증가·복원을 검증한다.
    - **Validates: Requirements 6.7-6.12**
  - [ ]* 16.7 quiz component와 projection leak test를 작성한다
    - radio/checkbox 접근성, Markdown XSS/Safe_URL/image failure, practice reveal timing, exam DOM/serialized props의 정답 부재, duplicate submit lock을 검증한다.
    - _Requirements: 5.1-5.13, 8.8-8.10, 10.7, 16.8, 16.9_

- [ ] 17. S6~S9 결과, 이력, 리더보드 화면 구현
  - [ ] 17.1 S6 practice result와 S7 exam result를 구현한다
    - Raw_Score/Accuracy_Rate를 우선 표시하고 domain/question review, pass badge, 참고 Reference_1000, 168시간 만료 상태를 구현한다.
    - _Requirements: 9.1-9.7, 12.9-12.11, 13.1-13.3_
  - [ ] 17.2 S8 history와 score visibility를 구현한다
    - Attempt-only count/table/trend, 같은 시각의 안정적 순서, 빈 상태와 visibility 저장 실패 rollback을 구현한다.
    - _Requirements: 9.8, 9.9, 13.10-13.14, 14.2, 14.3, 16.3-16.7_
  - [ ] 17.3 S9 certification leaderboard를 구현한다
    - 서버 rank, exact 대표 성과의 표시값, 공동 순위, current marker, 비공개/빈 상태를 렌더링한다.
    - _Requirements: 9.10, 9.11, 14.4-14.15, 16.3-16.7_
  - [ ]* 17.4 result/history/leaderboard component test를 작성한다
    - exact-vs-display 구분, 168시간 만료, immutable review, 빈 이력/count 0, 공동 순위/current marker/privacy를 검증한다.
    - _Requirements: 9.1-9.11, 12.9-12.12, 13.1-13.14, 14.4-14.15_

- [ ] 18. IaC, observability, 운영 보안 구현
  - [ ] 18.1 Terraform 기반 인프라를 구현한다
    - Cognito+Google IdP, 선택 DB, S3/CloudFront, IAM role, SSM namespace, log retention, backup/PITR와 stage isolation을 코드화한다.
    - Terraform과 Serverless 소유 리소스가 겹치지 않게 output/SSM 계약을 만든다.
    - _Requirements: 1.1, 1.13, 9.6, 15.28, 16.4_
  - [ ] 18.2 Serverless Framework 배포 구성을 구현한다
    - 단일 Hono Lambda, API Gateway JWT authorizer/routes, practice cleanup EventBridge mapping과 SSM dynamic reference를 연결한다.
    - background job은 practice 물리 cleanup만 수행하고 exam Attempt를 만들지 않게 한다.
    - _Requirements: 9.6, 9.7, 11.2, 11.3_
  - [ ] 18.3 IAM, CORS, CSP, rate limit와 web 보안 header를 구현한다
    - 최소 DB/SSM/log 권한, prod SPA 단일 origin, HSTS, no-sniff, no-referrer, frame deny, Markdown origin 정책을 적용한다.
    - login/start/submit/admin import에 사용자/IP 기반 제한과 안전한 429를 제공한다.
    - _Requirements: 1.1-1.3, 2.4, 5.10, 5.11, 16.4, 16.6_
  - [ ] 18.4 structured telemetry와 alarm/runbook automation을 구현한다
    - request/DB/finalize/cleanup/import/projection metric과 JSON log redaction을 추가하고 request ID 상관관계를 연결한다.
    - token, email, Google_Sub, answers, explanations, import payload, SQL bind를 로그·trace에서 제거한다.
    - _Requirements: 1.2, 1.12, 11.12, 15.23, 16.4_
  - [ ]* 18.5 인프라·보안 자동화 test를 작성한다
    - Terraform/Serverless ownership lint, IAM policy assertion, CORS/CSP, log redaction, oversized import, owner IDOR, rate-limit 응답을 검증한다.
    - _Requirements: 1.12, 2.4, 5.10, 5.11, 15.15, 16.4, 16.6_

- [ ] 19. Integration, E2E, CI/CD와 release gate 완성
  - [ ] 19.1 통합 test harness와 결정적 fixture를 구현한다
    - DOP-C02 catalog, Cognito claim, seeded RNG, fake Clock, barrier/fault injector, DB reset/migration fixture를 실제 contracts에 연결한다.
    - _Requirements: 3.9, 4.1-4.12, 10.1-10.13, 12.1-12.17_
  - [ ]* 19.2 API·DB integration suite를 작성한다
    - 인증/승인, import switch, generation rollback, practice 168h 경계, exact score, all-owner-route lazy expiration, concurrent finalize, immutable history를 실제 선택 DB에서 검증한다.
    - _Requirements: 1.1-2.6, 3.1-4.12, 7.1-15.28_
  - [ ]* 19.3 Playwright S1~S10 E2E suite를 작성한다
    - 로그인 fixture 이후 pending→승인, catalog/mode, practice, exam, 결과, 이력, leaderboard, admin import의 loading/empty/error/retry 흐름을 자동화한다.
    - 정답 공개 시점, duplicate submit, timer reconnect와 privacy를 검증한다.
    - _Requirements: 1.1-16.9_
  - [ ] 19.4 PR·DB adapter·배포 후보 CI gate를 구현한다
    - PR에 lint/typecheck/unit/property/component/contract를, DB 변경에 실제 adapter contract/concurrency를, 후보에 Cognito/API/DB integration과 Playwright smoke를 연결한다.
    - 실패 seed/path, migration checksum, DSQL gate 결과를 artifact로 보존하고 실패 시 배포를 차단한다.
    - _Requirements: 1.6, 4.10, 11.6-11.10, 15.27, 16.1, 16.2_
  - [ ] 19.5 migration·alias·web·catalog release와 rollback automation을 구현한다
    - expand migration, unpublished Lambda smoke, alias switch, versioned web deploy, admin dry-run/commit, post-deploy smoke 순서를 자동화한다.
    - API/web rollback과 active catalog 이전 revision 재활성화 절차를 script로 제공하고 Attempt/snapshot을 수정하지 않는다.
    - _Requirements: 4.12, 13.8, 13.9, 15.21, 15.27, 15.28_

- [ ] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- `*`가 붙은 하위 작업은 선택 가능한 자동화 테스트 작업이며, 더 빠른 MVP 진행 시 건너뛸 수 있다. 핵심 제품 동작, 데이터 무결성, 보안 경계, 인프라와 release gate 구현은 필수 작업이다.
- Correctness Properties 1~25는 각각 정확히 하나의 독립 property-test 작업(4.5, 4.6, 6.5-6.7, 7.3, 8.6-8.7, 9.5-9.7, 11.7-11.10, 12.6-12.9, 13.4-13.5, 14.4, 16.4-16.6)에 연결한다.
- 모든 property test는 TypeScript `fast-check`를 사용하고 기본 `numRuns: 200`과 재현 가능한 seed/path를 기록한다. 각 파일에는 `Feature: cert-quiz-mvp, Property N` 주석을 둔다.
- 선택 test 작업을 실행할 때 property test는 설계 property당 top-level test 하나로 유지하고, repository concurrency/fault-injection 및 실제 DB barrier test는 별도 integration suite에서 보완한다.
- 각 작업은 앞 단계의 실제 contracts, composition root와 repository를 수정해 연결하며, 사용되지 않는 대체 구현이나 고립된 scaffold를 만들지 않는다.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["2.3"] },
    { "id": 5, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 6, "tasks": ["4.4"] },
    { "id": 7, "tasks": ["4.5", "4.6"] },
    { "id": 8, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 9, "tasks": ["5.4"] },
    { "id": 10, "tasks": ["5.5", "5.6"] },
    { "id": 11, "tasks": ["6.1", "6.2"] },
    { "id": 12, "tasks": ["6.3", "6.4"] },
    { "id": 13, "tasks": ["6.5", "6.6", "6.7", "6.8"] },
    { "id": 14, "tasks": ["7.1"] },
    { "id": 15, "tasks": ["7.2", "7.3"] },
    { "id": 16, "tasks": ["8.1", "8.3"] },
    { "id": 17, "tasks": ["8.2"] },
    { "id": 18, "tasks": ["8.4"] },
    { "id": 19, "tasks": ["8.5"] },
    { "id": 20, "tasks": ["8.6", "8.7", "8.8"] },
    { "id": 21, "tasks": ["9.1", "9.2"] },
    { "id": 22, "tasks": ["9.3"] },
    { "id": 23, "tasks": ["9.4"] },
    { "id": 24, "tasks": ["9.5", "9.6", "9.7", "9.8"] },
    { "id": 25, "tasks": ["11.1"] },
    { "id": 26, "tasks": ["11.2"] },
    { "id": 27, "tasks": ["11.3"] },
    { "id": 28, "tasks": ["11.4", "11.5"] },
    { "id": 29, "tasks": ["11.6"] },
    { "id": 30, "tasks": ["11.7", "11.8", "11.9"] },
    { "id": 31, "tasks": ["12.1"] },
    { "id": 32, "tasks": ["12.2", "12.3"] },
    { "id": 33, "tasks": ["12.4"] },
    { "id": 34, "tasks": ["12.5"] },
    { "id": 35, "tasks": ["12.6", "12.7", "12.8", "12.9"] },
    { "id": 36, "tasks": ["12.10"] },
    { "id": 37, "tasks": ["13.1", "13.2"] },
    { "id": 38, "tasks": ["13.3"] },
    { "id": 39, "tasks": ["11.10", "13.4", "13.5", "13.6"] },
    { "id": 40, "tasks": ["14.1", "14.2", "14.3"] },
    { "id": 41, "tasks": ["14.4"] },
    { "id": 42, "tasks": ["15.1", "15.2", "15.3", "15.4"] },
    { "id": 43, "tasks": ["15.5"] },
    { "id": 44, "tasks": ["16.1"] },
    { "id": 45, "tasks": ["16.2", "16.3"] },
    { "id": 46, "tasks": ["16.4", "16.5", "16.6", "16.7"] },
    { "id": 47, "tasks": ["17.1", "17.2", "17.3"] },
    { "id": 48, "tasks": ["17.4"] },
    { "id": 49, "tasks": ["18.1"] },
    { "id": 50, "tasks": ["18.2", "18.3"] },
    { "id": 51, "tasks": ["18.4"] },
    { "id": 52, "tasks": ["18.5"] },
    { "id": 53, "tasks": ["19.1"] },
    { "id": 54, "tasks": ["19.2", "19.3"] },
    { "id": 55, "tasks": ["19.4"] },
    { "id": 56, "tasks": ["19.5"] }
  ]
}
```
