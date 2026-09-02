# 클라우드 자격증 모의고사 웹앱 — 설계 문서

> 이 문서는 대화하면서 계속 업데이트하는 살아있는 문서(living doc)입니다.
> 최종 수정: v0.28

---

## 0. 목적

- 내가 직접 수집·정리한 클라우드 자격증 연습문제를 **모의고사 형식**으로 풀 수 있는 웹페이지.
- 퍼블릭 공개 아님. 지인 한정 가벼운 공유.

---

## 0.1 구현 스코프

### 1차 구현 (MVP): AWS Certified DevOps Engineer – Professional (DOP-C02)

구조는 확장 가능하게 만들되(R11), 첫 릴리스는 **DOP-C02 하나만** 완성한다.

**DOP-C02 공식 스펙** (출처: AWS 공식 exam guide)

| 항목 | 값 |
|------|-----|
| Provider | AWS |
| 자격증 코드 | DOP-C02 |
| 총 문제 수 | 75 (모의고사 기준. 실제 채점 문항은 65, 나머지 10은 미채점 — 앱은 65 or 75 중 택1, 아래 Q11) |
| 제한 시간 | 180분 |
| 합격 점수 | 750 / 1000 (약 75%) |
| 문제 형식 | 단일 정답 + 복수 정답 혼합 |

**도메인 비율 (합 100%)**

| # | 도메인 | 비율 |
|---|--------|------|
| 1 | SDLC Automation | 22% |
| 2 | Configuration Management and IaC | 17% |
| 3 | Security and Compliance | 17% |
| 4 | Resilient Cloud Solutions | 15% |
| 5 | Monitoring and Logging | 15% |
| 6 | Incident and Event Response | 14% |

> 참고: 일부 비공식 사이트가 다른 비율을 표기하나, 위는 AWS 공식 exam guide 기준.

### 향후 확장
- AWS 타 자격증 → 기타 CSP → K8s(CNCF) → Linux Foundation … (R11 원칙에 따라 데이터 추가만으로)

### 1차 스코프에서 제외 (Non-goals)
- 모바일 반응형 / 모바일 전용 화면 — 데스크톱 우선, 모바일은 나중 (Q16)
- 다크모드 — 라이트 모드 단일 (Q25)

---

## 1. 요구사항 (기능 정의)

### 1.1 확정된 요건

| # | 요건 | 비고 |
|---|------|------|
| R1 | Google SSO 로그인 | 사용자 식별용 |
| R2 | 사용자별 점수/이력 기록 | 서버 저장 필요 |
| R3 | 모의고사 생성: 도메인별 비율에 맞춰 랜덤 출제 | 문항 수는 시험마다 다름(자격증별 설정값) |
| R4 | 시도 횟수 기록 | 사용자별 |
| R5 | 시도(회차)별 점수 기록 | 이력 조회 |
| R6 | 문제별 풀이/해설 제공 | 채점 후 확인 |
| R7 | 단일 정답 문제 → 하나만 선택 (라디오) | |
| R8 | 복수 정답 문제 → 여러 개 선택 (체크박스) | "N개 선택" 형태 |
| R9 | **연습 모드**: 문제마다 즉시 정답/해설 확인 + 완료 후 최종 점수 확인 | 학습 초점 |
| R10 | **모의고사 모드**: 전체 출제 → 제출까지 정답 비공개 → 제출 후 점수+풀이 | R3~R6가 여기 해당 |
| R11 | **자격증 무한 확장성**: 코드 수정 없이 데이터 추가만으로 새 자격증 지원 | 아래 원칙 참고 |
| R12 | 시험 중 이전/다음 문제 이동 | 문제 네비게이션 |
| R13 | "나중에 풀기" 플래그 + 미풀이/플래그 문항 한눈에 보기 | |
| R14 | 제한 시간(타이머) — **모의고사 모드에서만** | 시간은 자격증별 설정값. 시간 종료 시 자동 제출 |
| R15 | 관리자(admin) 역할 — 문제/시험 데이터는 관리자만 편집 | 일반 user는 풀이만 |
| R16 | 점수 공개 여부를 사용자가 선택 + 공개 점수 대상 리더보드 순위 | 기본 비공개 권장 |
| R17 | **연습 모드 이어풀기**: 완료 안 된 연습 세션을 나중에 재개 | 진행 상태 저장 필요 |
| R18 | **영어/한국어 이중 언어**: 문제·해설을 원문(영어)+번역(한국어)으로 보관, UI 토글 전환 | 데이터에 두 언어 필드 |

### 1.1.1 확장성 원칙 (R11)

- 지원 대상이 특정 벤더에 묶이지 않음. 예상 범위:
  - AWS 전 자격증 (SAA, SCS, SAP, DVA, …)
  - 기타 CSP (Azure, GCP, …)
  - Kubernetes (CKA, CKAD, CKS, …)
  - Linux Foundation 전 자격증
- 앱은 자격증을 **하드코딩하지 않는다.** 모든 자격증은 아래 공통 형태로 표현되는 데이터일 뿐:
  - 자격증 메타: 이름, 벤더, 총 문제 수, 제한시간, 합격 점수(%)
  - 도메인 목록 + 도메인별 출제 비율(%)
  - 문제 풀 (각 문제는 도메인에 소속)
- → 새 자격증 = 새 데이터 세트 추가. 화면/로직은 그대로 재사용.
- → 벤더(Provider)를 한 단계 위 개념으로 두면 UI에서 그룹핑도 가능 (예: AWS > SAA, AWS > SCS).

**자격증별로 달라지는 설정값 (코드가 아니라 데이터에 담는다)**

아래는 시험마다 다르므로 Certification 데이터의 속성으로 저장:

| 설정 | 예시 | 비고 |
|------|------|------|
| 총 문항 수 | DOP-C02=75 | 시험마다 다름 (Q11) |
| 제한 시간 | DOP-C02=180분 | 모의고사 모드에서만 사용 |
| 합격 점수 | DOP-C02=75% | |
| 복수 정답 채점 방식 | AWS=전부 맞아야 / Azure=부분점수 | `all_or_nothing` vs `partial` (Q3) |
| 도메인 비율 | 도메인별 % | |

