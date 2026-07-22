import { useState, useEffect, useRef } from 'react';
import type { Project, Requirement, RequirementInput, RequirementCategory, RequirementPriority, RequirementStatus, Attachment } from './types';
import { REQ_CATEGORY_LABEL, REQ_PRIORITY_LABEL, REQ_STATUS_LABEL, EXCEPTION_CATEGORY_LABEL } from './types';
import { attachmentsApi } from './api';
import './ProjectModal.css';

interface Props {
  initial: Requirement | null;
  projects?: Project[];
  defaultProjectId?: number;
  readOnly?: boolean;
  onClose: () => void;
  onSubmit?: (input: RequirementInput) => Promise<void>;
}

function buildRequirementAiPrompt(title: string, description: string, category: string, attachmentSummaries: string[]) {
  const exceptionList = Object.values(EXCEPTION_CATEGORY_LABEL).join(', ');
  const summaryBlock = attachmentSummaries.length > 0
    ? `\n[연결된 기획문서/화면 요약]:\n${attachmentSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`
    : '';

  return `아래 요구사항을 검토해서 두 가지를 답변해줘.

[요구사항 제목]: ${title || '(제목 없음)'}
[분류]: ${category}
[설명]: ${description || '(설명 없음)'}${summaryBlock}
1. 이 요구사항 설명${attachmentSummaries.length > 0 ? '과 화면 요약' : ''}만으로 개발/QA를 진행하기에 애매하거나 빠진 정보가 있다면, 구체화를 위한 질문 목록을 만들어줘.
2. 아래 예외 케이스 카테고리 기준으로, 이 요구사항에서 고려해야 할 예외 상황이 있는지 카테고리별로 체크해줘. (해당 없는 카테고리는 "해당없음"이라고 표시)
카테고리: ${exceptionList}`;
}

