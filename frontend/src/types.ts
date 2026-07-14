export type ProjectStatus =
  | 'planning'
  | 'planning_done'
  | 'planning_revision'
  | 'in_progress'
  | 'qa_in_progress'
  | 'test_done'
  | 'completed'
  | 'on_hold';

export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  manager: string | null;
  start_date: string | null;
  end_date: string | null;
  progress: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectInput {
  name: string;
  description?: string;
  status?: ProjectStatus;
  manager?: string;
  start_date?: string;
  end_date?: string;
  progress?: number;
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: '기획중',
  planning_done: '기획완료',
  planning_revision: '기획변경',
  in_progress: '진행중',
  qa_in_progress: 'QA진행중',
  test_done: '테스트완료',
  completed: '완료',
  on_hold: '보류',
};

// 선형 진행 순서 (기획변경/보류는 분기 상태이므로 트래커 순서에서 제외)
export const STATUS_STAGE_ORDER: ProjectStatus[] = [
  'planning',
  'planning_done',
  'in_progress',
  'qa_in_progress',
  'test_done',
  'completed',
];

export type RequirementCategory = 'functional' | 'non_functional' | 'ui_ux' | 'performance' | 'security';
export type RequirementPriority = 'low' | 'medium' | 'high' | 'critical';
export type RequirementStatus = 'draft' | 'reviewing' | 'approved' | 'rejected' | 'implemented';

export interface Requirement {
  id: number;
  project_id: number;
  project_name: string;
  title: string;
  description: string | null;
  category: RequirementCategory;
  priority: RequirementPriority;
  status: RequirementStatus;
  requester: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequirementInput {
  project_id: number;
  title: string;
  description?: string;
  category?: RequirementCategory;
  priority?: RequirementPriority;
  status?: RequirementStatus;
  requester?: string;
}

export const REQ_CATEGORY_LABEL: Record<RequirementCategory, string> = {
  functional: '기능',
  non_functional: '비기능',
  ui_ux: 'UI/UX',
  performance: '성능',
  security: '보안',
};

export const REQ_PRIORITY_LABEL: Record<RequirementPriority, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  critical: '긴급',
};

export const REQ_STATUS_LABEL: Record<RequirementStatus, string> = {
  draft: '초안',
  reviewing: '검토중',
  approved: '승인',
  rejected: '반려',
  implemented: '구현완료',
};

export interface Attachment {
  id: number;
  project_id: number;
  project_name: string;
  requirement_id: number | null;
  requirement_title: string | null;
  type: 'file' | 'link';
  stored_name: string | null;
  original_name: string;
  mime_type: string | null;
  file_size: number;
  uploader: string | null;
  url: string | null;
  created_at: string;
}

export type TestCasePriority = RequirementPriority;
export type TestCaseStatus = 'not_run' | 'pass' | 'fail' | 'blocked';

export interface TestCase {
  id: number;
  project_id: number;
  project_name: string;
  requirement_id: number | null;
  requirement_title: string | null;
  attachment_id: number | null;
  attachment_name: string | null;
  attachment_type: 'file' | 'link' | null;
  attachment_url: string | null;
  title: string;
  precondition: string | null;
  steps: string | null;
  expected_result: string | null;
  priority: TestCasePriority;
  status: TestCaseStatus;
  tester: string | null;
  automation_script: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestCaseInput {
  project_id: number;
  requirement_id?: number | null;
  attachment_id?: number | null;
  title: string;
  precondition?: string;
  steps?: string;
  expected_result?: string;
  priority?: TestCasePriority;
  status?: TestCaseStatus;
  tester?: string;
  automation_script?: string;
}

export const TC_STATUS_LABEL: Record<TestCaseStatus, string> = {
  not_run: '미실행',
  pass: '통과',
  fail: '실패',
  blocked: '차단됨',
};

export interface RequirementCoverage {
  id: number;
  title: string;
  priority: RequirementPriority;
  status: RequirementStatus;
  test_case_count: string;
}

export type ReleaseStatus = 'planned' | 'released' | 'rolled_back';

export interface ReleaseLinkedItem {
  id: number;
  title: string;
  priority?: RequirementPriority;
  severity?: BugSeverity;
  status: string;
}

export interface Release {
  id: number;
  project_id: number;
  project_name: string;
  version: string;
  release_date: string | null;
  status: ReleaseStatus;
  notes: string | null;
  bug_count?: number;
  requirement_count?: number;
  bugs?: ReleaseLinkedItem[];
  requirements?: ReleaseLinkedItem[];
  created_at: string;
  updated_at: string;
}

export interface ReleaseInput {
  project_id: number;
  version: string;
  release_date?: string | null;
  status?: ReleaseStatus;
  notes?: string;
  requirement_ids?: number[];
}

export const RELEASE_STATUS_LABEL: Record<ReleaseStatus, string> = {
  planned: '배포예정',
  released: '배포완료',
  rolled_back: '롤백됨',
};

export type BugSeverity = RequirementPriority;
export type BugStatus = 'open' | 'in_progress' | 'fixed' | 'closed' | 'reopened';

export interface Bug {
  id: number;
  project_id: number;
  project_name: string;
  test_case_id: number | null;
  test_case_title: string | null;
  requirement_id: number | null;
  requirement_title: string | null;
  release_id: number | null;
  release_version: string | null;
  title: string;
  description: string | null;
  steps_to_reproduce: string | null;
  expected_result: string | null;
  actual_result: string | null;
  severity: BugSeverity;
  status: BugStatus;
  reporter: string | null;
  assignee: string | null;
  created_at: string;
  updated_at: string;
}

export interface BugInput {
  project_id: number;
  test_case_id?: number | null;
  requirement_id?: number | null;
  release_id?: number | null;
  title: string;
  description?: string;
  steps_to_reproduce?: string;
  expected_result?: string;
  actual_result?: string;
  severity?: BugSeverity;
  status?: BugStatus;
  reporter?: string;
  assignee?: string;
}

export const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  open: '열림',
  in_progress: '수정중',
  fixed: '수정완료',
  closed: '종료',
  reopened: '재오픈',
};

// 선형 진행 순서 (재오픈은 분기 상태이므로 트래커 순서에서 제외)
export const BUG_STAGE_ORDER: BugStatus[] = ['open', 'in_progress', 'fixed', 'closed'];
