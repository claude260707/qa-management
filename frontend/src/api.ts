import type { Project, ProjectInput, Requirement, RequirementInput, Attachment, TestCase, TestCaseInput, TestCaseBulkItem, RequirementCoverage, Bug, BugInput, Release, ReleaseInput } from './types';

// VITE_API_URL이 별도로 지정되지 않으면, 지금 이 화면에 접속한 주소(hostname)를 그대로 따라간다.
// "localhost"로 고정하면 다른 PC에서 접속했을 때 그 PC 자신을 가리키게 되어 API 호출이 실패한다.
const BASE_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:4000/api`;

async function handle(res: Response) {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '요청 처리 중 오류가 발생했습니다.');
  }
  return data;
}

export const projectsApi = {
  advanceRound: (id: number): Promise<Project> =>
    fetch(`${BASE_URL}/projects/${id}/advance-round`, { method: 'PUT' }).then(handle),
  list: (params?: { status?: string; keyword?: string }): Promise<Project[]> => {
    const qs = new URLSearchParams();
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.keyword) qs.set('keyword', params.keyword);
    const query = qs.toString();
    return fetch(`${BASE_URL}/projects${query ? `?${query}` : ''}`).then(handle);
  },


  get: (id: number): Promise<Project> =>
    fetch(`${BASE_URL}/projects/${id}`).then(handle),

  create: (input: ProjectInput): Promise<Project> =>
    fetch(`${BASE_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handle),

  update: (id: number, input: Partial<ProjectInput>): Promise<Project> =>
    fetch(`${BASE_URL}/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handle),

  remove: (id: number): Promise<{ message: string }> =>
    fetch(`${BASE_URL}/projects/${id}`, { method: 'DELETE' }).then(handle),
};

export const requirementsApi = {
  list: (params?: { project_id?: number; status?: string; priority?: string; keyword?: string }): Promise<Requirement[]> => {
    const qs = new URLSearchParams();
    if (params?.project_id) qs.set('project_id', String(params.project_id));
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.priority && params.priority !== 'all') qs.set('priority', params.priority);
    if (params?.keyword) qs.set('keyword', params.keyword);
    const query = qs.toString();
    return fetch(`${BASE_URL}/requirements${query ? `?${query}` : ''}`).then(handle);
  },

  create: (input: RequirementInput): Promise<Requirement> =>
    fetch(`${BASE_URL}/requirements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handle),

  update: (id: number, input: Partial<RequirementInput>): Promise<Requirement> =>
    fetch(`${BASE_URL}/requirements/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handle),

  remove: (id: number): Promise<{ message: string }> =>
    fetch(`${BASE_URL}/requirements/${id}`, { method: 'DELETE' }).then(handle),
};

export const attachmentsApi = {
  list: (params?: { project_id?: number; requirement_id?: number }): Promise<Attachment[]> => {
    const qs = new URLSearchParams();
    if (params?.project_id) qs.set('project_id', String(params.project_id));
    if (params?.requirement_id) qs.set('requirement_id', String(params.requirement_id));
    const query = qs.toString();
    return fetch(`${BASE_URL}/attachments${query ? `?${query}` : ''}`).then(handle);
  },

  upload: (file: File, projectId: number, uploader: string, requirementId?: number | null): Promise<Attachment> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_id', String(projectId));
    formData.append('uploader', uploader);
    if (requirementId) formData.append('requirement_id', String(requirementId));
    return fetch(`${BASE_URL}/attachments`, { method: 'POST', body: formData }).then(handle);
  },

  createLink: (input: { project_id: number; requirement_id?: number | null; title: string; url: string; uploader?: string; summary?: string }): Promise<Attachment> =>
    fetch(`${BASE_URL}/attachments/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handle),

  downloadUrl: (id: number): string => `${BASE_URL}/attachments/${id}/download`,

  remove: (id: number): Promise<{ message: string }> =>
    fetch(`${BASE_URL}/attachments/${id}`, { method: 'DELETE' }).then(handle),
};

