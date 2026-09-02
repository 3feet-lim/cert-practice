# Requirements Document

## Introduction

CertQuiz MVP는 소수의 승인된 사용자가 클라우드 자격증 문제를 연습 모드 또는 모의고사 모드로 풀고, 모의고사 성과를 이력과 리더보드에서 확인할 수 있는 비공개 웹 애플리케이션이다. 첫 릴리스는 AWS Certified DevOps Engineer – Professional(DOP-C02)만 제공하지만, 자격증별 메타데이터와 문제 은행을 데이터로 추가할 수 있는 확장 구조를 요구한다.

본 문서는 `design.md`, `wireframes.html` 및 대화에서 확정된 내용을 검증 가능한 제품 요구사항으로 정규화한다. 와이어프레임은 정보 구조와 화면 흐름의 참고 자료이며 시각 디자인의 최종 명세가 아니다.

### MVP 범위

- Google 계정을 사용하는 로그인과 신규 사용자 승인 대기
- DOP-C02 자격증 카탈로그와 데이터 기반 확장 구조
- 도메인 비율 기반 무작위 출제
- 연습 모드, 모의고사 모드, 문제 탐색과 플래그
- 영어·한국어 문제 및 해설 전환
- 모의고사 이력, 점수 공개 설정, 리더보드
- 관리자 사용자 승인과 JSON 문제 은행 임포트

### 후속 설계에 적용할 확정 제약

- 프론트엔드: React, TypeScript, Vite 기반 SPA
- API: API Gateway와 단일 Hono 기반 Node.js/TypeScript Lambda
- 데이터베이스: 서울 리전의 Aurora DSQL
- 인증: Cognito와 Google 자격 증명 공급자 연동
- UI: Tailwind CSS와 shadcn/ui를 사용한 라이트 모드 미니멀 데스크톱 UI
- 와이어프레임: 화면 구조와 사용자 흐름만 참고하고 손그림 스타일은 구현하지 않음

## Glossary

- **CertQuiz_System**: 인증, 자격증 선택, 문제 풀이, 채점, 결과, 이력, 리더보드 및 관리 기능을 제공하는 전체 시스템
- **MVP**: 본 요구사항 문서에서 정의한 첫 번째 배포 범위
- **Provider**: AWS처럼 하나 이상의 자격증을 발급하는 기관
- **Certification**: 시험 코드, 이름, 회차 문항 수, 제한 시간, 합격 기준, 채점 방식 및 도메인 구성을 가진 자격증 정의
- **DOP_C02**: MVP에서 제공하는 AWS Certified DevOps Engineer – Professional 시험
- **Domain**: Certification 안에서 출제 비율을 갖는 시험 영역
- **Domain_Weight**: 한 회차에서 Domain에 배정할 문제 비율
- **Domain_Allocation**: 각 Domain의 `회차 문항 수 × Domain_Weight`를 내림한 뒤, 남은 문항을 소수 부분이 큰 Domain부터 배정하여 합계를 회차 문항 수와 일치시키는 정수 문항 배정 방식. 소수 부분이 같으면 임포트된 Domain 순서를 사용함
- **Question**: 지문, 선지, 정답 집합, 해설, Domain 및 번역 상태를 포함하는 문제
- **Choice**: Question에서 사용자가 선택할 수 있는 답변 항목
- **Question_Pool**: Certification에 속하며 회차 출제에 사용할 수 있는 전체 Question 집합
- **Question_Snapshot**: 세션 시작 시점의 Question 내용을 이후 원본 변경과 분리하여 보존한 복사본
- **Certification_Catalog**: Provider, Certification, Domain 및 Question 계층을 조회하는 구성 요소
- **Authentication_Service**: Cognito가 발급한 인증 정보를 사용하여 Google 계정 사용자를 식별하는 구성 요소
- **Google_Sub**: Google 계정마다 고유한 OIDC subject 식별자
- **User_Profile**: Google_Sub, 표시 이름, 이메일, 역할, 승인 상태 및 점수 공개 설정을 가진 사용자 레코드
- **Approval_Status**: `pending` 또는 `approved` 값을 갖는 사용자 승인 상태
- **User_Role**: `user` 또는 `admin` 값을 갖는 권한 역할
- **Access_Controller**: 인증 상태, Approval_Status 및 User_Role에 따라 기능 접근을 허용하는 구성 요소
- **Admin_Console**: 관리자가 승인 대기 사용자와 문제 은행 임포트를 처리하는 화면 및 기능
- **Exam_Generator**: Domain_Allocation에 따라 Question_Pool에서 회차 문제를 선택하고 순서를 섞는 구성 요소
- **Question_Presenter**: Question, Choice, 언어, 선택 상태, 정답 상태 및 해설을 표시하는 구성 요소
- **Question_Projection**: 현재 모드와 제출 상태에 따라 사용자에게 반환되는 Question 응답 데이터. 공개 조건 전에는 정답 Choice, 정오답, 획득 점수 및 해설 필드 자체를 포함하지 않음
- **Language_Mode**: `en` 또는 `ko` 값을 갖는 문제 표시 언어
- **Translation_Status**: `translated` 또는 `en_only` 값을 갖는 Question 번역 상태
- **Markdown_Content**: 링크, 코드 블록 및 이미지 문법을 포함할 수 있는 해설 텍스트
- **Raw_HTML**: Markdown_Content 안에 직접 작성된 HTML 요소 또는 속성
- **Safe_URL**: 동일 출처 상대 URL 또는 `https` 스킴을 사용하는 URL
- **MiB**: 1,048,576바이트인 파일 크기 단위
- **State_Version**: Practice_Session 또는 Exam_Session의 저장된 상태가 변경될 때 증가하며 오래된 상태 변경 요청을 식별하는 값
- **Practice_Session**: 제한 시간 없이 Question별 최초 제출 직후 채점 결과를 제공하는 진행 중 연습 데이터
- **Completed_Practice_Result**: 완료 시각 이상이고 완료 시각부터 168시간이 되는 시각보다 이른 기간에 다시 볼 수 있는 연습 결과 데이터
- **Practice_Manager**: Practice_Session 생성, 저장, 재개, 제출, 완료 및 결과 보관을 관리하는 구성 요소
- **Exam_Session**: 서버 기준 시작 시각과 만료 시각을 가지며 전체 제출 전까지 정답을 공개하지 않는 모의고사 진행 데이터
- **Exam_Manager**: Exam_Session 생성, 상태 저장, 제한 시간 계산 및 제출을 관리하는 구성 요소
- **Flag**: 사용자가 Question을 나중에 다시 확인하도록 표시하는 상태
- **Attempt**: 제출된 Exam_Session의 Question_Snapshot, 응답, 점수, 합격 여부 및 시각을 보존하는 모의고사 이력
- **Scoring_Mode**: 복수 정답 문제의 채점 방식인 `all_or_nothing` 또는 `partial`
- **all_or_nothing**: 선택한 Choice 집합과 정답 Choice 집합이 같을 때만 Question에 1점을 부여하는 채점 방식
- **partial**: 필수 선택 수를 지킨 응답에 대해 `선택한 정답 Choice 수 ÷ 전체 정답 Choice 수`만큼 Question 점수를 부여하는 채점 방식
- **Scoring_Engine**: Question 응답과 Scoring_Mode를 사용하여 점수와 합격 여부를 계산하는 구성 요소
- **Raw_Score**: 모든 Question에서 획득한 점수의 합
- **Accuracy_Rate**: `Raw_Score ÷ 전체 Question 수 × 100`으로 계산한 백분율
- **Exact_Value**: 계산 과정에서 반올림하거나 유효 자릿수를 줄이지 않은 수학적 점수 값
- **Half_Up_Rounding**: 반올림 대상 자리의 바로 다음 숫자가 5 이상이면 올리고 5 미만이면 버리는 반올림 방식
- **Reference_1000_Score**: Exact_Value인 `Accuracy_Rate × 10`에 Half_Up_Rounding을 적용한 참고 표시값
- **Pass_Threshold**: Certification에 저장된 합격 Accuracy_Rate
- **Result_Service**: 연습 및 모의고사 결과와 Domain별 성과를 제공하는 구성 요소
- **History_Service**: 사용자의 Attempt 목록과 점수 추이를 제공하는 구성 요소
- **Leaderboard_Service**: 점수 공개 사용자의 Certification별 최고 Accuracy_Rate를 순위로 제공하는 구성 요소
- **Standard_Competition_Rank**: 자신보다 높은 Accuracy_Rate를 가진 후보 수에 1을 더하여 순위를 계산하고 동점 후보에게 같은 순위를 부여하는 방식
- **Import_Service**: 관리자 JSON 파일을 검증하고 Certification 데이터를 교체하는 구성 요소
- **Retention_Manager**: Completed_Practice_Result의 168시간 보관 기한을 적용하는 구성 요소
- **API_Request**: 인증된 클라이언트가 CertQuiz_System 서버 기능에 보내는 요청
- **Idempotent_Submission**: 같은 Exam_Session에 제출 요청이 반복되어도 하나의 Attempt와 동일한 결과만 생성하는 제출 특성
- **JSON_Import**: Provider, Certification, Domain 및 Question_Pool을 하나의 JSON 문서로 전달하는 관리자 입력 형식
- **Canonical_JSON**: 객체 키 순서, 의미 없는 공백 및 동등한 JSON 숫자 표기 차이는 동일하게 취급하고 배열 순서는 보존하는 JSON 내용 표현
- **Import_Validation**: 검증에 성공한 Canonical_JSON 내용과 검증을 수행한 관리자를 결합하며 생성 시각 이상이고 생성 시각부터 15분이 되는 시각보다 이른 기간에 한 번의 교체 확정에만 사용할 수 있는 검증 결과

