import { useEffect, useRef, useState } from 'react';
import type { Attachment, TestCase, TestCaseInput, TestCasePriority, TestCaseStatus } from './types';
import { REQ_PRIORITY_LABEL, TC_STATUS_LABEL } from './types';
import { attachmentsApi } from './api';
import './ProjectModal.css';
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface Props {
  initial: TestCase | null;
  projectId: number;
  attachments: Attachment[];
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

function buildAiPrompt(title: string, precondition: string, steps: string, expectedResult: string, pdfText?: string) {
  const pdfBlock = pdfText
    ? `\n[참고 기획문서 발췌]:\n${pdfText}\n`
    : '';
  return `다음 테스트 절차를 Playwright 테스트 코드로 변환해줘.
실제 화면의 정확한 selector는 모르니 TODO 주석으로 표시해줘.

[테스트 제목]: ${title || '(제목 없음)'}
[사전조건]: ${precondition || '없음'}
[테스트 절차]:
${steps || '(작성 필요)'}
[기대 결과]: ${expectedResult || '(작성 필요)'}${pdfBlock}`;
}
function parsePageRange(range: string): number[] {
  const pages = new Set<number>();
  range.split(',').forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map((n) => parseInt(n.trim(), 10));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) pages.add(i);
      }
    } else {
      const n = parseInt(trimmed, 10);
      if (!isNaN(n)) pages.add(n);
    }
  });
  return Array.from(pages).sort((a, b) => a - b);
}

async function extractPdfPageText(url: string, pageRange: string): Promise<string> {
  const pages = parsePageRange(pageRange);
  if (pages.length === 0) return '';
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const chunks: string[] = [];
  for (const pageNum of pages) {
    if (pageNum < 1 || pageNum > doc.numPages) continue;
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(' ');
    chunks.push(`--- ${pageNum}페이지 ---\n${text}`);
  }
  return chunks.join('\n\n');
}

