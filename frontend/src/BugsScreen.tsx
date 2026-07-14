import { useEffect, useMemo, useState } from 'react';
import type { Project, Bug, BugInput, BugStatus } from './types';
import { REQ_PRIORITY_LABEL, BUG_STATUS_LABEL } from './types';
import { projectsApi, bugsApi } from './api';
import BugModal from './BugModal';
import './BugsScreen.css';

function formatDate(d: string) {
  return d.slice(0, 10);
}

const OPEN_GROUP: BugStatus[] = ['open'];
const PROGRESS_GROUP: BugStatus[] = ['in_progress', 'reopened'];
const DONE_GROUP: BugStatus[] = ['fixed', 'closed'];

export default function BugsScreen({ embeddedProjectId }: { embeddedProjectId?: number } = {}) {
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [projectFilter, setProjectFilter] = useState<'all' | number>(embeddedProjectId ?? 'all');
  const [statusFilter, setStatusFilter] = useState<'all' | BugStatus>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Bug | null>(null);

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await bugsApi.list({
        project_id: projectFilter === 'all' ? undefined : projectFilter,
        status: statusFilter,
        keyword,
      });
      setBugs(data);
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
    const total = bugs.length;
    const open = bugs.filter((b) => OPEN_GROUP.includes(b.status)).length;
    const inProgress = bugs.filter((b) => PROGRESS_GROUP.includes(b.status)).length;
    const done = bugs.filter((b) => DONE_GROUP.includes(b.status)).length;
    return { total, open, inProgress, done };
  }, [bugs]);

  const groupedByProject = useMemo(() => {
    if (projectFilter !== 'all') return null;
    const map = new Map<number, { projectName: string; items: Bug[] }>();
    bugs.forEach((b) => {
      if (!map.has(b.project_id)) map.set(b.project_id, { projectName: b.project_name, items: [] });
      map.get(b.project_id)!.items.push(b);
    });
    return Array.from(map.entries()).map(([projectId, v]) => ({ projectId, ...v }));
  }, [bugs, projectFilter]);

  async function handleSubmit(input: BugInput) {
    if (editing) {
      await bugsApi.update(editing.id, input);
    } else {
      await bugsApi.create(input);
    }
    setModalOpen(false);
    setEditing(null);
    await load();
  }

  async function handleDelete(b: Bug) {
    if (!confirm(`"${b.title}" Bug를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await bugsApi.remove(b.id);
    await load();
  }

  function renderBugCard(b: Bug, hideProjectTag: boolean) {
    return (
      <article className="bug-card" key={b.id}>
        <div className="bug-card-top">
          <div className="bug-card-tags">
            <span className={`priority-pill priority-${b.severity}`}>{REQ_PRIORITY_LABEL[b.severity]}</span>
            <span className={`bug-status-pill bug-status-${b.status}`}>{BUG_STATUS_LABEL[b.status]}</span>
          </div>
          <div className="card-actions">
            <button onClick={() => { setEditing(b); setModalOpen(true); }} title="수정">✎</button>
            <button onClick={() => handleDelete(b)} title="삭제">✕</button>
          </div>
        </div>

        <h3 className="bug-title">{b.title}</h3>

        <div className="bug-links">
          {!hideProjectTag && <span className="bug-link-tag">📁 {b.project_name}</span>}
          {b.test_case_title && <span className="bug-link-tag tc-tag">🧪 {b.test_case_title}</span>}
          {b.requirement_title && <span className="bug-link-tag req-tag">📋 {b.requirement_title}</span>}
          {b.release_version && <span className="bug-link-tag release-tag">🚀 {b.release_version}</span>}
        </div>

        {b.actual_result && (
          <div className="bug-field">
            <span className="bug-field-label">실제 결과</span>
            <p>{b.actual_result}</p>
          </div>
        )}

        <div className="bug-meta">
          <div><span className="meta-label">리포터</span><span>{b.reporter || '-'}</span></div>
          <div><span className="meta-label">담당자</span><span>{b.assignee || '-'}</span></div>
          <div><span className="meta-label">등록일</span><span className="mono">{formatDate(b.created_at)}</span></div>
        </div>
      </article>
    );
  }

  return (
    <div className="bugs-screen">
      <header className="screen-header">
        {!embeddedProjectId && (
          <div>
            <h1>Bug 관리</h1>
            <p className="screen-subtitle">Test Case 실패에서 발견된 버그와 독립적으로 등록된 버그를 함께 추적합니다</p>
          </div>
        )}
        <button
          className="btn-primary"
          onClick={() => { setEditing(null); setModalOpen(true); }}
          disabled={projects.length === 0}
          title={projects.length === 0 ? '먼저 프로젝트를 생성해주세요' : ''}
        >
          + 새 Bug
        </button>
      </header>

      <section className="stat-row">
        <div className="stat-card">
          <span className="stat-value">{summary.total}</span>
          <span className="stat-label">전체 Bug</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--bug-open)' }}>{summary.open}</span>
          <span className="stat-label">열림</span>
        </div>
        <div className="stat-card" title="수정중 + 재오픈">
          <span className="stat-value" style={{ color: 'var(--bug-in_progress)' }}>{summary.inProgress}</span>
          <span className="stat-label">진행중</span>
        </div>
        <div className="stat-card" title="수정완료 + 종료">
          <span className="stat-value" style={{ color: 'var(--bug-fixed)' }}>{summary.done}</span>
          <span className="stat-label">완료</span>
        </div>
      </section>

      <section className="toolbar">
        <input
          className="search-input"
          placeholder="Bug 제목 또는 설명으로 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <div className="toolbar-filters">
          {!embeddedProjectId && (
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">전체 프로젝트</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <div className="filter-chips">
            {(['all', 'open', 'in_progress', 'fixed', 'closed', 'reopened'] as const).map((s) => (
              <button
                key={s}
                className={`chip ${statusFilter === s ? 'is-active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? '전체' : BUG_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <div className="error-banner">⚠ {error} — 백엔드 서버(http://localhost:4000)가 실행 중인지 확인해주세요.</div>}

      {projects.length === 0 && !loading && (
        <div className="empty-state">
          <strong>먼저 프로젝트를 생성해주세요.</strong>
          <span>Bug는 특정 프로젝트에 소속되어 관리됩니다.</span>
        </div>
      )}

      {loading ? (
        <div className="empty-state">불러오는 중...</div>
      ) : projects.length > 0 && bugs.length === 0 ? (
        <div className="empty-state">
          <strong>표시할 Bug가 없습니다.</strong>
          <span>새 Bug를 등록하거나 검색/필터 조건을 변경해보세요.</span>
        </div>
      ) : (
        groupedByProject ? (
          <div className="bug-group-list">
            {groupedByProject.map((group) => (
              <div className="bug-group" key={group.projectId}>
                <div className="bug-group-header">
                  📁 {group.projectName} <span className="bug-group-count">({group.items.length})</span>
                </div>
                <div className="bug-list">
                  {group.items.map((b) => renderBugCard(b, true))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bug-list">
            {bugs.map((b) => renderBugCard(b, false))}
          </div>
        )
      )}

      {modalOpen && (
        <BugModal
          initial={editing}
          projects={projects}
          defaultProjectId={projectFilter === 'all' ? projects[0]?.id : projectFilter}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
