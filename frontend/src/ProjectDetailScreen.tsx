import { useEffect, useState } from 'react';
import type { Project } from './types';
import { STATUS_LABEL } from './types';
import { projectsApi } from './api';
import TestCasesScreen from './TestCasesScreen';
import PlanAnalysisScreen from './PlanAnalysisScreen';
import './ProjectDetailScreen.css';

type DetailTab = 'planAnalysis' | 'testcases';

const TABS: { key: DetailTab; label: string }[] = [
  { key: 'planAnalysis', label: '기획 자료 분석' },
  { key: 'testcases', label: 'Test Case' },
];

function formatDate(d: string | null) {
  if (!d) return '-';
  return d.slice(0, 10);
}

export default function ProjectDetailScreen({ projectId, onBack }: { projectId: number; onBack: () => void }) {
  const [tab, setTab] = useState<DetailTab>('planAnalysis');
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setTab('planAnalysis');
    projectsApi.get(projectId).then((p) => {
      if (cancelled) return;
      setProject(p);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [projectId]);

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
        </div>
      </header>

      <div className="pd-tab-row">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`pd-tab-btn ${tab === t.key ? 'is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: tab === 'planAnalysis' ? 'block' : 'none' }}>
        <PlanAnalysisScreen embeddedProjectId={projectId} />
      </div>
      {tab === 'testcases' && <TestCasesScreen embeddedProjectId={projectId} />}
    </div>
  );
}
