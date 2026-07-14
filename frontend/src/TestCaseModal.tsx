import { useEffect, useMemo, useRef, useState } from 'react';
import type { Attachment, Requirement, TestCase, TestCaseInput, TestCasePriority, TestCaseStatus } from './types';
import { REQ_PRIORITY_LABEL, TC_STATUS_LABEL } from './types';
import { attachmentsApi } from './api';
import './ProjectModal.css';

interface Props {
  initial: TestCase | null;
  projectId: number;
  requirements: Requirement[];
  attachments: Attachment[];
  defaultRequirementId?: number | null;
  onAttachmentAdded: () => Promise<Attachment[] | undefined>;
  onClose: () => void;
  onSubmit: (input: TestCaseInput) => Promise<void>;
}

function buildScriptTemplate(title: string) {
  return `import { test, expect } from '@playwright/test';

test('${title || '테스트 제목'}', async ({ page }) => {
  await page.goto('http://localhost:5173');
  // TODO: 테스트 절차를 여기에 작성하세요
});
`;
}

export default function TestCaseModal({ initial, projectId, requirements, attachments, defaultRequirementId, onAttachmentAdded, onClose, onSubmit }: Props) {
  const [requirementId, setRequirementId] = useState<number | ''>(initial?.requirement_id ?? defaultRequirementId ?? '');
  const [attachmentId, setAttachmentId] = useState<number | ''>(initial?.attachment_id ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [precondition, setPrecondition] = useState(initial?.precondition ?? '');
  const [steps, setSteps] = useState(initial?.steps ?? '');
  const [expectedResult, setExpectedResult] = useState(initial?.expected_result ?? '');
  const [priority, setPriority] = useState<TestCasePriority>(initial?.priority ?? 'medium');
  const [status, setStatus] = useState<TestCaseStatus>(initial?.status ?? 'not_run');
  const [tester, setTester] = useState(initial?.tester ?? '');
  const [automationScript, setAutomationScript] = useState(initial?.automation_script ?? (initial ? '' : buildScriptTemplate('')));
  const scriptTouched = useRef(!!initial?.automation_script);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 신규 TC 작성 중이고, 사용자가 스크립트를 직접 손대지 않은 동안에는
  // 제목을 입력할 때마다 기본 템플릿의 테스트명도 함께 갱신해준다.
  useEffect(() => {
    if (initial || scriptTouched.current) return;
    setAutomationScript(buildScriptTemplate(title));
  }, [title, initial]);

  function handleScriptChange(value: string) {
    scriptTouched.current = true;
    setAutomationScript(value);
  }

  // 새 첨부파일 인라인 업로드 상태
  const [showUploadBox, setShowUploadBox] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 선택한 요구사항과 관련된 첨부파일을 우선 표시 (요구사항 전용 파일 + 프로젝트 공용 파일)
  const relevantAttachments = useMemo(() => {
    if (!requirementId) return attachments;
    const linked = attachments.filter((a) => a.requirement_id === requirementId);
    const shared = attachments.filter((a) => a.requirement_id === null);
    return [...linked, ...shared];
  }, [attachments, requirementId]);

  async function handleInlineFileUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploadBusy(true);
    setUploadError(null);
    try {
      const uploaded = await attachmentsApi.upload(fileList[0], projectId, '익명', requirementId || null);
      await onAttachmentAdded();
      setAttachmentId(uploaded.id);
      setShowUploadBox(false);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '파일 업로드에 실패했습니다.');
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleInlineLinkAdd() {
    if (!newLinkTitle.trim() || !/^https?:\/\//.test(newLinkUrl.trim())) {
      setUploadError('제목과 http(s):// 로 시작하는 URL을 모두 입력해주세요.');
      return;
    }
    setUploadBusy(true);
    setUploadError(null);
    try {
      const created = await attachmentsApi.createLink({
        project_id: projectId,
        requirement_id: requirementId || null,
        title: newLinkTitle.trim(),
        url: newLinkUrl.trim(),
        uploader: '익명',
      });
      await onAttachmentAdded();
      setAttachmentId(created.id);
      setShowUploadBox(false);
      setNewLinkTitle('');
      setNewLinkUrl('');
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '링크 추가에 실패했습니다.');
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Test Case 제목을 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        project_id: projectId,
        requirement_id: requirementId === '' ? null : requirementId,
        attachment_id: attachmentId === '' ? null : attachmentId,
        title: title.trim(),
        precondition: precondition.trim(),
        steps: steps.trim(),
        expected_result: expectedResult.trim(),
        priority,
        status,
        tester: tester.trim(),
        automation_script: automationScript.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2>{initial ? 'Test Case 수정' : '새 Test Case'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span>연결된 요구사항 (선택)</span>
            <select value={requirementId} onChange={(e) => { setRequirementId(e.target.value === '' ? '' : Number(e.target.value)); setAttachmentId(''); }}>
              <option value="">선택 안 함</option>
              {requirements.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>
              참고 기획문서/디자인 (선택)
              {requirementId !== '' && <span style={{ color: 'var(--text-sub)', fontWeight: 400 }}> — 이 요구사항 전용 파일이 위에 먼저 표시됩니다</span>}
            </span>
            <select value={attachmentId} onChange={(e) => setAttachmentId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">선택 안 함</option>
              {relevantAttachments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.type === 'link' ? '🔗 ' : '📎 '}{a.original_name}{a.requirement_id ? ' (요구사항 전용)' : ''}
                </option>
              ))}
            </select>
          </label>

          {!showUploadBox ? (
            <button type="button" className="btn-ghost-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowUploadBox(true)}>
              + 새 기획문서/링크 바로 추가하기
            </button>
          ) : (
            <div className="inline-upload-box">
              <div className="inline-upload-row">
                <button type="button" className="btn-primary" disabled={uploadBusy} onClick={() => fileInputRef.current?.click()}>
                  {uploadBusy ? '업로드 중...' : '파일 선택'}
                </button>
                <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={(e) => handleInlineFileUpload(e.target.files)} />
                <span className="inline-upload-or">또는 링크:</span>
              </div>
              <div className="inline-upload-row">
                <input className="field-inline-input" placeholder="링크 제목" value={newLinkTitle} onChange={(e) => setNewLinkTitle(e.target.value)} />
                <input className="field-inline-input" placeholder="https://..." value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} />
                <button type="button" className="btn-ghost-sm" disabled={uploadBusy} onClick={handleInlineLinkAdd}>추가</button>
              </div>
              {requirementId !== '' && (
                <div className="inline-upload-hint">📋 현재 선택된 요구사항에 자동으로 연결됩니다</div>
              )}
              {uploadError && <div className="field-error">⚠ {uploadError}</div>}
            </div>
          )}

          <label className="field">
            <span>Test Case 제목 *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 프로젝트 생성 - 필수값 검증" />
          </label>

          <label className="field">
            <span>사전 조건</span>
            <textarea value={precondition} onChange={(e) => setPrecondition(e.target.value)} rows={2} placeholder="테스트 전에 갖춰져야 할 상태" />
          </label>

          <label className="field">
            <span>테스트 절차</span>
            <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} placeholder={'1. ...\n2. ...\n3. ...'} />
          </label>

          <label className="field">
            <span>기대 결과</span>
            <textarea value={expectedResult} onChange={(e) => setExpectedResult(e.target.value)} rows={2} placeholder="테스트 통과 기준" />
          </label>

          <div className="field-row">
            <label className="field">
              <span>우선순위</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TestCasePriority)}>
                {Object.entries(REQ_PRIORITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>상태</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as TestCaseStatus)}>
                {Object.entries(TC_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>담당자</span>
            <input value={tester} onChange={(e) => setTester(e.target.value)} placeholder="테스트 담당자명" />
          </label>

          <label className="field">
            <span>자동화 스크립트 (Playwright 등, 선택) — 저장용, 실행은 되지 않음</span>
            <textarea
              value={automationScript}
              onChange={(e) => handleScriptChange(e.target.value)}
              rows={6}
              placeholder={"import { test, expect } from '@playwright/test';\n\ntest('...', async ({ page }) => {\n  ...\n});"}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
            />
          </label>

          {error && <div className="field-error">⚠ {error}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? '저장 중...' : initial ? '수정 완료' : 'Test Case 등록'}
          </button>
        </div>
      </form>
    </div>
  );
}
