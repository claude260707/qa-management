import { useEffect, useState } from 'react';
import type { Project } from './types';
import { projectsApi } from './api';
import './Sidebar.css';

interface SidebarProps {
  activeProjectId: number | null;
  isListActive: boolean;
  onSelectProject: (id: number) => void;
  onOpenProjectList: () => void;
  refreshSignal: number;
}

export default function Sidebar({ activeProjectId, isListActive, onSelectProject, onOpenProjectList, refreshSignal }: SidebarProps) {
  const [expanded, setExpanded] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  // 프로젝트가 생성/수정/삭제될 때마다(refreshSignal 증가) 사이드바 목록도 최신화
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    projectsApi.list().then((data) => {
      if (!cancelled) setProjects(data);
    }).catch(() => {
      // 사이드바 목록 갱신 실패는 조용히 무시 - 본문 화면에서 이미 에러를 보여줌
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [refreshSignal]);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">QA</span>
        <div className="sidebar-brand-text">
          <strong>QA Management</strong>
          <span>System</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-accordion-header">
          <button
            className="sidebar-accordion-chevron"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? '프로젝트 목록 접기' : '프로젝트 목록 펼치기'}
          >
            {expanded ? '▾' : '▸'}
          </button>
          <button
            className={`sidebar-item sidebar-accordion-label ${isListActive ? 'is-active' : ''}`}
            onClick={onOpenProjectList}
          >
            <span className="sidebar-item-icon">◧</span>
            <span>프로젝트 관리</span>
          </button>
        </div>

        {expanded && (
          <div className="sidebar-project-list">
            <div className="sidebar-project-list-label">프로젝트 목록</div>
            {loading && <div className="sidebar-project-empty">불러오는 중...</div>}
            {!loading && projects.length === 0 && (
              <div className="sidebar-project-empty">등록된 프로젝트가 없습니다</div>
            )}
            {!loading && projects.map((p) => (
              <button
                key={p.id}
                className={`sidebar-project-item ${activeProjectId === p.id ? 'is-active' : ''}`}
                onClick={() => onSelectProject(p.id)}
                title={p.name}
              >
                <span className="sidebar-project-name">{p.name}</span>
                <span className="sidebar-project-progress">{p.progress}%</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-row">
          <span className="sidebar-dot" />
          <span>API 연결됨</span>
        </div>
      </div>
    </aside>
  );
}
