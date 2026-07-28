import './Sidebar.css';

const NAV_ITEMS = [
  { key: 'projects', label: '프로젝트 관리', icon: '◧', ready: true },
];

export default function Sidebar({ active, onNavigate }: { active: string; onNavigate: (key: string) => void }) {
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
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`sidebar-item ${active === item.key ? 'is-active' : ''} ${!item.ready ? 'is-disabled' : ''}`}
            disabled={!item.ready}
            onClick={() => item.ready && onNavigate(item.key)}
            title={item.ready ? '' : '준비중인 화면입니다'}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            <span>{item.label}</span>
            {!item.ready && <span className="sidebar-item-badge">준비중</span>}
          </button>
        ))}
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
