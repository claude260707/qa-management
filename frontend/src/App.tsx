import { useState } from 'react';
import Sidebar from './Sidebar';
import ProjectsScreen from './ProjectsScreen';
import ProjectDetailScreen from './ProjectDetailScreen';
import BugsScreen from './BugsScreen';
import type { PlanAnalysisTab } from './PlanAnalysisScreen';
import './App.layout.css';

export default function App() {
  const [detailProjectId, setDetailProjectId] = useState<number | null>(null);
  const [projectsVersion, setProjectsVersion] = useState(0);
  // 사이드바 폴더 트리 <-> 본문 탭을 서로 동기화하기 위해 여기서 관리
  const [detailTab, setDetailTab] = useState<'planAnalysis' | 'testcases'>('planAnalysis');
  const [planStep, setPlanStep] = useState<PlanAnalysisTab>('type');
  // 최상위 화면 전환 - "프로젝트 관리"(목록/상세) 아니면 "Bug 관리"(프로젝트 전체 버그 조회)
  const [topView, setTopView] = useState<'projects' | 'bugs'>('projects');

  function handleSelectProject(id: number) {
    setTopView('projects');
    setDetailProjectId(id);
    setDetailTab('planAnalysis');
    setPlanStep('type');
  }

  function handleOpenProjectList() {
    setTopView('projects');
    setDetailProjectId(null);
  }

  function handleOpenBugs() {
    setTopView('bugs');
  }

  function handleProjectsChanged() {
    setProjectsVersion((v) => v + 1);
  }

  // 사이드바 폴더 트리에서 "기획 자료 분석" 하위의 특정 단계(①~⑤)를 클릭했을 때
  function handleSelectPlanStep(projectId: number, step: PlanAnalysisTab) {
    setTopView('projects');
    setDetailProjectId(projectId);
    setDetailTab('planAnalysis');
    setPlanStep(step);
  }

  // 사이드바 폴더 트리에서 "Test Case"를 클릭했을 때
  function handleSelectTestCaseTab(projectId: number) {
    setTopView('projects');
    setDetailProjectId(projectId);
    setDetailTab('testcases');
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeProjectId={detailProjectId}
        isListActive={topView === 'projects' && detailProjectId === null}
        isBugsActive={topView === 'bugs'}
        onSelectProject={handleSelectProject}
        onOpenProjectList={handleOpenProjectList}
        onOpenBugs={handleOpenBugs}
        refreshSignal={projectsVersion}
        activeDetailTab={detailTab}
        activePlanStep={planStep}
        onSelectPlanStep={handleSelectPlanStep}
        onSelectTestCaseTab={handleSelectTestCaseTab}
      />
      <main className="app-main">
        {topView === 'bugs' ? (
          <BugsScreen />
        ) : detailProjectId !== null ? (
          <ProjectDetailScreen
            projectId={detailProjectId}
            onBack={handleOpenProjectList}
            tab={detailTab}
            onTabChange={setDetailTab}
            planStep={planStep}
            onPlanStepChange={setPlanStep}
          />
        ) : (
          <ProjectsScreen onOpenDetail={setDetailProjectId} onProjectsChanged={handleProjectsChanged} />
        )}
      </main>
    </div>
  );
}
