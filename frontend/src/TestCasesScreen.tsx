import { useEffect, useMemo, useState } from 'react';
import type { Project, Requirement, TestCase, TestCaseInput, TestCaseBulkItem, TestCasePriority, TestCaseStatus, RequirementCoverage, Attachment, BugInput } from './types';

import { REQ_PRIORITY_LABEL, TC_STATUS_LABEL, STATUS_LABEL } from './types';
import { projectsApi, requirementsApi, testCasesApi, attachmentsApi, bugsApi } from './api';
import TestCaseModal from './TestCaseModal';
import RequirementModal from './RequirementModal';
import BugModal from './BugModal';
import TestCaseBulkUploadModal from './TestCaseBulkUploadModal';
import './TestCasesScreen.css';

function buildBatchPrompt(items: TestCase[]) {
  const body = items.map((tc) => `제목: ${tc.title}
[사전조건]: ${tc.precondition || '없음'}
[테스트 절차]:
${tc.steps || '(작성 필요)'}
[기대 결과]: ${tc.expected_result || '(작성 필요)'}`).join('\n\n');

  return `아래 여러 개의 테스트 절차를 각각 Playwright 테스트 코드로 변환해줘.
실제 selector는 모르니 TODO 주석으로 표시해줘.

${body}

---
중요: 각 테스트 코드의 맨 첫 줄에 반드시 아래 형식의 주석을 정확히 넣어줘.
// @TC 테스트제목그대로

이 주석 형식을 지켜야만 시스템이 인식할 수 있어. 마크다운 제목(###)이나 구분선은 쓰지 말고, 코드만 순서대로 이어서 답변해줘.`;
}

function parseBatchResult(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const markerRegex = /\/\/\s*@TC\s+(.+)/g;
  const matches = [...text.matchAll(markerRegex)];
  for (let i = 0; i < matches.length; i++) {
    const title = matches[i][1].trim();
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    result[title] = text.slice(start, end).trim();
  }
  return result;
}

function parseBulkTcText(text: string, requirementId: number | null): TestCaseBulkItem[] {
  const blocks = [...text.matchAll(/\[TC\]([\s\S]*?)\[\/TC\]/g)].map((m) => m[1]);
  const labelRegex = /^(제목|사전조건|절차|기대결과|우선순위)\s*:\s*(.*)$/;
  const priorityMap: Record<string, TestCasePriority> = {
	'높음': 'critical', '보통': 'major', '낮음': 'minor',
	high: 'critical', medium: 'major', low: 'minor',
	critical: 'critical', major: 'major', minor: 'minor',
};

  return blocks.map((block) => {
    const fields: Record<string, string> = {};
    let current = '';
    let buffer: string[] = [];
    const flush = () => {
      if (current) fields[current] = buffer.join('\n').trim();
      buffer = [];
    };
    for (const line of block.split('\n')) {
      const m = line.match(labelRegex);
      if (m) {
        flush();
        current = m[1];
        buffer.push(m[2]);
      } else {
        buffer.push(line);
      }
    }
    flush();

    return {
      requirement_id: requirementId,
      title: fields['제목']?.trim() || '(제목 없음)',
      precondition: fields['사전조건']?.trim() || '',
      steps: fields['절차']?.trim() || '',
      expected_result: fields['기대결과']?.trim() || '',
      priority: priorityMap[fields['우선순위']?.trim()] ?? 'major',
    };
  });
}



function formatDate(d: string) {
  return d.slice(0, 10);
}

