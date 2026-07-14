-- 파일 첨부 테이블에 "링크" 유형 지원 추가

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS type VARCHAR(10) NOT NULL DEFAULT 'file'; -- file | link
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS url TEXT;

-- 링크 항목은 실제 파일이 없으므로 stored_name을 NULL 허용으로 변경
ALTER TABLE attachments ALTER COLUMN stored_name DROP NOT NULL;

-- 기존 데이터(파일)는 모두 type='file'로 유지 (DEFAULT 값으로 이미 처리됨)
