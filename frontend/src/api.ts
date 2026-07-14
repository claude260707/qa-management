import type { Project, ProjectInput, Requirement, RequirementInput, Attachment, TestCase, TestCaseInput, TestCaseBulkItem, RequirementCoverage, Bug, BugInput, Release, ReleaseInput } from './types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function handle(res: Response) {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '요청 처리 중 오류가 발생했습니다.');
  }
  return data;
}

export const projectsApi = {
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

  createLink: (input: { project_id: number; requirement_id?: number | null; title: string; url: string; uploader?: string }): Promise<Attachment> =>
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
