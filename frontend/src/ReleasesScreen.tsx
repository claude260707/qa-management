import { useEffect, useMemo, useState } from 'react';
import type { Project, Release, ReleaseInput, ReleaseStatus } from './types';
import { RELEASE_STATUS_LABEL } from './types';
import { projectsApi, releasesApi } from './api';
import ReleaseModal from './ReleaseModal';
import './ReleasesScreen.css';

function formatDate(d: string | null) {
  if (!d) return '미정';
  return d.slice(0, 10);
}

export default function ReleasesScreen({ embeddedProjectId }: { embeddedProjectId?: number } = {}) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [projectFilter, setProjectFilter] = useState<'all' | number>(embeddedProjectId ?? 'all');
  const [statusFilter, setStatusFilter] = useState<'all' | ReleaseStatus>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Release | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailById, setDetailById] = useState<Record<number, Release>>({});

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await releasesApi.list({
        project_id: projectFilter === 'all' ? undefined : projectFilter,
        status: statusFilter,
        keyword,
      });
      setReleases(data);
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
    const total = releases.length;
    const planned = releases.filter((r) => r.status === 'planned').length;
    const released = releases.filter((r) => r.status === 'released').length;
    const rolledBack = releases.filter((r) => r.status === 'rolled_back').length;
    return { total, planned, released, rolledBack };
  }, [releases]);

  const groupedByProject = useMemo(() => {
    if (projectFilter !== 'all') return null;
    const map = new Map<number, { projectName: string; items: Release[] }>();
    releases.forEach((r) => {
      if (!map.has(r.project_id)) map.set(r.project_id, { projectName: r.project_name, items: [] });
      map.get(r.project_id)!.items.push(r);
    });
    return Array.from(map.entries()).map(([projectId, v]) => ({ projectId, ...v }));
  }, [releases, projectFilter]);

  async function handleSubmit(input: ReleaseInput) {
    if (editing) {
      await releasesApi.update(editing.id, input);
    } else {
      await releasesApi.create(input);
    }
    setModalOpen(false);
    setEditing(null);
    setDetailById({});
    await load();
  }

  async function handleDelete(r: Release) {
    if (!confirm(`"${r.version}" Release를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await releasesApi.remove(r.id);
    await load();
  }

  async function toggleExpand(r: Release) {
    if (expandedId === r.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(r.id);
    if (!detailById[r.id]) {
      const detail = await releasesApi.get(r.id);
      setDetailById((prev) => ({ ...prev, [r.id]: detail }));
    }
  }

  async function openEdit(r: Release) {
    let full = detailById[r.id];
    if (!full) {
      full = await releasesApi.get(r.id);
      setDetailById((prev) => ({ ...prev, [r.id]: full }));
    }
    setEditing(full);
    setModalOpen(true);
  }

  function renderReleaseCard(r: Release, hideProjectTag: boolean) {
    const detail = detailById[r.id];
    const isExpanded = expandedId === r.id;
    return (
      <article className="release-card" key={r.id}>
        <div className="release-card-top" onClick={() => toggleExpand(r)}>
          <div className="release-card-main">
            <span className={`release-status-pill release-status-${r.status}`}>{RELEASE_STATUS_LABEL[r.status]}</span>
            <h3 className="release-version">{r.version}</h3>
            {!hideProjectTag && <span className="release-project-tag">📁 {r.project_name}</span>}
          </div>
          <div className="release-card-side">
            <span className="release-date mono">📅 {formatDate(r.release_date)}</span>
            <span className="release-counts">🐞 {r.bug_count ?? 0} · 📋 {r.requirement_count ?? 0}</span>
            <span className="expand-arrow">{isExpanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {isExpanded && (
          <div className="release-card-detail">
            {r.notes && <p className="release-notes">{r.notes}</p>}

            <div className="release-detail-col">
              <span className="release-detail-label">🐞 이 버전에서 수정된 Bug ({detail?.bugs?.length ?? 0})</span>
              {detail?.bugs && detail.bugs.length > 0 ? (
                <ul className="release-detail-list">
                  {detail.bugs.map((b) => <li key={b.id}>{b.title}</li>)}
                </ul>
              ) : (
                <span className="release-detail-empty">연결된 Bug가 없습니다.</span>
              )}
            </div>

            <div className="release-detail-col">
              <span className="release-detail-label">📋 이 버전에 포함된 요구사항 ({detail?.requirements?.length ?? 0})</span>
              {detail?.requirements && detail.requirements.length > 0 ? (
                <ul className="release-detail-list">
                  {detail.requirements.map((req) => <li key={req.id}>{req.title}</li>)}
                </ul>
              ) : (
                <span className="release-detail-empty">연결된 요구사항이 없습니다.</span>
              )}
            </div>

            <div className="release-detail-actions">
              <button className="btn-ghost-sm" onClick={() => openEdit(r)}>✎ 수정</button>
              <button className="btn-ghost-sm" onClick={() => handleDelete(r)}>✕ 삭제</button>
            </div>
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="releases-screen">
      <header className="screen-header">
        {!embeddedProjectId && (
          <div>
            <h1>Release 관리</h1>
            <p className="screen-subtitle">버전과 배포일자를 기준으로, 수정된 Bug와 완료된 요구사항을 함께 기록합니다</p>
          </div>
        )}
        <button
          className="btn-primary"
          onClick={() => { setEditing(null); setModalOpen(true); }}
          disabled={projects.length === 0}
          title={projects.length === 0 ? '먼저 프로젝트를 생성해주세요' : ''}
        >
          + 새 Release
        </button>
      </header>

      <section className="stat-row">
        <div className="stat-card">
          <span className="stat-value">{summary.total}</span>
          <span className="stat-label">전체 Release</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--rel-planned)' }}>{summary.planned}</span>
          <span className="stat-label">배포예정</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--rel-released)' }}>{summary.released}</span>
          <span className="stat-label">배포완료</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--rel-rolled_back)' }}>{summary.rolledBack}</span>
          <span className="stat-label">롤백됨</span>
        </div>
      </section>

      <section className="toolbar">
        <input
          className="search-input"
          placeholder="버전명 또는 노트로 검색"
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
            {(['all', 'planned', 'released', 'rolled_back'] as const).map((s) => (
              <button
                key={s}
                className={`chip ${statusFilter === s ? 'is-active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? '전체' : RELEASE_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <div className="error-banner">⚠ {error} — 백엔드 서버(http://localhost:4000)가 실행 중인지 확인해주세요.</div>}

      {projects.length === 0 && !loading && (
        <div className="empty-state">
          <strong>먼저 프로젝트를 생성해주세요.</strong>
          <span>Release는 특정 프로젝트에 소속되어 관리됩니다.</span>
        </div>
      )}

      {loading ? (
        <div className="empty-state">불러오는 중...</div>
      ) : projects.length > 0 && releases.length === 0 ? (
        <div className="empty-state">
          <strong>표시할 Release가 없습니다.</strong>
          <span>새 Release를 등록하거나 검색/필터 조건을 변경해보세요.</span>
        </div>
      ) : (
        groupedByProject ? (
          <div className="release-group-list">
            {groupedByProject.map((group) => (
              <div className="release-group" key={group.projectId}>
                <div className="release-group-header">
                  📁 {group.projectName} <span className="release-group-count">({group.items.length})</span>
                </div>
                <div className="release-list">
                  {group.items.map((r) => renderReleaseCard(r, true))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="release-list">
            {releases.map((r) => renderReleaseCard(r, false))}
          </div>
        )
      )}

      {modalOpen && (
        <ReleaseModal
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
