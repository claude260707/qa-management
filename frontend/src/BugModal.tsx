import { useEffect, useState } from 'react';
import type { Project, TestCase, Bug, BugInput, BugSeverity, BugStatus, Release } from './types';
import { REQ_PRIORITY_LABEL, BUG_STATUS_LABEL } from './types';
import { testCasesApi, releasesApi } from './api';
import './ProjectModal.css';

interface Props {
  initial: Bug | null;
  projects: Project[];
  defaultProjectId?: number;
  prefillFromTestCase?: TestCase | null;
  onClose: () => void;
  onSubmit: (input: BugInput) => Promise<void>;
}

export default function BugModal({ initial, projects, defaultProjectId, prefillFromTestCase, onClose, onSubmit }: Props) {
  const prefill = prefillFromTestCase;
  const [projectId, setProjectId] = useState<number>(initial?.project_id ?? prefill?.project_id ?? defaultProjectId ?? projects[0]?.id ?? 0);
  const [testCases, setTestCases] = useState<TestCase[]>(prefill ? [prefill] : []);
  const [testCaseId, setTestCaseId] = useState<number | ''>(initial?.test_case_id ?? prefill?.id ?? '');
  const [releases, setReleases] = useState<Release[]>([]);
  const [releaseId, setReleaseId] = useState<number | ''>(initial?.release_id ?? '');
  const [title, setTitle] = useState(initial?.title ?? (prefill ? `[TC 실패] ${prefill.title}` : ''));
  const [description, setDescription] = useState(initial?.description ?? '');
  const [stepsToReproduce, setStepsToReproduce] = useState(initial?.steps_to_reproduce ?? prefill?.steps ?? '');
  const [expectedResult, setExpectedResult] = useState(initial?.expected_result ?? prefill?.expected_result ?? '');
  const [actualResult, setActualResult] = useState(initial?.actual_result ?? '');
  const [severity, setSeverity] = useState<BugSeverity>(initial?.severity ?? prefill?.priority ?? 'major');
  const [status, setStatus] = useState<BugStatus>(initial?.status ?? 'open');
  const [reporter, setReporter] = useState(initial?.reporter ?? '');
  const [assignee, setAssignee] = useState(initial?.assignee ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefill || !projectId) return;
    testCasesApi.list({ project_id: projectId }).then(setTestCases).catch(() => {});
  }, [projectId, prefill]);

  useEffect(() => {
    if (!projectId) return;
    releasesApi.list({ project_id: projectId }).then(setReleases).catch(() => {});
  }, [projectId]);

  const availableTestCases = testCases.filter((tc) => tc.project_id === projectId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Bug 제목을 입력해주세요.');
      return;
    }
    if (!projectId) {
      setError('프로젝트를 선택해주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const linkedTc = testCaseId === '' ? null : testCases.find((tc) => tc.id === testCaseId) ?? null;
      await onSubmit({
        project_id: projectId,
        test_case_id: testCaseId === '' ? null : testCaseId,
        requirement_id: linkedTc?.requirement_id ?? null,
        release_id: releaseId === '' ? null : releaseId,
        title: title.trim(),
        description: description.trim(),
        steps_to_reproduce: stepsToReproduce.trim(),
        expected_result: expectedResult.trim(),
        actual_result: actualResult.trim(),
        severity,
        status,
        reporter: reporter.trim(),
        assignee: assignee.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2>{initial ? 'Bug 수정' : prefill ? '실패 TC에서 Bug 등록' : '새 Bug 등록'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="field-row">
            <label className="field">
              <span>프로젝트 *</span>
              <select value={projectId} onChange={(e) => { setProjectId(Number(e.target.value)); setTestCaseId(''); }} disabled={!!prefill}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>연결된 Test Case</span>
              <select value={testCaseId} onChange={(e) => setTestCaseId(e.target.value === '' ? '' : Number(e.target.value))} disabled={!!prefill}>
                <option value="">연결 없음 (독립 등록)</option>
                {availableTestCases.map((tc) => (
                  <option key={tc.id} value={tc.id}>{tc.title}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Bug 제목 *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 검색창에 특수문자 입력 시 500 에러" autoFocus />
          </label>

          <label className="field">
            <span>설명</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="버그에 대한 개괄적인 설명" />
          </label>

          <label className="field">
            <span>재현 절차</span>
            <textarea value={stepsToReproduce} onChange={(e) => setStepsToReproduce(e.target.value)} rows={3} placeholder="1. ...
2. ..." />
          </label>

          <div className="field-row">
            <label className="field">
              <span>기대 결과</span>
              <textarea value={expectedResult} onChange={(e) => setExpectedResult(e.target.value)} rows={2} />
            </label>
            <label className="field">
              <span>실제 결과 *</span>
              <textarea value={actualResult} onChange={(e) => setActualResult(e.target.value)} rows={2} placeholder="실제로 어떻게 동작했는지" />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>심각도</span>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as BugSeverity)}>
                {Object.entries(REQ_PRIORITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>상태</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as BugStatus)}>
                {Object.entries(BUG_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>수정 포함 릴리즈</span>
            <select value={releaseId} onChange={(e) => setReleaseId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">아직 없음</option>
              {releases.map((rl) => (
                <option key={rl.id} value={rl.id}>{rl.version}</option>
              ))}
            </select>
          </label>

          <div className="field-row">
            <label className="field">
              <span>리포터</span>
              <input value={reporter} onChange={(e) => setReporter(e.target.value)} placeholder="발견자명" />
            </label>
            <label className="field">
              <span>담당자</span>
              <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="수정 담당자명" />
            </label>
          </div>

          {error && <div className="field-error">⚠ {error}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? '저장 중...' : initial ? '수정 완료' : 'Bug 등록'}
          </button>
        </div>
      </form>
    </div>
  );
}
