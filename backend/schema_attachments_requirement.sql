-- 첨부파일을 요구사항 단위로도 연결 가능하게 확장
-- NULL이면 "프로젝트 전체 공용" 파일, 값이 있으면 "특정 요구사항 전용" 파일

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS requirement_id INTEGER REFERENCES requirements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_requirement ON attachments(requirement_id);
