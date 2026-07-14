import { useState } from 'react';
import type { Project, Requirement, RequirementInput, RequirementCategory, RequirementPriority, RequirementStatus } from './types';
import { REQ_CATEGORY_LABEL, REQ_PRIORITY_LABEL, REQ_STATUS_LABEL } from './types';
import './ProjectModal.css';

interface Props {
  initial: Requirement | null;
  projects?: Project[];
  defaultProjectId?: number;
  readOnly?: boolean;
  onClose: () => void;
  onSubmit?: (input: RequirementInput) => Promise<void>;
}

export default function RequirementModal({ initial, projects = [], defaultProjectId, readOnly = false, onClose, onSubmit }: Props) {
  const [projectId, setProjectId] = useState<number>(initial?.project_id ?? defaultProjectId ?? projects[0]?.id ?? 0);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<RequirementCategory>(initial?.category ?? 'functional');
  const [priority, setPriority] = useState<RequirementPriority>(initial?.priority ?? 'medium');
  const [status, setStatus] = useState<RequirementStatus>(initial?.status ?? 'draft');
  const [requester, setRequester] = useState(initial?.requester ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onSubmit) return;
    if (!title.trim()) {
      setError('요구사항 제목을 입력해주세요.');
      return;
    }
    if (!projectId) {
      setError('프로젝트를 선택해주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        project_id: projectId,
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        status,
        requester: requester.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
      setSubmitting(false);
    }
  }

  if (readOnly && initial) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>요구사항 상세</h2>
            <button type="button" className="modal-close" onClick={onClose}>✕</button>
          </div>

          <div className="modal-body">
            <div className="field-row">
              <div className="field">
                <span>프로젝트</span>
                <p className="view-text">{initial.project_name}</p>
              </div>
              <div className="field">
                <span>상태</span>
                <p className="view-text"><span className={`req-status-pill req-status-${initial.status}`}>{REQ_STATUS_LABEL[initial.status]}</span></p>
              </div>
            </div>

            <div className="field">
              <span>요구사항 제목</span>
              <p className="view-text view-text-title">{initial.title}</p>
            </div>

            <div className="field">
              <span>설명</span>
              <p className="view-text view-text-multiline">{initial.description || '설명이 없습니다.'}</p>
            </div>

            <div className="field-row">
              <div className="field">
                <span>분류</span>
                <p className="view-text">{REQ_CATEGORY_LABEL[initial.category]}</p>
              </div>
              <div className="field">
                <span>우선순위</span>
                <p className="view-text"><span className={`priority-pill priority-${initial.priority}`}>{REQ_PRIORITY_LABEL[initial.priority]}</span></p>
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <span>요청자</span>
                <p className="view-text">{initial.requester || '-'}</p>
              </div>
              <div className="field">
                <span>최근 수정</span>
                <p className="view-text mono">{initial.updated_at.replace('T', ' ').slice(0, 16)}</p>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-ghost" onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2>{initial ? '요구사항 수정' : '새 요구사항'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span>프로젝트 *</span>
            <select value={projectId} onChange={(e) => setProjectId(Number(e.target.value))}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>요구사항 제목 *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 프로젝트 CRUD 기능" autoFocus />
          </label>

          <label className="field">
            <span>설명</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="요구사항에 대한 상세 설명" />
          </label>

          <div className="field-row">
            <label className="field">
              <span>분류</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as RequirementCategory)}>
                {Object.entries(REQ_CATEGORY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>우선순위</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as RequirementPriority)}>
                {Object.entries(REQ_PRIORITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>상태</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as RequirementStatus)}>
                {Object.entries(REQ_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>요청자</span>
              <input value={requester} onChange={(e) => setRequester(e.target.value)} placeholder="요청자명" />
            </label>
          </div>

          {error && <div className="field-error">⚠ {error}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? '저장 중...' : initial ? '수정 완료' : '요구사항 등록'}
          </button>
        </div>
      </form>
    </div>
  );
}