### 1.1.2 두 모드 비교

**출제 로직은 두 모드가 완전히 동일** (시험 종류 선택 → 도메인 비율 맞춰 N문제 랜덤 출제).

| 항목 | 연습 모드 (Practice) | 모의고사 모드 (Exam) |
|------|----------------------|----------------------|
| 출제 방식 | 도메인 비율 맞춰 N문제 (동일) | 도메인 비율 맞춰 N문제 (동일) |
| 채점 | 함 | 함 |
| 정답 공개 시점 | **문제마다 즉시 (+해설)** | 전체 제출 후 |
| 최종 점수 | 완료 후 확인 가능 | 제출 후 확인 |
| 제한 시간(타이머) | **없음** | 있음 (R14) |
| 이전/다음 이동, 플래그 | 있음 (R12,R13) | 있음 (R12,R13) |
| 이어풀기(재개) | **있음 (R17)** | **없음 — 시작하면 끝까지 (타이머 계속)** |
| 결과 이력/통계 기록 | **안 남김** | 회차/점수로 기록 (R4,R5) |
| 진행 상태 저장 | **저장함 (이어풀기용, 완료 시 정리)** | 시작 시각 저장 → 이탈해도 남은 시간 계산 (Q15) |
| 초점 | 학습 | 실전 평가 |

> "이력 기록 안 함"과 "진행 상태 저장"은 다른 개념:
> 완료된 연습의 점수는 통계/리더보드에 안 들어가지만, 진행 중인 세션은 이어풀기 위해 임시 저장한다.


### 1.2 열린 질문 (다음에 정할 것)

- [x] ~~Q1. 시험 종류를 여러 개 지원?~~ → **해결: 무한 확장 가능하게 (R11). AWS 시작, 모든 벤더/자격증 수용**
- [~] Q2. 채점 시점 → **모의고사=제출 후 일괄 확정. 연습 모드는 아래 Q12로 분리 (R9와 충돌 확인 중)**
- [x] ~~Q3. 복수 정답 채점~~ → **해결: 자격증별 설정값. AWS=전부 맞아야(all-or-nothing), Azure 등=부분점수(partial)**
- [x] ~~Q4. 이전/다음 이동, 나중에 풀기~~ → **해결: 둘 다 필요 (문제 네비게이션 + 플래그)**
- [x] ~~Q5. 제한 시간~~ → **해결: 필요. 모의고사 모드에서만. 시간은 자격증별 설정값**
- [x] ~~Q6. 문제/시험 데이터 관리~~ → **해결: 관리자(나)만 편집. admin 역할 필요**
- [x] ~~Q7. 지인 점수/리더보드~~ → **해결: 사용자가 점수 공개 여부 선택. 리더보드는 공개된 점수만 순위**
- [x] ~~Q11. 모의고사 문항 수~~ → **해결: 실제 시험과 동일(DOP-C02=75). 자격증별 설정값**
- [x] ~~Q8. 연습 모드 출제 방식~~ → **해결: 모의고사와 동일 (도메인 비율 랜덤)**
- [x] ~~Q9. 연습 모드 이력 기록~~ → **해결: 기록 안 함**
- [x] ~~Q10. 연습 모드 문제 수~~ → **해결: 모의고사와 동일 (시험별 N문제)**
- [x] ~~Q12. 연습 모드 채점/정답 공개~~ → **해결: (B) 문제마다 즉시 정답/해설. 완료 후 최종 점수도 확인. R9 유지**
- [x] ~~Q13. 모의고사 이어풀기~~ → **해결: 없음. 시작하면 타이머 끝까지 (실제 시험 환경). 이탈/새로고침 시 처리는 Q15**
- [x] ~~Q14. 동시 연습 세션 수~~ → **해결: 자격증당 진행 중 연습 세션 1개 (새로 시작하면 기존 것 이어받기/덮어쓰기 안내)**
- [x] ~~Q15. 모의고사 중 이탈/새로고침 처리~~ → **해결: 서버가 시작 시각 저장. 복귀 시 경과 시간 차감한 남은 시간만 제공(자리 비운 동안도 시간 흐름). 0이면 자동 제출. 시간 이득 없음**

---

## 2. 데이터 모델 (초안)

R11(확장성)을 반영. 계층: **Provider → Certification → Domain → Question**

- **Provider(벤더)**: AWS / Azure / GCP / CNCF / Linux Foundation …
  - id, 이름, 로고(선택)
- **Certification(자격증)**: SAA-C03, SCS-C02, CKA …
  - id, provider_id, 이름, 코드
  - total_questions(**한 회차 출제 수**, 풀 크기 아님), time_limit_min(제한시간), pass_score_pct(합격 %)
  - scoring_mode: `all_or_nothing` | `partial` (복수 정답 채점 방식, Q3)
- **Domain(도메인)**: 자격증 내 영역
  - id, certification_id, 이름, **출제 비율(%)**
  - (비율 합은 100이어야 함 — 검증 필요)
- **Question(문제)**: 
  - id(순번), domain_id(근접 도메인 1개)
  - **다국어**: text_en(필수)/text_ko(null 허용), explanation_en/explanation_ko, 선지별 text_en/text_ko
  - 해설은 마크다운(링크·코드블록·이미지 허용)
  - translation_status: `translated` | `en_only`
  - 선지 목록, **정답(복수 가능)** — 정답 개수로 단일/복수 판별 (R7/R8)
  - UI에서 영어/한국어 토글로 전환 (R18)
- **User(사용자)**: Google sub(고유 id), 이름, 이메일
  - role: `user` | `admin` (R15)
  - score_public: bool — 점수 공개 여부, 기본 false (R16)
- **Attempt(시도/회차)**: 모의고사 모드에서만 생성
  - id, user_id, certification_id, 시작/종료 시각, 점수, 통과 여부
  - **출제된 문제 스냅샷 = 실제 복사본으로 저장.** 이후 관리자가 문제를 수정/재임포트해도 과거 회차는 당시 본 그대로 보존(소급 수정 안 함). 문제 버전 추적은 스코프 밖 — 스냅샷이 그 역할 대체
