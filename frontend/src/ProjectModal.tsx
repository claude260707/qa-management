import { useState } from 'react';
import type { Project, ProjectInput, ProjectStatus } from './types';
import { STATUS_LABEL } from './types';
import './ProjectModal.css';

interface Props {
  initial: Project | null;
  onClose: () => void;
  onSubmit: (input: ProjectInput) => Promise<void>;
}

export default function ProjectModal({ initial, onClose, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? 'planning');
  const [manager, setManager] = useState(initial?.manager ?? '');
  const [startDate, setStartDate] = useState(initial?.start_date?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(initial?.end_date?.slice(0, 10) ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('프로젝트명을 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        status,
        manager: manager.trim(),
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2>{initial ? '프로젝트 수정' : '새 프로젝트'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span>프로젝트명 *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 사내 QA 관리 시스템" autoFocus />
          </label>

          <label className="field">
            <span>설명</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="프로젝트에 대한 간단한 설명" />
          </label>

          <div className="field-row">
            <label className="field">
              <span>상태</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>담당자</span>
              <input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="담당자명" />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>시작일</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="field">
              <span>종료일</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>

          {error && <div className="field-error">⚠ {error}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? '저장 중...' : initial ? '수정 완료' : '프로젝트 생성'}
          </button>
        </div>
      </form>
    </div>
  );
}
