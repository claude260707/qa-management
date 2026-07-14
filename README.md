# QA Management System — 프로젝트/요구사항/파일첨부/Test Case 관리

기획부터 QA 테스트까지 진행 과정을 관리하는 웹 시스템입니다.
지금 단계는 **프로젝트 관리**, **요구사항 관리**, **파일 첨부**, **Test Case 관리** 기능이 실제 동작하며, 나머지(QA테스트/Bug/Release)는
사이드바에 "준비중"으로 표시만 되어 있어 다음 단계에서 이어서 개발할 수 있습니다.

## 기술 스택
- Frontend: React 19 + TypeScript + Vite
- Backend: Node.js + Express
- Database: PostgreSQL 16

## 폴더 구조
```
qa-management/
├── backend/                     # Express API 서버
│   ├── server.js
│   ├── schema.sql                # 프로젝트 테이블 + 샘플 데이터
│   ├── schema_requirements.sql   # 요구사항 테이블 + 샘플 데이터
│   ├── schema_attachments.sql    # 파일 첨부 테이블
│   ├── schema_attachments_links.sql  # 파일 첨부 테이블에 "링크" 유형 추가 (ALTER)
│   ├── schema_test_cases.sql     # Test Case 테이블 + 샘플 데이터
│   ├── schema_status_migration.sql   # 프로젝트 상태 세분화 마이그레이션 (5단계 → 8단계)
│   ├── schema_attachments_requirement.sql  # 첨부파일을 요구사항 단위로도 연결 (ALTER)
│   ├── schema_automation_script.sql  # Test Case에 자동화 스크립트 저장 필드 추가 (ALTER)
│   ├── uploads/                  # 업로드된 파일이 저장되는 폴더 (자동 생성)
│   ├── src/
│   │   ├── db.js
│   │   ├── projects.js           # 프로젝트 CRUD API
│   │   ├── requirements.js       # 요구사항 CRUD API
│   │   ├── attachments.js        # 파일 업로드/다운로드/삭제 API
│   │   ├── testCases.js          # Test Case CRUD + 커버리지 API
│   │   └── notify.js             # Slack 알림 유틸리티 (요구사항 상태 변경 시)
│   └── .env                      # DB 접속 정보
└── frontend/                     # React 화면
    └── src/
        ├── App.tsx                # 화면 전환 (사이드바 클릭으로 이동)
        ├── Sidebar.tsx
        ├── ProjectsScreen.tsx
        ├── ProjectModal.tsx
        ├── ProjectDetailScreen.tsx  # 프로젝트 클릭 시 상세 화면 (상태별로 다른 콘텐츠)
        ├── RequirementsScreen.tsx
        ├── RequirementModal.tsx
        ├── FilesScreen.tsx
        ├── TestCasesScreen.tsx
        ├── TestCaseModal.tsx
        ├── api.ts
        └── types.ts
```

## 로컬 실행 방법

### 1. PostgreSQL 준비
로컬에 PostgreSQL이 설치되어 있어야 합니다. (Mac: `brew install postgresql`, Windows: 공식 설치파일)

```bash
# DB 생성
createdb qa_management

# 스키마 + 샘플 데이터 적용
psql -d qa_management -f backend/schema.sql
psql -d qa_management -f backend/schema_requirements.sql
psql -d qa_management -f backend/schema_attachments.sql
psql -d qa_management -f backend/schema_attachments_links.sql
psql -d qa_management -f backend/schema_test_cases.sql
psql -d qa_management -f backend/schema_status_migration.sql
psql -d qa_management -f backend/schema_attachments_requirement.sql
psql -d qa_management -f backend/schema_automation_script.sql
```

`backend/.env` 파일에서 본인의 DB 접속 정보(계정/비밀번호)에 맞게 수정하세요.

### 2. 백엔드 실행
```bash
cd backend
npm install
node server.js
# → http://localhost:4000 에서 API 서버 실행
```