- **AttemptAnswer(회차 내 응답)**: 
  - attempt_id, question_id, 선택한 선지들, 정오답
  - (시험 진행 중 임시 상태: 플래그(나중에 풀기), 미풀이 여부 — R13)
- **Session(진행 중 세션)**: 이어풀기용 (R17). 완료 전까지만 존재
  - id, user_id, certification_id, mode(practice/exam), 생성 시각
  - 출제된 문제 목록(스냅샷), 현재 위치, 각 문제 선택 상태, 플래그 상태
  - 연습 모드: 완료 시 삭제(통계에 안 남김). 모의고사: 완료 시 Attempt로 확정 후 정리

> 연습 모드는 완료된 결과를 Attempt/통계로 남기지 않음. 단 진행 중 Session은 저장(이어풀기).
> 리더보드는 score_public=true 인 사용자의 Attempt 점수만 대상으로 순위 계산 (R16). 순위 기준은 **자격증별 최고점**.
> 상세 스키마(타입, 관계, 인덱스)는 기술 스택 확정 후 DB 스키마로 구체화.

### 2.1 JSON 임포트 스키마 (관리자 입력 형식, R15/S10)

관리자가 이 형태의 JSON을 올리면 앱이 검증 후 DB에 반영. **문제 수집·번역·해설 작업의 목표 형식**이기도 함.

> **중요 — JSON은 "문제 은행(pool)" 전체이지 시험 1회분이 아니다.**
> - `questions[]`에는 한 자격증의 **전체 문제 풀**이 들어감 (예: DOP-C02 300~400문제 이상)
> - 모의고사/연습을 시작할 때마다 이 풀에서 **도메인 비율에 맞춰 `total_questions`개(예: 75)를 랜덤 추출**
> - 매 회차 문제 구성·순서가 달라짐 (셔플)
> - `certification.total_questions`(75)는 **풀 크기가 아니라 한 회차 출제 수**

```json
{
  "provider": { "id": "aws", "name": "AWS" },
  "certification": {
    "id": "dop-c02",
    "code": "DOP-C02",
    "name": "AWS Certified DevOps Engineer - Professional",
    "total_questions": 75,
    "time_limit_min": 180,
    "pass_score_pct": 75,
    "scoring_mode": "all_or_nothing"
  },
  "domains": [
    { "id": "d1", "name": "SDLC Automation", "weight_pct": 22 },
    { "id": "d2", "name": "Configuration Management and IaC", "weight_pct": 17 },
    { "id": "d3", "name": "Security and Compliance", "weight_pct": 17 },
    { "id": "d4", "name": "Resilient Cloud Solutions", "weight_pct": 15 },
    { "id": "d5", "name": "Monitoring and Logging", "weight_pct": 15 },
    { "id": "d6", "name": "Incident and Event Response", "weight_pct": 14 }
  ],
  "questions": [
    { "//": "문제 은행 전체 — 실제로는 수백 개. 아래는 한 항목 예시",
      "id": 1,
      "domain_id": "d1",
      "text_en": "Question stem in English...",
      "text_ko": "한국어 지문... (없으면 null)",
      "choices": [
        { "id": "A", "text_en": "Choice A", "text_ko": "선지 A" },
        { "id": "B", "text_en": "Choice B", "text_ko": "선지 B" },
        { "id": "C", "text_en": "Choice C", "text_ko": "선지 C" },
        { "id": "D", "text_en": "Choice D", "text_ko": "선지 D" }
      ],
      "correct": ["B"],
      "explanation_en": "Why B is correct... (markdown: 링크/코드블록/이미지 허용)",
      "explanation_ko": "해설... (없으면 null)",
      "translation_status": "translated"
    }
  ]
}
```

**필드 규칙 (확정)**
- `id`: 순번(정수). 자격증 내에서만 유일하면 됨(재임포트는 전체 덮어쓰기라 안정성 부담 없음)
- `domain_id`: 가장 근접한 도메인 1개만(문제당 단일)
- 지문·선지·해설: **영어(_en)·한국어(_ko) 두 필드.** 한국어 미번역이면 `_ko`는 null 허용
- 해설: **마크다운.** 링크·코드블록·이미지 표현 가능(이미지는 마크다운 문법으로)
- `translation_status`: `translated`(영·한 완비) | `en_only`(한국어 미번역). UI에서 미번역 표시/필터에 활용
- 출처 필드 없음
- 정답 개수: `correct` 배열 길이로 자동 판별(별도 필드 불필요) → "N개 선택" 안내에 사용

**임포트 시 검증 규칙**
- `domains[].weight_pct` 합계 = 100 (아니면 거부)
- 모든 `question.domain_id` 가 domains에 존재
- `correct` 는 choices의 id 부분집합, 최소 1개
- `correct` 길이 ≥ 2 → 복수 정답 문제로 자동 판별 (R7/R8)
- **영어 필드(_en)는 필수. 한국어(_ko) 없으면 `translation_status=en_only`로 임포트 허용** (R18)
- **각 도메인의 풀 문제 수 ≥ 그 도메인의 회차 출제 수**여야 랜덤 추출 가능 (예: Security 17% × 75 ≈ 13문제 → 풀에 Security 문제 최소 13개↑). 부족하면 경고/거부
- 풀 총량은 `total_questions`보다 충분히 많아야 회차마다 다양성 확보(300~400+ 권장)
- `id` 중복 검사. **재임포트 정책 = 전체 덮어쓰기**(해당 자격증 문제 풀 통째 교체). 과거 Attempt는 스냅샷이라 무영향 (Q18)

---

---

## 3. 화면 설계 (초안)

### 3.0 UI 원칙 (디자인 방향)

