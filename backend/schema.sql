-- QA Management System - Project 관리 스키마

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'planning',   -- planning | in_progress | testing | completed | on_hold
  manager VARCHAR(100),
  start_date DATE,
  end_date DATE,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 샘플 데이터
INSERT INTO projects (name, description, status, manager, start_date, end_date, progress) VALUES
('전자상거래 플랫폼 리뉴얼', '기존 쇼핑몰 시스템의 UI/UX 및 결제 모듈 전면 개편', 'in_progress', '김지훈', '2026-05-01', '2026-09-30', 45),
('사내 ERP 시스템 구축', '인사/회계/재고 통합 관리 시스템 신규 개발', 'planning', '이서연', '2026-08-01', '2027-02-28', 5),
('모바일 뱅킹 앱 QA', '신규 모바일 뱅킹 앱 출시 전 통합 테스트', 'testing', '박민수', '2026-04-15', '2026-07-31', 78),
('사내 QA 관리 시스템', '기획부터 QA 테스트까지 프로젝트 진행 과정을 관리하는 웹 시스템', 'in_progress', '최유나', '2026-06-01', '2026-10-31', 30),
('레거시 시스템 마이그레이션', '구형 자바 시스템을 Node.js 기반으로 전환', 'completed', '정하늘', '2026-01-10', '2026-06-30', 100)
ON CONFLICT DO NOTHING;
