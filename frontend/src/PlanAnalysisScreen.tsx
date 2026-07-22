import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { planAnalysisApi, testCasesApi } from './api';

// 기존 프로젝트에서 pdfjs worker를 이미 설정해두신 방식이 있다면 그걸 따라가시고,
// 없다면 아래처럼 cdn worker를 지정하시면 됩니다. (기존 PDF 추출 코드와 workerSrc 설정이
// 중복되지 않도록, 이미 다른 곳(RequirementModal.tsx 등)에서 설정했다면 이 줄은 지워도 됩니다.)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n\n';
  }
  return fullText;
}

// 엑셀은 모든 시트의 모든 셀 값을 행 단위로 이어붙여 하나의 텍스트로 만든다.
// (xlsx 라이브러리는 이미 TestCaseBulkUploadModal.tsx 등에서 쓰고 있는 것과 동일)
async function extractXlsxText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array' });
  let fullText = '';
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    fullText += `[시트: ${sheetName}]\n`;
    rows.forEach((row) => {
      const line = row.filter((cell) => cell !== undefined && cell !== null && cell !== '').join(' | ');
      if (line) fullText += line + '\n';
    });
    fullText += '\n';
  });
  return fullText;
}

async function extractTxtText(file: File): Promise<string> {
  return await file.text();
}
async function extractPptxText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)![1], 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/)![1], 10);
      return numA - numB;
    });

  let fullText = '';
  for (const slideFile of slideFiles) {
    const xml = await zip.files[slideFile].async('text');
    const matches = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)];
    const slideText = matches.map((m) => m[1]).join(' ');
    fullText += slideText + '\n\n';
  }
  return fullText;
}

// TC 생성 프롬프트가 만드는 한글 우선순위를 실제 저장용 코드값으로 매핑
// (라벨 개편 전까지는 기존 4단계 체계 그대로 사용)
function mapPriorityToCode(korean: string): 'low' | 'medium' | 'high' | 'critical' {
  if (korean.includes('높')) return 'high';
  if (korean.includes('낮')) return 'low';
  if (korean.includes('긴급') || korean.includes('critical')) return 'critical';
  return 'medium';
}

interface PlanAnalysisScreenProps {
  embeddedProjectId: number;
}

interface ChecklistItem {
  label: string;
  status: string;
  missing: boolean;
  note: string;
}

interface GeneratedTc {
  title: string;
  priority: string;
  precondition: string;
  steps: string;
  expected_result: string;
}