- **완성도 목표**: 지인용이지만 프로덕션 레벨의 "꽤 괜찮은" UI. 단, 불필요한 기능/장식은 배제
- **분위기**: 깔끔한 미니멀 — 여백 많고 담백
- **모드**: 라이트 모드 단일 (다크모드 미지원 → 색 토큰 한 벌만 관리, 완성도에 집중)
- **완성도는 라이브러리가 아니라 디테일에서**: 일관된 여백·타이포·색(디자인 토큰), 로딩/빈/에러 상태 정성껏(TanStack Query 활용), 부드러운 상태 전환(정답 공개·타이머), 데스크톱 레이아웃만 탄탄히
- shadcn/ui는 필요한 컴포넌트만 코드로 가져오는 방식 → 군더더기 없음 + 라이브러리 색 안 탐

### 3.1 화면 목록

| # | 화면 | 접근 권한 | 설명 |
|---|------|-----------|------|
| S1 | 로그인 | 비로그인 | Google SSO 버튼 하나 (R1) |
| S2 | 홈 / 자격증 선택 | user | Provider별 그룹핑된 자격증 목록 (R11). 진행 중 연습 세션 있으면 "이어풀기" 노출 (R17) |
| S3 | 모드 선택 | user | 선택한 자격증에서 연습/모의고사 택1. 시험 정보(문항수·시간·합격선) 표시 |
| S4 | 문제 풀이 (연습) | user | 문제 1개씩. 답 제출→즉시 정답/해설. 이전/다음(R12), 플래그(R13) |
| S5 | 문제 풀이 (모의고사) | user | 타이머(R14). 정답 비공개. 이전/다음(R12), 플래그(R13), 문항 목록/네비 |
| S6 | 결과 (연습) | user | 완료 후 점수 + 문제별 풀이 다시보기 (기록엔 안 남김) |
| S7 | 결과 (모의고사) | user | 점수·합격여부 + 문제별 풀이. 이력에 저장됨 |
| S8 | 내 이력 / 통계 | user | 모의고사 회차 목록, 점수 추이. 점수 공개 여부 토글(R16) |
| S9 | 리더보드 | user | 공개 점수만 순위 (R16). 자격증별. **순위 기준 = 사용자별 최고점** |
| S10 | 관리자 - JSON 임포트 | admin | 자격증 데이터 JSON 업로드 (R15). 스키마·도메인 비율 합=100 검증 후 반영. 웹 폼 CRUD는 나중 |

### 3.2 핵심 화면 흐름

```
S1 로그인
   └─(Google SSO)─> S2 홈/자격증 선택
                        ├─(자격증 선택)─> S3 모드 선택
                        │                  ├─(연습)──> S4 ──> S6 결과(연습)
                        │                  └─(모의고사)> S5 ──> S7 결과(모의고사)─> S8 이력
                        ├─(이어풀기)──────> S4 (중단 지점부터)
                        ├─> S8 내 이력/통계
                        ├─> S9 리더보드
                        └─(admin만)─> S10 관리자
```

### 3.3 문제 풀이 화면 상세 (S4/S5 공통 UI 요소)

- 문제 지문 + 선지 (단일=라디오 R7 / 복수=체크박스 R8, "N개 선택" 안내)
- **언어 토글 (영어/한국어) — R18.** 지문·선지·해설 전환
- 진행 표시: 현재 N / 전체 M, 플래그·미풀이 표시
- 네비게이션: 이전 / 다음 (R12), 문항 점퍼(번호 그리드)
- 플래그 토글 "나중에 풀기" (R13)
- 연습(S4): [제출] → 즉시 정오답 + 해설 표시 → [다음]
- 모의고사(S5): 상단 타이머(R14), [시험 제출] 버튼, 미풀이/플래그 있으면 확인 모달

### 3.4 열린 질문
- [x] ~~Q18. JSON 재임포트 정책~~ → **전체 덮어쓰기. 같은 자격증 재임포트 시 해당 자격증의 문제 풀을 통째로 교체. (과거 Attempt는 스냅샷 복사본이라 영향 없음)**
- [x] ~~Q16. 모바일 대응 수준~~ → **해결: 1차 스코프에서 제외. 데스크톱 우선. 모바일 반응형은 나중 과제**
- [x] ~~Q17. 관리자 문제 입력 방식~~ → **해결: JSON 파일 임포트. 웹 폼 CRUD는 1차 제외(나중). 임포트 시 스키마·비율합 검증**

---

## 4. 기술 스택 (제안)

### 4.0 결정에 반영한 전제
- 개발자: 풀스택 경험 있음
- 우선순위: 확장성·구조 견고함 + **비용 최소화**
- 배포 타깃: AWS
- **초기 규모: 최대 사용자 ~10명** (지인 한정)

> 주: 스택 선택은 자격증 시험 공부와 무관하게, 순수히 이 앱에 적합한지로만 판단한다.

### 4.1 확정된 제약 (요구사항에서 유도)
- Google SSO → OAuth/OIDC 필요 (R1)
- 사용자·이력·리더보드 → 관계형 DB 적합 (R2, R5, R16)
- 서버 로직 필요: 출제(도메인 비율 랜덤), 채점, 타이머 검증, JSON 검증 임포트 → **백엔드 필수**
- 정적 사이트만으로는 불가 (이미 v0.4에서 확정)

### 4.2 레이어별 결정

#### 프론트: S3 + CloudFront 정적 호스팅 ✅ 확정
- React(SPA)는 정적 파일. 동적 기능은 전부 백엔드 API 호출로 처리 → 정적 호스팅으로 기능 제약 없음
- Google SSO도 프론트는 리다이렉트만, 토큰 검증은 백엔드 → 문제없음
- 비용: 이 규모면 사실상 프리티어

**프론트 세부 스택 (표준 조합 제안 — 조정 가능)**

앱 성격: 화면 10개, **API 연동 중심**(출제·타이머·채점·리더보드·이력), 데스크톱 전용, 폼은 적음.

