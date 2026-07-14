-- Release 관리 스키마
-- 버전명 + 배포일자를 기본으로 관리하고, 수정된 Bug와 완료된 요구사항을 함께 기록한다.

CREATE TABLE IF NOT EXISTS releases (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version VARCHAR(50) NOT NULL,
  release_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'planned',   -- planned | released | rolled_back
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_releases_project ON releases(project_id);

-- 하나의 릴리즈에 여러 요구사항(완료된 기능)을 연결 (다대다)
CREATE TABLE IF NOT EXISTS release_requirements (
  release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  PRIMARY KEY (release_id, requirement_id)
);

-- Bug가 어느 버전에서 수정되었는지 연결 (선택값, nullable)
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS release_id INTEGER REFERENCES releases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bugs_release ON bugs(release_id);