## Requirements

### Requirement 1: Google 로그인과 사용자 승인

**User Story:** 승인된 사용자로서, Google 계정으로 로그인하고 싶다. 그래야 별도 비밀번호 없이 개인 세션과 이력을 안전하게 사용할 수 있다.

#### Acceptance Criteria

1. WHEN Cognito 로그인 결과가 전달되면, THE Authentication_Service SHALL 서명, 발급자, 수신 대상 및 유효기간을 검증한다.
2. IF Cognito 로그인 결과의 서명, 발급자, 수신 대상 또는 유효기간 검증이 실패하면, THEN THE Access_Controller SHALL User_Profile 및 보호 데이터를 생성하거나 변경하지 않고 인증 오류를 반환한다.
3. IF 유효한 Cognito 로그인 결과에 Google_Sub가 없으면, THEN THE Authentication_Service SHALL User_Profile을 생성하거나 변경하지 않고 인증 오류를 반환한다.
4. WHEN 유효한 Cognito 로그인 결과의 Google_Sub와 일치하는 User_Profile이 존재하면, THE Authentication_Service SHALL 해당 User_Profile로 사용자를 식별한다.
5. WHEN 유효한 Cognito 로그인 결과의 Google_Sub와 일치하는 User_Profile이 존재하지 않으면, THE Authentication_Service SHALL Approval_Status가 `pending`이고 User_Role이 `user`이며 점수 공개 설정이 `false`인 User_Profile 하나를 원자적으로 생성한다.
6. WHEN 동일한 Google_Sub를 포함한 둘 이상의 유효한 로그인이 동시에 처리되면, THE Authentication_Service SHALL 해당 Google_Sub에 연결되는 User_Profile을 정확히 1개 유지한다.
7. WHILE User_Profile의 Approval_Status가 `pending`이면, THE Access_Controller SHALL 해당 사용자의 본인 Approval_Status 조회에만 접근을 허용한다.
8. IF Approval_Status가 `pending`인 사용자가 본인 Approval_Status 조회 이외의 보호 기능을 요청하면, THEN THE Access_Controller SHALL 보호 데이터와 시스템 상태를 변경하지 않고 권한 오류를 반환한다.
9. WHEN 관리자가 Approval_Status가 `pending`인 사용자를 승인하면, THE Admin_Console SHALL 해당 User_Profile의 Approval_Status를 `approved`로 원자적으로 변경한다.
10. WHEN 관리자가 Approval_Status가 `approved`인 사용자에게 승인을 다시 요청하면, THE Admin_Console SHALL User_Profile을 추가로 변경하지 않고 기존 승인 상태를 반환한다.
11. WHILE User_Profile의 Approval_Status가 `approved`이면, THE Access_Controller SHALL User_Role에 허용된 사용자 기능에 접근을 허용한다.
12. IF 사용자가 다른 사용자의 Practice_Session, Completed_Practice_Result, Exam_Session 또는 Attempt를 요청하면, THEN THE Access_Controller SHALL 요청 대상 데이터와 시스템 상태를 변경하지 않고 보호 데이터가 포함되지 않은 권한 오류를 반환한다.
13. THE Authentication_Service SHALL Google_Sub를 User_Profile의 외부 계정 고유 식별자로 사용한다.
14. IF 신규 User_Profile 생성 작업이 실패하면, THEN THE Authentication_Service SHALL User_Profile과 관련 보호 데이터를 생성하거나 변경하지 않고 인증 오류를 반환한다.
15. IF 사용자 승인 작업이 실패하면, THEN THE Admin_Console SHALL 해당 User_Profile의 Approval_Status와 다른 시스템 상태를 승인 요청 전 상태로 유지하고 승인 오류를 반환한다.

### Requirement 2: 역할 기반 관리 권한

**User Story:** 관리자로서, 승인과 데이터 임포트 기능을 일반 사용자와 분리하고 싶다. 그래야 운영 데이터와 접근 권한을 통제할 수 있다.

#### Acceptance Criteria

1. WHERE User_Role이 `admin`이면, THE Access_Controller SHALL 승인 대기 사용자 목록 접근을 허용한다.
2. WHERE User_Role이 `admin`이면, THE Access_Controller SHALL JSON_Import 검증 기능 접근을 허용한다.
3. WHERE User_Role이 `admin`이면, THE Access_Controller SHALL 검증에 성공한 JSON_Import 확정 기능 접근을 허용한다.
4. IF User_Role이 `user`인 사용자가 승인 대기 사용자 목록, JSON_Import 검증 또는 JSON_Import 확정 기능을 요청하면, THEN THE Access_Controller SHALL 전체 시스템 상태를 변경하지 않고 보호 데이터가 포함되지 않은 권한 오류를 반환한다.
5. WHEN 관리자가 승인 대기 사용자 목록을 요청하면, THE Admin_Console SHALL Approval_Status가 `pending`인 각 사용자를 정확히 한 번 포함하고 각 사용자의 표시 이름, 이메일 및 최초 로그인 시각을 제공한다.
6. WHEN 승인 대기 사용자가 없는 상태에서 관리자가 승인 대기 사용자 목록을 요청하면, THE Admin_Console SHALL 오류 대신 빈 목록을 제공한다.

### Requirement 3: 데이터 기반 자격증 카탈로그

**User Story:** 학습자로서, 사용 가능한 자격증을 Provider별로 탐색하고 싶다. 그래야 원하는 시험의 학습 모드를 선택할 수 있다.

#### Acceptance Criteria

1. THE Certification_Catalog SHALL 각 Certification을 정확히 하나의 Provider에 연결한다.
2. THE Certification_Catalog SHALL 각 Domain을 정확히 하나의 Certification에 연결한다.
3. THE Certification_Catalog SHALL 각 Question을 정확히 하나의 Domain에 연결하고 Question의 Certification을 해당 Domain의 Certification과 일치시킨다.
4. THE Certification_Catalog SHALL 각 Certification에 비어 있지 않은 시험 코드와 이름, 1 이상의 정수인 회차 문항 수와 제한 시간, 0 이상 100 이하인 Pass_Threshold 및 `all_or_nothing` 또는 `partial`인 Scoring_Mode를 유지한다.
5. THE Certification_Catalog SHALL 각 Domain_Weight를 0% 초과 100% 이하로 유지하고 각 Certification의 Domain_Weight 합계를 100%로 유지한다.
6. WHEN 승인된 사용자가 홈 화면을 열면, THE Certification_Catalog SHALL 필수 필드와 관계가 유효하고 각 Domain의 Question_Pool 크기가 Domain_Allocation 이상인 Certification만 Provider별로 그룹화하여 제공한다.
7. THE Certification_Catalog SHALL Practice_Session과 Exam_Session의 출제 대상을 선택된 Certification에 연결된 Domain 및 Question_Pool로 제한한다.
8. THE Certification_Catalog SHALL 화면과 출제 동작을 저장된 Provider, Certification, Domain 및 Question 데이터에서 결정한다.
9. WHERE MVP 데이터 세트가 사용되면, THE Certification_Catalog SHALL 아래 DOP_C02 기준 데이터를 제공한다.