| 영역 | 선택 | 이유 | 조정 여지 |
|------|------|------|-----------|
| 빌드 | **Vite** | React+TS 표준, 빠름 | 낮음(사실상 확정) |
| 언어 | **TypeScript** | 백엔드와 타입 공유(4.4) | 낮음 |
| 라우팅 | **React Router** | 화면 10개 + admin 권한 분기 | 중 |
| 서버 상태 | **TanStack Query** | 이 앱의 핵심. API 캐싱/로딩/에러/리페치 자동화 | 낮음(강력 추천) |
| 클라 상태 | **Zustand** | 시험 진행 상태(현재 문항·선택·플래그·타이머) 관리에 경량 적합 | 중(Redux는 과함) |
| 스타일 | **Tailwind CSS + shadcn/ui** | 빠른 스타일링 + 깔끔한 컴포넌트(버튼·모달·카드) | 중(취향) |
| 폼 | React Hook Form (선택) | 폼이 적어 필수 아님 | 높음(생략 가능) |

- **핵심 판단**: "폼 많은 앱"이 아니라 "API 상태 관리 중심 앱" → TanStack Query가 최고 값어치, 폼 라이브러리는 optional
- 미확정: 스타일링 취향(Tailwind vs 다른 것), 폼 라이브러리 채택 여부 → Q25

#### 백엔드: 서버리스(Lambda) ✅ 확정 — "완전 서버리스"
**"확장성=ECS"는 이 케이스에선 재고 필요.** 근거:

| 관점 | Lambda (서버리스) | ECS (Fargate/EC2) |
|------|-------------------|-------------------|
| 확장 | 요청따라 0→수천 자동 | 오토스케일링 직접 구성 |
| 유휴 비용 | 안 쓰면 $0 | 최소 태스크 상시 과금(~월 $10~15+) |
| 10명 규모 비용 | 프리티어 내 ≈ $0 | 상시 과금 발생 |
| 단점 | 콜드스타트, DB 커넥션 관리 | 유휴 비용, 관리 포인트 |

→ **완전 서버리스 확정.** API Gateway + Lambda. 콜드스타트는 학습/지인용이라 수용 가능.

#### DB: Aurora DSQL 유력 (완전 서버리스 정합)
현황 확인(2026년 기준):
- 2025-05 GA. PostgreSQL 호환. **scale-to-zero, 시간당 요금 없음.**
- **영구 프리티어**: 월 10만 DPU + 1GB 스토리지 (12개월 만료 아님). → 10명 규모 ≈ **$0**
- 서울 리전(ap-northeast-2) 지원 확인됨(2025-07~). 단일·멀티 리전 클러스터 모두 가능
- 주의: PostgreSQL "호환"이나 일부 확장/기능 미지원. 우리 앱 쿼리는 단순(사용자·이력·리더보드)이라 영향 낮음. 표준 드라이버·ORM은 사용 가능(AWS 공식)

| 후보 | 유휴 비용 | 완전 서버리스 정합 | 리스크 |
|------|-----------|--------------------|--------|
| **Aurora DSQL** | scale-to-zero ($0) | ★★★ | 신규, 기능 제약, 리전 |
| Aurora Serverless v2 | 최소 ACU 상시 | ★★ | 완전 0 아님, 하지만 PG 확장 완전 지원 |
| RDS PostgreSQL | 상시(~$12+) | ★ (Proxy 필요) | 비용 최소화와 상충 |

→ **완전 서버리스 + 비용 최소 = Aurora DSQL 1순위.** 리전/ORM 확인 후 확정. PG 확장 완전 지원이나 안정성이 더 급하면 Serverless v2 폴백.

#### 인증
- **Cognito + Google 연동** ✅: Google을 Cognito의 자격증명 공급자(IdP)로 등록. 프론트는 Cognito Hosted UI/SDK로 로그인, 백엔드는 Cognito 발급 토큰 검증
- Cognito가 사용자 풀·토큰 관리 대행 → 직접 OIDC 검증 코드 최소화

### 4.3 확정 스택 (완전 서버리스) — 전부 서울 리전(ap-northeast-2)

```
[사용자 브라우저]
      │
      ▼
[CloudFront] ──> [S3] (React 정적 SPA)
      │
      ▼ (API 호출)
[API Gateway] ──> [Lambda] (Node+TS, Hono 라우터: 출제/채점/타이머/JSON임포트)
                      │
                      ▼
                [Aurora DSQL] (사용자·문제·이력·리더보드)
      ▲
      │ (로그인)
[Cognito] ──(자격증명 공급자)── [Google]
```

- 프론트: S3 + CloudFront / **React+TS(Vite), React Router, TanStack Query, Zustand, Tailwind+shadcn/ui** ✅
- API: API Gateway + Lambda (Node + TypeScript, **단일 함수 + Hono 라우터**) ✅
- DB: Aurora DSQL (서울) ✅ / Aurora Serverless v2 폴백
- 인증: **Cognito + Google 연동** ✅
- IaC: **Terraform(기반 인프라) + Serverless Framework v4(Lambda/API GW)** ✅ — 로컬은 serverless-offline
- 전 구간 유휴 시 비용 ≈ $0 지향, 단일 리전으로 전송비 $0

### 4.4 확장성 관점 구조 포인트 (스택 무관 공통)
- 자격증을 코드가 아닌 데이터로(R11): 출제/채점 로직은 특정 시험을 몰라야 함
- 문제 JSON ↔ DB 스키마 ↔ 프론트 타입을 하나의 타입 정의로 공유(TS 풀스택 이점)
- 채점 방식(all_or_nothing/partial)을 전략 패턴으로 분리 → 새 시험 추가 시 로직 불변

### 4.5 열린 질문 (해결됨)
- [x] ~~Q19. DB 최종~~ → **Aurora DSQL (서울 리전 지원 확인). Serverless v2 폴백**
- [x] ~~Q20. 백엔드 최종~~ → **완전 서버리스: API Gateway + Lambda 확정**
- [x] ~~Q21. Lambda 코드 구조~~ → **단일 Lambda + 경량 라우터(Hono). 경로별 함수 분리 안 함(이 규모엔 단일이 개발·유지보수 유리)**

  **Hono 선택 이유:**
  - **TS 풀스택 타입 공유**: 프론트(React+TS)와 백엔드가 같은 언어 → 문제/시험 JSON 스키마·API 타입을 한 곳에서 정의해 양쪽이 공유. Python 백엔드였다면 이 이점이 사라짐
  - **서버리스 친화·경량**: 콜드스타트 부담이 적고 Lambda/엣지 런타임에 맞게 설계된 초경량 프레임워크
  - **단일 함수 라우팅에 적합**: 하나의 Lambda 안에서 `/exam`, `/leaderboard` 등 경로 분기를 깔끔하게 처리
  - **코드 구현 주체가 에이전트**: 런타임 언어를 사람 선호로 고를 필요가 낮아짐 → 위 타입 공유 이점이 있는 TS가 유리
  - (Python을 썼다면 FastAPI+Mangum / Lambda Powertools가 후보였으나, 타입 공유 이점 상실로 미채택)
