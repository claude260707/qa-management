import { useEffect, useMemo, useState } from 'react';
import type { Project, ProjectInput, ProjectStatus } from './types';
import { STATUS_LABEL, STATUS_STAGE_ORDER } from './types';
import { projectsApi } from './api';
import ProjectModal from './ProjectModal';
import './ProjectsScreen.css';


const STAGE_ORDER = STATUS_STAGE_ORDER;

function formatDate(d: string | null) {
  if (!d) return '-';
  return d.slice(0, 10);
}

export default function ProjectsScreen({ onOpenDetail }: { onOpenDetail: (id: number) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await projectsApi.list({ status: statusFilter, keyword });
      setProjects(data);
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
  }, [statusFilter, keyword]);


  const PROGRESS_GROUP: ProjectStatus[] = ['qa_in_progress', 'test_done'];
  const DONE_GROUP: ProjectStatus[] = ['completed', 'on_hold'];

  const summary = useMemo(() => {
    const total = projects.length;
    const planning = projects.filter((p) => p.status === 'planning').length;
    const inProgressGroup = projects.filter((p) => PROGRESS_GROUP.includes(p.status)).length;
    const doneGroup = projects.filter((p) => DONE_GROUP.includes(p.status)).length;
    return { total, planning, inProgressGroup, doneGroup };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  async function handleSubmit(input: ProjectInput) {
    if (editing) {
      await projectsApi.update(editing.id, input);
    } else {
      await projectsApi.create(input);
    }
    setModalOpen(false);
    setEditing(null);
    await load();
  }

  async function handleDelete(p: Project) {
    if (!confirm(`"${p.name}" 프로젝트를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await projectsApi.remove(p.id);
    await load();
  }

  return (
    <div className="projects-screen">
      <header className="screen-header">
        <div>
          <h1>프로젝트 관리</h1>
          <p className="screen-subtitle">기획부터 QA 테스트까지, 진행 중인 모든 프로젝트를 한 곳에서 확인합니다</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
          + 새 프로젝트
        </button>
      </header>

      <section className="stat-row">
        <div className="stat-card">
          <span className="stat-value">{summary.total}</span>
          <span className="stat-label">전체 프로젝트</span>
        </div>
        <div className="stat-card" title="QA 미진행 상태인 프로젝트">
          <span className="stat-value" style={{ color: 'var(--status-planning)' }}>{summary.planning}</span>
          <span className="stat-label">{STATUS_LABEL.planning}</span>
        </div>
        <div className="stat-card" title="QA진행중 + 테스트완료">
          <span className="stat-value" style={{ color: 'var(--status-in_progress)' }}>{summary.inProgressGroup}</span>
          <span className="stat-label">QA 진행</span>
        </div>
        <div className="stat-card" title="완료 + 보류">
          <span className="stat-value" style={{ color: 'var(--status-completed)' }}>{summary.doneGroup}</span>
          <span className="stat-label">완료 · 보류</span>
        </div>
      </section>

      <section className="toolbar">
        <input
          className="search-input"
          placeholder="프로젝트명 또는 설명으로 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <div className="filter-chips">
          {([
            { key: 'all', label: '전체' },
            { key: 'planning', label: STATUS_LABEL.planning },
            { key: 'qa_in_progress', label: STATUS_LABEL.qa_in_progress },
            { key: 'test_done', label: STATUS_LABEL.test_done },
            { key: 'completed', label: STATUS_LABEL.completed },
            { key: 'on_hold', label: STATUS_LABEL.on_hold },
          ] as const).map((c) => (
            <button
              key={c.key}
              className={`chip ${statusFilter === c.key ? 'is-active' : ''}`}
              onClick={() => setStatusFilter(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="error-banner">⚠ {error} — 백엔드 서버(http://localhost:4000)가 실행 중인지 확인해주세요.</div>}

      {loading ? (
        <div className="empty-state">불러오는 중...</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <strong>표시할 프로젝트가 없습니다.</strong>
          <span>새 프로젝트를 등록하거나 검색/필터 조건을 변경해보세요.</span>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <article className="project-card" key={p.id}>
              <div className="project-card-top">
                <span className={`status-pill status-${p.status}`}>{STATUS_LABEL[p.status]}</span>
                <div className="card-actions">
                  <button onClick={() => { setEditing(p); setModalOpen(true); }} title="수정">✎</button>
                  <button onClick={() => handleDelete(p)} title="삭제">✕</button>
                </div>
              </div>

              <h3 className="project-name project-name-clickable" onClick={() => onOpenDetail(p.id)}>{p.name}</h3>
              {p.description && <p className="project-desc">{p.description}</p>}

              <div className="stage-tracker">
                {STAGE_ORDER.map((stage, i) => {
                  const isBranch = p.status === 'on_hold';
                  const currentIdx = STAGE_ORDER.indexOf(isBranch ? 'planning' : p.status);
                  let stateClass = '';
                  if (p.status === 'on_hold') stateClass = 'is-hold';
                  else stateClass = i < currentIdx ? 'is-done' : i === currentIdx ? 'is-current' : '';
                  return <span key={stage} className={`stage-dot ${stateClass}`} title={STATUS_LABEL[stage]} />;
                })}
              </div>

              <div className="project-meta">
                <div><span className="meta-label">담당자</span><span>{p.manager || '-'}</span></div>
                <div><span className="meta-label">기간</span><span className="mono">{formatDate(p.start_date)} ~ {formatDate(p.end_date)}</span></div>
              </div>
            </article>
          ))}
        </div>
      )}

      {modalOpen && (
        <ProjectModal
          initial={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