| 항목 | 기준값 |
|---|---:|
| Provider | AWS |
| 시험 코드 | DOP-C02 |
| 이름 | AWS Certified DevOps Engineer – Professional |
| 회차 문항 수 | 75 |
| 제한 시간 | 180분 |
| Pass_Threshold | 75% |
| Scoring_Mode | `all_or_nothing` |
| SDLC Automation | 22% |
| Configuration Management and IaC | 17% |
| Security and Compliance | 17% |
| Resilient Cloud Solutions | 15% |
| Monitoring and Logging | 15% |
| Incident and Event Response | 14% |

10. IF Certification의 필수 필드, 부모 관계 또는 Domain_Weight가 유효하지 않으면, THEN THE Certification_Catalog SHALL 해당 Certification을 사용자 목록에 노출하지 않고 유효하지 않은 항목의 식별자와 원인을 포함한 데이터 오류를 반환한다.
11. IF 하나 이상의 Domain의 Question_Pool 크기가 Domain_Allocation보다 작으면, THEN THE Certification_Catalog SHALL 해당 Certification을 사용자 목록에 노출하지 않고 부족한 모든 Domain의 이름, 보유 문항 수 및 필요한 Domain_Allocation을 포함한 데이터 오류를 반환한다.

### Requirement 4: 도메인 비율 기반 회차 생성

**User Story:** 학습자로서, 실제 시험 비율을 반영한 무작위 문제 세트를 받고 싶다. 그래야 회차마다 균형 잡힌 범위를 연습할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 연습 또는 모의고사 시작을 요청하면, THE Exam_Generator SHALL 각 Domain에 대해 `회차 문항 수 × Domain_Weight`를 계산하고 계산값 이하의 가장 큰 정수를 최초 Domain_Allocation으로 배정한다.
2. WHEN 최초 Domain_Allocation 합계가 회차 문항 수보다 작으면, THE Exam_Generator SHALL 계산값의 소수 부분이 큰 Domain부터 남은 문항을 한 개씩 배정한다.
3. WHEN 둘 이상의 Domain에서 계산값의 소수 부분이 같으면, THE Exam_Generator SHALL JSON_Import에 기록된 Domain 순서가 앞선 Domain부터 남은 문항을 배정한다.
4. WHEN Domain_Allocation이 완료되면, THE Exam_Generator SHALL Domain별 배정 문항 수 합계를 Certification의 회차 문항 수와 일치시킨다.
5. WHEN Domain별 출제 문항 수가 계산되면, THE Exam_Generator SHALL 각 Domain의 Question_Pool에서 Domain_Allocation과 정확히 같은 수의 Question을 중복 없이 선택한다.
6. THE Exam_Generator SHALL 같은 Domain의 Question_Pool에서 Domain_Allocation 크기로 만들 수 있는 각 Question 부분집합의 선택 확률을 서로 같게 적용한다.
7. WHEN 회차 Question 선택이 완료되면, THE Exam_Generator SHALL 선택된 Question으로 만들 수 있는 각 전체 표시 순서의 선택 확률을 서로 같게 적용한다.
8. THE Exam_Generator SHALL 연습 모드와 모의고사 모드에 동일한 Domain_Allocation과 Question 선택 규칙을 적용한다.
9. IF 하나 이상의 Domain의 Question_Pool 크기가 계산된 Domain_Allocation보다 작으면, THEN THE Exam_Generator SHALL 부족한 모든 Domain의 이름, 보유 문항 수 및 필요한 문항 수를 포함한 시작 오류를 반환한다.
10. IF 회차 생성 중 Domain_Allocation, Question 선택, 전체 표시 순서 생성, Question_Snapshot 생성 또는 세션 저장이 실패하면, THEN THE Exam_Generator SHALL 해당 생성 요청의 Practice_Session, Exam_Session 및 Question_Snapshot을 하나도 생성하지 않는다.
11. WHEN 회차 생성이 성공하면, THE Exam_Generator SHALL 선택된 Question 내용, Choice 순서 및 모든 Question의 전체 표시 순서를 해당 세션의 Question_Snapshot으로 원자적으로 저장한다.
12. WHILE Practice_Session 또는 Exam_Session이 존재하면, THE Exam_Generator SHALL 원본 Question_Pool의 변경과 분리된 해당 세션의 Question_Snapshot을 유지한다.

### Requirement 5: 문제 유형과 다국어 표시

**User Story:** 학습자로서, 단일 정답과 복수 정답 문제를 영어 또는 한국어로 풀고 싶다. 그래야 시험 형식과 학습 언어에 맞게 문제를 이해할 수 있다.

#### Acceptance Criteria

1. WHEN Question의 필수 선택 수가 1이면, THE Question_Presenter SHALL 단일 Choice만 선택할 수 있는 라디오 입력을 표시한다.
2. WHEN Question의 필수 선택 수가 2 이상이면, THE Question_Presenter SHALL 복수 Choice를 선택할 수 있는 체크박스 입력과 필수 선택 수를 표시한다.
3. WHILE 사용자가 복수 정답 Question에 응답하면, THE Question_Presenter SHALL 선택된 Choice 수와 필수 선택 수를 함께 표시한다.
4. IF 사용자의 Choice 선택으로 선택된 Choice 수가 필수 선택 수를 초과하면, THEN THE Question_Presenter SHALL 해당 선택을 반영하지 않고 직전 선택 상태를 유지한다.
5. WHEN 사용자가 Language_Mode를 변경하면, THE Question_Presenter SHALL 현재 문항 위치, 선택된 Choice, Flag 및 정답·해설 공개 상태를 변경 전 상태로 유지한다.
6. WHERE Language_Mode가 `en`이면, THE Question_Presenter SHALL 지문, 모든 Choice 및 공개된 해설을 영어로 함께 표시한다.
7. WHERE Language_Mode가 `ko`이고 Translation_Status가 `translated`이면, THE Question_Presenter SHALL 지문, 모든 Choice 및 공개된 해설을 한국어로 함께 표시한다.
8. WHERE Language_Mode가 `ko`이고 Translation_Status가 `en_only`이면, THE Question_Presenter SHALL 지문, 모든 Choice 및 공개된 해설을 영어로 표시하고 한국어 미번역 표시를 제공한다.
9. WHEN 해설 공개 조건이 충족되면, THE Question_Presenter SHALL Markdown_Content의 링크, 코드 블록 및 이미지를 허용된 Markdown 요소로 렌더링한다.
10. IF Markdown_Content에 Raw_HTML이 포함되면, THEN THE Question_Presenter SHALL 해당 Raw_HTML을 실행 가능한 문서 요소가 아닌 이스케이프된 텍스트로 표시한다.
11. IF Markdown_Content의 링크 또는 이미지에 Safe_URL이 아닌 URL이 포함되면, THEN THE Question_Presenter SHALL 해당 URL을 비활성 텍스트로 표시하고 연결 또는 리소스 요청을 생성하지 않는다.
12. IF Markdown_Content의 이미지 로드가 실패하면, THEN THE Question_Presenter SHALL 대체 설명과 이미지 로드 실패 상태를 표시하고 나머지 Markdown_Content를 유지한다.
13. THE Question_Presenter SHALL 현재 문항 번호, 전체 문항 수 및 Domain 이름을 표시한다.

### Requirement 6: 공통 문제 탐색과 상태 저장

**User Story:** 학습자로서, 문제 사이를 이동하고 다시 볼 문제를 표시하고 싶다. 그래야 미풀이 문제와 검토할 문제를 관리할 수 있다.

#### Acceptance Criteria

