import { useState } from 'react';
import Sidebar from './Sidebar';
import ProjectsScreen from './ProjectsScreen';
import ProjectDetailScreen from './ProjectDetailScreen';
import './App.layout.css';

export default function App() {
  const [detailProjectId, setDetailProjectId] = useState<number | null>(null);
  const [projectsVersion, setProjectsVersion] = useState(0);

  function handleSelectProject(id: number) {
    setDetailProjectId(id);
  }

  function handleOpenProjectList() {
    setDetailProjectId(null);
  }

  function handleProjectsChanged() {
    setProjectsVersion((v) => v + 1);
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeProjectId={detailProjectId}
        isListActive={detailProjectId === null}
        onSelectProject={handleSelectProject}
        onOpenProjectList={handleOpenProjectList}
        refreshSignal={projectsVersion}
      />
      <main className="app-main">
        {detailProjectId !== null
          ? <ProjectDetailScreen projectId={detailProjectId} onBack={handleOpenProjectList} />
          : <ProjectsScreen onOpenDetail={setDetailProjectId} onProjectsChanged={handleProjectsChanged} />}
      </main>
    </div>
  );
}
