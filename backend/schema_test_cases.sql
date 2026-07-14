-- Test Case 관리 스키마

CREATE TABLE IF NOT EXISTS test_cases (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_id INTEGER REFERENCES requirements(id) ON DELETE SET NULL,   -- 어떤 요구사항을 검증하는지 (선택)
  attachment_id INTEGER REFERENCES attachments(id) ON DELETE SET NULL,     -- 참고한 Figma/PPT 등 첨부 (선택)
  title VARCHAR(200) NOT NULL,
  precondition TEXT,        -- 사전 조건
  steps TEXT,                -- 테스트 절차 (줄바꿈으로 구분)
  expected_result TEXT,      -- 기대 결과
  priority VARCHAR(10) NOT NULL DEFAULT 'medium',   -- low | medium | high | critical
  status VARCHAR(20) NOT NULL DEFAULT 'not_run',    -- not_run | pass | fail | blocked
  tester VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_cases_project ON test_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_requirement ON test_cases(requirement_id);

-- 샘플 데이터 (사내 QA 관리 시스템 프로젝트)
INSERT INTO test_cases (project_id, requirement_id, title, precondition, steps, expected_result, priority, status, tester)
SELECT p.id, r.id,
  '프로젝트 생성 - 필수값 검증',
  '프로젝트 관리 화면에 접근한 상태',
  '1. "+ 새 프로젝트" 클릭
2. 프로젝트명을 입력하지 않고 "프로젝트 생성" 클릭',
  '"프로젝트명을 입력해주세요" 에러 메시지가 표시되고 저장되지 않는다',
  'high', 'pass', '최유나'
FROM projects p
JOIN requirements r ON r.project_id = p.id AND r.title = '프로젝트 CRUD 기능'
WHERE p.name = '사내 QA 관리 시스템'
ON CONFLICT DO NOTHING;

INSERT INTO test_cases (project_id, requirement_id, title, precondition, steps, expected_result, priority, status, tester)
SELECT p.id, r.id,
  '프로젝트 삭제 - 확인 다이얼로그',
  '프로젝트가 1개 이상 존재하는 상태',
  '1. 프로젝트 카드의 ✕ 버튼 클릭
2. 확인 다이얼로그에서 "확인" 선택',
  '해당 프로젝트가 목록에서 사라지고 DB에서도 삭제된다',
  'medium', 'pass', '최유나'
FROM projects p
JOIN requirements r ON r.project_id = p.id AND r.title = '프로젝트 CRUD 기능'
WHERE p.name = '사내 QA 관리 시스템'
ON CONFLICT DO NOTHING;

INSERT INTO test_cases (project_id, requirement_id, title, precondition, steps, expected_result, priority, status, tester)
SELECT p.id, r.id,
  '요구사항-TC 연결 목록 표시',
  '요구사항이 1개 이상 등록된 상태',
  '1. Test Case 관리 화면 접속
2. 특정 요구사항으로 필터링',
  '해당 요구사항에 연결된 TC만 목록에 표시된다',
  'high', 'not_run', '박민수'
FROM projects p
JOIN requirements r ON r.project_id = p.id AND r.title = '요구사항-Test Case 연결'
WHERE p.name = '사내 QA 관리 시스템'
ON CONFLICT DO NOTHING;