export default function TestCasesScreen({ embeddedProjectId }: { embeddedProjectId?: number } = {}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(embeddedProjectId ?? null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [coverage, setCoverage] = useState<RequirementCoverage[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [keyword, setKeyword] = useState('');
  const [requirementFilter, setRequirementFilter] = useState<'all' | number>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TestCaseStatus>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TestCase | null>(null);
  const [prefillRequirementId, setPrefillRequirementId] = useState<number | null>(null);
  const [viewingRequirement, setViewingRequirement] = useState<Requirement | null>(null);
  const [bugPrefillTc, setBugPrefillTc] = useState<TestCase | null>(null);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchPasteOpen, setBatchPasteOpen] = useState(false);
  const [batchPasteText, setBatchPasteText] = useState('');
  const [batchApplyMsg, setBatchApplyMsg] = useState<string | null>(null);
  const [bulkTcPasteOpen, setBulkTcPasteOpen] = useState(false);
  const [bulkTcPasteText, setBulkTcPasteText] = useState('');
  const [bulkTcRequirementId, setBulkTcRequirementId] = useState<number | ''>('');
  const [bulkTcParsed, setBulkTcParsed] = useState<TestCaseBulkItem[]>([]);
  const [bulkTcChecked, setBulkTcChecked] = useState<Set<number>>(new Set());
  const [bulkTcMsg, setBulkTcMsg] = useState<string | null>(null);
  

  function toggleSelected(id: number) {
	setSelectedIds((prev) => {
		const next = new Set(prev);
		if (next.has(id)) {
			next.delete(id);
		} else {
		  next.add(id);
		}
		return next;
  });
}

  function handleCopyBatchPrompt() {
  const items = testCases.filter((tc) => selectedIds.has(tc.id));
  if (items.length === 0) return;
  const prompt = buildBatchPrompt(items);
  const textarea = document.createElement('textarea');
  textarea.value = prompt;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    const ok = document.execCommand('copy');
    alert(ok
      ? `${items.length}건의 프롬프트가 복사되었습니다. Claude.ai에 붙여넣어 주세요.`
      : '복사에 실패했습니다. 다시 시도해주세요.');
  } catch {
    alert('복사에 실패했습니다. 다시 시도해주세요.');
  } finally {
    document.body.removeChild(textarea);
  }
}

  async function handleApplyBatchResult() {
   const parsed = parseBatchResult(batchPasteText);
   const items = testCases.filter((tc) => selectedIds.has(tc.id));
   let applied = 0;
   for (const tc of items) {
    const script = parsed[tc.title];
    if (script) {
      await testCasesApi.update(tc.id, { automation_script: script });
      applied += 1;
    }
   }
   setBatchApplyMsg(`${applied}/${items.length}건 적용 완료 (제목이 일치하지 않으면 매칭되지 않습니다)`);
   setBatchPasteText('');
   setBatchPasteOpen(false);
   await load();
}
  
 
 function handleParseBulkTc() {
    const reqId = bulkTcRequirementId === '' ? null : bulkTcRequirementId;
    const parsed = parseBulkTcText(bulkTcPasteText, reqId);
    setBulkTcParsed(parsed);
    setBulkTcChecked(new Set(parsed.map((_, i) => i)));
    setBulkTcMsg(parsed.length === 0 ? '⚠ [TC]...[/TC] 형식을 찾지 못했습니다.' : null);
  }

  function toggleBulkTcChecked(idx: number) {
    setBulkTcChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  async function handleRegisterBulkTc() {
    if (!projectId) return;
    const items = bulkTcParsed.filter((_, i) => bulkTcChecked.has(i));
    if (items.length === 0) return;
    await testCasesApi.bulkCreate(projectId, items);
    setBulkTcMsg(`${items.length}건 등록 완료`);
    setBulkTcPasteText('');
    setBulkTcParsed([]);
    setBulkTcChecked(new Set());
    setBulkTcPasteOpen(false);
    await load();
    await refreshCoverage();
  } 
  
  
  

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) return;
    requirementsApi.list({ project_id: projectId }).then(setRequirements).catch(() => {});
    attachmentsApi.list({ project_id: projectId }).then(setAttachments).catch(() => {});
    testCasesApi.coverage(projectId).then(setCoverage).catch(() => {});
	setSelectedIds(new Set()); // 프로젝트 전환 시 선택 초기화
  }, [projectId]);

  async function load() {
    if (!projectId) { setTestCases([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await testCasesApi.list({
        project_id: projectId,
        requirement_id: requirementFilter === 'all' ? undefined : requirementFilter,
        status: statusFilter,
        keyword,
      });
      setTestCases(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, requirementFilter, statusFilter, keyword]);

  async function refreshCoverage() {
    if (!projectId) return;
    testCasesApi.coverage(projectId).then(setCoverage).catch(() => {});
  }

  async function refreshAttachments() {
    if (!projectId) return;
    const data = await attachmentsApi.list({ project_id: projectId });
    setAttachments(data);
    return data;
  }

  const summary = useMemo(() => {
    const total = testCases.length;
    const pass = testCases.filter((t) => t.status === 'pass').length;
    const fail = testCases.filter((t) => t.status === 'fail').length;
    const notRun = testCases.filter((t) => t.status === 'not_run').length;
    return { total, pass, fail, notRun };
  }, [testCases]);

  const uncovered = coverage.filter((c) => Number(c.test_case_count) === 0);
  const coveredRatio = coverage.length > 0 ? Math.round(((coverage.length - uncovered.length) / coverage.length) * 100) : 0;

  async function handleSubmit(input: TestCaseInput) {
    if (editing) {
      await testCasesApi.update(editing.id, input);
    } else {
      await testCasesApi.create(input);
    }
    setModalOpen(false);
    setEditing(null);
    setPrefillRequirementId(null);
    await load();
    await refreshCoverage();
  }

  async function handleDelete(tc: TestCase) {
    if (!confirm(`"${tc.title}" Test Case를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await testCasesApi.remove(tc.id);
    await load();
    await refreshCoverage();
  }

  async function handleBugSubmit(input: BugInput) {
    await bugsApi.create(input);
    setBugPrefillTc(null);
  }

  async function handleBulkImport(items: TestCaseBulkItem[]) {
    if (!projectId) return;
    await testCasesApi.bulkCreate(projectId, items);
    setBulkUploadOpen(false);
    await load();
    await refreshCoverage();
  }

  function downloadAutomationScript(tc: TestCase) {
    if (!tc.automation_script) return;
    const safeName = tc.title
      .trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60) || `test-case-${tc.id}`;
    const blob = new Blob([tc.automation_script], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.spec.ts`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function openCreateForRequirement(reqId: number | null) {
    setEditing(null);
    setPrefillRequirementId(reqId);
    setModalOpen(true);
  }

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;

  if (!projectId) {
    return (
      <div className="tc-screen">
        <header className="screen-header">
          <div>
            <h1>Test Case 관리</h1>
            <p className="screen-subtitle">프로젝트를 선택하면 해당 프로젝트의 Test Case를 관리할 수 있습니다</p>
          </div>
        </header>

        {projects.length === 0 ? (
          <div className="empty-state">
            <strong>먼저 프로젝트를 생성해주세요.</strong>
            <span>Test Case는 특정 프로젝트에 소속되어 관리됩니다.</span>
          </div>
        ) : (
          <div className="tc-project-grid">
            {projects.map((p) => (
              <button key={p.id} className="tc-project-card" onClick={() => setProjectId(p.id)}>
                <span className={`status-pill status-${p.status}`}>{STATUS_LABEL[p.status]}</span>
                <h3>{p.name}</h3>
                {p.description && <p>{p.description}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tc-screen">
      <header className="screen-header">
        {!embeddedProjectId && (
          <div>
            <button className="tc-back-btn" onClick={() => setProjectId(null)}>← 프로젝트 목록</button>
            <h1>{selectedProject?.name ?? 'Test Case 관리'}</h1>
            <p className="screen-subtitle">요구사항 기반으로 Test Case를 설계하고, 커버리지 누락 여부를 확인합니다</p>
          </div>
        )}
        <div className="tc-header-actions">
			<button className="btn-ghost" onClick={() => setBulkUploadOpen(true)}>📤 엑셀 업로드</button>
			<button className="btn-ghost" onClick={() => setBulkTcPasteOpen(true)}>🤖 AI 초안 붙여넣어 일괄 등록</button>
			{selectedIds.size > 0 && (
			<>
				<button className="btn-ghost" onClick={handleCopyBatchPrompt}>🤖 선택 {selectedIds.size}건 AI 프롬프트 복사</button>
				<button className="btn-ghost" onClick={() => setBatchPasteOpen(true)}>결과 붙여넣기</button>
			</>
		)}
		<button
			className="btn-primary"
			onClick={() => openCreateForRequirement(null)}
		>
			+ 새 Test Case
		</button>
	</div>
	
      </header>

      {projects.length === 0 ? (
        <div className="empty-state">
          <strong>먼저 프로젝트를 생성해주세요.</strong>
          <span>Test Case는 특정 프로젝트에 소속되어 관리됩니다.</span>
        </div>
      ) : (
        <>
          <section className="coverage-panel">
            <div className="coverage-header">
              <div>
                <span className="coverage-title">요구사항 커버리지</span>
                <span className="coverage-sub">{coverage.length}개 요구사항 중 {coverage.length - uncovered.length}개에 TC 연결됨</span>
              </div>
              <div className="coverage-ratio" data-warn={uncovered.length > 0}>
                {coveredRatio}%
              </div>
            </div>
            <div className="coverage-bar">
              <div className="coverage-bar-fill" style={{ width: `${coveredRatio}%` }} />
            </div>
            {uncovered.length > 0 ? (
              <div className="uncovered-list">
                <span className="uncovered-label">⚠ TC가 없는 요구사항 ({uncovered.length}개) — 설계 누락 가능성</span>
                {uncovered.map((r) => (
                  <div className="uncovered-row" key={r.id}>
                    <span className={`priority-pill priority-${r.priority}`}>{REQ_PRIORITY_LABEL[r.priority]}</span>
                    <span className="uncovered-title">{r.title}</span>
                    <button className="btn-ghost-sm" onClick={() => openCreateForRequirement(r.id)}>+ TC 추가</button>
                  </div>
                ))}
              </div>
            ) : coverage.length > 0 && (
              <div className="all-covered">✓ 모든 요구사항에 Test Case가 최소 1개 이상 연결되어 있습니다</div>
            )}
          </section>

          <section className="stat-row">
            <div className="stat-card">
              <span className="stat-value">{summary.total}</span>
              <span className="stat-label">전체 TC</span>
            </div>
            <div className="stat-card">
              <span className="stat-value" style={{ color: 'var(--tc-pass)' }}>{summary.pass}</span>
              <span className="stat-label">통과</span>
            </div>
            <div className="stat-card">
              <span className="stat-value" style={{ color: 'var(--tc-fail)' }}>{summary.fail}</span>
              <span className="stat-label">실패</span>
            </div>
            <div className="stat-card">
              <span className="stat-value" style={{ color: 'var(--tc-not_run)' }}>{summary.notRun}</span>
              <span className="stat-label">미실행</span>
            </div>
          </section>

          <section className="toolbar">
            <input
              className="search-input"
              placeholder="Test Case 제목 또는 기대결과로 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <div className="toolbar-filters">
              <select value={requirementFilter} onChange={(e) => setRequirementFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                <option value="all">전체 요구사항</option>
                {requirements.map((r) => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </select>
              <div className="filter-chips">
                {(['all', 'not_run', 'pass', 'fail', 'n_a', 'n_t', 'blocked'] as const).map((s) => (
                  <button
                    key={s}
                    className={`chip ${statusFilter === s ? 'is-active' : ''}`}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s === 'all' ? '전체' : TC_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {error && <div className="error-banner">⚠ {error} — 백엔드 서버(http://localhost:4000)가 실행 중인지 확인해주세요.</div>}

          {loading ? (
            <div className="empty-state">불러오는 중...</div>
          ) : testCases.length === 0 ? (
            <div className="empty-state">
              <strong>표시할 Test Case가 없습니다.</strong>
              <span>새 Test Case를 등록하거나 검색/필터 조건을 변경해보세요.</span>
            </div>
          ) : (
            <div className="tc-list">
              {testCases.map((tc) => (
                <article className="tc-card" key={tc.id}>
                  <div className="tc-card-top">
                    <div className="tc-card-tags">
						<input
							type="checkbox"
							checked={selectedIds.has(tc.id)}
							onChange={() => toggleSelected(tc.id)}
							title="일괄 AI 프롬프트 대상으로 선택"
						/>
						<span className={`priority-pill priority-${tc.priority}`}>{REQ_PRIORITY_LABEL[tc.priority]}</span>
						<span className={`tc-status-pill tc-status-${tc.status}`}>{TC_STATUS_LABEL[tc.status]}</span>
					</div>
                    <div className="card-actions">
                      {tc.status === 'fail' && (
                        <button onClick={() => setBugPrefillTc(tc)} title="버그 등록" className="bug-report-btn">🐞 버그 등록</button>
                      )}
                      <button onClick={() => { setEditing(tc); setPrefillRequirementId(null); setModalOpen(true); }} title="수정">✎</button>
                      <button onClick={() => handleDelete(tc)} title="삭제">✕</button>
                    </div>
                  </div>

                  <h3 className="tc-title">{tc.title}</h3>

                  <div className="tc-links">
                    {tc.requirement_title && (
                      <button
                        type="button"
                        className="tc-link-tag req-tag req-tag-clickable"
                        onClick={() => {
                          const req = requirements.find((r) => r.id === tc.requirement_id);
                          if (req) setViewingRequirement(req);
                        }}
                        title="요구사항 상세 보기"
                      >
                        📋 {tc.requirement_title}
                      </button>
                    )}
                    {tc.attachment_name && (
                      tc.attachment_type === 'link' ? (
                        <a className="tc-link-tag design-tag" href={tc.attachment_url ?? '#'} target="_blank" rel="noopener noreferrer">🔗 {tc.attachment_name}</a>
                      ) : (
                        <a className="tc-link-tag design-tag" href={attachmentsApi.downloadUrl(tc.attachment_id!)}>📎 {tc.attachment_name}</a>
                      )
                    )}
                  </div>

                  {tc.precondition && (
                    <div className="tc-field">
                      <span className="tc-field-label">사전조건</span>
                      <p>{tc.precondition}</p>
                    </div>
                  )}
                  {tc.steps && (
                    <div className="tc-field">
                      <span className="tc-field-label">테스트 절차</span>
                      <pre>{tc.steps}</pre>
                    </div>
                  )}
                  {tc.expected_result && (
                    <div className="tc-field">
                      <span className="tc-field-label">기대 결과</span>
                      <p>{tc.expected_result}</p>
                    </div>
                  )}
                  {tc.automation_script && (
                    <details className="tc-script-details">
                      <summary>
                        🤖 자동화 스크립트 보기
                        <button
                          type="button"
                          className="tc-script-download-btn"
                          onClick={(e) => { e.preventDefault(); downloadAutomationScript(tc); }}
                          title=".spec.ts 파일로 다운로드"
                        >
                          📥 .spec.ts 다운로드
                        </button>
                      </summary>
                      <pre className="tc-script-pre">{tc.automation_script}</pre>
                    </details>
                  )}

                  <div className="tc-meta">
                    <span>담당자: {tc.tester || '-'}</span>
                    <span className="mono-cell">{formatDate(tc.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {modalOpen && projectId && (
        <TestCaseModal
          initial={editing}
          projectId={projectId}
          requirements={requirements}
          attachments={attachments}
          defaultRequirementId={prefillRequirementId}
          onAttachmentAdded={refreshAttachments}
          onClose={() => { setModalOpen(false); setEditing(null); setPrefillRequirementId(null); }}
          onSubmit={handleSubmit}
        />
      )}

      {viewingRequirement && (
        <RequirementModal
          initial={viewingRequirement}
          readOnly
          onClose={() => setViewingRequirement(null)}
        />
      )}

      {bugPrefillTc && (
        <BugModal
          initial={null}
          projects={projects}
          prefillFromTestCase={bugPrefillTc}
          onClose={() => setBugPrefillTc(null)}
          onSubmit={handleBugSubmit}
        />
      )}

      {bulkUploadOpen && (
        <TestCaseBulkUploadModal
          requirements={requirements}
          onClose={() => setBulkUploadOpen(false)}
          onImport={handleBulkImport}
        />
      )}
	  
	  {batchPasteOpen && (
        <div className="modal-backdrop" onClick={() => setBatchPasteOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>AI 결과 일괄 적용</h2>
              <button type="button" className="modal-close" onClick={() => setBatchPasteOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <label className="field">
                <span>Claude.ai에서 받은 응답을 통째로 붙여넣으세요</span>
                <textarea
                  value={batchPasteText}
                  onChange={(e) => setBatchPasteText(e.target.value)}
                  rows={12}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                />
              </label>
              {batchApplyMsg && <div className="inline-upload-hint">{batchApplyMsg}</div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-ghost" onClick={() => setBatchPasteOpen(false)}>취소</button>
              <button type="button" className="btn-primary" onClick={handleApplyBatchResult}>제목 기준 자동 매칭 적용</button>
            </div>
          </div>
        </div>
      )}
	  {bulkTcPasteOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2>AI 초안 붙여넣어 TC 일괄 등록</h2>
              <button type="button" className="modal-close" onClick={() => { setBulkTcPasteOpen(false); setBulkTcParsed([]); setBulkTcChecked(new Set()); }}>✕</button>
            </div>
            <div className="modal-body">
              <label className="field">
                <span>연결할 요구사항 (선택)</span>
                <select value={bulkTcRequirementId} onChange={(e) => setBulkTcRequirementId(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">선택 안 함</option>
                  {requirements.map((r) => (
                    <option key={r.id} value={r.id}>{r.title}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Claude 응답을 [TC]...[/TC] 형식으로 붙여넣으세요</span>
                <textarea
                  value={bulkTcPasteText}
                  onChange={(e) => setBulkTcPasteText(e.target.value)}
                  rows={10}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  placeholder={'[TC]\n제목: ...\n사전조건: ...\n절차: ...\n기대결과: ...\n[/TC]'}
                />
              </label>

              <button type="button" className="btn-ghost-sm" onClick={handleParseBulkTc}>파싱하기</button>

              {bulkTcMsg && <div className="inline-upload-hint">{bulkTcMsg}</div>}

              {bulkTcParsed.length > 0 && (
                <div className="tc-list" style={{ marginTop: 12 }}>
                  {bulkTcParsed.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}>
                      <input type="checkbox" checked={bulkTcChecked.has(idx)} onChange={() => toggleBulkTcChecked(idx)} />
                      <div>
                        <strong>{item.title}</strong>
                        <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>{item.steps?.slice(0, 60)}...</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-ghost" onClick={() => setBulkTcPasteOpen(false)}>취소</button>
              <button type="button" className="btn-primary" disabled={bulkTcChecked.size === 0} onClick={handleRegisterBulkTc}>
                선택한 {bulkTcChecked.size}건 등록
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
