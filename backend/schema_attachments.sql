-- 파일 첨부 스키마

CREATE TABLE IF NOT EXISTS attachments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stored_name VARCHAR(255) NOT NULL,     -- 디스크에 저장된 실제 파일명 (uuid 기반)
  original_name VARCHAR(255) NOT NULL,   -- 사용자가 업로드한 원래 파일명
  mime_type VARCHAR(150),
  file_size INTEGER NOT NULL,            -- bytes
  uploader VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_project ON attachments(project_id);
