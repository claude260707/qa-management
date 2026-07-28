export type ProjectStatus =
  | 'planning'
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
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'QA 미진행',
  qa_in_progress: 'QA진행중',
  test_done: '테스트완료',
  completed: '완료',
  on_hold: '보류',
};

// 선형 진행 순서 (보류는 분기 상태이므로 트래커 순서에서 제외)
export const STATUS_STAGE_ORDER: ProjectStatus[] = [
  'planning',
  'qa_in_progress',
  'test_done',
  'completed',
];

export type RequirementCategory = 'functional' | 'non_functional' | 'ui_ux' | 'performance' | 'security';
export type RequirementPriority = 'minor' | 'major' | 'critical';
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

export interface TestCase {
  id: number;
  project_id: number;
  title: string;
  status: TestCaseStatus;
  // ... 다른 필드들
}

export interface TestCaseInput {
  project_id: number;
  title: string;
  status?: TestCaseStatus;
  // ... 다른 필드들
}

export const REQ_CATEGORY_LABEL: Record<RequirementCategory, string> = {
  functional: '기능',
  non_functional: '비기능',
  ui_ux: 'UI/UX',
  performance: '성능',
  security: '보안',
};

export const REQ_PRIORITY_LABEL: Record<RequirementPriority, string> = {
  minor: '낮음',
  major: '보통',
  critical: '높음',
};

export type ExceptionCaseCategory =
  | 'boundary_value'
  | 'invalid_input'
  | 'permission'
  | 'concurrency'
  | 'network_failure'
  | 'data_integrity';

export const EXCEPTION_CATEGORY_LABEL: Record<ExceptionCaseCategory, string> = {
  boundary_value: '경계값',
  invalid_input: '잘못된 입력',
  permission: '권한/인증',
  concurrency: '동시성',
  network_failure: '네트워크 장애',
  data_integrity: '데이터 정합성',
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
  summary: string | null;
  created_at: string;
}

export type TestCasePriority = RequirementPriority;
export type TestCaseStatus = 'not_run' | 'pass' | 'fail' | 'n_a' | 'n_t' | 'blocked';

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
  status_note: string | null;
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
  status_note?: string | null;
}

export interface TestCaseBulkItem {
  requirement_id?: number | null;
  title: string;
  precondition?: string;
  steps?: string;
  expected_result?: string;
  priority?: TestCasePriority;
  tester?: string;
}

export const TC_STATUS_LABEL: Record<TestCaseStatus, string> = {
  not_run: '미진행',
  pass: 'Pass',
  fail: 'Fail',
  n_a: 'N/A',
  n_t: 'N/T',
  blocked: 'Blocked',
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
