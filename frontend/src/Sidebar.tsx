import { useEffect, useState } from 'react';
import type { Project } from './types';
import { projectsApi } from './api';
import { PLAN_ANALYSIS_TAB_CONFIG } from './PlanAnalysisScreen';
import type { PlanAnalysisTab } from './PlanAnalysisScreen';
import './Sidebar.css';

interface SidebarProps {
  activeProjectId: number | null;
  isListActive: boolean;
  isBugsActive: boolean;
  onSelectProject: (id: number) => void;
  onOpenProjectList: () => void;
  onOpenBugs: () => void;
  refreshSignal: number;
  // 프로젝트 하위 폴더(기획 자료 분석 > ①~⑤ / Test Case) 트리 동기화용
  activeDetailTab?: 'planAnalysis' | 'testcases';
  activePlanStep?: PlanAnalysisTab;
  onSelectPlanStep?: (projectId: number, step: PlanAnalysisTab) => void;
  onSelectTestCaseTab?: (projectId: number) => void;
}

export default function Sidebar({
  activeProjectId, isListActive, isBugsActive, onSelectProject, onOpenProjectList, onOpenBugs, refreshSignal,
  activeDetailTab, activePlanStep, onSelectPlanStep, onSelectTestCaseTab,
}: SidebarProps) {
  const [expanded, setExpanded] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  // 어떤 프로젝트의 하위 폴더(기획 자료 분석/Test Case)가 펼쳐져 있는지
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<number>>(new Set());
  // "기획 자료 분석" 폴더 자체를 펼쳐서 ①~⑤ 단계까지 보여줄지 (프로젝트별로 관리)
  const [expandedPlanFolders, setExpandedPlanFolders] = useState<Set<number>>(new Set());

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

  // 현재 열려있는 프로젝트는 자동으로 하위 폴더까지 펼쳐서 보여줌 (어디 있는지 바로 보이게)
  useEffect(() => {
    if (activeProjectId == null) return;
    setExpandedProjectIds((prev) => new Set(prev).add(activeProjectId));
    if (activeDetailTab === 'planAnalysis') {
      setExpandedPlanFolders((prev) => new Set(prev).add(activeProjectId));
    }
  }, [activeProjectId, activeDetailTab]);

  function toggleProjectFolder(id: number) {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePlanFolder(id: number) {
    setExpandedPlanFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
            {!loading && projects.map((p) => {
              const isProjectOpen = expandedProjectIds.has(p.id);
              const isPlanFolderOpen = expandedPlanFolders.has(p.id);
              const isThisProjectActive = activeProjectId === p.id;
              return (
                <div key={p.id} className="sidebar-project-group">
                  <div className="sidebar-project-row">
                    <button
                      className="sidebar-project-chevron"
                      onClick={() => toggleProjectFolder(p.id)}
                      aria-label={isProjectOpen ? '폴더 접기' : '폴더 펼치기'}
                    >
                      {isProjectOpen ? '▾' : '▸'}
                    </button>
                    <button
                      className={`sidebar-project-item ${isThisProjectActive ? 'is-active' : ''}`}
                      onClick={() => onSelectProject(p.id)}
                      title={p.name}
                    >
                      <span className="sidebar-project-name">{p.name}</span>
                      <span className="sidebar-project-progress">{p.progress}%</span>
                    </button>
                  </div>

                  {isProjectOpen && (
                    <div className="sidebar-project-children">
                      {/* 기획 자료 분석 폴더 - 펼치면 ①~⑤ 단계가 하위 항목으로 나옴 */}
                      <div className="sidebar-subfolder-row">
                        <button
                          className="sidebar-project-chevron"
                          onClick={() => togglePlanFolder(p.id)}
                          aria-label={isPlanFolderOpen ? '기획 자료 분석 접기' : '기획 자료 분석 펼치기'}
                        >
                          {isPlanFolderOpen ? '▾' : '▸'}
                        </button>
                        <button
                          className={`sidebar-child-item ${isThisProjectActive && activeDetailTab === 'planAnalysis' && !activePlanStep ? 'is-active' : ''}`}
                          onClick={() => onSelectPlanStep?.(p.id, activePlanStep ?? 'type')}
                        >
                          📁 기획 자료 분석
                        </button>
                      </div>

                      {isPlanFolderOpen && (
                        <div className="sidebar-step-list">
                          {PLAN_ANALYSIS_TAB_CONFIG.map((step) => (
                            <button
                              key={step.key}
                              className={`sidebar-step-item ${isThisProjectActive && activeDetailTab === 'planAnalysis' && activePlanStep === step.key ? 'is-active' : ''}`}
                              onClick={() => onSelectPlanStep?.(p.id, step.key)}
                            >
                              {step.label}
                            </button>
                          ))}
                        </div>
                      )}

                      <button
                        className={`sidebar-child-item ${isThisProjectActive && activeDetailTab === 'testcases' ? 'is-active' : ''}`}
                        onClick={() => onSelectTestCaseTab?.(p.id)}
                      >
                        📄 Test Case
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="sidebar-accordion-header">
          <span className="sidebar-accordion-chevron" style={{ visibility: 'hidden' }}>▾</span>
          <button
            className={`sidebar-item sidebar-accordion-label ${isBugsActive ? 'is-active' : ''}`}
            onClick={onOpenBugs}
          >
            <span className="sidebar-item-icon">🐞</span>
            <span>Bug 관리</span>
          </button>
        </div>
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