### 3. 프론트엔드 실행
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173 접속
```

## Slack 알림 설정 (선택)

요구사항 상태가 **승인 / 반려 / 구현완료**로 바뀔 때 Slack으로 자동 알림을 보낼 수 있습니다. (Slack 무료 기능, 별도 API 비용 없음)

### 1. Slack Incoming Webhook 만들기
1. Slack에서 알림 받을 채널을 정하고, https://api.slack.com/apps 접속
2. "Create New App" → "From scratch" → 앱 이름 입력, 워크스페이스 선택
3. 왼쪽 메뉴 "Incoming Webhooks" → 활성화(On) → "Add New Webhook to Workspace"
4. 알림 받을 채널 선택 → 생성된 Webhook URL 복사 (`https://hooks.slack.com/services/...` 형태)

### 2. 앱에 연결
`backend/.env` 파일의 `SLACK_WEBHOOK_URL=` 뒤에 복사한 주소를 붙여넣기:
```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T000/B000/xxxxxxxx
```
저장 후 백엔드 서버 재시작(`node server.js`)하면 적용됩니다.

### 동작 방식
- 요구사항 관리 화면에서 상태를 승인/반려/구현완료로 변경하면 자동으로 알림이 갑니다
- 그 외 상태(초안, 검토중)로 변경 시에는 알림이 가지 않습니다
- `SLACK_WEBHOOK_URL`을 비워두면 알림 기능이 자동으로 꺼지고, 앱은 평소처럼 정상 동작합니다

## API 엔드포인트

### 프로젝트
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/projects` | 목록 조회 (`?status=`, `?keyword=` 필터 지원) |
| GET | `/api/projects/:id` | 단건 조회 |
| POST | `/api/projects` | 생성 |
| PUT | `/api/projects/:id` | 수정 |
| DELETE | `/api/projects/:id` | 삭제 |

### 요구사항
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/requirements` | 목록 조회 (`?project_id=`, `?status=`, `?priority=`, `?keyword=` 필터 지원) |
| GET | `/api/requirements/:id` | 단건 조회 |
| POST | `/api/requirements` | 생성 (프로젝트 필수 연결) |
| PUT | `/api/requirements/:id` | 수정 |
| DELETE | `/api/requirements/:id` | 삭제 |

### 파일 첨부
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/attachments` | 목록 조회 (`?project_id=` 필터 지원, 파일+링크 함께 반환) |
| POST | `/api/attachments` | 파일 업로드 (multipart/form-data: `file`, `project_id`, `uploader`) |
| POST | `/api/attachments/links` | 링크 추가 (JSON: `project_id`, `title`, `url`, `uploader`) |
| GET | `/api/attachments/:id/download` | 파일 다운로드 (링크 항목은 다운로드 불가, `url`로 직접 접속) |
| DELETE | `/api/attachments/:id` | 삭제 (파일이면 DB 레코드 + 디스크 파일 함께 삭제) |

### Test Case
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/test-cases` | 목록 조회 (`?project_id=`, `?requirement_id=`, `?status=`, `?priority=`, `?keyword=` 필터 지원) |
| GET | `/api/test-cases/coverage?project_id=` | 프로젝트의 요구사항별 TC 연결 개수 (0개인 요구사항 = 설계 누락 후보) |
| GET | `/api/test-cases/:id` | 단건 조회 |
| POST | `/api/test-cases` | 생성 (요구사항/첨부파일 연결은 선택) |
| PUT | `/api/test-cases/:id` | 수정 |
| DELETE | `/api/test-cases/:id` | 삭제 |

## 구현된 기능

### 프로젝트 관리
- 프로젝트 목록 조회 (카드형 그리드)
- **상태 8단계 세분화**: 기획중 → 기획완료 → (기획변경) → 진행중 → QA진행중 → 테스트완료 → 완료, 그리고 별도 분기 상태로 보류. 상태별로 색상이 모두 다르게 구분됨 (기획변경=주황, QA진행중=보라, 테스트완료=라임그린, 완료=초록, 보류=빨강 등)
- 키워드 검색 (프로젝트명, 설명)
- 프로젝트 생성 / 수정 / 삭제
- 상태 요약 통계, 진행률 바 + 단계별 진행 트래커 (기획변경/보류는 분기 상태로 트래커에 별도 표시)
- **프로젝트 상세 화면** — 카드의 프로젝트명을 클릭하면 전용 상세 페이지로 이동. 현재 상태에 따라 보여주는 내용이 달라짐:
  - **기획중 / 기획완료 / 기획변경**: 요구사항 목록 + 첨부된 기획문서/디자인을 우선 표시
  - **진행중 / QA진행중 / 테스트완료 / 완료 / 보류**: 요구사항 커버리지 대시보드 + Test Case 목록 표시 (완료 상태는 최종 통과율 요약 배너 추가)