- [x] ~~Q22. IaC 도구~~ → **분업 구조: Terraform(기반 인프라) + Serverless Framework(Lambda/API GW). SAM 미채택**

  **IaC 분업 (Q22 상세):**
  - **Terraform**: 서버리스 외 전부 — S3, CloudFront, Cognito, Aurora DSQL, IAM, SSM 등 기반 인프라
  - **Serverless Framework(v4)**: Lambda + API Gateway (자주 바뀌는 애플리케이션 레이어)
  - SAM은 이 분업에서 Serverless Framework로 대체(추가 아님, 택1 관계)
  - Serverless Framework v4 라이선스: 연매출 $2M 미만 개인·소규모는 **무료** → 본 프로젝트 해당, 비용 $0
  - 주의: `serverless.yml`에 `app` 속성 넣으면 Dashboard(별도 유료 제품) 연동됨 → **Dashboard 미사용**(CLI만)
  - **경계·연결 규칙(중요)**: Terraform이 만든 리소스 식별자(DSQL 엔드포인트, Cognito 풀/클라이언트 ID, Lambda 실행용 IAM 역할 ARN 등)를 **SSM Parameter Store**(또는 TF output)로 노출 → Serverless Framework가 이를 참조. "누가 무엇을 만드는가"를 겹치지 않게 고정
  - 참고: "JS라서 Serverless Framework가 유리"한 것은 아님(런타임 중립). 채택 이유는 플러그인 생태계·배포 경험. 인프라를 TS 코드로 통일하려면 CDK가 대안이었으나, 기반 인프라를 Terraform으로 가는 방침이라 해당 없음

  **로컬 개발(배포 없이 테스트) 관점 — SAM vs Serverless Framework:**

  | 항목 | SAM | Serverless Framework |
  |------|-----|----------------------|
  | 로컬 실행 | 기본 내장(`sam local invoke`, `sam local start-api`) | `serverless-offline` 플러그인 필요 |
  | 방식 | Docker로 Lambda 런타임 에뮬레이션 | Node 프로세스로 실행(Docker 불필요) |
  | 속도/체감 | 컨테이너라 매 실행 다소 무거움 | 가볍고 핫리로드 편하다는 평 |
  | 의존 | Docker 필요 | 플러그인 의존 |

  - **공통 한계(중요)**: 두 도구 모두 로컬 에뮬레이션은 *코드 로직* 테스트엔 좋지만 실제 AWS 서비스 동작을 완벽 재현 못 함. 특히 우리 스택의 **Aurora DSQL(신규)·Cognito는 로컬 흉내가 어려움**
  - **현실적 로컬 개발 전략**:
    - API 라우팅 / 채점 로직 / JSON 임포트 검증 → 로컬 에뮬레이션으로 충분
    - DSQL 쿼리 / Cognito 인증 → dev 전용 실제 리소스에 붙여 테스트(또는 LocalStack 검토)
  - **로컬 개발 우선순위라면**: Docker 없이 가볍게 도는 `serverless-offline`이 반복 개발 사이클에서 유리. 단 DSQL/Cognito는 어차피 실제 dev 리소스 필요 → 이 부분은 도구 선택과 무관
  - **✅ 최종 확정: Serverless Framework (v4) + serverless-offline.** 로컬 반복 개발이 가볍고, 플러그인 생태계 이점. Dashboard 미사용(CLI만). DSQL/Cognito는 dev 전용 실제 리소스로 테스트
- [x] ~~Q23. 인증~~ → **Cognito로 감싸기 (Google을 Cognito 자격증명 공급자로 연결)**
- [x] ~~Q24. DSQL 리전~~ → **서울(ap-northeast-2) 지원 확인. 전 리소스 서울 단일 리전 → 리전 간 전송비 $0**
- [x] ~~Q25. 프론트 세부 미세조정~~ → **Tailwind + shadcn/ui 확정. UI 방향: 깔끔한 미니멀(여백 많고 담백), 라이트 모드 단일. 폼 라이브러리는 optional(필요 시 RHF)**

### 4.6 리전 전략
- **전 리소스(S3, CloudFront 오리진, Lambda, DSQL)를 서울(ap-northeast-2) 단일 리전에 배치.**
- 같은 리전 내 전송은 무료 → 리전 간 데이터 전송 비용 없음
- 국내 지인 대상이라 지연시간도 최소
- (CloudFront는 글로벌 엣지지만 오리진이 서울이면 문제없음)
- DSQL은 PostgreSQL 호환으로 표준 드라이버·ORM 사용 가능(AWS 공식). 단 일부 기능 제약은 구현 시 확인

---

## 5. 인프라 / 배포

> 배포는 사용자가 직접 담당. 본 장은 그 설계·순서를 정의.
> 4장 확정 스택(전부 서울 리전, 완전 서버리스, Terraform+Serverless Framework) 위에서 구성.

### 5.1 환경 분리 (dev / prod) — 비대칭 전략

**핵심: dev/prod를 통째로 두 벌 뜨지 않는다.** 로컬 개발(serverless-offline + Vite dev server)로 커버되는 것은 dev 클라우드 배포를 생략하고, **로컬이 재현 못 하는 것만 dev용 실물을 둔다.**

