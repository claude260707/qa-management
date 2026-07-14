-- 요구사항 관리 스키마

CREATE TABLE IF NOT EXISTS requirements (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(20) NOT NULL DEFAULT 'functional',  -- functional | non_functional | ui_ux | performance | security
  priority VARCHAR(10) NOT NULL DEFAULT 'medium',       -- low | medium | high | critical
  status VARCHAR(20) NOT NULL DEFAULT 'draft',          -- draft | reviewing | approved | rejected | implemented
  requester VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id);

-- 샘플 데이터 (사내 QA 관리 시스템 프로젝트에 연결)
INSERT INTO requirements (project_id, title, description, category, priority, status, requester)
SELECT id, '프로젝트 CRUD 기능', '프로젝트 생성/조회/수정/삭제 및 상태별 필터링 기능', 'functional', 'high', 'implemented', '최유나'
FROM projects WHERE name = '사내 QA 관리 시스템'
ON CONFLICT DO NOTHING;

INSERT INTO requirements (project_id, title, description, category, priority, status, requester)
SELECT id, '요구사항-Test Case 연결', '하나의 요구사항에 여러 Test Case를 연결해 추적할 수 있어야 함', 'functional', 'high', 'reviewing', '최유나'
FROM projects WHERE name = '사내 QA 관리 시스템'
ON CONFLICT DO NOTHING;

INSERT INTO requirements (project_id, title, description, category, priority, status, requester)
SELECT id, '대시보드 로딩 속도', '프로젝트 목록 화면은 1초 이내에 렌더링되어야 함', 'performance', 'medium', 'approved', '김지훈'
FROM projects WHERE name = '사내 QA 관리 시스템'
ON CONFLICT DO NOTHING;

INSERT INTO requirements (project_id, title, description, category, priority, status, requester)
SELECT id, '결제 모듈 PCI-DSS 준수', '카드 정보는 저장하지 않고 PG사 토큰만 저장', 'security', 'critical', 'approved', '박민수'
FROM projects WHERE name = '전자상거래 플랫폼 리뉴얼'
ON CONFLICT DO NOTHING;

INSERT INTO requirements (project_id, title, description, category, priority, status, requester)
SELECT id, '반응형 결제 화면', '모바일/태블릿에서도 결제 화면이 깨지지 않아야 함', 'ui_ux', 'medium', 'draft', '이서연'
FROM projects WHERE name = '전자상거래 플랫폼 리뉴얼'
ON CONFLICT DO NOTHING;
