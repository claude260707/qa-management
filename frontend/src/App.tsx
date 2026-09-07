import { useState } from 'react';
import Sidebar from './Sidebar';
import ProjectsScreen from './ProjectsScreen';
import ProjectDetailScreen from './ProjectDetailScreen';
import type { PlanAnalysisTab } from './PlanAnalysisScreen';
import './App.layout.css';

export default function App() {
  const [detailProjectId, setDetailProjectId] = useState<number | null>(null);
  const [projectsVersion, setProjectsVersion] = useState(0);
  // 사이드바 폴더 트리 <-> 본문 탭을 서로 동기화하기 위해 여기서 관리
  const [detailTab, setDetailTab] = useState<'planAnalysis' | 'testcases'>('planAnalysis');
  const [planStep, setPlanStep] = useState<PlanAnalysisTab>('type');

  function handleSelectProject(id: number) {
    setDetailProjectId(id);
    setDetailTab('planAnalysis');
    setPlanStep('type');
  }

  function handleOpenProjectList() {
    setDetailProjectId(null);
  }

  function handleProjectsChanged() {
    setProjectsVersion((v) => v + 1);
  }

  // 사이드바 폴더 트리에서 "기획 자료 분석" 하위의 특정 단계(①~⑤)를 클릭했을 때
  function handleSelectPlanStep(projectId: number, step: PlanAnalysisTab) {
    setDetailProjectId(projectId);
    setDetailTab('planAnalysis');
    setPlanStep(step);
  }

  // 사이드바 폴더 트리에서 "Test Case"를 클릭했을 때
  function handleSelectTestCaseTab(projectId: number) {
    setDetailProjectId(projectId);
    setDetailTab('testcases');
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeProjectId={detailProjectId}
        isListActive={detailProjectId === null}
        onSelectProject={handleSelectProject}
        onOpenProjectList={handleOpenProjectList}
        refreshSignal={projectsVersion}
        activeDetailTab={detailTab}
        activePlanStep={planStep}
        onSelectPlanStep={handleSelectPlanStep}
        onSelectTestCaseTab={handleSelectTestCaseTab}
      />
      <main className="app-main">
        {detailProjectId !== null
          ? (
            <ProjectDetailScreen
              projectId={detailProjectId}
              onBack={handleOpenProjectList}
              tab={detailTab}
              onTabChange={setDetailTab}
              planStep={planStep}
              onPlanStepChange={setPlanStep}
            />
          )
          : <ProjectsScreen onOpenDetail={setDetailProjectId} onProjectsChanged={handleProjectsChanged} />}
      </main>
    </div>
  );
}