### 요구사항 관리
- 프로젝트별 요구사항 목록 조회 (테이블형)
- 프로젝트 / 상태 필터, 키워드 검색
- 분류(기능/비기능/UI-UX/성능/보안) 및 우선순위(낮음~긴급) 표시
- 요구사항 생성 / 수정 / 삭제 (반드시 프로젝트에 연결)
- 상태 요약 통계 (검토중/승인/구현완료 건수)

### 파일 첨부
- **"파일 업로드"** / **"링크 추가"** 탭으로 구분
- 파일 업로드: 드래그앤드롭 또는 클릭으로 업로드 (최대 20MB, 여러 파일 동시 업로드 가능, PPT/문서/이미지/압축파일 등 모든 형식 지원)
- 링크 추가: Google Docs, Figma, Notion 등 외부 URL을 제목 + 링크로 등록 (새 탭에서 "열기")
- **요구사항 단위 연결**: 업로드/링크 추가 시 특정 요구사항에 전용으로 연결하거나, 프로젝트 전체 공용으로 둘 수 있음. 목록에 "📋 요구사항명" 배지로 표시
- 파일 다운로드, 파일/링크 삭제 (파일 삭제 시 서버 디스크의 실제 파일도 함께 제거)
- 확장자별 색상 태그 표시 (이미지/PDF/PPT/문서/스프레드시트/압축파일/링크 등)
- 한글 파일명 인코딩 처리 (업로드 시 깨지지 않도록 UTF-8 변환)

공통: 실제 PostgreSQL DB 연동 (새로고침해도 데이터 유지)

### Test Case 관리
- 프로젝트별 Test Case 카드형 목록 (사전조건/절차/기대결과 표시)
- **요구사항 커버리지 대시보드** — 요구사항 대비 TC 연결 비율(%)을 표시하고, TC가 하나도 없는 요구사항을 자동으로 찾아서 경고 배너로 보여줌 (설계 누락 방지). 해당 요구사항 옆 "+ TC 추가" 버튼을 누르면 요구사항이 자동 연결된 채로 생성 모달이 열림
- Test Case 생성 시 **요구사항**과 **첨부파일(기획문서/Figma/PPT 등)**을 선택적으로 연결 가능
  - 요구사항을 선택하면 첨부파일 드롭다운이 "그 요구사항 전용 파일"을 먼저 보여줌
  - **모달 안에서 바로 새 기획문서 업로드/링크 추가 가능** — 파일 첨부 화면으로 이동할 필요 없이, TC 작성 중 바로 파일을 올리면 자동으로 현재 선택된 요구사항에 연결되고 즉시 그 TC의 참고 파일로 선택됨
- TC 카드에 "📋 요구사항명", "🔗/📎 디자인 파일명" 태그로 표시되고 클릭하면 바로 이동/다운로드
- 요구사항별 필터, 상태별 필터(미실행/통과/실패/차단됨), 키워드 검색
- 상태 요약 통계 (전체/통과/실패/미실행 건수)
- **자동화 스크립트 저장 필드** — Playwright 등 자동화 코드를 TC에 함께 기록해둘 수 있음 (실행 기능은 아니고 보관/버전관리 목적). TC 카드에서 "🤖 자동화 스크립트 보기"로 접었다 펼 수 있음

## 다음 단계 제안
1. QA 테스트 실행 및 결과 기록 (Test Case를 실행 세션으로 묶어 일괄 기록)
2. Bug 관리 (Test Case 실패 시 버그 등록, 상태 추적)
3. Release 관리 (배포 이력, 버전 관리)
4. 로그인/인증 및 권한 관리
