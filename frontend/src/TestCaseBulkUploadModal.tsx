import { useState } from 'react';
import * as XLSX from 'xlsx';
import type { Requirement, TestCaseBulkItem, TestCasePriority } from './types';
import { REQ_PRIORITY_LABEL } from './types';
import './ProjectModal.css';
import './TestCaseBulkUploadModal.css';

interface Props {
  requirements: Requirement[];
  onClose: () => void;
  onImport: (items: TestCaseBulkItem[]) => Promise<void>;
}

interface ParsedRow {
  title: string;
  precondition: string;
  steps: string;
  expected_result: string;
  priority: TestCasePriority;
  requirementName: string;
  requirementId: number | null;
  tester: string;
  warnings: string[];
}

const PRIORITY_TEXT_TO_VALUE: Record<string, TestCasePriority> = {};
Object.entries(REQ_PRIORITY_LABEL).forEach(([value, label]) => {
  PRIORITY_TEXT_TO_VALUE[label] = value as TestCasePriority;
  PRIORITY_TEXT_TO_VALUE[value] = value as TestCasePriority;
});

const TEMPLATE_HEADERS = ['제목', '사전조건', '절차', '기대결과', '우선순위', '요구사항명', '담당자'];

function downloadTemplate() {
  const sample = [
    TEMPLATE_HEADERS,
    ['로그인 성공 확인', '테스트 계정 보유', '1. 로그인 페이지 접속\n2. 이메일/비밀번호 입력\n3. 로그인 버튼 클릭', '정상적으로 메인 화면으로 이동한다', '높음', '', '홍길동'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(sample);
  ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'TestCases');
  XLSX.writeFile(wb, 'test-case-template.xlsx');
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export default function TestCaseBulkUploadModal({ requirements, onClose, onImport }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleFile(file: File) {
    setParseError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (raw.length === 0) {
          setParseError('시트에서 데이터를 찾을 수 없습니다. 템플릿 양식을 확인해주세요.');
          setRows([]);
          return;
        }

        const parsed: ParsedRow[] = raw.map((r) => {
          const title = String(r['제목'] ?? '').trim();
          const priorityText = String(r['우선순위'] ?? '').trim();
          const requirementName = String(r['요구사항명'] ?? '').trim();
          const warnings: string[] = [];

          let priority: TestCasePriority = 'medium';
          if (priorityText) {
            const matched = PRIORITY_TEXT_TO_VALUE[priorityText] ?? PRIORITY_TEXT_TO_VALUE[normalize(priorityText)];
            if (matched) {
              priority = matched;
            } else {
              warnings.push(`우선순위 "${priorityText}" 인식 불가 → 기본값(보통) 적용`);
            }
          }

          let requirementId: number | null = null;
          if (requirementName) {
            const match = requirements.find((req) => normalize(req.title) === normalize(requirementName));
            if (match) {
              requirementId = match.id;
            } else {
              warnings.push(`요구사항 "${requirementName}" 매칭 안 됨 → 연결 없이 등록`);
            }
          }

          if (!title) {
            warnings.push('제목이 비어 있어 이 행은 등록에서 제외됩니다');
          }

          return {
            title,
            precondition: String(r['사전조건'] ?? '').trim(),
            steps: String(r['절차'] ?? '').trim(),
            expected_result: String(r['기대결과'] ?? '').trim(),
            priority,
            requirementName,
            requirementId,
            tester: String(r['담당자'] ?? '').trim(),
            warnings,
          };
        });

        setRows(parsed);
      } catch {
        setParseError('파일을 읽는 중 오류가 발생했습니다. .xlsx 형식이 맞는지 확인해주세요.');
        setRows([]);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  const validRows = rows.filter((r) => r.title);
  const warnCount = rows.filter((r) => r.warnings.length > 0).length;

  async function handleConfirm() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const items: TestCaseBulkItem[] = validRows.map((r) => ({
        title: r.title,
        precondition: r.precondition || undefined,
        steps: r.steps || undefined,
        expected_result: r.expected_result || undefined,
        priority: r.priority,
        requirement_id: r.requirementId,
        tester: r.tester || undefined,
      }));
      await onImport(items);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '일괄 등록 중 오류가 발생했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel bulk-upload-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>엑셀로 Test Case 일괄 등록</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="bulk-upload-actions">
            <button type="button" className="btn-ghost" onClick={downloadTemplate}>📥 템플릿 다운로드</button>
            <label className="btn-primary bulk-upload-file-label">
              📤 엑셀 파일 선택
              <input
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </label>
            {fileName && <span className="bulk-upload-filename">{fileName}</span>}
          </div>

          {parseError && <div className="field-error">⚠ {parseError}</div>}

          {rows.length > 0 && (
            <>
              <div className="bulk-upload-summary">
                총 {rows.length}행 파싱됨 · 등록 대상 {validRows.length}건
                {warnCount > 0 && <span className="bulk-upload-warn"> · 확인 필요 {warnCount}건</span>}
              </div>

              <div className="bulk-upload-table-wrap">
                <table className="bulk-upload-table">
                  <thead>
                    <tr>
                      <th>제목</th>
                      <th>우선순위</th>
                      <th>요구사항명</th>
                      <th>담당자</th>
                      <th>확인사항</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={!r.title ? 'bulk-row-excluded' : ''}>
                        <td>{r.title || <em>(비어있음)</em>}</td>
                        <td>{REQ_PRIORITY_LABEL[r.priority]}</td>
                        <td>
                          {r.requirementName
                            ? (r.requirementId ? <span className="bulk-match-ok">✓ {r.requirementName}</span> : <span className="bulk-match-fail">{r.requirementName}</span>)
                            : '-'}
                        </td>
                        <td>{r.tester || '-'}</td>
                        <td>
                          {r.warnings.length > 0
                            ? r.warnings.map((w, wi) => <div key={wi} className="bulk-warning-text">⚠ {w}</div>)
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {submitError && <div className="field-error">⚠ {submitError}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button
            type="button"
            className="btn-primary"
            disabled={validRows.length === 0 || submitting}
            onClick={handleConfirm}
          >
            {submitting ? '등록 중...' : `일괄 등록 (${validRows.length}건)`}
          </button>
        </div>
      </div>
    </div>
  );
}