1. WHILE Practice_Session 또는 Exam_Session이 진행 중이고 현재 위치가 첫 번째 Question이면, THE Question_Presenter SHALL 이전 문항 이동을 비활성 상태로 표시한다.
2. WHILE Practice_Session 또는 Exam_Session이 진행 중이고 현재 위치가 마지막 Question이면, THE Question_Presenter SHALL 다음 문항 이동을 비활성 상태로 표시한다.
3. WHEN 사용자가 활성 상태인 이전 문항 이동을 선택하면, THE Question_Presenter SHALL 현재 Question 번호를 정확히 1 감소시킨다.
4. WHEN 사용자가 활성 상태인 다음 문항 이동을 선택하면, THE Question_Presenter SHALL 현재 Question 번호를 정확히 1 증가시킨다.
5. WHILE Practice_Session 또는 Exam_Session이 진행 중이면, THE Question_Presenter SHALL 1부터 전체 Question 수까지의 각 Question 번호를 정확히 한 번 포함하는 문항 탐색기를 제공한다.
6. WHEN 사용자가 문항 탐색기에서 Question 번호를 선택하면, THE Question_Presenter SHALL 선택한 번호의 Question으로 현재 위치를 이동한다.
7. WHEN Practice_Session의 Flag 변경 요청의 State_Version이 저장된 State_Version과 일치하면, THE Practice_Manager SHALL 변경된 Flag 상태를 저장하고 State_Version을 정확히 1 증가시킨 후 성공 응답을 반환한다.
8. WHEN Exam_Session의 Flag 변경 요청의 State_Version이 저장된 State_Version과 일치하면, THE Exam_Manager SHALL 변경된 Flag 상태를 저장하고 State_Version을 정확히 1 증가시킨 후 성공 응답을 반환한다.
9. IF Flag 상태 저장이 실패하면, THEN THE Question_Presenter SHALL 표시된 Flag를 저장 전 상태로 복원하고 저장 오류를 표시한다.
10. IF Practice_Session의 Flag 변경 요청의 State_Version이 저장된 State_Version과 다르면, THEN THE Practice_Manager SHALL 저장된 Flag와 State_Version을 변경하지 않고 최신 State_Version을 포함한 상태 충돌 오류를 반환한다.
11. IF Exam_Session의 Flag 변경 요청의 State_Version이 저장된 State_Version과 다르면, THEN THE Exam_Manager SHALL 저장된 Flag와 State_Version을 변경하지 않고 최신 State_Version을 포함한 상태 충돌 오류를 반환한다.
12. WHEN Flag 변경 요청에 상태 충돌 오류가 반환되면, THE Question_Presenter SHALL 표시된 Flag를 저장 전 상태로 복원하고 상태 충돌 오류를 표시한다.
13. THE Question_Presenter SHALL 현재 위치와 일치하는 Question 하나를 현재 문항 상태로 표시한다.
14. THE Question_Presenter SHALL 필수 선택 수를 충족하는 응답이 저장된 Question을 응답 완료 상태로 표시한다.
15. THE Question_Presenter SHALL 필수 선택 수를 충족하는 응답이 저장되지 않은 Question을 미응답 상태로 표시한다.
16. WHERE Question의 Flag가 설정되어 있으면, THE Question_Presenter SHALL 현재 문항, 응답 완료 또는 미응답 상태와 함께 Flag 상태를 표시한다.

### Requirement 7: 연습 세션 생성과 이어풀기

**User Story:** 학습자로서, 연습을 중단한 뒤 같은 진행 상태로 돌아오고 싶다. 그래야 시간 제약 없이 학습을 이어갈 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 활성 Practice_Session이 없는 Certification의 연습 시작을 요청하면, THE Practice_Manager SHALL State_Version이 0인 새로운 Practice_Session 하나를 사용자와 Certification 조합에 원자적으로 생성한다.
2. WHEN 새로운 Practice_Session 생성이 성공하면, THE Practice_Manager SHALL 생성된 Practice_Session 식별자와 State_Version 0을 성공 응답에 포함한다.
3. IF 새로운 Practice_Session 생성 또는 Question_Snapshot 저장이 실패하면, THEN THE Practice_Manager SHALL Practice_Session과 Question_Snapshot을 하나도 생성하지 않고 시작 오류를 반환한다.
4. THE Practice_Manager SHALL 사용자와 Certification 조합마다 활성 Practice_Session을 최대 1개로 유지한다.
5. WHEN 사용자가 활성 Practice_Session이 있는 Certification의 연습 시작을 요청하면, THE Practice_Manager SHALL 기존 세션 이어풀기와 기존 세션 교체 선택을 제공한다.
6. WHILE 사용자가 기존 Practice_Session 이어풀기 또는 교체를 선택하지 않았으면, THE Practice_Manager SHALL 기존 Practice_Session과 새 Practice_Session을 변경하지 않는다.
7. WHEN 사용자가 기존 Practice_Session 이어풀기를 선택하면, THE Practice_Manager SHALL 저장된 Question_Snapshot, Choice 순서, 응답, 제출 상태, 공개된 정답과 해설 상태, Flag 및 현재 위치를 복원하고 Practice_Session 식별자와 현재 State_Version을 반환한다.
8. WHEN 사용자가 기존 Practice_Session 교체를 확인하면, THE Practice_Manager SHALL 기존 Practice_Session 제거와 State_Version이 0인 새 Practice_Session 생성을 하나의 원자적 작업으로 처리하고 새 Practice_Session 식별자와 State_Version 0을 반환한다.
9. IF Practice_Session 교체 작업이 실패하면, THEN THE Practice_Manager SHALL 기존 Practice_Session을 유지하고 새 Practice_Session과 Question_Snapshot을 생성하지 않는다.
10. WHEN Practice_Session의 응답, 제출 상태, Flag 또는 현재 위치 변경 요청의 State_Version이 저장된 State_Version과 일치하면, THE Practice_Manager SHALL 해당 변경을 원자적으로 저장하고 State_Version을 정확히 1 증가시킨 후 증가된 State_Version과 Practice_Session 식별자를 성공 응답에 포함한다.
11. IF Practice_Session 상태 변경 저장이 실패하면, THEN THE Practice_Manager SHALL 저장 전 Practice_Session 상태와 State_Version을 유지하고 저장 오류를 반환한다.
12. IF Practice_Session 상태 변경 요청의 State_Version이 저장된 State_Version과 다르면, THEN THE Practice_Manager SHALL 저장된 상태를 변경하지 않고 최신 Practice_Session을 재조회할 수 있는 Practice_Session 식별자와 최신 State_Version을 포함한 상태 충돌 오류를 반환한다.

### Requirement 8: 연습 문제 최초 제출 잠금과 즉시 해설

**User Story:** 학습자로서, 각 문제의 답을 확정한 직후 정답과 해설을 보고 싶다. 그래야 답을 바꾸어 결과를 왜곡하지 않고 즉시 학습할 수 있다.

#### Acceptance Criteria