export default function TestCaseModal({ initial, projectId, attachments, onAttachmentAdded, onClose, onSubmit }: Props) {

  // 요구사항 연결 UI는 제거되었지만, 기존에 연결되어 있던 TC를 수정할 때는 값을 그대로 보존한다.
  const requirementId = initial?.requirement_id ?? null;
  const [attachmentId, setAttachmentId] = useState<number | ''>(initial?.attachment_id ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [precondition, setPrecondition] = useState(initial?.precondition ?? '');
  const [steps, setSteps] = useState(initial?.steps ?? '');
  const [expectedResult, setExpectedResult] = useState(initial?.expected_result ?? '');
  const [priority, setPriority] = useState<TestCasePriority>(initial?.priority ?? 'major');
  const [status, setStatus] = useState<TestCaseStatus>(initial?.status ?? 'not_run');
  const [tester, setTester] = useState(initial?.tester ?? '');
  const [automationScript, setAutomationScript] = useState(initial?.automation_script ?? (initial ? '' : buildScriptTemplate('')));
  const scriptTouched = useRef(!!initial?.automation_script);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState(initial?.status_note ?? '');

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

const [showCodegenGuide, setShowCodegenGuide] = useState(false);
const [pdfPageRange, setPdfPageRange] = useState('');
const [pdfExtracting, setPdfExtracting] = useState(false);

const selectedAttachment = attachments.find((a) => a.id === attachmentId);
const isPdfAttachment = selectedAttachment?.type === 'file'
  && (selectedAttachment.mime_type === 'application/pdf' || selectedAttachment.original_name?.toLowerCase().endsWith('.pdf'));

function copyTextToClipboard(text: string, successMsg: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    const ok = document.execCommand('copy');
    alert(ok ? successMsg : '복사에 실패했습니다. 아래 내용을 직접 선택해서 복사해주세요:\n\n' + text);
  } catch {
    alert('복사에 실패했습니다. 아래 내용을 직접 선택해서 복사해주세요:\n\n' + text);
  } finally {
    document.body.removeChild(textarea);
  }
}

async function handleCopyAiPrompt() {
  let pdfText = '';
  if (isPdfAttachment && pdfPageRange.trim() && selectedAttachment) {
    setPdfExtracting(true);
    try {
      pdfText = await extractPdfPageText(attachmentsApi.downloadUrl(selectedAttachment.id), pdfPageRange);
    } catch {
		alert('PDF 텍스트 추출에 실패했습니다. 페이지 범위를 확인해주세요.');
      setPdfExtracting(false);
      return;
    }
    setPdfExtracting(false);
  }
  const prompt = buildAiPrompt(title, precondition, steps, expectedResult, pdfText || undefined);
  copyTextToClipboard(prompt, 'AI 프롬프트가 복사되었습니다. Claude.ai에 붙여넣어 주세요.');
}

  // 새 첨부파일 인라인 업로드 상태
  const [showUploadBox, setShowUploadBox] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleInlineFileUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploadBusy(true);
    setUploadError(null);
    try {
      const uploaded = await attachmentsApi.upload(fileList[0], projectId, '익명', requirementId);
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
        requirement_id: requirementId,
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
if ((status === 'fail' || status === 'blocked') && !statusNote.trim()) {
  setError('실패/차단 사유를 입력해주세요.');
  return;
}
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        project_id: projectId,
        requirement_id: requirementId,
        attachment_id: attachmentId === '' ? null : attachmentId,
        title: title.trim(),
        precondition: precondition.trim(),
        steps: steps.trim(),
        expected_result: expectedResult.trim(),
        priority,
        status,
        tester: tester.trim(),
        automation_script: automationScript.trim(),
        status_note: statusNote.trim() || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2>{initial ? 'Test Case 수정' : '새 Test Case'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <label className="field">
			<span>참고 기획문서/디자인 (선택)</span>
			<select value={attachmentId} onChange={(e) => setAttachmentId(e.target.value === '' ? '' : Number(e.target.value))}>
				<option value="">선택 안 함</option>
				 {attachments.map((a) => (
				  <option key={a.id} value={a.id}>
					{a.type === 'link' ? '🔗 ' : '📎 '}{a.original_name}{a.requirement_id ? ' (요구사항 전용)' : ''}
				  </option>
				))}
			  </select>
          </label>



		  {isPdfAttachment && (
			<label className="field">
				<span>PDF 페이지 범위 (선택, 예: 8 또는 8-12)</span>
				<input
					value={pdfPageRange}
					onChange={(e) => setPdfPageRange(e.target.value)}
					placeholder="예: 8, 10-14"
				/>
				<span style={{ fontSize: 12, color: 'var(--text-sub)' }}>
					입력한 페이지의 텍스트가 AI 프롬프트에 자동으로 포함됩니다 (레이아웃/이미지는 포함되지 않음)
				</span>
				</label>
		   )}

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
              {requirementId !== null && (
                <div className="inline-upload-hint">📋 이 Test Case에 연결된 요구사항에 자동으로 연결됩니다</div>
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

{(status === 'fail' || status === 'blocked' || status === 'n_a') && (
  <label className="field">
    <span>사유{status !== 'n_a' && ' *'}</span>
    <textarea
      value={statusNote}
      onChange={(e) => setStatusNote(e.target.value)}
      placeholder="사유를 입력해주세요"
      rows={3}
    />
  </label>
)}

          <label className="field">
            <span>담당자</span>
            <input value={tester} onChange={(e) => setTester(e.target.value)} placeholder="테스트 담당자명" />
          </label>

         <label className="field">
			<span>자동화 스크립트 (Playwright 등, 선택) — 저장용, 실행은 되지 않음</span>

			<div className="inline-upload-row" style={{ marginBottom: 8 }}>
			<button type="button" className="btn-ghost-sm" onClick={handleCopyAiPrompt} disabled={pdfExtracting}>
				{pdfExtracting ? 'PDF 텍스트 추출 중...' : '🤖 AI 초안 프롬프트 복사'}
			</button>
			<button type="button" className="btn-ghost-sm" onClick={() => window.open('https://claude.ai/new', '_blank')}>
				Claude.ai 새 탭 열기 ↗
			</button>
			<button type="button" className="btn-ghost-sm" onClick={() => setShowCodegenGuide(!showCodegenGuide)}>
				📹 정확한 코드 녹화 방법
			</button>
		</div>

		{showCodegenGuide && (
			<div className="inline-upload-hint" style={{ marginBottom: 8 }}>
				가장 정확한 방법: cmd에서 <code>npx playwright codegen http://localhost:5173</code> 실행 →
				뜨는 브라우저에서 테스트 절차대로 직접 클릭·입력 → Inspector 창에 생성된 코드를 복사해서 아래에 붙여넣기
		</div>
		)}

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
