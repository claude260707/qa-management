ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS source_snippet TEXT;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS source_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_test_cases_source_hash ON test_cases(source_hash);