function copyToClipboardFallback(text: string, onDone: (ok: boolean) => void) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    onDone(document.execCommand('copy'));
  } catch {
    onDone(false);
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function RequirementModal({ initial, projects = [], defaultProjectId, readOnly = false, onClose, onSubmit }: Props) {
  const [projectId, setProjectId] = useState<number>(initial?.project_id ?? defaultProjectId ?? projects[0]?.id ?? 0);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<RequirementCategory>(initial?.category ?? 'functional');
const [priority, setPriority] = useState<RequirementPriority>(initial?.priority ?? 'major');
  const [status, setStatus] = useState<RequirementStatus>(initial?.status ?? 'draft');
  const [requester, setRequester] = useState(initial?.requester ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relatedAttachments, setRelatedAttachments] = useState<Attachment[]>([]);

async function refreshRelatedAttachments() {
  if (!initial?.id) return;
  const list = await attachmentsApi.list({ requirement_id: initial.id });
  setRelatedAttachments(list);
  return list;
}

useEffect(() => {
  refreshRelatedAttachments().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [initial?.id]);

const [showAttachBox, setShowAttachBox] = useState(false);
const [newLinkTitle, setNewLinkTitle] = useState('');
const [newLinkUrl, setNewLinkUrl] = useState('');
const [newLinkSummary, setNewLinkSummary] = useState('');
const [attachBusy, setAttachBusy] = useState(false);
const [attachError, setAttachError] = useState<string | null>(null);
const fileInputRef = useRef<HTMLInputElement>(null);

async function handleInlineFileUpload(fileList: FileList | null) {
  if (!fileList || fileList.length === 0 || !initial?.id) return;
  setAttachBusy(true);
  setAttachError(null);
  try {
    await attachmentsApi.upload(fileList[0], projectId, '익명', initial.id);
    await refreshRelatedAttachments();
    setShowAttachBox(false);
  } catch (e) {
    setAttachError(e instanceof Error ? e.message : '파일 업로드에 실패했습니다.');
  } finally {
    setAttachBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
}

async function handleInlineLinkAdd() {
  if (!initial?.id) return;
  if (!newLinkTitle.trim() || !/^https?:\/\//.test(newLinkUrl.trim())) {
    setAttachError('제목과 http(s):// 로 시작하는 URL을 모두 입력해주세요.');
    return;
  }
  setAttachBusy(true);
  setAttachError(null);
  try {
    await attachmentsApi.createLink({
      project_id: projectId,
      requirement_id: initial.id,
      title: newLinkTitle.trim(),
      url: newLinkUrl.trim(),
      uploader: '익명',
      summary: newLinkSummary.trim() || undefined,
    });
    await refreshRelatedAttachments();
    setShowAttachBox(false);
    setNewLinkTitle('');
    setNewLinkUrl('');
    setNewLinkSummary('');
  } catch (e) {
    setAttachError(e instanceof Error ? e.message : '링크 추가에 실패했습니다.');
  } finally {
    setAttachBusy(false);
  }
}
  
function handleCopyAiPrompt() {
  const summaries = relatedAttachments
    .filter((a) => a.summary && a.summary.trim())
    .map((a) => `[${a.original_name}] ${a.summary}`);
  const prompt = buildRequirementAiPrompt(title, description, REQ_CATEGORY_LABEL[category], summaries);
  copyToClipboardFallback(prompt, (ok) => {
    alert(ok
      ? 'AI 프롬프트가 복사되었습니다. Claude.ai에 붙여넣어 주세요.'
      : '복사에 실패했습니다. 다시 시도해주세요.');
  });
}

 function renderAttachmentSection() {
  if (!initial?.id) return null;
  return (
    <div className="field">
      <span>📎 연결된 참고자료</span>
      {relatedAttachments.length > 0 ? (
        <div className="file-list" style={{ marginBottom: 8 }}>
          {relatedAttachments.map((a) => (
            <div className="file-row" key={a.id}>
              <div className="file-info">
                <div className="file-name">{a.type === 'link' ? '🔗 ' : '📎 '}{a.original_name}</div>
                {a.summary && <div className="file-summary">📝 {a.summary}</div>}
              </div>
              <div className="file-actions">
				{a.type === 'link' ? (
				  <a className="btn-ghost-sm" href={a.url ?? '#'} target="_blank" rel="noopener noreferrer">열기</a>
				) : (
				  <a className="btn-ghost-sm" href={attachmentsApi.downloadUrl(a.id)}>다운로드</a>
				)}
				<button
				  type="button"
				  className="btn-icon-sm"
				  title="삭제"
		          onClick={async () => {
					if (!confirm(`"${a.original_name}" 항목을 삭제할까요? 되돌릴 수 없습니다.`)) return;
					await attachmentsApi.remove(a.id);
					await refreshRelatedAttachments();
				  }}
				>
				  ✕
				</button>
			</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="view-text" style={{ color: 'var(--text-sub)' }}>연결된 참고자료가 없습니다.</p>
      )}

      {!showAttachBox ? (
        <button type="button" className="btn-ghost-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAttachBox(true)}>
          + 새 참고자료 바로 추가하기
        </button>
      ) : (
        <div className="inline-upload-box">
          <div className="inline-upload-row">
            <button type="button" className="btn-primary" disabled={attachBusy} onClick={() => fileInputRef.current?.click()}>
              {attachBusy ? '업로드 중...' : '파일 선택'}
            </button>
            <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={(e) => handleInlineFileUpload(e.target.files)} />
            <span className="inline-upload-or">또는 링크:</span>
          </div>
          <div className="inline-upload-row">
            <input className="field-inline-input" placeholder="링크 제목" value={newLinkTitle} onChange={(e) => setNewLinkTitle(e.target.value)} />
            <input className="field-inline-input" placeholder="https://..." value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} />
          </div>
          <textarea
            className="field-inline-input"
            placeholder="화면 요약 (선택, AI 프롬프트 생성에 활용됩니다)"
            value={newLinkSummary}
            onChange={(e) => setNewLinkSummary(e.target.value)}
            rows={2}
            style={{ width: '100%' }}
          />
          <button type="button" className="btn-ghost-sm" disabled={attachBusy} onClick={handleInlineLinkAdd}>추가</button>
          {attachError && <div className="field-error">⚠ {attachError}</div>}
        </div>
      )}
    </div>
  );
}

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

			<div className="field">
				{renderAttachmentSection()}

				<button type="button" className="btn-ghost-sm" style={{ alignSelf: 'flex-start' }} onClick={handleCopyAiPrompt}>
					🤖 AI 보완 질문/예외케이스 프롬프트 복사
				</button>
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
			
			<button type="button" className="btn-ghost-sm" style={{ alignSelf: 'flex-start' }} onClick={handleCopyAiPrompt}>
				🤖 AI 보완 질문/예외케이스 프롬프트 복사
			</button>

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
