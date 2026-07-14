import { useEffect, useMemo, useState } from 'react';
import type { Project, Requirement, RequirementInput, RequirementStatus } from './types';
import { REQ_CATEGORY_LABEL, REQ_PRIORITY_LABEL, REQ_STATUS_LABEL } from './types';
import { projectsApi, requirementsApi } from './api';
import RequirementModal from './RequirementModal';
import './RequirementsScreen.css';

function formatDate(d: string) {
  return d.slice(0, 10);
}

export default function RequirementsScreen() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [projectFilter, setProjectFilter] = useState<'all' | number>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | RequirementStatus>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [viewing, setViewing] = useState<Requirement | null>(null);

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await requirementsApi.list({
        project_id: projectFilter === 'all' ? undefined : projectFilter,
        status: statusFilter,
        keyword,
      });
      setRequirements(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilter, statusFilter, keyword]);

  const summary = useMemo(() => {
    const total = requirements.length;
    const draft = requirements.filter((r) => r.status === 'draft').length;
    const reviewing = requirements.filter((r) => r.status === 'reviewing').length;
    const approved = requirements.filter((r) => r.status === 'approved').length;
    const rejected = requirements.filter((r) => r.status === 'rejected').length;
    const implemented = requirements.filter((r) => r.status === 'implemented').length;
    return { total, draft, reviewing, approved, rejected, implemented };
  }, [requirements]);

  async function handleSubmit(input: RequirementInput) {
    if (editing) {
      await requirementsApi.update(editing.id, input);
    } else {
      await requirementsApi.create(input);
    }
    setModalOpen(false);
    setEditing(null);
    await load();
  }

  async function handleDelete(r: Requirement) {
    if (!confirm(`"${r.title}" 요구사항을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await requirementsApi.remove(r.id);
    await load();
  }

  return (
    <div className="req-screen">
      <header className="screen-header">
        <div>
          <h1>요구사항 관리</h1>
          <p className="screen-subtitle">프로젝트별 요구사항을 등록하고 우선순위·진행 상태를 추적합니다</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => { setEditing(null); setModalOpen(true); }}
          disabled={projects.length === 0}
          title={projects.length === 0 ? '먼저 프로젝트를 생성해주세요' : ''}
        >
          + 새 요구사항
        </button>
      </header>

      <section className="stat-row">
        <div className="stat-card">
          <span className="stat-value">{summary.total}</span>
          <span className="stat-label">전체 요구사항</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--req-draft)' }}>{summary.draft}</span>
          <span className="stat-label">초안</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--req-reviewing)' }}>{summary.reviewing}</span>
          <span className="stat-label">검토중</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--req-approved)' }}>{summary.approved}</span>
          <span className="stat-label">승인</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--req-rejected)' }}>{summary.rejected}</span>
          <span className="stat-label">반려</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--req-implemented)' }}>{summary.implemented}</span>
          <span className="stat-label">구현완료</span>
        </div>
      </section>

      <section className="toolbar">
        <input
          className="search-input"
          placeholder="요구사항 제목 또는 설명으로 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <div className="toolbar-filters">
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">전체 프로젝트</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="filter-chips">
            {(['all', 'draft', 'reviewing', 'approved', 'rejected', 'implemented'] as const).map((s) => (
              <button
                key={s}
                className={`chip ${statusFilter === s ? 'is-active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? '전체' : REQ_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <div className="error-banner">⚠ {error} — 백엔드 서버(http://localhost:4000)가 실행 중인지 확인해주세요.</div>}

      {projects.length === 0 && !loading && (
        <div className="empty-state">
          <strong>먼저 프로젝트를 생성해주세요.</strong>
          <span>요구사항은 특정 프로젝트에 소속되어 관리됩니다.</span>
        </div>
      )}

      {loading ? (
        <div className="empty-state">불러오는 중...</div>
      ) : projects.length > 0 && requirements.length === 0 ? (
        <div className="empty-state">
          <strong>표시할 요구사항이 없습니다.</strong>
          <span>새 요구사항을 등록하거나 검색/필터 조건을 변경해보세요.</span>
        </div>
      ) : requirements.length > 0 && (
        <div className="req-table-wrap">
          <table className="req-table">
            <thead>
              <tr>
                <th className="col-title">제목</th>
                <th>프로젝트</th>
                <th>분류</th>
                <th>우선순위</th>
                <th>상태</th>
                <th>요청자</th>
                <th>작성일</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((r) => (
                <tr key={r.id}>
                  <td className="col-title">
                    <div className="req-title req-title-clickable" onClick={() => setViewing(r)}>{r.title}</div>
                    {r.description && <div className="req-desc">{r.description}</div>}
                  </td>
                  <td><span className="project-tag">{r.project_name}</span></td>
                  <td className="mono-cell">{REQ_CATEGORY_LABEL[r.category]}</td>
                  <td><span className={`priority-pill priority-${r.priority}`}>{REQ_PRIORITY_LABEL[r.priority]}</span></td>
                  <td><span className={`req-status-pill req-status-${r.status}`}>{REQ_STATUS_LABEL[r.status]}</span></td>
                  <td>{r.requester || '-'}</td>
                  <td className="mono-cell">{formatDate(r.created_at)}</td>
                  <td className="col-actions">
                    <button onClick={() => { setEditing(r); setModalOpen(true); }} title="수정">✎</button>
                    <button onClick={() => handleDelete(r)} title="삭제">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <RequirementModal
          initial={editing}
          projects={projects}
          defaultProjectId={projectFilter === 'all' ? projects[0]?.id : projectFilter}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSubmit={handleSubmit}
        />
      )}

      {viewing && (
        <RequirementModal
          initial={viewing}
          readOnly
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
