import { useEffect, useState } from 'react';
import type { Project, Requirement, Release, ReleaseInput, ReleaseStatus } from './types';
import { REQ_STATUS_LABEL, RELEASE_STATUS_LABEL } from './types';
import { requirementsApi } from './api';
import './ProjectModal.css';

interface Props {
  initial: Release | null;
  projects: Project[];
  defaultProjectId?: number;
  onClose: () => void;
  onSubmit: (input: ReleaseInput) => Promise<void>;
}

export default function ReleaseModal({ initial, projects, defaultProjectId, onClose, onSubmit }: Props) {
  const [projectId, setProjectId] = useState<number>(initial?.project_id ?? defaultProjectId ?? projects[0]?.id ?? 0);
  const [version, setVersion] = useState(initial?.version ?? '');
  const [releaseDate, setReleaseDate] = useState(initial?.release_date?.slice(0, 10) ?? '');
  const [status, setStatus] = useState<ReleaseStatus>(initial?.status ?? 'planned');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [selectedReqIds, setSelectedReqIds] = useState<number[]>(initial?.requirements?.map((r) => r.id) ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    requirementsApi.list({ project_id: projectId }).then(setRequirements).catch(() => {});
  }, [projectId]);

  function toggleReq(id: number) {
    setSelectedReqIds((prev) => prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!version.trim()) {
      setError('버전명을 입력해주세요.');
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
        version: version.trim(),
        release_date: releaseDate || null,
        status,
        notes: notes.trim(),
        requirement_ids: selectedReqIds,
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
          <h2>{initial ? 'Release 수정' : '새 Release'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="field-row">
            <label className="field">
              <span>프로젝트 *</span>
              <select value={projectId} onChange={(e) => { setProjectId(Number(e.target.value)); setSelectedReqIds([]); }}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>버전명 *</span>
              <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="예: v1.2.0" autoFocus />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>배포일자</span>
              <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
            </label>

            <label className="field">
              <span>상태</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as ReleaseStatus)}>
                {Object.entries(RELEASE_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>릴리즈 노트</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="이번 버전의 주요 변경사항을 요약해주세요" />
          </label>

          <label className="field">
            <span>포함된 요구사항 (완료된 기능)</span>
            <div className="req-checklist">
              {requirements.length === 0 ? (
                <span className="req-checklist-empty">이 프로젝트에 등록된 요구사항이 없습니다.</span>
              ) : (
                requirements.map((r) => (
                  <label key={r.id} className="req-checklist-item">
                    <input
                      type="checkbox"
                      checked={selectedReqIds.includes(r.id)}
                      onChange={() => toggleReq(r.id)}
                    />
                    <span>{r.title}</span>
                    <span className={`req-status-pill req-status-${r.status}`}>{REQ_STATUS_LABEL[r.status]}</span>
                  </label>
                ))
              )}
            </div>
          </label>

          {error && <div className="field-error">⚠ {error}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? '저장 중...' : initial ? '수정 완료' : 'Release 등록'}
          </button>
        </div>
      </form>
    </div>
  );
}
