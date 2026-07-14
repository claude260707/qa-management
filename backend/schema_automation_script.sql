-- Test Case에 자동화 스크립트(Playwright 등) 저장 필드 추가
-- 실행 기능은 아니며, 코드를 함께 기록/보관하기 위한 용도

ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS automation_script TEXT;