1. IF 단일 정답 Question에 선택된 Choice 수가 1이 아니면, THEN THE Practice_Manager SHALL 최초 제출을 거부하고 필요한 선택 수를 반환하며 Practice_Session 상태를 유지한다.
2. IF 복수 정답 Question의 선택된 Choice 수가 필수 선택 수와 다르면, THEN THE Practice_Manager SHALL 최초 제출을 거부하고 필요한 선택 수를 반환하며 Practice_Session 상태를 유지한다.
3. IF 제출 응답에 해당 Question에 속하지 않는 Choice가 포함되면, THEN THE Practice_Manager SHALL 최초 제출을 거부하고 Practice_Session 상태를 유지한다.
4. IF 제출 대상 Question이 요청된 Practice_Session에 속하지 않으면, THEN THE Practice_Manager SHALL 최초 제출을 거부하고 Practice_Session 상태를 유지한다.
5. WHEN Question의 최초 제출이 승인되면, THE Practice_Manager SHALL 제출 시점의 선택된 Choice 집합, Scoring_Mode에 따른 채점 결과 및 획득 점수를 해당 Practice_Session의 최종 응답으로 원자적으로 잠근다.
6. WHEN 잠긴 최종 응답과 동일한 Choice 집합으로 같은 Question의 제출이 반복되면, THE Practice_Manager SHALL 최초 제출과 동일한 채점 결과 및 획득 점수를 반환하고 Practice_Session을 추가로 변경하지 않는다.
7. IF 잠긴 최종 응답과 다른 Choice 집합으로 같은 Question의 제출이 반복되면, THEN THE Practice_Manager SHALL 응답 변경을 거부하고 잠긴 최종 응답과 획득 점수를 유지한다.
8. WHEN Question의 최초 제출 저장이 성공하면, THE Question_Presenter SHALL 해당 Question의 정오답, 정답 Choice, 획득 점수 및 선택된 Language_Mode의 해설을 표시한다.
9. WHILE Question의 최초 제출 전 상태가 유지되면, THE CertQuiz_System SHALL 해당 Question_Projection에 정답 Choice, 정오답, 획득 점수 및 해설 필드 자체를 포함하지 않는다.
10. WHILE 하나 이상의 Question이 최초 제출 전 상태이면, THE Question_Presenter SHALL 최초 제출이 완료된 Question에만 정답 Choice, 정오답, 획득 점수 및 해설을 표시한다.
11. WHEN Practice_Session의 마지막 미제출 Question의 최초 제출이 성공하면, THE Practice_Manager SHALL Practice_Session 완료와 Completed_Practice_Result 하나의 생성을 원자적으로 처리한다.
12. WHEN 완료된 Practice_Session의 마지막 Question 제출이 반복되면, THE Practice_Manager SHALL 기존 Completed_Practice_Result와 동일한 결과를 반환하고 Completed_Practice_Result를 추가로 생성하지 않는다.

### Requirement 9: 연습 결과 보관과 통계 제외

**User Story:** 학습자로서, 완료한 연습 결과를 일주일 동안 다시 보고 싶다. 그래야 단기 복습은 가능하면서 모의고사 통계와 분리할 수 있다.

#### Acceptance Criteria

1. WHEN Completed_Practice_Result가 생성되면, THE Result_Service SHALL Raw_Score와 Accuracy_Rate의 Exact_Value를 제공한다.
2. WHEN Completed_Practice_Result가 생성되면, THE Result_Service SHALL 각 Domain의 전체 Question 수, 획득 점수 합의 Exact_Value 및 Accuracy_Rate의 Exact_Value를 제공한다.
3. WHEN Completed_Practice_Result가 생성되면, THE Result_Service SHALL 각 Question의 전체 표시 순서, 사용자 응답, 정답 Choice, 획득 점수 및 해설을 제공한다.
4. WHILE 서버 현재 시각이 Completed_Practice_Result의 완료 시각 이상이고 완료 시각부터 168시간이 되는 시각보다 이르면, THE Result_Service SHALL 해당 사용자에게 Completed_Practice_Result 다시보기를 제공한다.
5. WHEN 서버 현재 시각이 Completed_Practice_Result의 완료 시각부터 정확히 168시간이 되는 시각 이상이면, THE Result_Service SHALL 해당 Completed_Practice_Result를 사용자 조회 결과에 포함하지 않고 만료 오류를 반환한다.
6. WHEN 서버 현재 시각이 Completed_Practice_Result의 완료 시각부터 정확히 168시간이 되는 시각 이상이면, THE Retention_Manager SHALL 해당 Completed_Practice_Result를 삭제 대상으로 처리한다.
7. WHILE 삭제 대상으로 처리된 Completed_Practice_Result의 물리적 삭제가 완료되지 않았으면, THE Result_Service SHALL 해당 Completed_Practice_Result를 사용자 조회 결과에서 제외한다.
8. THE History_Service SHALL Attempt 데이터만 사용하여 응시 횟수, 점수 이력 및 점수 추이를 계산한다.
9. THE History_Service SHALL Completed_Practice_Result를 응시 횟수, 점수 이력 및 점수 추이에서 제외한다.
10. THE Leaderboard_Service SHALL Attempt 데이터만 사용하여 순위를 계산한다.
11. THE Leaderboard_Service SHALL Completed_Practice_Result를 순위 후보와 대표 성과에서 제외한다.

### Requirement 10: 모의고사 세션과 서버 기준 제한 시간

**User Story:** 응시자로서, 실제 시험처럼 제한 시간이 계속 흐르는 모의고사를 치르고 싶다. 그래야 시간 관리 능력을 평가할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자의 모의고사 시작 확인 요청을 서버가 수신하면, THE Exam_Manager SHALL 서버 수신 시각인 시작 시각과 시작 시각에 Certification 제한 시간을 더한 만료 시각을 원자적으로 저장한다.
2. WHEN 동일한 모의고사 시작 확인 요청이 반복되면, THE Exam_Manager SHALL 기존 Exam_Session의 시작 시각과 만료 시각을 변경하지 않고 기존 Exam_Session 식별자, 시작 시각 및 만료 시각을 반환한다.
3. WHILE Exam_Session이 활성 상태이면, THE Exam_Manager SHALL `max(0, floor((만료 시각 - 서버 현재 시각)의 초 단위 값))`으로 남은 시간을 계산한다.
4. WHEN 사용자가 만료 시각 전에 Exam_Session으로 돌아오면, THE Exam_Manager SHALL 저장된 Question_Snapshot, Choice 순서, 응답, Flag, 현재 위치, State_Version 및 서버 기준 남은 시간을 복원한다.
5. IF Exam_Session 복원이 실패하면, THEN THE Exam_Manager SHALL 대체 Exam_Session 또는 Question_Snapshot을 생성하지 않고 복원 오류를 반환한다.
6. WHILE Exam_Session이 활성 상태이면, THE Exam_Manager SHALL 사용자의 화면 이탈 또는 연결 종료와 관계없이 저장된 시작 시각과 만료 시각을 유지한다.
7. WHILE Exam_Session이 제출 전 상태이면, THE CertQuiz_System SHALL 각 Question_Projection에 정답 Choice, 정오답, 획득 점수 및 해설 필드 자체를 포함하지 않는다.
8. WHILE Exam_Session이 활성 상태이고 서버 현재 시각이 만료 시각보다 이르면, THE Exam_Manager SHALL 저장된 Question 응답의 변경을 허용한다.
9. IF 서버 현재 시각이 Exam_Session의 만료 시각 이상이면, THEN THE Exam_Manager SHALL Question 응답, Flag 및 현재 위치 변경을 거부하고 만료 전 저장 상태를 유지한다.
10. WHEN Exam_Session의 Question 응답, Flag 또는 현재 위치 변경 요청의 State_Version이 저장된 State_Version과 일치하면, THE Exam_Manager SHALL 변경 상태를 저장하고 State_Version을 정확히 1 증가시킨 후 증가된 State_Version과 Exam_Session 식별자를 성공 응답에 포함한다.
11. IF Exam_Session 상태 변경 저장이 실패하면, THEN THE Exam_Manager SHALL 저장 전 Exam_Session 상태와 State_Version을 유지하고 저장 오류를 반환한다.
12. IF Exam_Session 상태 변경 요청의 State_Version이 저장된 State_Version과 다르면, THEN THE Exam_Manager SHALL 저장된 상태를 변경하지 않고 최신 Exam_Session을 재조회할 수 있는 Exam_Session 식별자와 최신 State_Version을 포함한 상태 충돌 오류를 반환한다.
13. WHEN 사용자가 만료 시각 전에 모의고사 제출 미리보기를 요청하면, THE Question_Presenter SHALL 서버에 저장이 완료된 최신 상태를 기준으로 미응답 Question 수와 Flag Question 수를 포함한 제출 확인을 표시한다.

### Requirement 11: 모의고사 제출과 만료 시 자동 제출