| 리소스 | 로컬 재현 | dev 실물 필요? | prod | 비고 |
|--------|-----------|----------------|------|------|
| Lambda(Hono) / API GW | ✅ serverless-offline | ❌ 불필요 | ✅ | 앱 로직은 로컬에서 |
| 프론트(S3/CloudFront) | ✅ Vite dev server | ❌ 불필요(필요 시만) | ✅ | 로컬에서 개발 |
| **Cognito** | ❌ 어려움 | ✅ **dev 두 벌** | ✅ | 로그인 흐름 테스트, prod 풀 오염 방지 |
| **Aurora DSQL** | ❌ 어려움 | ✅ **dev 두 벌** | ✅ | 마이그레이션·임포트 시험용. scale-to-zero라 유휴비용 ≈0 |

- 결과 구조: **dev = 로컬 앱 + 최소 클라우드(Cognito, DSQL)** / **prod = 전체 클라우드**
- 1인·소규모·비용 최소에 최적. dev용 DSQL은 유휴 시 사실상 무료라 두 벌 부담 없음
- **주의(비대칭의 트레이드오프)**: 로컬이 안 거치는 부분(API Gateway 실제 설정, IAM 권한 경계, CloudFront 동작)은 prod에서 처음 드러날 수 있음 → prod 첫 배포 시 이 부분 집중 점검

**격리 방식(공통)**
- 단일 AWS 계정 + 환경 접두어: `certquiz-dev-*`, `certquiz-prod-*`
- Cognito: 환경별 별도 User Pool / DSQL: 환경별 별도 클러스터
- Terraform 변수(`var.env`)로 어떤 환경 리소스를 만들지 제어(dev는 Cognito·DSQL만, prod는 전체)
- Serverless Framework `stage`: 로컬(offline)/prod 중심. dev 스테이지 클라우드 배포는 기본 생략

### 5.2 배포 순서 (의존성 기반)

**기반 인프라(Terraform)가 먼저, 애플리케이션(Serverless Framework)이 나중.** 4.5 경계 규칙과 연결.

```
1. [Terraform] 기반 인프라 프로비저닝
   - S3(프론트), CloudFront, Cognito(User Pool + Google IdP),
     Aurora DSQL, IAM 역할, SSM 파라미터(출력값 저장)
        │  (출력: DSQL 엔드포인트, Cognito 풀/클라이언트 ID, IAM 역할 ARN → SSM에 기록)
        ▼
2. [Serverless Framework] 애플리케이션 배포
   - Lambda(Hono) + API Gateway
   - SSM에서 1의 출력값 참조하여 환경변수 주입
        │
        ▼
3. [프론트] 빌드 & 배포
   - Vite 빌드 → S3 업로드 → CloudFront 무효화(invalidation)
   - 빌드 시 API 엔드포인트/Cognito 설정 주입(환경별)
        │
        ▼
4. [DB 초기화] 마이그레이션 + (선택) 관리자 JSON 임포트
```

- 삭제(destroy)는 역순: 프론트 → 서버리스 → 기반 인프라
- DB 스키마 마이그레이션은 별도 단계로 관리(예: 마이그레이션 툴 또는 Lambda one-off)
- **환경별 적용 범위(5.1 비대칭)**: dev는 위 1단계 중 Cognito·DSQL만 프로비저닝(앱은 로컬). prod는 1~4 전체 수행

### 5.3 CI/CD (GitHub Actions)

**도구: GitHub Actions.** 근거: 코드가 GitHub에 있고, 무료 한도 넉넉, AWS OIDC 연동이 표준이라 장기 크리덴셜 불필요(보안·비용 유리). 별도 CI 서비스 비용 없음.

**인증 방식**: GitHub Actions ↔ AWS는 **OIDC 페더레이션**(IAM Role 수임). 액세스 키를 저장소에 넣지 않음.

**브랜치 → 환경 매핑**
- 로컬 개발: serverless-offline + Vite dev server (dev용 Cognito·DSQL 실물에 연결)
- `main` 브랜치 push → **prod** 자동 배포 (Q28). 안전을 위해 배포 파이프라인에 테스트 게이트 유지
- dev는 별도 클라우드 앱 배포 없음(로컬이 dev 앱 역할). dev용 Cognito·DSQL은 Terraform으로 1회 프로비저닝 후 유지
- (필요 시) dev 클라우드 앱을 임시로 띄우고 싶으면 수동 `deploy --stage dev` 가능하되 상시 운영 안 함

**파이프라인 단계(예시)**
```
on push:
  1. Lint / Type check / 테스트 (프론트·백 공통 TS)
  2. (기반 인프라 변경 시) terraform plan → apply
  3. Serverless Framework deploy --stage <env>
  4. 프론트 빌드 → S3 sync → CloudFront invalidation
  5. (선택) 스모크 테스트
```

- **환경 보호**: prod는 main push 시 자동 배포(Q28)하되, 파이프라인의 Lint/타입/테스트 통과를 필수 게이트로 둠(테스트 실패 시 배포 중단). 수동 승인 게이트는 두지 않음
- **Terraform 상태**: 원격 상태(S3)에 저장 — 로컬 유실 대비·재현성. **상태 잠금(DynamoDB)은 미사용**(1인 작업이라 동시 apply 충돌 없음)
- **비용 주의**: Actions 무료 한도 내 운영. prod 배포는 빈번하지 않게

### 5.4 관측/운영 (최소)
- CloudWatch Logs(Lambda 기본), 필요 시 알람 1~2개(에러율/5xx)
- 비용 경보: AWS Budgets로 월 상한 알림(비용 최소화 목표 안전장치)
- Serverless Framework Dashboard는 미사용(4.5) → 관측은 CloudWatch로

### 5.5 열린 질문
- [x] ~~Q26. 커스텀 도메인~~ → **사용 예정(Route 53 + ACM). 구체 도메인·구성은 나중에 확정**
- [ ] Q27. DB 마이그레이션(테이블 스키마 생성·변경 관리) 도구 선정 + 실행 위치. **Aurora DSQL 호환 확인 필요**(신규 서비스). 후보: Prisma Migrate / Drizzle / node-pg-migrate 등. 구현 단계에서 결정
- [x] ~~Q28. prod 배포 트리거~~ → **main push 시 자동 배포**

---

## 변경 이력