export default function PlanAnalysisScreen({ embeddedProjectId }: PlanAnalysisScreenProps) {
  const [planText, setPlanText] = useState('');
  const [fileName, setFileName] = useState('');
  const [extracting, setExtracting] = useState(false);

  const [classifying, setClassifying] = useState(false);
  const [projectType, setProjectType] = useState('');
  const [reason, setReason] = useState('');

  const [extractingRules, setExtractingRules] = useState(false);
  const [rules, setRules] = useState<{ summary: string; source: string; risk: string; verify: string }[]>([]);
  const [selectedRuleIdx, setSelectedRuleIdx] = useState<Set<number>>(new Set());

  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [selectedGaps, setSelectedGaps] = useState<Set<string>>(new Set());

  const [generatingTc, setGeneratingTc] = useState(false);
  const [generateProgress, setGenerateProgress] = useState('');
  const [testCases, setTestCases] = useState<GeneratedTc[]>([]);
  const [selectedTcIdx, setSelectedTcIdx] = useState<Set<number>>(new Set());
  const [savedTcIdx, setSavedTcIdx] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const [error, setError] = useState('');

  // 기본 기능(정상 케이스) TC 생성 - 정책분석/체크리스트와 완전히 독립적인 state
  const [extractingFeatures, setExtractingFeatures] = useState(false);
  const [features, setFeatures] = useState<{ name: string; desc: string }[]>([]);
  const [selectedFeatureIdx, setSelectedFeatureIdx] = useState<Set<number>>(new Set());
  const [generatingBasicTc, setGeneratingBasicTc] = useState(false);
  const [generateBasicProgress, setGenerateBasicProgress] = useState('');
  const [basicTestCases, setBasicTestCases] = useState<GeneratedTc[]>([]);
  const [, setBasicTcFeatureIdx] = useState<number[]>([]); // basicTestCases[i]가 features의 몇 번째에서 왔는지
  const [completedFeatureIdx, setCompletedFeatureIdx] = useState<Set<number>>(new Set()); // TC가 저장 완료된 기능
  const [selectedBasicTcIdx, setSelectedBasicTcIdx] = useState<Set<number>>(new Set());
  const [savedBasicTcIdx, setSavedBasicTcIdx] = useState<Set<number>>(new Set());
  const [savingBasic, setSavingBasic] = useState(false);
  const [saveBasicMessage, setSaveBasicMessage] = useState('');

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setFileName(file.name);
    setExtracting(true);
    try {
      const lower = file.name.toLowerCase();
      let fullText = '';
      if (lower.endsWith('.pptx')) {
        fullText = await extractPptxText(file);
      } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        fullText = await extractXlsxText(file);
      } else if (lower.endsWith('.txt')) {
        fullText = await extractTxtText(file);
      } else {
        fullText = await extractPdfText(file);
      }
      setPlanText(fullText);
      // 새 파일을 올리면 이전 분석 결과는 전부 초기화 (기능목록 버튼도 다시 눌릴 수 있게)
      setFeatures([]);
      setSelectedFeatureIdx(new Set());
      setBasicTestCases([]);
      setSelectedBasicTcIdx(new Set());
      setSavedBasicTcIdx(new Set());
      setBasicTcFeatureIdx([]);
      setCompletedFeatureIdx(new Set());
      setProjectType('');
      setRules([]);
      setChecklist([]);
      setTestCases([]);
      setSavedTcIdx(new Set());
    } catch (err) {
      console.error(err);
      setError('파일 텍스트 추출 중 오류가 발생했습니다. (PDF/PPTX/XLSX/TXT만 지원)');
    } finally {
      setExtracting(false);
    }
  }

  async function handleExtractFeatures() {
    if (!planText.trim()) {
      setError('기획서 내용이 없습니다. PDF를 업로드하거나 텍스트를 붙여넣어 주세요.');
      return;
    }
    setError('');
    setExtractingFeatures(true);
    setBasicTestCases([]);
    try {
      const result = await planAnalysisApi.extractFeatures(planText);
      setFeatures(result.features);
      setSelectedFeatureIdx(new Set(result.features.map((_, idx) => idx)));
    } catch (err: any) {
      setError(err.message || '기능 목록 추출 중 오류가 발생했습니다.');
    } finally {
      setExtractingFeatures(false);
    }
  }

  function toggleFeature(idx: number) {
    setSelectedFeatureIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleGenerateBasicTc() {
    if (selectedFeatureIdx.size === 0) {
      setError('TC를 생성할 기능을 하나 이상 선택해주세요.');
      return;
    }
    setError('');
    setGeneratingBasicTc(true);
    setBasicTestCases([]);
    try {
      const selectedFeatureIndices = features.map((_, idx) => idx).filter((idx) => selectedFeatureIdx.has(idx));
      const featureNames = selectedFeatureIndices.map((idx) => features[idx].name);

      // 예외 TC 생성과 동일한 이유로, 5개씩 나눠서 순차 호출 후 병합
      const BATCH_SIZE = 5;
      const nameBatches: string[][] = [];
      const idxBatches: number[][] = [];
      for (let i = 0; i < featureNames.length; i += BATCH_SIZE) {
        nameBatches.push(featureNames.slice(i, i + BATCH_SIZE));
        idxBatches.push(selectedFeatureIndices.slice(i, i + BATCH_SIZE));
      }

      let allResults: GeneratedTc[] = [];
      let allFeatureIdx: number[] = [];
      for (let i = 0; i < nameBatches.length; i++) {
        setGenerateBasicProgress(`TC 생성 중... (${i + 1}/${nameBatches.length}배치)`);
        const result = await planAnalysisApi.generateBasicTc(planText, nameBatches[i]);
        allResults = allResults.concat(result.testCases);
        // "기능당 정확히 1개씩" 생성을 전제로, 반환된 순서를 원본 기능 인덱스에 순서대로 매핑한다.
        // (완벽히 보장되진 않지만, 대부분의 경우 개수/순서가 일치한다.)
        allFeatureIdx = allFeatureIdx.concat(idxBatches[i].slice(0, result.testCases.length));
      }

      setBasicTestCases(allResults);
      setBasicTcFeatureIdx(allFeatureIdx);
      setSelectedBasicTcIdx(new Set(allResults.map((_, idx) => idx)));
      setSaveBasicMessage('');
    } catch (err: any) {
      setError(err.message || '기본 기능 TC 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingBasicTc(false);
      setGenerateBasicProgress('');
    }
  }

  function toggleBasicTc(idx: number) {
    setSelectedBasicTcIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleSaveBasicTestCases() {
    // 이미 저장된 항목은 중복 저장되지 않도록 제외
    const idxToSave = Array.from(selectedBasicTcIdx).filter((idx) => !savedBasicTcIdx.has(idx));
    if (idxToSave.length === 0) return;
    setError('');
    setSaveBasicMessage('');
    setSavingBasic(true);
    try {
      const itemsToSave = idxToSave.map((idx) => {
        const tc = basicTestCases[idx];
        return {
          title: tc.title,
          precondition: tc.precondition,
          steps: tc.steps,
          expected_result: tc.expected_result,
          priority: mapPriorityToCode(tc.priority),
          status: 'not_run' as const,
        };
      });

      const result = await testCasesApi.bulkCreate(embeddedProjectId, itemsToSave);
      setSaveBasicMessage(`${result.created_count}개 TC가 Test Case 목록에 저장되었습니다.`);
      setSavedBasicTcIdx((prev) => new Set([...prev, ...idxToSave]));

      setSelectedBasicTcIdx((prev) => {
        const next = new Set(prev);
        idxToSave.forEach((idx) => next.delete(idx));
        return next;
      });
    } catch (err: any) {
      setError(err.message || 'TC 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingBasic(false);
    }
  }

async function handleClassify() {
    if (!planText.trim()) {
      setError('기획서 내용이 없습니다. PDF를 업로드하거나 텍스트를 붙여넣어 주세요.');
      return;
    }
    setError('');
    setClassifying(true);
    setChecklist([]);
    setTestCases([]);
    try {
      const result = await planAnalysisApi.classifyType(planText);
      setProjectType(result.type);
      setReason(result.reason);
    } catch (err: any) {
      setError(err.message || '유형 판별 중 오류가 발생했습니다.');
    } finally {
      setClassifying(false);
    }
  }


  async function handleExtractRules() {
    if (!planText.trim()) return;
    setError('');
    setExtractingRules(true);
    try {
      const result = await planAnalysisApi.extractRules(planText);
      setRules(result.rules);
      setSelectedRuleIdx(new Set(result.rules.map((_, idx) => idx)));
    } catch (err: any) {
      setError(err.message || '규칙 추출 중 오류가 발생했습니다.');
    } finally {
      setExtractingRules(false);
    }
  }

  function toggleRule(idx: number) {
    setSelectedRuleIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleGetChecklist() {
    if (!projectType) return;
    setError('');
    setLoadingChecklist(true);
    try {
      const result = await planAnalysisApi.getChecklist(planText, projectType);
      setChecklist(result.items);
      setSelectedGaps(new Set(result.items.filter((i) => i.missing).map((i) => i.label)));
    } catch (err: any) {
      setError(err.message || '체크리스트 생성 중 오류가 발생했습니다.');
    } finally {
      setLoadingChecklist(false);
    }
  }

  function toggleGap(label: string) {
    setSelectedGaps((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function handleGenerateTc() {
    if (selectedGaps.size === 0) {
      setError('TC를 생성할 항목을 하나 이상 선택해주세요.');
      return;
    }
    setError('');
    setGeneratingTc(true);
    setTestCases([]);
    try {
      const rulesToSend = rules.filter((_, idx) => selectedRuleIdx.has(idx));
      const gapList = Array.from(selectedGaps);

      // 한 번에 너무 많은 항목을 요청하면 AI 응답이 중간에 잘려서 일부가 누락될 수 있어,
      // 5개씩 나눠서 순차 호출한 뒤 결과를 합친다.
      const BATCH_SIZE = 5;
      const batches: string[][] = [];
      for (let i = 0; i < gapList.length; i += BATCH_SIZE) {
        batches.push(gapList.slice(i, i + BATCH_SIZE));
      }

      let allResults: GeneratedTc[] = [];
      for (let i = 0; i < batches.length; i++) {
        setGenerateProgress(`TC 생성 중... (${i + 1}/${batches.length}배치)`);
        const result = await planAnalysisApi.generateTc(planText, projectType, batches[i], rulesToSend);
        allResults = allResults.concat(result.testCases);
      }

      setTestCases(allResults);
      setSelectedTcIdx(new Set(allResults.map((_, idx) => idx)));
      setSaveMessage('');
    } catch (err: any) {
      setError(err.message || 'TC 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingTc(false);
      setGenerateProgress('');
    }
  }

  function toggleTc(idx: number) {
    setSelectedTcIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleSaveTestCases() {
    const idxToSave = Array.from(selectedTcIdx).filter((idx) => !savedTcIdx.has(idx));
    if (idxToSave.length === 0) return;
    setError('');
    setSaveMessage('');
    setSaving(true);
    try {
      const itemsToSave = idxToSave.map((idx) => {
        const tc = testCases[idx];
        return {
          title: tc.title,
          precondition: tc.precondition,
          steps: tc.steps,
          expected_result: tc.expected_result,
          priority: mapPriorityToCode(tc.priority),
          status: 'not_run' as const,
        };
      });

      const result = await testCasesApi.bulkCreate(embeddedProjectId, itemsToSave);
      setSaveMessage(`${result.created_count}개 TC가 Test Case 목록에 저장되었습니다.`);
      setSavedTcIdx((prev) => new Set([...prev, ...idxToSave]));
    } catch (err: any) {
      setError(err.message || 'TC 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <h3 style={{ marginBottom: 16 }}>기획 자료 분석</h3>

      {error && (
        <div style={{ background: '#fdecea', color: '#a33', padding: '8px 12px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* 1. 업로드 */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>기획서 / 요구사항 업로드 (PDF / PPTX / XLSX / TXT)</p>
        <input
          type="file"
          accept=".pdf,.pptx,.xlsx,.xls,.txt"
          onChange={handleFileUpload}
          disabled={extracting}
        />
        {fileName && (
          <p style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
            {fileName} {extracting ? '- 텍스트 추출 중...' : `- ${planText.length}자 추출됨`}
          </p>
        )}
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 12, color: '#888', cursor: 'pointer' }}>또는 텍스트 직접 붙여넣기</summary>
          <textarea
            value={planText}
            onChange={(e) => setPlanText(e.target.value)}
            rows={6}
            style={{ width: '100%', marginTop: 8, fontSize: 13 }}
            placeholder="기획서 내용을 여기에 붙여넣으세요"
          />
        </details>
      </div>

      {/* 1.5. 기본 기능(정상 케이스) TC 생성 - 완전히 독립적, 유형판별/정책분석/체크리스트 불필요 */}
      <div style={{ marginBottom: 20, border: '1px solid #d8ecd8', background: '#f6fbf6', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 600, margin: '0 0 4px' }}>기본 기능(정상 케이스) TC 생성</p>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 10px' }}>
          기획서에 정의된 기능들이 "정상적으로 잘 동작하는지" 확인하는 TC를 만듭니다. 예외/에러 상황은 다루지 않아요.
          아래 정책분석·예외케이스 점검과는 완전히 독립적으로 동작합니다.
        </p>

        <button onClick={handleExtractFeatures} disabled={extractingFeatures || !planText.trim() || features.length > 0}>
          {extractingFeatures ? '추출 중...' : features.length > 0 ? 'TC 생성 목록 확인 완료' : 'TC 생성 목록 확인'}
        </button>

        {features.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#888' }}>빠른 선택:</span>
              {[3, 5, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setSelectedFeatureIdx(new Set(features.slice(0, n).map((_, idx) => idx)))}
                  style={{ fontSize: 12, padding: '2px 8px' }}
                >
                  상위 {n}개만
                </button>
              ))}
              <button
                onClick={() => setSelectedFeatureIdx(new Set(features.map((_, idx) => idx)))}
                style={{ fontSize: 12, padding: '2px 8px' }}
              >
                전체 선택
              </button>
              <button
                onClick={() => setSelectedFeatureIdx(new Set())}
                style={{ fontSize: 12, padding: '2px 8px' }}
              >
                전체 해제
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {features.map((f, idx) => {
                const isDone = completedFeatureIdx.has(idx);
                return (
                  <label
                    key={idx}
                    style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: '1px solid #e0eee0', background: isDone ? '#f2f2f2' : '#fff', borderRadius: 6, padding: '8px 12px', fontSize: 13, cursor: isDone ? 'default' : 'pointer', opacity: isDone ? 0.6 : 1 }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFeatureIdx.has(idx)}
                      onChange={() => toggleFeature(idx)}
                      disabled={isDone}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <p style={{ fontWeight: 500, margin: 0 }}>
                        {f.name}
                        {isDone && (
                          <span style={{ marginLeft: 8, background: '#e0e0e0', color: '#777', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
                            완료 (TC 저장됨)
                          </span>
                        )}
                      </p>
                      <p style={{ color: '#888', margin: '4px 0 0', fontSize: 12 }}>{f.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={{ marginTop: 10 }}>
              <button onClick={handleGenerateBasicTc} disabled={generatingBasicTc || selectedFeatureIdx.size === 0}>
                {generatingBasicTc ? (generateBasicProgress || 'TC 생성 중...') : `선택한 ${selectedFeatureIdx.size}개 기능으로 TC 생성`}
              </button>
            </div>
          </>
        )}

        {basicTestCases.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={handleSaveBasicTestCases}
                disabled={savingBasic || Array.from(selectedBasicTcIdx).filter((i) => !savedBasicTcIdx.has(i)).length === 0}
              >
                {savingBasic
                  ? '저장 중...'
                  : `선택한 ${Array.from(selectedBasicTcIdx).filter((i) => !savedBasicTcIdx.has(i)).length}개를 Test Case에 저장`}
              </button>
              {saveBasicMessage && <span style={{ fontSize: 13, color: '#2a8f4d' }}>{saveBasicMessage}</span>}
            </div>

            {basicTestCases.map((tc, idx) => {
              const stepLines = tc.steps.split('\n').filter(Boolean);
              const isSaved = savedBasicTcIdx.has(idx);
              return (
                <div key={idx} style={{ border: '1px solid #ddd', borderRadius: 8, padding: '16px 18px', background: isSaved ? '#f7f7f7' : '#fff', display: 'flex', gap: 12, opacity: isSaved ? 0.7 : 1 }}>
                  <input
                    type="checkbox"
                    checked={selectedBasicTcIdx.has(idx)}
                    onChange={() => toggleBasicTc(idx)}
                    disabled={isSaved}
                    style={{ marginTop: 4 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ background: '#e3f2e3', color: '#2a8f4d', fontSize: 12, padding: '3px 10px', borderRadius: 4, marginRight: 8 }}>
                        {tc.priority}
                      </span>
                      {isSaved && (
                        <span style={{ background: '#eee', color: '#888', fontSize: 12, padding: '3px 10px', borderRadius: 4, marginRight: 8 }}>
                          저장됨
                        </span>
                      )}
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{tc.title}</span>
                    </div>

                    <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>사전조건</p>
                    <p style={{ fontSize: 14, color: '#333', margin: '0 0 14px' }}>{tc.precondition}</p>

                    <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>테스트 절차</p>
                    <div style={{ fontSize: 14, color: '#333', margin: '0 0 14px', lineHeight: 1.8 }}>
                      {stepLines.map((line, i) => (
                        <div key={i}>{i + 1}. {line}</div>
                      ))}
                    </div>

                    <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>기대 결과</p>
                    <p style={{ fontSize: 14, color: '#333', margin: 0 }}>{tc.expected_result}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. 유형 판별 */}
      <div style={{ marginBottom: 16 }}>
        <button onClick={handleClassify} disabled={classifying || !planText.trim()}>
          {classifying ? '판별 중...' : '프로젝트 유형 판별'}
        </button>
        {projectType && (
          <div style={{ marginTop: 10, background: '#f5f5f5', borderRadius: 8, padding: 12 }}>
            <p style={{ fontWeight: 500 }}>감지된 유형: {projectType}</p>
            <p style={{ fontSize: 13, color: '#666' }}>{reason}</p>
          </div>
        )}
      </div>

      {/* 2.5. 두 버튼(정책 분석 / 예외 케이스 점검)의 차이를 설명하는 안내 박스 */}
      {projectType && (
        <div style={{ marginBottom: 12, fontSize: 12, color: '#555', background: '#f0f5fa', border: '1px solid #dde6ee', borderRadius: 6, padding: '10px 12px', lineHeight: 1.7 }}>
          아래 두 기능은 서로 다른 결과를 만들어요, 순서 상관없이 <b>둘 다 진행하시는 걸 추천</b>드려요.
          <br />
          <b>① 기획서 정책·제한사항 분석</b> → 이 문서에만 있는 구체적인 조건/숫자/예외 규정을 찾아줌 (예: "쿠폰 최대 3개", "반기 기준 제한")
          <br />
          <b>② 예외 케이스 점검 리스트 생성</b> → 이 유형(쇼핑몰 등) 서비스라면 보통 챙겨야 할 일반적인 예외 항목 중, 이 기획서에 없는 것을 찾아줌
          <br />
          두 결과에서 체크한 항목들이 합쳐져서 <b>TC 생성</b>에 반영됩니다.
        </div>
      )}

      {/* 2.6. 기획서 정책·제한사항 분석 */}
      {projectType && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={handleExtractRules} disabled={extractingRules}>
            {extractingRules ? '분석 중...' : '기획서 정책·제한사항 분석'}
          </button>
          <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>
            기획서에만 있는 조건/제한 정책(숫자, 예외 규정 등)을 찾아냅니다. 체크한 항목은 아래 TC 생성 시 우선 반영됩니다.
          </p>
          {rules.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rules.map((r, idx) => (
                <label
                  key={idx}
                  style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: '1px solid #e8dff5', background: '#faf7ff', borderRadius: 6, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={selectedRuleIdx.has(idx)}
                    onChange={() => toggleRule(idx)}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <p style={{ fontWeight: 500, margin: 0 }}>{r.summary}</p>
                    <p style={{ color: '#888', margin: '4px 0 0', fontSize: 12 }}>근거: {r.source}</p>
                    <p style={{ color: '#a35ec2', margin: '4px 0 0', fontSize: 12 }}>파생 위험: {r.risk}</p>
                    {r.verify && (
                      <p style={{ color: '#2a6f8f', margin: '4px 0 0', fontSize: 12 }}>확인해야 할 것: {r.verify}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. 체크리스트 */}
      {projectType && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={handleGetChecklist} disabled={loadingChecklist}>
            {loadingChecklist ? '점검 중...' : '예외 케이스 점검 리스트 생성'}
          </button>
          <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>
            이 유형(쇼핑몰 등) 서비스라면 일반적으로 요구되는 항목(쿠폰/재고/결제 등) 중, 이 기획서에 명시되지 않은 것을 찾아냅니다. 체크한 항목은 아래 TC 생성 시 반영됩니다.
          </p>

          {checklist.length > 0 && (
            <>
              <div style={{ marginTop: 12, marginBottom: 8, fontSize: 12, color: '#888', background: '#fafafa', border: '1px solid #eee', borderRadius: 6, padding: '8px 12px' }}>
                <b>충족</b> = 기획서에 명시됨 · <b>누락 의심</b> = 체크리스트 기준으로 봤을 때 기획서에 언급이 없어 TC 생성 대상 (각 항목에 마우스를 올리면 판단 근거가 보입니다)
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#888' }}>빠른 선택 (누락 의심 중):</span>
                {[3, 5, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() =>
                      setSelectedGaps(new Set(checklist.filter((i) => i.missing).slice(0, n).map((i) => i.label)))
                    }
                    style={{ fontSize: 12, padding: '2px 8px' }}
                  >
                    상위 {n}개만
                  </button>
                ))}
                <button
                  onClick={() => setSelectedGaps(new Set(checklist.filter((i) => i.missing).map((i) => i.label)))}
                  style={{ fontSize: 12, padding: '2px 8px' }}
                >
                  전체 선택
                </button>
                <button
                  onClick={() => setSelectedGaps(new Set())}
                  style={{ fontSize: 12, padding: '2px 8px' }}
                >
                  전체 해제
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {checklist.map((item) => (
                  <label
                    key={item.label}
                    title={item.note}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: '1px solid #eee',
                      borderRadius: 6,
                      padding: '8px 12px',
                      fontSize: 13,
                      cursor: item.missing ? 'pointer' : 'default',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {item.missing && (
                        <input
                          type="checkbox"
                          checked={selectedGaps.has(item.label)}
                          onChange={() => toggleGap(item.label)}
                        />
                      )}
                      {item.label}
                    </span>
                    <span style={{ color: item.missing ? '#c77700' : '#2a8f4d', fontSize: 12 }}>
                      {item.status}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 4. TC 생성 */}
      {checklist.some((i) => i.missing) && (
        <div style={{ marginBottom: 16 }}>
          {rules.length === 0 && (
            <p style={{ fontSize: 12, color: '#c77700', marginBottom: 6 }}>
              ⚠ 아직 "기획서 정책·제한사항 분석"을 하지 않았어요. 먼저 분석하면 이 문서만의 특이 예외가 TC에 반영돼서 퀄리티가 더 좋아져요.
            </p>
          )}
          <button onClick={handleGenerateTc} disabled={generatingTc || selectedGaps.size === 0}>
            {generatingTc ? (generateProgress || 'TC 생성 중...') : `선택한 ${selectedGaps.size}개 항목으로 TC 생성`}
          </button>
        </div>
      )}

      {testCases.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <button
              onClick={handleSaveTestCases}
              disabled={saving || Array.from(selectedTcIdx).filter((i) => !savedTcIdx.has(i)).length === 0}
            >
              {saving
                ? '저장 중...'
                : `선택한 ${Array.from(selectedTcIdx).filter((i) => !savedTcIdx.has(i)).length}개를 Test Case에 저장`}
            </button>
            {saveMessage && <span style={{ fontSize: 13, color: '#2a8f4d' }}>{saveMessage}</span>}
          </div>

          {testCases.map((tc, idx) => {
            const stepLines = tc.steps.split('\n').filter(Boolean);
            const isSaved = savedTcIdx.has(idx);
            return (
              <div key={idx} style={{ border: '1px solid #ddd', borderRadius: 8, padding: '16px 18px', background: isSaved ? '#f7f7f7' : '#fff', display: 'flex', gap: 12, opacity: isSaved ? 0.7 : 1 }}>
                <input
                  type="checkbox"
                  checked={selectedTcIdx.has(idx)}
                  onChange={() => toggleTc(idx)}
                  disabled={isSaved}
                  style={{ marginTop: 4 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ background: '#fdf1e0', color: '#c77700', fontSize: 12, padding: '3px 10px', borderRadius: 4, marginRight: 8 }}>
                      {tc.priority}
                    </span>
                    {isSaved && (
                      <span style={{ background: '#eee', color: '#888', fontSize: 12, padding: '3px 10px', borderRadius: 4, marginRight: 8 }}>
                        저장됨
                      </span>
                    )}
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{tc.title}</span>
                  </div>

                  <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>사전조건</p>
                  <p style={{ fontSize: 14, color: '#333', margin: '0 0 14px' }}>{tc.precondition}</p>

                  <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>테스트 절차</p>
                  <div style={{ fontSize: 14, color: '#333', margin: '0 0 14px', lineHeight: 1.8 }}>
                    {stepLines.map((line, i) => (
                      <div key={i}>{i + 1}. {line}</div>
                    ))}
                  </div>

                  <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>기대 결과</p>
                  <p style={{ fontSize: 14, color: '#333', margin: 0 }}>{tc.expected_result}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