**User Story:** 응시자로서, 직접 제출하거나 시간이 만료되면 결과가 한 번만 확정되기를 원한다. 그래야 중복 이력이나 시간 이득 없이 일관된 점수를 받을 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 만료 시각 전에 제출을 확정하면, THE Exam_Manager SHALL 제출 요청 수신 전에 저장이 완료된 최신 응답으로 Idempotent_Submission을 수행한다.
2. WHEN 만료된 미제출 Exam_Session을 가진 세션 소유자의 인증된 API_Request가 수신되면, THE Exam_Manager SHALL API_Request의 대상 기능과 관계없이 해당 사용자의 만료된 미제출 Exam_Session에 대해 만료 시각과 Exam_Session 식별자의 오름차순으로 원래 요청 처리 전에 각각 Idempotent_Submission을 수행한다.
3. WHILE 만료된 Exam_Session에 대해 세션 소유자의 인증된 API_Request가 수신되지 않았으면, THE Exam_Manager SHALL 만료만을 근거로 Attempt를 생성하지 않는다.
4. WHEN 만료된 Exam_Session이 제출되면, THE Exam_Manager SHALL 만료 시각 이하의 서버 시각에 저장이 완료된 응답만 채점 대상으로 사용한다.
5. WHEN 미응답 Question이 포함된 Exam_Session이 제출되면, THE Scoring_Engine SHALL 각 미응답 Question에 0점을 부여한다.
6. WHEN 동일한 Exam_Session의 수동 제출과 만료 제출이 동시에 처리되면, THE Exam_Manager SHALL Attempt를 정확히 1개 생성하고 두 제출 흐름에 동일한 Attempt 식별자와 결과를 반환한다.
7. WHEN 동일한 Exam_Session에 제출 요청이 반복되면, THE Exam_Manager SHALL 최초 생성된 Attempt 식별자와 동일한 결과를 반환한다.
8. THE Exam_Manager SHALL 하나의 Exam_Session에서 최대 1개의 Attempt를 생성한다.
9. WHEN Idempotent_Submission이 완료되면, THE Exam_Manager SHALL Attempt 생성과 Exam_Session의 제출 완료 상태 전환을 하나의 원자적 작업으로 처리한다.
10. IF Idempotent_Submission이 실패하면, THEN THE Exam_Manager SHALL 해당 Exam_Session을 미제출 상태로 유지하고 해당 Exam_Session의 Attempt를 생성하지 않은 채 제출 오류를 반환한다.
11. IF 원래 API_Request 처리 전에 순차 수행하는 하나 이상의 Idempotent_Submission이 실패하면, THEN THE Exam_Manager SHALL 실패 전에 완료된 Attempt를 유지하고 원래 API_Request를 실행하지 않는다.
12. IF 원래 API_Request 처리 전에 순차 수행하는 하나 이상의 Idempotent_Submission이 실패하면, THEN THE Exam_Manager SHALL 실패한 소유자 Exam_Session 식별자를 포함하고 보호 데이터가 포함되지 않은 재시도 가능한 제출 오류를 반환한다.

### Requirement 12: 채점과 대표 점수

**User Story:** 응시자로서, 이해하기 쉬운 원점수와 정답률로 성과를 확인하고 싶다. 그래야 비공식 환산값과 실제 학습 성과를 구분할 수 있다.

#### Acceptance Criteria

1. WHERE Certification의 Scoring_Mode가 `all_or_nothing`이면, THE Scoring_Engine SHALL 선택된 Choice 집합과 정답 Choice 집합의 원소가 정확히 같은 Question에 1점을 부여한다.
2. WHERE Certification의 Scoring_Mode가 `all_or_nothing`이면, THE Scoring_Engine SHALL 선택된 Choice 집합과 정답 Choice 집합의 원소가 하나 이상 다른 Question에 0점을 부여한다.
3. WHERE Certification의 Scoring_Mode가 `partial`이고 선택된 Choice 수가 필수 선택 수와 같으면, THE Scoring_Engine SHALL `선택된 Choice 집합과 정답 Choice 집합의 교집합 원소 수 ÷ 정답 Choice 수`의 Exact_Value로 Question 점수를 계산한다.
4. WHERE Certification의 Scoring_Mode가 `partial`이고 선택된 Choice 수가 필수 선택 수와 다르면, THE Scoring_Engine SHALL 해당 Question에 0점을 부여한다.
5. WHEN 회차 채점이 완료되면, THE Scoring_Engine SHALL Question별 점수의 Exact_Value를 중간 반올림 없이 합산하여 Raw_Score의 Exact_Value를 계산한다.
6. WHEN Raw_Score가 계산되면, THE Scoring_Engine SHALL `Raw_Score ÷ 전체 Question 수 × 100`을 중간 반올림 없이 계산하여 Accuracy_Rate의 Exact_Value를 유지한다.
7. WHEN Accuracy_Rate가 계산되면, THE Scoring_Engine SHALL Accuracy_Rate의 Exact_Value가 Pass_Threshold의 Exact_Value 이상인지로 합격 여부를 결정한다.
8. WHEN Accuracy_Rate가 계산되면, THE Scoring_Engine SHALL `Accuracy_Rate × 10`의 Exact_Value에 Half_Up_Rounding을 적용한 정수를 Reference_1000_Score로 계산한다.
9. THE Result_Service SHALL Raw_Score와 Accuracy_Rate를 대표 점수로 표시한다.
10. WHEN Result_Service가 Raw_Score와 Accuracy_Rate를 화면에 표시하면, THE Result_Service SHALL 각 Exact_Value에 소수점 이하 둘째 자리 Half_Up_Rounding을 적용한 값을 표시한다.
11. WHERE Reference_1000_Score가 표시되면, THE Result_Service SHALL Reference_1000_Score를 참고 환산값으로 표시한다.
12. THE Leaderboard_Service SHALL Accuracy_Rate의 Exact_Value를 대표 성과 선택, 순위 비교 및 동률 판정에 사용한다.
13. IF Scoring_Mode가 `all_or_nothing` 또는 `partial`이 아니면, THEN THE Scoring_Engine SHALL 점수와 합격 여부를 확정하지 않고 Scoring_Mode를 식별하는 설정 오류를 반환한다.
14. IF Pass_Threshold가 0 이상 100 이하가 아니면, THEN THE Scoring_Engine SHALL 점수와 합격 여부를 확정하지 않고 Pass_Threshold를 식별하는 설정 오류를 반환한다.
15. IF Question의 필수 선택 수가 1 미만이거나 전체 Choice 수를 초과하면, THEN THE Scoring_Engine SHALL 점수와 합격 여부를 확정하지 않고 해당 Question과 필수 선택 수를 식별하는 설정 오류를 반환한다.
16. IF Question의 정답 Choice 집합이 비어 있거나 Question의 Choice 집합의 부분집합이 아니면, THEN THE Scoring_Engine SHALL 점수와 합격 여부를 확정하지 않고 해당 Question과 유효하지 않은 정답 Choice를 식별하는 설정 오류를 반환한다.
17. IF Question의 필수 선택 수와 정답 Choice 수가 다르면, THEN THE Scoring_Engine SHALL 점수와 합격 여부를 확정하지 않고 해당 Question, 필수 선택 수 및 정답 Choice 수를 식별하는 설정 오류를 반환한다.

### Requirement 13: 모의고사 결과와 불변 이력

**User Story:** 응시자로서, 제출 당시의 문제와 답변을 포함한 모의고사 결과를 나중에도 확인하고 싶다. 그래야 문제 은행이 바뀌어도 과거 응시 내용을 동일하게 검토할 수 있다.

#### Acceptance Criteria

