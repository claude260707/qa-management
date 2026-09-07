import { useEffect, useState } from 'react';
import type { Project } from './types';
import { STATUS_LABEL } from './types';
import { projectsApi } from './api';
import TestCasesScreen from './TestCasesScreen';
import PlanAnalysisScreen from './PlanAnalysisScreen';
import type { PlanAnalysisTab } from './PlanAnalysisScreen';
import Breadcrumb from './Breadcrumb';
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

interface ProjectDetailScreenProps {
  projectId: number;
  onBack: () => void;
  // 사이드바 폴더 트리와 동기화하기 위해 상위(App)에서 내려주는 제어값들.
  // 넘어오지 않으면 이 화면 내부 상태로만 동작 (하위 호환).
  tab?: DetailTab;
  onTabChange?: (tab: DetailTab) => void;
  planStep?: PlanAnalysisTab;
  onPlanStepChange?: (step: PlanAnalysisTab) => void;
}

export default function ProjectDetailScreen({ projectId, onBack, tab: controlledTab, onTabChange, planStep, onPlanStepChange }: ProjectDetailScreenProps) {
  const [internalTab, setInternalTab] = useState<DetailTab>('planAnalysis');
  const tab = controlledTab ?? internalTab;
  function setTab(t: DetailTab) {
    if (onTabChange) onTabChange(t);
    else setInternalTab(t);
  }
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [planStepLabel, setPlanStepLabel] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (!controlledTab) setInternalTab('planAnalysis');
    setPlanStepLabel('');
    projectsApi.get(projectId).then((p) => {
      if (cancelled) return;
      setProject(p);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleAdvanceRound() {
    if (!project) return;
    const confirmed = window.confirm(
      `${project.current_round}차를 종료하고 ${project.current_round + 1}차를 시작할까요?\n(기존 TC 실행 이력은 보존되고, 이후 저장되는 결과부터 새 차수로 기록됩니다.)`
    );
    if (!confirmed) return;
    try {
      const updated = await projectsApi.advanceRound(project.id);
      setProject(updated);
    } catch (err) {
      console.error(err);
      alert('차수 진행에 실패했습니다.');
    }
  }

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
      <Breadcrumb
        items={[
          { label: '프로젝트 관리', onClick: onBack },
          { label: project.name },
          ...(tab === 'testcases'
            ? [{ label: 'Test Case' }]
            : [{ label: '기획 자료 분석' }, ...(planStepLabel ? [{ label: planStepLabel }] : [])]),
        ]}
      />
      <button className="pd-back" onClick={onBack}>← 프로젝트 목록으로</button>

      <header className="pd-header">
        <div className="pd-header-top">
          <span className={`status-pill status-${project.status}`}>{STATUS_LABEL[project.status]}</span>
          <h1>{project.name}</h1>
          <button className="round-advance-btn" onClick={handleAdvanceRound}>
            {project.current_round}차 진행 중 · 다음 차수 시작
          </button>
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
        <PlanAnalysisScreen
          embeddedProjectId={projectId}
          onStepChange={setPlanStepLabel}
          activeTab={planStep}
          onActiveTabChange={onPlanStepChange}
        />
      </div>
      {tab === 'testcases' && <TestCasesScreen embeddedProjectId={projectId} />}
    </div>
  );
}