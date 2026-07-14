import { useState } from 'react';
import Sidebar from './Sidebar';
import ProjectsScreen from './ProjectsScreen';
import ProjectDetailScreen from './ProjectDetailScreen';
import RequirementsScreen from './RequirementsScreen';
import FilesScreen from './FilesScreen';
import TestCasesScreen from './TestCasesScreen';
import BugsScreen from './BugsScreen';
import ReleasesScreen from './ReleasesScreen';
import './App.layout.css';

export default function App() {
  const [screen, setScreen] = useState('projects');
  const [detailProjectId, setDetailProjectId] = useState<number | null>(null);

  function handleNavigate(key: string) {
    setScreen(key);
    setDetailProjectId(null);
  }

  return (
    <div className="app-shell">
      <Sidebar active={screen} onNavigate={handleNavigate} />
      <main className="app-main">
        {screen === 'projects' && (
          detailProjectId !== null
            ? <ProjectDetailScreen projectId={detailProjectId} onBack={() => setDetailProjectId(null)} />
            : <ProjectsScreen onOpenDetail={setDetailProjectId} />
        )}
        {screen === 'requirements' && <RequirementsScreen />}
        {screen === 'files' && <FilesScreen />}
        {screen === 'testcases' && <TestCasesScreen />}
        {screen === 'bugs' && <BugsScreen />}
        {screen === 'release' && <ReleasesScreen />}
      </main>
    </div>
  );
}
