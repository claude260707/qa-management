import './Breadcrumb.css';

interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumb" aria-label="현재 위치">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="breadcrumb-segment">
            {item.onClick ? (
              <button type="button" className="breadcrumb-link" onClick={item.onClick}>
                {item.label}
              </button>
            ) : (
              <span className={isLast ? 'breadcrumb-current' : 'breadcrumb-text'}>{item.label}</span>
            )}
            {!isLast && <span className="breadcrumb-sep">›</span>}
          </span>
        );
      })}
    </nav>
  );
}
