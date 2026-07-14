-- 프로젝트 상태 세분화
-- 기존: planning | in_progress | testing | completed | on_hold
-- 신규: planning | planning_done | planning_revision | in_progress | qa_in_progress | test_done | completed | on_hold

-- 기존 데이터 마이그레이션 (기존 'testing' 상태는 새 체계의 'qa_in_progress'로 이동)
UPDATE projects SET status = 'qa_in_progress' WHERE status = 'testing';

-- 나머지 값(planning, in_progress, completed, on_hold)은 새 체계에도 동일하게 존재하므로 그대로 유지