1. WHEN Exam_Session 제출이 완료되면, THE Result_Service SHALL Raw_Score와 Accuracy_Rate의 Exact_Value, Reference_1000_Score 및 합격 여부를 제공한다.
2. WHEN Exam_Session 제출이 완료되면, THE Result_Service SHALL 각 Domain의 전체 Question 수, 획득 점수 합의 Exact_Value 및 Accuracy_Rate의 Exact_Value를 제공한다.
3. WHEN Exam_Session 제출이 완료되면, THE Result_Service SHALL 각 Question의 전체 표시 순서, Choice 표시 순서, 사용자 응답 또는 미응답 상태, 정답 Choice, 획득 점수 및 해설을 제공한다.
4. WHEN Attempt가 생성되면, THE Exam_Manager SHALL 제출 시점의 Certification 시험 코드, 이름, Scoring_Mode 및 Pass_Threshold를 Attempt에 저장한다.
5. WHEN Attempt가 생성되면, THE Exam_Manager SHALL 출제된 Question_Snapshot, Question 전체 표시 순서, Choice 표시 순서, 사용자 응답 또는 미응답 상태, 정답 Choice 및 Question별 획득 점수를 Attempt에 저장한다.
6. WHEN Attempt가 생성되면, THE Exam_Manager SHALL Raw_Score와 Accuracy_Rate의 Exact_Value, Reference_1000_Score, Pass_Threshold, 합격 여부 및 각 Domain의 전체 Question 수, 획득 점수 합의 Exact_Value와 Accuracy_Rate의 Exact_Value를 Attempt에 저장한다.
7. WHEN Attempt가 생성되면, THE Exam_Manager SHALL Exam_Session의 시작 시각, 만료 시각 및 제출 시각을 Attempt에 저장한다.
8. WHILE Attempt가 보관되면, THE History_Service SHALL 원본 Provider, Certification, Domain 및 Question_Pool의 변경과 분리된 Attempt 데이터를 제공한다.
9. WHEN JSON_Import로 Certification 데이터가 교체되면, THE History_Service SHALL 기존 Attempt의 Certification 정보, Question_Snapshot, Question과 Choice 표시 순서, 응답 또는 미응답 상태, 점수, 합격 여부, Domain별 성과 및 시각을 변경하지 않는다.
10. WHEN 사용자가 모의고사 이력을 요청하면, THE History_Service SHALL 해당 사용자가 소유한 Attempt만 제출 시각의 내림차순으로 제공한다.
11. WHEN 해당 사용자가 소유한 둘 이상의 Attempt의 제출 시각이 같으면, THE History_Service SHALL Attempt 식별자의 오름차순으로 해당 Attempt의 순서를 결정한다.
12. WHEN 사용자가 모의고사 통계를 요청하면, THE History_Service SHALL 해당 사용자가 소유한 Attempt만 사용하여 Certification별 Attempt 수와 제출 시각 오름차순의 Accuracy_Rate 추이를 제공한다.
13. WHEN 점수 추이에서 둘 이상의 Attempt의 제출 시각이 같으면, THE History_Service SHALL Attempt 식별자의 오름차순으로 해당 Accuracy_Rate의 순서를 결정한다.
14. WHEN 사용자에게 Attempt가 없으면, THE History_Service SHALL 오류 대신 빈 이력, Certification별 응시 횟수 0 및 빈 점수 추이를 제공한다.

### Requirement 14: 점수 공개 설정과 리더보드

**User Story:** 사용자로서, 점수 공개 여부를 선택하고 공개를 선택한 사용자와 최고 성과를 비교하고 싶다. 그래야 개인정보 선택권을 유지하면서 학습 동기를 얻을 수 있다.

#### Acceptance Criteria

1. THE CertQuiz_System SHALL 신규 User_Profile의 점수 공개 설정을 `false`로 초기화한다.
2. WHEN Approval_Status가 `approved`인 사용자가 점수 공개 설정을 변경하면, THE CertQuiz_System SHALL 변경된 공개 설정을 User_Profile에 저장한다.
3. IF Approval_Status가 `pending`인 사용자가 점수 공개 설정 변경을 요청하면, THEN THE Access_Controller SHALL User_Profile을 변경하지 않고 권한 오류를 반환한다.
4. WHERE User_Profile의 점수 공개 설정이 `true`이고 해당 Certification의 Attempt가 하나 이상이면, THE Leaderboard_Service SHALL 해당 사용자를 해당 Certification의 순위 후보에 정확히 한 번 포함한다.
5. WHERE User_Profile의 점수 공개 설정이 `true`이고 해당 Certification의 Attempt가 없으면, THE Leaderboard_Service SHALL 해당 사용자를 해당 Certification의 순위 후보에서 제외한다.
6. WHERE User_Profile의 점수 공개 설정이 `false`이면, THE Leaderboard_Service SHALL 해당 사용자를 순위 후보와 순위 결과에서 제외한다.
7. THE Leaderboard_Service SHALL 각 사용자와 Certification 조합에서 Accuracy_Rate의 Exact_Value가 가장 높은 Attempt 하나를 대표 성과로 사용한다.
8. WHEN 한 사용자와 Certification 조합에서 최고 Accuracy_Rate의 Exact_Value가 같은 Attempt가 둘 이상이면, THE Leaderboard_Service SHALL 제출 시각이 가장 이른 Attempt를 대표 성과로 사용한다.
9. WHEN 한 사용자와 Certification 조합에서 최고 Accuracy_Rate의 Exact_Value와 제출 시각이 같은 Attempt가 둘 이상이면, THE Leaderboard_Service SHALL Attempt 식별자가 가장 작은 Attempt를 대표 성과로 사용한다.
10. WHEN Certification 리더보드가 요청되면, THE Leaderboard_Service SHALL 순위 후보를 대표 성과 Accuracy_Rate의 Exact_Value 내림차순으로 제공한다.
11. WHEN 둘 이상의 순위 후보에서 대표 성과 Accuracy_Rate의 Exact_Value가 같으면, THE Leaderboard_Service SHALL Standard_Competition_Rank에 따라 해당 후보에게 같은 순위를 부여한다.
12. WHEN 둘 이상의 순위 후보에서 대표 성과 Accuracy_Rate의 Exact_Value가 같으면, THE Leaderboard_Service SHALL 대표 Attempt의 제출 시각 오름차순과 User_Profile 식별자 오름차순으로 해당 후보의 출력 순서를 결정한다.
13. WHEN 현재 사용자가 순위 후보에 포함되면, THE Leaderboard_Service SHALL 현재 사용자 항목에 현재 사용자 표시를 정확히 한 번 제공한다.
14. WHEN 현재 사용자가 순위 후보에 포함되지 않으면, THE Leaderboard_Service SHALL 다른 사용자 항목에 현재 사용자 표시를 제공하지 않는다.
15. WHEN Certification의 순위 후보가 없으면, THE Leaderboard_Service SHALL 오류 대신 빈 리더보드를 제공한다.

### Requirement 15: 관리자 JSON 문제 은행 임포트

**User Story:** 관리자로서, 자격증 전체 문제 은행을 JSON 파일로 검증하고 교체하고 싶다. 그래야 웹 폼으로 문제를 하나씩 입력하지 않고 콘텐츠를 관리할 수 있다.

#### Acceptance Criteria