- v0.1 — 초안. R1~R8 확정, 데이터 모델 개념 스케치.
- v0.2 — 연습 모드(R9)/모의고사 모드(R10) 추가. 모드 비교표, Q8~Q10 추가.
- v0.3 — 두 모드 출제 로직 공유 확정. 연습=기록 안 함. Q8~Q10 해결.
- v0.4 — 확장성 원칙(R11) 추가. Provider→Certification→Domain→Question 계층으로 데이터 모델 확장. Q1 해결.
- v0.5 — 1차 구현 스코프 = DOP-C02 확정. 공식 도메인 비율/시험 스펙 반영. Q11(문항 수) 추가.
- v0.6 — Q2~Q7,Q11 해결. R12~R16 추가(네비/플래그/타이머/admin/점수공개·리더보드). 자격증별 설정값을 데이터로 분리. Q12(연습모드 채점방식) 신규.
- v0.7 — Q12 해결(연습=즉시 정답+완료후 점수). R17(연습 이어풀기) 추가. Session 엔티티 추가. Q13(모의고사 이어풀기)·Q14(동시 세션 수) 신규.
- v0.8 — Q13 해결(모의고사 이어풀기 없음, 타이머 끝까지). Q14 해결(연습 세션 자격증당 1개). Q15(이탈 시 처리) 신규.
- v0.9 — Q15 해결. 요구사항 1장 완결. 화면 설계 3장 작성(S1~S10, 흐름도, 풀이화면 상세). Q16~Q17 신규.
- v0.10 — Q16 해결(모바일 제외, 데스크톱 우선). Non-goals 섹션 추가.
- v0.11 — Q17 해결(JSON 임포트). JSON 스키마(2.1)와 검증 규칙 정의. S10을 JSON 임포트로 갱신. Q18(재임포트 정책) 신규.
- v0.12 — 기술 스택 4장 작성. A안(React+TS / Node+TS / PostgreSQL) 추천, B안(AWS 서버리스)·C안(Next.js) 비교. Q19~Q21 신규.
- v0.13 — AWS 비용최소·10명 규모 반영. 프론트 S3+CloudFront 확정. 백엔드 Lambda 우선(확장성=ECS 통념 재검토). DB 후보 비교(Aurora Serverless/DSQL/RDS). 조합 1~3 정리. Q19~Q22 갱신.
- v0.14 — 완전 서버리스 확정(API GW+Lambda). DSQL 현황 확인(GA, 영구 프리티어, scale-to-zero, 리전 확대 중) → DB 1순위 DSQL. 아키텍처 다이어그램 추가. Q19/Q20 해결, Q23(인증)·Q24(리전) 신규.
- v0.15 — Q21~Q24 전부 해결: Hono 단일함수, SAM, Cognito+Google, 서울 리전. 리전 전략(4.6, 전 리소스 서울 단일). 스택 판단에서 자격증 학습 연관 제거. 기술 스택 4장 완결.
- v0.16 — Python 런타임 검토 후 TS(Hono) 유지 결정. Hono 선택 이유 명시(타입 공유·서버리스 친화·에이전트 구현 전제).
- v0.17 — IaC를 분업 구조로 변경: Terraform(기반 인프라) + Serverless Framework(Lambda/API GW), SAM 대체. v4 소규모 무료 확인. 경계·연결 규칙(SSM으로 TF output 전달) 명시.
- v0.18 — 로컬 개발 관점 SAM vs Serverless Framework 비교 추가. 공통 한계(DSQL/Cognito 로컬 재현 어려움)와 현실적 로컬 개발 전략 명시.
- v0.19 — Serverless Framework v4 + serverless-offline 최종 확정. 기술 스택(4장) 전체 확정 완료.
- v0.20 — 프론트 세부 스택 표준 조합 확정: Vite/RR/TanStack Query/Zustand/Tailwind+shadcn. API 상태 관리 중심 판단. Q25(프론트 미세조정) 신규.
- v0.21 — Q25 해결. UI 원칙(3.0) 추가: 미니멀·여백·라이트 단일·프로덕션 완성도. 다크모드 Non-goals 추가.
- v0.22 — 전체 리뷰 반영. [A정리] 헤더 버전 갱신, 1.1.1/1.1.2 순서 정정, JSON 하단 오배치 주석 이동, R3 예시숫자 제거. [B결정] R18 이중언어(영/한 토글) 추가·Question/JSON스키마 반영, Attempt 스냅샷=복사본 보존 명시(과거이력 소급수정 안 함), 리더보드 순위=자격증별 최고점.
- v0.23 — 5장(인프라/배포) 상세 작성: 환경분리(dev/prod, 단일계정+접두어), 배포 순서(TF→Serverless→프론트→DB), CI/CD(GitHub Actions+OIDC, 브랜치→환경 매핑, prod 승인 게이트), 관측/비용경보. Q26~Q28 신규.
- v0.24 — Q18(전체 덮어쓰기)·Q26(커스텀 도메인 예정)·Q28(main push 자동배포) 해결. prod 수동 승인 게이트 제거(테스트 게이트로 대체). Q27(DB 마이그레이션)은 DSQL 호환 확인 필요로 유지.
- v0.25 — Terraform 상태 잠금(DynamoDB) 제거, S3 원격 상태만 유지(1인 작업).
- v0.26 — 환경 전략을 비대칭으로 변경: dev/prod 통째 두 벌 대신, 로컬(serverless-offline+Vite)로 커버 안 되는 Cognito·DSQL만 dev 실물 두 벌. Lambda/API/프론트 dev 배포 생략. CI/CD·배포순서에 반영.
- v0.27 — JSON 스키마 확정: id 순번, domain_id 단일, 해설 마크다운(링크·코드·이미지), 출처 없음, translation_status(translated/en_only)로 미번역 임포트 허용. 검증 규칙·Question 모델 반영.
- v0.28 — 핵심 명확화: JSON은 문제 은행(pool) 전체(수백 문항)이며 total_questions는 회차 출제 수. 회차마다 도메인 비율 맞춰 랜덤 추출·셔플. 풀 문제 수 ≥ 도메인 출제 수 검증 규칙 명시.