export const testCasesApi = {
  list: (params?: { project_id?: number; requirement_id?: number; status?: string; priority?: string; keyword?: string }): Promise<TestCase[]> => {
    const qs = new URLSearchParams();
    if (params?.project_id) qs.set('project_id', String(params.project_id));
    if (params?.requirement_id) qs.set('requirement_id', String(params.requirement_id));
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.priority && params.priority !== 'all') qs.set('priority', params.priority);
    if (params?.keyword) qs.set('keyword', params.keyword);
    const query = qs.toString();
    return fetch(`${BASE_URL}/test-cases${query ? `?${query}` : ''}`).then(handle);
  },
  coverage: (projectId: number): Promise<RequirementCoverage[]> =>
    fetch(`${BASE_URL}/test-cases/coverage?project_id=${projectId}`).then(handle),

  create: (input: TestCaseInput): Promise<TestCase> =>
    fetch(`${BASE_URL}/test-cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handle),

  update: (id: number, input: Partial<TestCaseInput>): Promise<TestCase> =>
    fetch(`${BASE_URL}/test-cases/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handle),

  remove: (id: number): Promise<{ message: string }> =>
    fetch(`${BASE_URL}/test-cases/${id}`, { method: 'DELETE' }).then(handle),

  bulkCreate: (projectId: number, items: TestCaseBulkItem[]): Promise<{ created_count: number; created: TestCase[] }> =>
    fetch(`${BASE_URL}/test-cases/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, items }),
    }).then(handle),
};

export const bugsApi = {
  list: (params?: { project_id?: number; test_case_id?: number; release_id?: number; status?: string; severity?: string; keyword?: string }): Promise<Bug[]> => {
    const qs = new URLSearchParams();
    if (params?.project_id) qs.set('project_id', String(params.project_id));
    if (params?.test_case_id) qs.set('test_case_id', String(params.test_case_id));
    if (params?.release_id) qs.set('release_id', String(params.release_id));
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.severity && params.severity !== 'all') qs.set('severity', params.severity);
    if (params?.keyword) qs.set('keyword', params.keyword);
    const query = qs.toString();
    return fetch(`${BASE_URL}/bugs${query ? `?${query}` : ''}`).then(handle);
  },

  create: (input: BugInput): Promise<Bug> =>
    fetch(`${BASE_URL}/bugs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handle),

  update: (id: number, input: Partial<BugInput>): Promise<Bug> =>
    fetch(`${BASE_URL}/bugs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handle),

  remove: (id: number): Promise<{ message: string }> =>
    fetch(`${BASE_URL}/bugs/${id}`, { method: 'DELETE' }).then(handle),
};

export const releasesApi = {
  list: (params?: { project_id?: number; status?: string; keyword?: string }): Promise<Release[]> => {
    const qs = new URLSearchParams();
    if (params?.project_id) qs.set('project_id', String(params.project_id));
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.keyword) qs.set('keyword', params.keyword);
    const query = qs.toString();
    return fetch(`${BASE_URL}/releases${query ? `?${query}` : ''}`).then(handle);
  },

  get: (id: number): Promise<Release> =>
    fetch(`${BASE_URL}/releases/${id}`).then(handle),

  create: (input: ReleaseInput): Promise<Release> =>
    fetch(`${BASE_URL}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handle),

  update: (id: number, input: Partial<ReleaseInput>): Promise<Release> =>
    fetch(`${BASE_URL}/releases/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handle),

  remove: (id: number): Promise<{ message: string }> =>
    fetch(`${BASE_URL}/releases/${id}`, { method: 'DELETE' }).then(handle),
};



// 파일 하단, testCasesApi 근처에 신규 객체로 추가
export interface StatusCounts {
  not_run?: number;
  pass?: number;
  fail?: number;
  blocked?: number;
  n_a?: number;
  n_t?: number;
}

export interface DailySnapshot {
  total: number;
  by_status: StatusCounts;
  by_executor: { automated: StatusCounts; manual: StatusCounts };
}

export interface DailyReportResponse {
  round: number | null;
  date?: string;
  message?: string;
  today?: DailySnapshot;
  yesterday?: DailySnapshot;
}


export interface DailyReportDetail {
  rounds: number[];
  roundSummary: Record<number, StatusCounts>;
  testCases: {
    id: number;
    title: string;
    priority: string;
    byRound: Record<number, string>;
    latestExecutor: string | null;
    latestNote: string | null;
  }[];
}

export const dailyReportApi = {
  get: (projectId: number, params?: { date?: string; round?: number }): Promise<DailyReportResponse> => {
    const qs = new URLSearchParams({ project_id: String(projectId) });
    if (params?.date) qs.set('date', params.date);
    if (params?.round) qs.set('round', String(params.round));
    return fetch(`${BASE_URL}/daily-report?${qs.toString()}`).then(handle);
  },
  getDetail: (projectId: number): Promise<DailyReportDetail> =>
    fetch(`${BASE_URL}/daily-report/detail?project_id=${projectId}`).then(handle),
};


export const planAnalysisApi = {
  classifyType: (planText: string): Promise<{ type: string; confidence: number | null; reason: string; serviceName: string }> =>
    fetch(`${BASE_URL}/plan/classify-type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planText }),
    }).then(handle),

  extractFeatures: (
    planText: string
  ): Promise<{ features: { name: string; desc: string }[] }> =>
    fetch(`${BASE_URL}/plan/extract-features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planText }),
    }).then(handle),

  generateBasicTc: (
    planText: string,
    selectedFeatureNames: string[]
  ): Promise<{
    testCases: { title: string; priority: string; precondition: string; steps: string; expected_result: string }[];
    warning?: string;
  }> =>
    fetch(`${BASE_URL}/plan/generate-basic-tc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planText, selectedFeatureNames }),
    }).then(handle),

  extractRules: (
    planText: string
  ): Promise<{ rules: { summary: string; source: string; risk: string; verify: string }[] }> =>
    fetch(`${BASE_URL}/plan/extract-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planText }),
    }).then(handle),

  getChecklist: (
    planText: string,
    projectType: string
  ): Promise<{ items: { label: string; status: string; missing: boolean; note: string }[] }> =>
    fetch(`${BASE_URL}/plan/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planText, projectType }),
    }).then(handle),

  generateTc: (
    planText: string,
    projectType: string,
    selectedGapLabels: string[],
    extractedRules: { summary: string; source: string; risk: string; verify: string }[] = []
  ): Promise<{
    testCases: { title: string; priority: string; precondition: string; steps: string; expected_result: string }[];
    warning?: string;
  }> =>
    fetch(`${BASE_URL}/plan/generate-tc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planText, projectType, selectedGapLabels, extractedRules }),
    }).then(handle),

  generateSatisfiedTc: (
    planText: string,
    selectedItems: { label: string; note: string }[]
  ): Promise<{
    testCases: { title: string; priority: string; precondition: string; steps: string; expected_result: string }[];
    warning?: string;
  }> =>
    fetch(`${BASE_URL}/plan/generate-satisfied-tc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planText, selectedItems }),
    }).then(handle),

  getState: (projectId: number): Promise<{
    requirementFiles: { name: string; text: string }[];
    designText: string;
    designFileName: string;
    projectType: string;
    reason: string;
    serviceName: string;
    rules: { summary: string; source: string; risk: string; verify: string }[];
    checklist: { label: string; status: string; missing: boolean; note: string }[];
    features: { name: string; desc: string }[];
    consistencyIssues: {
      category: 'mismatch' | 'internal_contradiction' | 'no_basis';
      categoryLabel: string;
      title: string;
      reqContent: string;
      designContent: string;
      location: string;
      question: string;
    }[];
    draftTestCases: {
      title: string;
      priority: string;
      precondition: string;
      steps: string;
      expected_result: string;
      source_category?: string;
      source_snippet?: string;
    }[];
    draftBasicTestCases: {
      title: string;
      priority: string;
      precondition: string;
      steps: string;
      expected_result: string;
      source_category?: string;
      source_snippet?: string;
    }[];
    savedTcIdx: number[];
    savedBasicTcIdx: number[];
  }> =>
    fetch(`${BASE_URL}/plan/state/${projectId}`).then(handle),

  saveState: (
    projectId: number,
    state: Partial<{
      requirementFiles: { name: string; text: string }[];
      designText: string;
      designFileName: string;
      projectType: string;
      reason: string;
      serviceName: string;
      rules: { summary: string; source: string; risk: string; verify: string }[];
      checklist: { label: string; status: string; missing: boolean; note: string }[];
      features: { name: string; desc: string }[];
      consistencyIssues: {
        category: 'mismatch' | 'internal_contradiction' | 'no_basis';
        categoryLabel: string;
        title: string;
        reqContent: string;
        designContent: string;
        location: string;
        question: string;
      }[];
      draftTestCases: {
        title: string;
        priority: string;
        precondition: string;
        steps: string;
        expected_result: string;
        source_category?: string;
        source_snippet?: string;
      }[];
      draftBasicTestCases: {
        title: string;
        priority: string;
        precondition: string;
        steps: string;
        expected_result: string;
        source_category?: string;
        source_snippet?: string;
      }[];
      savedTcIdx: number[];
      savedBasicTcIdx: number[];
    }>
  ): Promise<{ ok: boolean }> =>
    fetch(`${BASE_URL}/plan/state/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }).then(handle),

  checkConsistency: (
  requirementFiles: { name: string; text: string }[],
  designText: string
): Promise<{
  issues: {
    category: 'mismatch' | 'internal_contradiction' | 'no_basis';
    categoryLabel: string;
    title: string;
    reqContent: string;
    designContent: string;
    location: string;
    question: string;
    sourceFile?: string;
  }[];
  failedFiles?: string[];
}> =>
  fetch(`${BASE_URL}/plan/consistency-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requirementFiles, designText })
  }).then(handle),
};
