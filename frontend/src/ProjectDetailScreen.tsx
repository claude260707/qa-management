import { useEffect, useMemo, useState } from 'react';
import type { Project, Requirement, Attachment, TestCase, RequirementCoverage, ProjectStatus } from './types';
import { STATUS_LABEL, REQ_PRIORITY_LABEL, REQ_STATUS_LABEL, TC_STATUS_LABEL } from './types';
import { projectsApi, requirementsApi, attachmentsApi, testCasesApi } from './api';
import './ProjectDetailScreen.css';

const PLANNING_STATUSES: ProjectStatus[] = ['planning', 'planning_done', 'planning_revision'];

function formatDate(d: string | null) {
  if (!d) return '-';
  return d.slice(0, 10);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectDetailScreen({ projectId, onBack }: { projectId: number; onBack: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [coverage, setCoverage] = useState<RequirementCoverage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      projectsApi.get(projectId),
      requirementsApi.list({ project_id: projectId }),
      attachmentsApi.list({ project_id: projectId }),
      testCasesApi.list({ project_id: projectId }),
      testCasesApi.coverage(projectId),
    ]).then(([p, reqs, files, tcs, cov]) => {
      if (cancelled) return;
      setProject(p);
      setRequirements(reqs);
      setAttachments(files);
      setTestCases(tcs);
      setCoverage(cov);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [projectId]);

  const isPlanningStage = project ? PLANNING_STATUSES.includes(project.status) : true;

  const summary = useMemo(() => {
    const total = testCases.length;
    const pass = testCases.filter((t) => t.status === 'pass').length;
    const fail = testCases.filter((t) => t.status === 'fail').length;
    const notRun = testCases.filter((t) => t.status === 'not_run').length;
    return { total, pass, fail, notRun, passRate: total > 0 ? Math.round((pass / total) * 100) : 0 };
  }, [testCases]);

  const uncovered = coverage.filter((c) => Number(c.test_case_count) === 0);
  const coveredRatio = coverage.length > 0 ? Math.round(((coverage.length - uncovered.length) / coverage.length) * 100) : 0;

  if (loading || !project) {
    return (
      <div className="pd-screen">
        <button className="pd-back" onClick={onBack}>← 프로젝트 목록으로</button>
        <div className="empty-state">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="pd-screen">
      <button className="pd-back" onClick={onBack}>← 프로젝트 목록으로</button>

      <header className="pd-header">
        <div className="pd-header-top">
          <span className={`status-pill status-${project.status}`}>{STATUS_LABEL[project.status]}</span>
          <h1>{project.name}</h1>
        </div>
        {project.description && <p className="pd-description">{project.description}</p>}

        <div className="pd-meta-row">
          <div><span className="meta-label">담당자</span><span>{project.manager || '-'}</span></div>
          <div><span className="meta-label">기간</span><span className="mono-cell">{formatDate(project.start_date)} ~ {formatDate(project.end_date)}</span></div>
          <div className="pd-progress-wrap">
            <span className="meta-label">진행률</span>
            <div className="progress-row">
              <div className="progress-track"><div className="progress-fill" style={{ width: `${project.progress}%` }} /></div>
              <span className="progress-value">{project.progress}%</span>
            </div>
          </div>
        </div>
      </header>

      {isPlanningStage ? (
        <section className="pd-body">
          <div className="pd-section-title">
            <h2>요구사항 ({requirements.length})</h2>
            <span className="pd-section-hint">기획 단계라 요구사항과 참고 기획문서를 우선 보여드려요</span>
          </div>

          {requirements.length === 0 ? (
            <div className="empty-state">등록된 요구사항이 없습니다.</div>
          ) : (
            <div className="req-table-wrap" style={{ marginBottom: 28 }}>
              <table className="req-table">
                <thead>
                  <tr>
                    <th className="col-title">제목</th>
                    <th>분류</th>
                    <th>우선순위</th>
                    <th>상태</th>
                    <th>요청자</th>
                  </tr>
                </thead>
                <tbody>
                  {requirements.map((r) => (
                    <tr key={r.id}>
                      <td className="col-title">
                        <div className="req-title">{r.title}</div>
                        {r.description && <div className="req-desc">{r.description}</div>}
                      </td>
                      <td className="mono-cell">{r.category}</td>
                      <td><span className={`priority-pill priority-${r.priority}`}>{REQ_PRIORITY_LABEL[r.priority]}</span></td>
                      <td><span className={`req-status-pill req-status-${r.status}`}>{REQ_STATUS_LABEL[r.status]}</span></td>
                      <td>{r.requester || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="pd-section-title">
            <h2>기획문서 / 디자인 ({attachments.length})</h2>
          </div>
          {attachments.length === 0 ? (
            <div className="empty-state">첨부된 파일/링크가 없습니다.</div>
          ) : (
            <div className="file-list">
              {attachments.map((a) => (
                <div className="file-row" key={a.id}>
                  <span className="file-tag" style={{ background: a.type === 'link' ? 'var(--file-link)' : 'var(--file-generic)' }}>
                    {a.type === 'link' ? 'LINK' : 'FILE'}
                  </span>
                  <div className="file-info">
                    <div className="file-name">
                      {a.original_name}
                      {a.requirement_title && <span className="req-badge">📋 {a.requirement_title}</span>}
                    </div>
                    <div className="file-meta">
                      {a.type === 'link' ? a.url : formatSize(a.file_size)} · {a.uploader || '익명'} · {formatDate(a.created_at)}
                    </div>
                  </div>
                  <div className="file-actions">
                    {a.type === 'link' ? (
                      <a className="btn-ghost-sm" href={a.url ?? '#'} target="_blank" rel="noopener noreferrer">열기</a>
                    ) : (
                      <a className="btn-ghost-sm" href={attachmentsApi.downloadUrl(a.id)}>다운로드</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="pd-body">
          {project.status === 'completed' && (
            <div className="pd-final-summary">
              <span>🏁 최종 마감 결과</span>
              {summary.total > 0 ? (
                <>
                  <strong>{summary.passRate}% 통과</strong>
                  <span className="pd-final-detail">TC {summary.total}개 중 통과 {summary.pass} · 실패 {summary.fail} · 미실행 {summary.notRun}</span>
                </>
              ) : (
                <span className="pd-final-detail" style={{ marginLeft: 0 }}>등록된 Test Case가 없어 통과율을 계산할 수 없습니다</span>
              )}
            </div>
          )}

          <div className="coverage-panel" style={{ marginBottom: 24 }}>
            <div className="coverage-header">
              <div>
                <span className="coverage-title">요구사항 커버리지</span>
                <span className="coverage-sub">
                  {coverage.length > 0
                    ? `${coverage.length}개 요구사항 중 ${coverage.length - uncovered.length}개에 TC 연결됨`
                    : '등록된 요구사항이 없습니다'}
                </span>
              </div>
              {coverage.length > 0 && (
                <div className="coverage-ratio" data-warn={uncovered.length > 0}>{coveredRatio}%</div>
              )}
            </div>
            {coverage.length > 0 && (
              <div className="coverage-bar"><div className="coverage-bar-fill" style={{ width: `${coveredRatio}%` }} /></div>
            )}
            {uncovered.length > 0 && (
              <div className="uncovered-list">
                <span className="uncovered-label">⚠ TC가 없는 요구사항 ({uncovered.length}개)</span>
                {uncovered.map((r) => (
                  <div className="uncovered-row" key={r.id}>
                    <span className={`priority-pill priority-${r.priority}`}>{REQ_PRIORITY_LABEL[r.priority]}</span>
                    <span className="uncovered-title">{r.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="stat-row" style={{ marginBottom: 20 }}>
            <div className="stat-card"><span className="stat-value">{summary.total}</span><span className="stat-label">전체 TC</span></div>
            <div className="stat-card"><span className="stat-value" style={{ color: 'var(--tc-pass)' }}>{summary.pass}</span><span className="stat-label">통과</span></div>
            <div className="stat-card"><span className="stat-value" style={{ color: 'var(--tc-fail)' }}>{summary.fail}</span><span className="stat-label">실패</span></div>
            <div className="stat-card"><span className="stat-value" style={{ color: 'var(--tc-not_run)' }}>{summary.notRun}</span><span className="stat-label">미실행</span></div>
          </div>

          <div className="pd-section-title"><h2>Test Case ({testCases.length})</h2></div>
          {testCases.length === 0 ? (
            <div className="empty-state">등록된 Test Case가 없습니다.</div>
          ) : (
            <div className="tc-list">
              {testCases.map((tc) => (
                <article className="tc-card" key={tc.id}>
                  <div className="tc-card-top">
                    <div className="tc-card-tags">
                      <span className={`priority-pill priority-${tc.priority}`}>{REQ_PRIORITY_LABEL[tc.priority]}</span>
                      <span className={`tc-status-pill tc-status-${tc.status}`}>{TC_STATUS_LABEL[tc.status]}</span>
                    </div>
                  </div>
                  <h3 className="tc-title">{tc.title}</h3>
                  <div className="tc-links">
                    {tc.requirement_title && <span className="tc-link-tag req-tag">📋 {tc.requirement_title}</span>}
                    {tc.attachment_name && (
                      tc.attachment_type === 'link' ? (
                        <a className="tc-link-tag design-tag" href={tc.attachment_url ?? '#'} target="_blank" rel="noopener noreferrer">🔗 {tc.attachment_name}</a>
                      ) : (
                        <a className="tc-link-tag design-tag" href={attachmentsApi.downloadUrl(tc.attachment_id!)}>📎 {tc.attachment_name}</a>
                      )
                    )}
                  </div>
                  {tc.expected_result && (
                    <div className="tc-field">
                      <span className="tc-field-label">기대 결과</span>
                      <p>{tc.expected_result}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