1. WHEN 관리자가 JSON_Import 파일 검증을 요청하면, THE Import_Service SHALL 저장된 Provider, Certification, Domain 및 Question_Pool을 변경하지 않는 검증을 수행한다.
2. IF JSON_Import 파일이 유효한 JSON 문법으로 해석되지 않으면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 오류 위치를 포함한 문법 오류를 반환한다.
3. WHEN 관리자가 JSON_Import 파일을 검증하면, THE Import_Service SHALL Choice 식별자와 영어 텍스트를 포함한 Provider, Certification, Domain, Question 및 Choice의 필수 필드와 데이터 타입을 검증한다.
4. IF 모든 Domain_Weight의 Exact_Value 합이 정확히 100%가 아니면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 계산된 Exact_Value 비율 합계를 포함한 오류를 반환한다.
5. IF Question의 Domain 식별자가 임포트 Domain에 존재하지 않으면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 해당 Question 식별자와 Domain 식별자를 포함한 참조 오류를 반환한다.
6. IF Certification 안에서 Question 식별자가 중복되면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 모든 중복 Question 식별자를 포함한 오류를 반환한다.
7. IF Question 안에서 Choice 식별자가 중복되면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 해당 Question 식별자와 모든 중복 Choice 식별자를 포함한 오류를 반환한다.
8. IF Question의 정답 Choice 집합이 비어 있거나 Question의 Choice 식별자 집합의 부분집합이 아니면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 해당 Question 식별자와 유효하지 않은 Choice 식별자를 포함한 정답 오류를 반환한다.
9. IF Question의 필수 선택 수가 1 미만이거나 전체 Choice 수를 초과하거나 정답 Choice 수와 다르면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 해당 Question 식별자, 필수 선택 수, 전체 Choice 수 및 정답 Choice 수를 포함한 오류를 반환한다.
10. IF Question의 영어 지문, 영어 Choice 또는 영어 해설이 누락되거나 공백 문자만 포함하면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 해당 Question 식별자와 누락 또는 공백 필드를 포함한 언어 필드 오류를 반환한다.
11. WHERE Question의 한국어 지문, 한국어 Choice 또는 한국어 해설 중 하나 이상이 누락되고 영어 필드가 유효하면, THE Import_Service SHALL Translation_Status를 `en_only`로 판정한다.
12. WHERE Question의 영어와 한국어 지문, 모든 Choice 및 해설이 유효하면, THE Import_Service SHALL Translation_Status를 `translated`로 판정한다.
13. IF Domain의 Question 수가 Domain_Allocation의 출제 문항 수보다 작으면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 부족한 모든 Domain의 이름, 보유 문항 수 및 필요한 문항 수를 포함한 오류를 반환한다.
14. IF Question_Pool의 전체 Question 수가 Certification의 회차 문항 수보다 작으면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 전체 보유 문항 수와 필요한 문항 수를 포함한 문제 은행 크기 오류를 반환한다.
15. IF JSON_Import 파일 크기가 10 MiB를 초과하면, THEN THE Import_Service SHALL JSON 문법 해석 전에 요청을 거부하고 현재 Certification 데이터를 유지하며 실제 파일 크기와 10 MiB 제한을 포함한 오류를 반환한다.
16. IF JSON_Import의 중첩 깊이가 20단계를 초과하거나 전체 Question 수가 10,000개를 초과하거나 한 Question의 Choice 수가 20개를 초과하면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 초과한 구조 제한, 실제 값 및 구조 위치를 포함한 오류를 반환한다.
17. WHEN JSON_Import 검증에서 둘 이상의 오류가 발견되면, THE Import_Service SHALL 구조상 후속 검증이 불가능한 항목을 제외하고 독립적으로 식별 가능한 모든 오류의 위치, 관련 식별자 및 원인을 하나의 검증 결과로 반환한다.
18. WHEN JSON_Import 검증이 완료되고 모든 요약 수치를 계산할 수 있으면, THE Admin_Console SHALL 전체 Question 수, Domain별 Question 수, Translation_Status별 Question 수 및 모든 검증 오류 수를 표시한다.
19. WHEN JSON_Import의 구조 오류로 하나 이상의 요약 수치를 계산할 수 없으면, THE Admin_Console SHALL 계산 가능한 요약 수치를 유지하고 계산할 수 없는 각 요약 수치를 계산 불가 상태로 표시한다.
20. WHEN JSON_Import의 모든 검증이 성공하면, THE Import_Service SHALL 검증을 요청한 관리자와 Canonical_JSON 내용에 결합되고 생성 시각부터 15분 동안 유효하며 사용 전 상태인 Import_Validation을 생성한다.
21. WHEN 관리자가 본인에게 결합된 사용 전 Import_Validation의 생성 시각 이상이고 생성 시각부터 15분이 되는 시각보다 이른 시점에 동일한 Canonical_JSON 내용의 교체를 확정하면, THE Import_Service SHALL 해당 Provider, Certification, Domain 및 Question_Pool 데이터 전체 교체와 Import_Validation의 사용 완료 상태 전환을 하나의 원자적 작업으로 처리한다.
22. IF 관리자가 확정한 JSON_Import의 Canonical_JSON 내용이 Import_Validation에 결합된 내용과 다르면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 재검증 필요 오류를 반환한다.
23. IF 관리자가 다른 관리자에게 결합된 Import_Validation으로 교체를 확정하면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 권한 오류를 반환한다.
24. IF Import_Validation 생성 시각부터 15분 이상 지난 후 교체가 확정되면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 검증 만료 오류를 반환한다.
25. IF 사용 완료 상태인 Import_Validation으로 교체가 다시 확정되면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 검증 결과 재사용 오류를 반환한다.
26. IF 성공한 Import_Validation 없이 JSON_Import 교체가 확정되면, THEN THE Import_Service SHALL 현재 Certification 데이터를 유지하고 검증 필요 오류를 반환한다.
27. IF JSON_Import 교체 작업 중 오류가 발생하면, THEN THE Import_Service SHALL Provider, Certification, Domain, Question_Pool 및 Import_Validation 사용 상태를 모두 교체 직전 상태로 원자적으로 복원한다.
28. WHEN Certification 데이터가 교체되면, THE Import_Service SHALL 기존 Attempt와 Attempt의 Question_Snapshot을 변경하지 않는다.

### Requirement 16: 로딩, 빈 상태 및 오류 피드백

**User Story:** 사용자로서, 데이터 요청과 오류의 현재 상태를 명확히 알고 싶다. 그래야 중복 작업을 피하고 다음 행동을 결정할 수 있다.

#### Acceptance Criteria

1. WHILE 하나 이상의 화면 데이터 API_Request가 완료 전이면, THE CertQuiz_System SHALL 완료 전인 각 API_Request의 로딩 상태를 다른 API_Request의 로딩 상태와 독립적으로 표시한다.
2. WHEN 화면 데이터 API_Request가 성공 또는 실패로 완료되면, THE CertQuiz_System SHALL 완료된 API_Request의 로딩 상태만 종료한다.
3. WHEN 화면 조회 결과가 비어 있으면, THE CertQuiz_System SHALL 요청한 데이터 종류와 적용된 조회 조건에서 결과가 없음을 식별하는 메시지와 사용자가 수행할 수 있는 다음 행동을 표시한다.
4. IF API_Request가 실패하면, THEN THE CertQuiz_System SHALL 인증 정보, 보호 데이터, 내부 오류 세부정보 및 다른 사용자의 데이터가 포함되지 않은 오류 메시지를 표시한다.
5. IF 사용자 입력을 포함한 API_Request가 실패하면, THEN THE CertQuiz_System SHALL 요청 직전의 사용자 입력을 편집 가능한 상태로 유지한다.
6. WHERE 동일한 API_Request의 반복으로 성공할 수 있는 오류이면, THE CertQuiz_System SHALL 재시도 기능을 표시한다.
7. IF 동일한 API_Request의 반복으로 성공할 수 없는 오류이면, THEN THE CertQuiz_System SHALL 재시도 기능 대신 오류를 해결하는 데 필요한 다음 행동을 표시한다.
8. WHILE 동일한 제출 대상의 제출 API_Request가 처리 중이면, THE CertQuiz_System SHALL 해당 제출 대상에 대한 추가 제출을 차단하고 최초 제출 흐름의 상태를 표시한다.
9. WHEN 제출 API_Request가 성공하면, THE CertQuiz_System SHALL 해당 제출 대상의 제출 결과를 정확히 한 번 표시한다.

## Out of Scope

다음 항목은 독립적인 후속 기능으로 추가할 수 있지만 CertQuiz MVP 범위에는 포함하지 않는다.

- 이메일 승인 알림, 시험 알림 및 기타 이메일 발송
- 사용자 거부, 정지, 삭제, 역할 편집, 일괄 처리 및 감사 로그를 포함한 고급 사용자 관리
- AWS 공식 채점 공식을 모사하는 정확한 1000점 환산
- 모바일 반응형 또는 모바일 전용 UI
- 다크 모드와 사용자 지정 테마
- 관리자 웹 폼 기반 Question CRUD
- DOP-C02 이외 자격증의 실제 콘텐츠 제공
- 완료된 연습 결과의 장기 보관과 연습 점수 통계
- 모의고사 타이머 일시 정지
- Question 버전 관리 및 출처 필드

## Requirement Quality Notes

- 각 Acceptance Criterion은 Ubiquitous, Event-driven, State-driven, Unwanted event 또는 Optional feature EARS 패턴 하나를 사용한다.
- 복합 조건은 조건을 하나의 검증 가능한 상태로 묶었으며, 오류 요구사항은 `IF ... THEN THE ... SHALL ...` 순서를 사용한다.
- 대표 성과는 Raw_Score와 Accuracy_Rate이며 Reference_1000_Score는 참고 표시값으로만 정의한다.
- Completed_Practice_Result의 보관 기간은 모호한 “1주” 대신 완료 시점부터 168시간으로 명시한다.
