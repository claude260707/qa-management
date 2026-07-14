-- Bug 관리 스키마
-- test_case_id는 nullable: 실패한 TC에서 등록된 버그는 연결되고,
-- TC 없이 발견된 버그(리뷰/운영 중 발견 등)는 NULL로 독립 등록 가능

CREATE TABLE IF NOT EXISTS bugs (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  test_case_id INTEGER REFERENCES test_cases(id) ON DELETE SET NULL,
  requirement_id INTEGER REFERENCES requirements(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  steps_to_reproduce TEXT,
  expected_result TEXT,
  actual_result TEXT,
  severity VARCHAR(10) NOT NULL DEFAULT 'medium',   -- low | medium | high | critical
  status VARCHAR(20) NOT NULL DEFAULT 'open',        -- open | in_progress | fixed | closed | reopened
  reporter VARCHAR(100),
  assignee VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bugs_project ON bugs(project_id);
CREATE INDEX IF NOT EXISTS idx_bugs_test_case ON bugs(test_case_id);
CREATE INDEX IF NOT EXISTS idx_bugs_requirement ON bugs(requirement_id);

-- 샘플 데이터 (사내 QA 관리 시스템 프로젝트, 기존 실패 TC와 연결)
INSERT INTO bugs (project_id, test_case_id, requirement_id, title, description, steps_to_reproduce, expected_result, actual_result, severity, status, reporter)
SELECT p.id, NULL, r.id,
  '검색창에 특수문자 입력 시 500 에러',
  '요구사항 검색창에 SQL 예약어 성격의 특수문자를 입력하면 서버 에러가 발생함',
  '1. 요구사항 관리 화면 접속
2. 검색창에 % 또는 '' 문자 입력',
  '검색 결과가 빈 목록으로 정상 표시되어야 한다',
  '500 Internal Server Error가 발생하며 화면이 멈춘다',
  'high', 'open', '박민수'
FROM projects p
JOIN requirements r ON r.project_id = p.id AND r.title = '요구사항-Test Case 연결'
WHERE p.name = '사내 QA 관리 시스템'
ON CONFLICT DO NOTHING;
