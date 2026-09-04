import { useEffect, useMemo, useState } from 'react';
import { planAnalysisApi, testCasesApi } from './api';
import { extractFileText } from './fileExtract';
import * as XLSX from 'xlsx';

// TC 생성 프롬프트가 만드는 한글 우선순위를 실제 저장용 코드값으로 매핑
// (라벨 개편 전까지는 기존 4단계 체계 그대로 사용)
function mapPriorityToCode(korean: string): 'minor' | 'major' | 'critical' {
  if (korean.includes('높')) return 'critical';
  if (korean.includes('낮')) return 'minor';
  if (korean.includes('긴급') || korean.includes('critical')) return 'critical';
  return 'major';
}

interface PlanAnalysisScreenProps {
  embeddedProjectId: number;
}

interface RequirementFile {
  name: string;
  text: string;
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
  source_category?: 'exception_gap' | 'satisfied_check' | 'policy_rule' | 'consistency_issue' | 'basic_function';
  source_snippet?: string;
}

const SOURCE_CATEGORY_META: Record<NonNullable<GeneratedTc['source_category']>, { label: string; color: string }> = {
  exception_gap: { label: '예외 케이스(누락 의심)', color: '#c77700' },
  satisfied_check: { label: '예외 케이스(충족 항목)', color: '#2a8f4d' },
  policy_rule: { label: '정책·제한사항 분석(규칙 검증)', color: '#a35ec2' },
  consistency_issue: { label: '정합성 검수(이슈 검증)', color: '#2a6f8f' },
  basic_function: { label: '기본 기능 TC', color: '#2a8f4d' },
};

// 배치 응답의 TC 개수가 "항목당 정확히 N개씩" 지시대로 나왔으면 순서 기반으로 정확히 매핑하고,
// 개수가 안 맞으면(모델이 지시를 안 지킨 경우) 배치 전체 근거를 합쳐서 넣는 안전한 폴백.
// AI에게 근거를 다시 만들어달라고 요청하지 않고, 이미 알고 있는 원본 데이터를 그대로 재사용하므로
// 추가 비용이 들지 않는다.
function attributeSource<T>(
  tcs: GeneratedTc[],
  items: T[],
  perItemCount: number,
  category: NonNullable<GeneratedTc['source_category']>,
  snippetOf: (item: T) => string
): GeneratedTc[] {
  const expectedCount = items.length * perItemCount;
  if (items.length > 0 && tcs.length === expectedCount) {
    return tcs.map((tc, j) => ({
      ...tc,
      source_category: category,
      source_snippet: snippetOf(items[Math.floor(j / perItemCount)]),
    }));
  }
  const combined = items.map(snippetOf).join(' / ');
  return tcs.map((tc) => ({ ...tc, source_category: category, source_snippet: combined }));
}

interface ConsistencyIssue {
  category: 'mismatch' | 'internal_contradiction' | 'no_basis';
  categoryLabel: string;
  title: string;
  reqContent: string;
  designContent: string;
  location: string;
  question: string;
  confirmedValue?: string;
}

const CATEGORY_META: Record<ConsistencyIssue['category'], { icon: string; label: string; color: string; desc: string }> = {
  mismatch: {
    icon: '🔴',
    label: '값 불일치',
    color: '#c0392b',
    desc: '요구사항과 화면설계서 둘 다에 있는데 값이 다름',
  },
  internal_contradiction: {
    icon: '🟡',
    label: '문서 내부 모순',
    color: '#b5760c',
    desc: '화면설계서 안에서 서로 다른 값이 나옴 (편집 실수 가능성)',
  },
  no_basis: {
    icon: '⚪',
    label: '근거 없음',
    color: '#6b7686',
    desc: '화면설계서에만 있고 요구사항 문서에는 언급이 없음 (확인 필요)',
  },
};

type PlanAnalysisTab = 'type' | 'rules' | 'consistency' | 'exception' | 'basic';

const TAB_CONFIG: { key: PlanAnalysisTab; label: string }[] = [
  { key: 'type', label: '① 유형 인지' },
  { key: 'rules', label: '② 정책·제한사항 분석' },
  { key: 'consistency', label: '③ 정합성 검수' },
  { key: 'exception', label: '④ 예외 케이스' },
  { key: 'basic', label: '⑤ 기본 기능 TC' },
];

export default function PlanAnalysisScreen({ embeddedProjectId }: PlanAnalysisScreenProps) {
  // --- 섹션 1: 요구사항 문서 (RFP/제안서/요구사항 정의서 등, 여러 개 업로드 가능) ---
  const [requirementFiles, setRequirementFiles] = useState<RequirementFile[]>([]);
  const [extractingRequirement, setExtractingRequirement] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // 여러 요구사항 문서를 파일명과 함께 하나의 텍스트로 결합.
  // 각 문서 안에 버전이력/변경사항이 이미 포함돼 있을 수 있으므로(문서이력 시트 등),
  // 별도로 "무엇이 원본이고 무엇이 변경분인지" 구분하지 않고 AI가 알아서 파악하게 한다.
  const requirementText = useMemo(
    () => requirementFiles.map((f) => `[문서: ${f.name}]\n${f.text}`).join('\n\n---\n\n'),
    [requirementFiles]
  );

  const requirementFilesPayload = useMemo(
    () => requirementFiles.map((f) => ({ name: f.name, text: f.text })),
    [requirementFiles]
  );

  const [classifying, setClassifying] = useState(false);
  const [projectType, setProjectType] = useState('');
  const [reason, setReason] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [typeConfirmed, setTypeConfirmed] = useState<boolean | null>(null);
  const [manualTypeInput, setManualTypeInput] = useState('');
  const [editingType, setEditingType] = useState(false);
  const [manualServiceNameInput, setManualServiceNameInput] = useState('');
  const [editingServiceName, setEditingServiceName] = useState(false);
  const [rules, setRules] = useState<{ summary: string; source: string; risk: string; verify: string; confirmed?: 'correct' | 'incorrect' | null; reasonNote?: string; needsReview?: boolean }[]>([]);

  const [extractingRules, setExtractingRules] = useState(false);
  const [selectedRuleIdx, setSelectedRuleIdx] = useState<Set<number>>(new Set());

  // --- 섹션 2: 화면설계서 ---
  const [designText, setDesignText] = useState('');
  const [designFileName, setDesignFileName] = useState('');
  const [extractingDesign, setExtractingDesign] = useState(false);

  // --- 정합성 검수 (요구사항 vs 화면설계서) ---
  const [checkingConsistency, setCheckingConsistency] = useState(false);
  const [issues, setIssues] = useState<ConsistencyIssue[]>([]);
  const [resolvedIssues, setResolvedIssues] = useState<ConsistencyIssue[]>([]);

  // --- 기본 기능(정상 케이스) TC 생성 - 화면설계서 기준, 독립 실행 ---
  const [extractingFeatures, setExtractingFeatures] = useState(false);
  const [features, setFeatures] = useState<{ name: string; desc: string }[]>([]);
  const [selectedFeatureIdx, setSelectedFeatureIdx] = useState<Set<number>>(new Set());
  const [generatingBasicTc, setGeneratingBasicTc] = useState(false);
  const [generateBasicProgress, setGenerateBasicProgress] = useState('');
  const [basicTestCases, setBasicTestCases] = useState<GeneratedTc[]>([]);
  const [, setBasicTcFeatureIdx] = useState<number[]>([]);
  const [completedFeatureIdx, setCompletedFeatureIdx] = useState<Set<number>>(new Set());
  const [selectedBasicTcIdx, setSelectedBasicTcIdx] = useState<Set<number>>(new Set());
  const [savedBasicTcIdx, setSavedBasicTcIdx] = useState<Set<number>>(new Set());
  const [savingBasic, setSavingBasic] = useState(false);
  const [saveBasicMessage, setSaveBasicMessage] = useState('');

  // --- 예외 케이스 점검 리스트 (화면설계서 기준) ---
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [selectedGaps, setSelectedGaps] = useState<Set<string>>(new Set());
  const [selectedSatisfied, setSelectedSatisfied] = useState<Set<string>>(new Set());
  const [expandedChecklist, setExpandedChecklist] = useState<Set<string>>(new Set());
  const [checklistChanges, setChecklistChanges] = useState<Record<string, boolean>>({});

  // --- TC 생성 (예외 케이스 탭: 누락의심 + 충족항목) ---
  const [generatingTc, setGeneratingTc] = useState(false);
  const [generateProgress, setGenerateProgress] = useState('');
  const [testCases, setTestCases] = useState<GeneratedTc[]>([]);
  const [selectedTcIdx, setSelectedTcIdx] = useState<Set<number>>(new Set());
  const [savedTcIdx, setSavedTcIdx] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // --- TC 생성 (정책·제한사항 분석 탭: 선택한 규칙만) ---
  const [generatingRuleTc, setGeneratingRuleTc] = useState(false);
  const [generateRuleProgress, setGenerateRuleProgress] = useState('');
  const [savingRuleTc, setSavingRuleTc] = useState(false);
  const [saveRuleTcMessage, setSaveRuleTcMessage] = useState('');

  const [error, setError] = useState('');
  const [restoringState, setRestoringState] = useState(true);
  const [activeTab, setActiveTab] = useState<PlanAnalysisTab>('type');

  // 프로젝트를 열 때 이전에 저장해둔 분석 상태를 복구.
  // 체크박스 선택 상태는 의도적으로 복구 대상에서 제외 (저장 전 임시값이라 큰 의미 없음).
  // TC 초안(testCases/basicTestCases)과 그중 이미 저장된 항목(savedTcIdx/savedBasicTcIdx)은
  // 새로고침해도 사라지면 안 되므로 복구 대상에 포함.
  useEffect(() => {
    let cancelled = false;
    setRestoringState(true);
    planAnalysisApi.getState(embeddedProjectId).then((state) => {
      if (cancelled) return;
      setRequirementFiles(state.requirementFiles || []);
      setDesignText(state.designText || '');
      setDesignFileName(state.designFileName || '');
      setProjectType(state.projectType || '');
      setReason(state.reason || '');
      setServiceName(state.serviceName || '');
      setRules(state.rules || []);
      setChecklist(state.checklist || []);
      setFeatures(state.features || []);
      setIssues(state.consistencyIssues || []);

      const restoredTcs: GeneratedTc[] = (state.draftTestCases || []) as GeneratedTc[];
      const restoredSavedTcIdx = new Set<number>(state.savedTcIdx || []);
      setTestCases(restoredTcs);
      setSavedTcIdx(restoredSavedTcIdx);
      setSelectedTcIdx(new Set(restoredTcs.map((_, idx) => idx).filter((idx) => !restoredSavedTcIdx.has(idx))));

      const restoredBasicTcs: GeneratedTc[] = (state.draftBasicTestCases || []) as GeneratedTc[];
      const restoredSavedBasicTcIdx = new Set<number>(state.savedBasicTcIdx || []);
      setBasicTestCases(restoredBasicTcs);
      setSavedBasicTcIdx(restoredSavedBasicTcIdx);
      setSelectedBasicTcIdx(new Set(restoredBasicTcs.map((_, idx) => idx).filter((idx) => !restoredSavedBasicTcIdx.has(idx))));
    }).catch(() => {
      // 저장된 상태가 없거나 서버 오류 - 빈 상태로 그냥 시작 (에러 표시 안 함)
    }).finally(() => {
      if (!cancelled) setRestoringState(false);
    });
    return () => { cancelled = true; };
  }, [embeddedProjectId]);

  // 각 분석 단계가 끝날 때마다 호출 - 현재 알고 있는 최신 값으로 서버에 저장(upsert).
  function persistState(overrides: Partial<{
    requirementFiles: RequirementFile[];
    designText: string; designFileName: string;
    projectType: string; reason: string; serviceName: string;
    rules: typeof rules; checklist: typeof checklist; features: typeof features;
    consistencyIssues: typeof issues;
    draftTestCases: GeneratedTc[]; draftBasicTestCases: GeneratedTc[];
    savedTcIdx: number[]; savedBasicTcIdx: number[];
  }> = {}) {
    planAnalysisApi.saveState(embeddedProjectId, {
      requirementFiles,
      designText, designFileName,
      projectType, reason, serviceName, rules, checklist, features,
      consistencyIssues: issues,
      draftTestCases: testCases,
      draftBasicTestCases: basicTestCases,
      savedTcIdx: Array.from(savedTcIdx),
      savedBasicTcIdx: Array.from(savedBasicTcIdx),
      ...overrides,
    }).catch(() => {
      // 자동 저장 실패는 조용히 무시 - 사용자 작업 흐름을 방해하지 않음
    });
  }

  // 요구사항 문서 목록이 바뀔 때 그 이후 모든 분석 결과를 초기화 (내용이 바뀌었으니 재분석 필요)
  function resetDownstreamAfterRequirementChange() {
    setProjectType('');
    setReason('');
    setServiceName('');
    setRules([]);
    setSelectedRuleIdx(new Set());
    setIssues([]);
    setResolvedIssues([]);
    setFeatures([]);
    setSelectedFeatureIdx(new Set());
    setBasicTestCases([]);
    setSelectedBasicTcIdx(new Set());
    setSavedBasicTcIdx(new Set());
    setBasicTcFeatureIdx([]);
    setCompletedFeatureIdx(new Set());
    setChecklist([]);
    setSelectedGaps(new Set());
    setSelectedSatisfied(new Set());
    setExpandedChecklist(new Set());
    setChecklistChanges({});
    setTestCases([]);
    setSavedTcIdx(new Set());
  }

  async function handleRequirementUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setError('');
    setExtractingRequirement(true);
    try {
      const newFiles: RequirementFile[] = [];
      for (const file of Array.from(fileList)) {
        const text = await extractFileText(file);
        newFiles.push({ name: file.name, text });
      }
      const updatedFiles = [...requirementFiles, ...newFiles];
      setRequirementFiles(updatedFiles);
      resetDownstreamAfterRequirementChange();
      persistState({
        requirementFiles: updatedFiles,
        projectType: '', reason: '', serviceName: '',
        rules: [], checklist: [], features: [], consistencyIssues: [],
        draftTestCases: [], draftBasicTestCases: [], savedTcIdx: [], savedBasicTcIdx: [],
      });
    } catch (err) {
      console.error(err);
      setError('요구사항 문서 텍스트 추출 중 오류가 발생했습니다. (PDF/PPTX/XLSX/TXT만 지원)');
    } finally {
      setExtractingRequirement(false);
      e.target.value = ''; // 같은 파일을 다시 선택해도 onChange가 또 발생하도록 초기화
    }
  }

function setRuleConfirmed(idx: number, value: 'correct' | 'incorrect' | null) {
  const updated = rules.map((r, i) => (i === idx ? { ...r, confirmed: value, needsReview: false } : r));
  setRules(updated);
  // 맞음 확인 시 TC 생성 대상에 자동 포함, 틀림 처리 시 자동 제외(재검토 필요하므로).
  // 토글 해제(null)로 돌아가는 경우는 기본값인 "포함"으로 되돌린다.
  setSelectedRuleIdx((prev) => {
    const next = new Set(prev);
    if (value === 'correct' || value === null) next.add(idx);
    else next.delete(idx);
    return next;
  });
  persistState({ rules: updated });
}

function setRuleReasonNote(idx: number, note: string) {
  setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, reasonNote: note } : r)));
}

function persistRuleReasonNote() {
  persistState({ rules });
}

function handleSelectAllRulesCorrect() {
  const updated = rules.map((r) => ({ ...r, confirmed: 'correct' as const, needsReview: false }));
  setRules(updated);
  setSelectedRuleIdx(new Set(rules.map((_, idx) => idx)));
  persistState({ rules: updated });
}

function handleExportIssuesExcel() {
  if (issues.length === 0) return;
  const rows = issues.map((issue, i) => ({
    번호: i + 1,
    카테고리: `${CATEGORY_META[issue.category].icon} ${CATEGORY_META[issue.category].label}`,
    제목: issue.title,
    요구사항_내용: issue.reqContent || '명시 없음',
    화면설계서_내용: issue.designContent,
    위치: issue.location,
    확인질문: issue.question,
    확정값: issue.confirmedValue || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 30 }, { wch: 40 }, { wch: 40 }, { wch: 20 }, { wch: 40 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '정합성검수결과');
  XLSX.writeFile(wb, `정합성검수결과_${serviceName || 'project'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}



  function handleRemoveRequirementFile(idx: number) {
    const updatedFiles = requirementFiles.filter((_, i) => i !== idx);
    setRequirementFiles(updatedFiles);
    resetDownstreamAfterRequirementChange();
    persistState({
      requirementFiles: updatedFiles,
      projectType: '', reason: '', serviceName: '',
      rules: [], checklist: [], features: [], consistencyIssues: [],
        draftTestCases: [], draftBasicTestCases: [], savedTcIdx: [], savedBasicTcIdx: [],
    });
  }

  function handleAddPastedText() {
    if (!pasteText.trim()) return;
    const updatedFiles = [...requirementFiles, { name: `붙여넣은 텍스트 ${requirementFiles.length + 1}`, text: pasteText }];
    setRequirementFiles(updatedFiles);
    setPasteText('');
    resetDownstreamAfterRequirementChange();
    persistState({
      requirementFiles: updatedFiles,
      projectType: '', reason: '', serviceName: '',
      rules: [], checklist: [], features: [], consistencyIssues: [],
        draftTestCases: [], draftBasicTestCases: [], savedTcIdx: [], savedBasicTcIdx: [],
    });
  }

  async function handleDesignUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setDesignFileName(file.name);
    setExtractingDesign(true);
    try {
      const fullText = await extractFileText(file);
      setDesignText(fullText);
      // 화면설계서가 바뀌면 화면설계서 기반 분석 결과는 다시 돌려야 함
      setIssues([]);
      setResolvedIssues([]);
      setFeatures([]);
      setSelectedFeatureIdx(new Set());
      setBasicTestCases([]);
      setSelectedBasicTcIdx(new Set());
      setSavedBasicTcIdx(new Set());
      setBasicTcFeatureIdx([]);
      setCompletedFeatureIdx(new Set());
      setChecklist([]);
      setSelectedGaps(new Set());
      setSelectedSatisfied(new Set());
      setExpandedChecklist(new Set());
      setChecklistChanges({});
      setTestCases([]);
      setSavedTcIdx(new Set());
      persistState({
        designText: fullText,
        designFileName: file.name,
        checklist: [],
        features: [],
        consistencyIssues: [],
      });
    } catch (err) {
      console.error(err);
      setError('화면설계서 텍스트 추출 중 오류가 발생했습니다. (PDF/PPTX/XLSX/TXT만 지원)');
    } finally {
      setExtractingDesign(false);
    }
  }

  async function handleClassify() {
    if (!requirementText.trim()) {
      setError('요구사항 문서 내용이 없습니다. 파일을 업로드하거나 텍스트를 붙여넣어 주세요.');
      return;
    }
    setError('');
    setClassifying(true);
    try {
      const result = await planAnalysisApi.classifyType(requirementText);
      setProjectType(result.type);
      setReason(result.reason);
      setServiceName(result.serviceName || '');
      persistState({ projectType: result.type, reason: result.reason, serviceName: result.serviceName || '' });
    } catch (err: any) {
      setError(err.message || '유형 판별 중 오류가 발생했습니다.');
    } finally {
      setClassifying(false);
    }
  }

  async function handleExtractRules() {
    if (!requirementText.trim()) return;
    setError('');
    setExtractingRules(true);
    try {
      const result = await planAnalysisApi.extractRules(requirementText);
      // 재분석 시 이전 판단(맞음/틀림/사유)을 규칙 문구(summary) 기준으로 이어받고,
      // 근거(source)가 이전과 달라졌으면 재검토가 필요하므로 판단을 초기화하고 배지를 띄운다.
      const prevBySummary = new Map(rules.map((r) => [r.summary, r]));
      const merged = result.rules.map((r) => {
        const prev = prevBySummary.get(r.summary);
        if (!prev) return { ...r, confirmed: null, reasonNote: undefined, needsReview: false };
        const needsReview = prev.source !== r.source;
        return {
          ...r,
          confirmed: needsReview ? null : (prev.confirmed ?? null),
          reasonNote: needsReview ? undefined : prev.reasonNote,
          needsReview,
        };
      });
      setRules(merged);
      setSelectedRuleIdx(new Set(merged.map((_, idx) => idx).filter((idx) => merged[idx].confirmed !== 'incorrect')));
      persistState({ rules: merged });
    } catch (err: any) {
      setError(err.message || '규칙 추출 중 오류가 발생했습니다.');
    } finally {
      setExtractingRules(false);
    }
  }

  async function handleCheckConsistency() {
    if (!requirementText.trim() || !designText.trim()) {
      setError('정합성 검수를 하려면 요구사항 문서와 화면설계서가 둘 다 필요합니다.');
      return;
    }
    setError('');
    setCheckingConsistency(true);
    const prevIssues = issues;
    setIssues([]);
    try {
      const result = await planAnalysisApi.checkConsistency(requirementFilesPayload, designText);
      // 재검수 시 이전엔 있었는데 이번엔 안 나온 이슈는 "해결됨"으로 별도 보관 (제목 기준 매칭)
      const newTitles = new Set(result.issues.map((iss) => iss.title));
      setResolvedIssues(prevIssues.filter((iss) => !newTitles.has(iss.title)));
      setIssues(result.issues);
      persistState({ consistencyIssues: result.issues });
    } catch (err: any) {
      setError(err.message || '정합성 검수 중 오류가 발생했습니다.');
    } finally {
      setCheckingConsistency(false);
    }
  }

  function updateIssueConfirmedValue(idx: number, value: string) {
    setIssues((prev) => prev.map((iss, i) => (i === idx ? { ...iss, confirmedValue: value } : iss)));
  }

  function persistIssueConfirmedValue() {
    persistState({ consistencyIssues: issues });
  }

  async function handleExtractFeatures() {
    if (!designText.trim()) {
      setError('화면설계서 내용이 없습니다. 파일을 업로드하거나 텍스트를 붙여넣어 주세요.');
      return;
    }
    setError('');
    setExtractingFeatures(true);
    setBasicTestCases([]);
    try {
      const result = await planAnalysisApi.extractFeatures(designText);
      setFeatures(result.features);
      setSelectedFeatureIdx(new Set(result.features.map((_, idx) => idx)));
      persistState({ features: result.features });
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

      const BATCH_SIZE = 5;
      const nameBatches: string[][] = [];
      const idxBatches: number[][] = [];
      for (let i = 0; i < featureNames.length; i += BATCH_SIZE) {
        nameBatches.push(featureNames.slice(i, i + BATCH_SIZE));
        idxBatches.push(selectedFeatureIndices.slice(i, i + BATCH_SIZE));
      }

      let allResults: GeneratedTc[] = [];
      let allFeatureIdx: number[] = [];
      const warnings: string[] = [];
      for (let i = 0; i < nameBatches.length; i++) {
        setGenerateBasicProgress(`TC 생성 중... (${i + 1}/${nameBatches.length}배치)`);
        const result = await planAnalysisApi.generateBasicTc(designText, nameBatches[i]);
        if (result.testCases.length === 0 && result.warning) warnings.push(result.warning);
        const matchedFeatureIdx = idxBatches[i].slice(0, result.testCases.length);
        const tagged = result.testCases.map((tc, j) => {
          const fIdx = matchedFeatureIdx[j];
          const feature = fIdx !== undefined ? features[fIdx] : undefined;
          return {
            ...tc,
            source_category: 'basic_function' as const,
            source_snippet: feature ? `${feature.name}: ${feature.desc}` : nameBatches[i].join(', '),
          };
        });
        allResults = allResults.concat(tagged);
        allFeatureIdx = allFeatureIdx.concat(matchedFeatureIdx);
      }
      if (warnings.length > 0) {
        setError(`AI가 일부 항목의 TC를 만들지 못했습니다: ${warnings[0]}`);
      }

      setBasicTestCases(allResults);
      setBasicTcFeatureIdx(allFeatureIdx);
      setSelectedBasicTcIdx(new Set(allResults.map((_, idx) => idx)));
      setSaveBasicMessage('');
      persistState({ draftBasicTestCases: allResults, savedBasicTcIdx: [] });
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
          source_category: tc.source_category || null,
          source_snippet: tc.source_snippet || null,
        };
      });

      const result = await testCasesApi.bulkCreate(embeddedProjectId, itemsToSave);
      setSaveBasicMessage(`${result.created_count}개 TC가 Test Case 목록에 저장되었습니다.`);
      const updatedSavedBasicTcIdx = new Set([...savedBasicTcIdx, ...idxToSave]);
      setSavedBasicTcIdx(updatedSavedBasicTcIdx);
      persistState({ savedBasicTcIdx: Array.from(updatedSavedBasicTcIdx) });
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

  async function handleGetChecklist() {
    if (!projectType) return;
    if (!designText.trim()) {
      setError('화면설계서 내용이 없습니다. 파일을 업로드하거나 텍스트를 붙여넣어 주세요.');
      return;
    }
    setError('');
    setLoadingChecklist(true);
    try {
      const result = await planAnalysisApi.getChecklist(designText, projectType);
      // 재분석 시 충족↔누락 의심 상태가 바뀐 항목을 라벨 기준으로 찾아 "변경됨" 배지 데이터로 보관
      const prevByLabel = new Map(checklist.map((c) => [c.label, c]));
      const changes: Record<string, boolean> = {};
      result.items.forEach((item) => {
        const prev = prevByLabel.get(item.label);
        if (prev && prev.missing !== item.missing) changes[item.label] = prev.missing;
      });
      setChecklistChanges(changes);
      setChecklist(result.items);
      setSelectedGaps(new Set(result.items.filter((i) => i.missing).map((i) => i.label)));
      setSelectedSatisfied(new Set());
      persistState({ checklist: result.items });
    } catch (err: any) {
      setError(err.message || '체크리스트 생성 중 오류가 발생했습니다.');
    } finally {
      setLoadingChecklist(false);
    }
  }

  function toggleChecklistExpand(label: string) {
    setExpandedChecklist((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function toggleGap(label: string) {
    setSelectedGaps((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function toggleSatisfied(label: string) {
    setSelectedSatisfied((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function handleGenerateTc() {
    if (selectedGaps.size === 0 && selectedSatisfied.size === 0) {
      setError('TC를 생성할 항목을 하나 이상 선택해주세요.');
      return;
    }
    if (!designText.trim()) {
      setError('화면설계서 내용이 없습니다. TC는 화면설계서를 기준으로 생성됩니다.');
      return;
    }
    setError('');
    setGeneratingTc(true);
    try {
      const rulesToSend = rules.filter((_, idx) => selectedRuleIdx.has(idx));
      const gapList = Array.from(selectedGaps);
      const satisfiedItems = checklist
        .filter((i) => selectedSatisfied.has(i.label))
        .map((i) => ({ label: i.label, note: i.note }));

      const BATCH_SIZE = 5;
      const batches: string[][] = [];
      for (let i = 0; i < gapList.length; i += BATCH_SIZE) {
        batches.push(gapList.slice(i, i + BATCH_SIZE));
      }
      const satisfiedBatches: { label: string; note: string }[][] = [];
      for (let i = 0; i < satisfiedItems.length; i += BATCH_SIZE) {
        satisfiedBatches.push(satisfiedItems.slice(i, i + BATCH_SIZE));
      }
      const totalBatches = batches.length + satisfiedBatches.length;

      let newResults: GeneratedTc[] = [];
      let batchDone = 0;
      const warnings: string[] = [];
      for (let i = 0; i < batches.length; i++) {
        setGenerateProgress(`TC 생성 중... (${++batchDone}/${totalBatches}배치 · 누락 의심)`);
        // rulesToSend는 "이 프로젝트만의 특이 예외"를 누락 항목 TC에 반영하기 위한 참고 자료로 계속 전달
        // (정책 규칙 자체의 검증 TC는 별도로 "정책·제한사항 분석" 탭에서 생성됨)
        const result = await planAnalysisApi.generateTc(designText, projectType, batches[i], rulesToSend);
        if (result.testCases.length === 0 && result.warning) warnings.push(result.warning);
        newResults = newResults.concat(attributeSource(result.testCases, batches[i], 2, 'exception_gap', (label) => label));
      }
      for (let i = 0; i < satisfiedBatches.length; i++) {
        setGenerateProgress(`TC 생성 중... (${++batchDone}/${totalBatches}배치 · 충족 항목 검증)`);
        const result = await planAnalysisApi.generateSatisfiedTc(designText, satisfiedBatches[i]);
        if (result.testCases.length === 0 && result.warning) warnings.push(result.warning);
        newResults = newResults.concat(
          attributeSource(result.testCases, satisfiedBatches[i], 1, 'satisfied_check', (item) => `${item.label}${item.note ? ` (근거: ${item.note})` : ''}`)
        );
      }
      if (warnings.length > 0) {
        setError(`AI가 일부 항목의 TC를 만들지 못했습니다: ${warnings[0]}`);
      }

      // 다른 탭(정책·제한사항 분석/정합성 검수)에서 이미 생성해둔 TC가 있을 수 있으므로, 덮어쓰지 않고 뒤에 이어붙임.
      const startIdx = testCases.length;
      const updated = [...testCases, ...newResults];
      setTestCases(updated);
      setSelectedTcIdx((prev) => {
        const next = new Set(prev);
        for (let i = startIdx; i < updated.length; i++) next.add(i);
        return next;
      });
      setSaveMessage('');
      persistState({ draftTestCases: updated });
    } catch (err: any) {
      setError(err.message || 'TC 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingTc(false);
      setGenerateProgress('');
    }
  }

  // 정책·제한사항 분석 탭 전용 - 선택한 규칙만으로 검증 TC 생성 (다른 탭 결과는 건드리지 않고 이어붙임)
  async function handleGenerateRuleTc() {
    const rulesToSend = rules.filter((_, idx) => selectedRuleIdx.has(idx));
    if (rulesToSend.length === 0) {
      setError('TC를 생성할 규칙을 하나 이상 선택해주세요.');
      return;
    }
    if (!designText.trim()) {
      setError('화면설계서 내용이 없습니다. TC는 화면설계서를 기준으로 생성됩니다.');
      return;
    }
    setError('');
    setGeneratingRuleTc(true);
    try {
      const ruleItems = rulesToSend.map((r) => ({ label: r.summary, note: r.verify || r.risk }));
      const BATCH_SIZE = 5;
      const ruleBatches: { label: string; note: string }[][] = [];
      for (let i = 0; i < ruleItems.length; i += BATCH_SIZE) {
        ruleBatches.push(ruleItems.slice(i, i + BATCH_SIZE));
      }

      let newResults: GeneratedTc[] = [];
      const warnings: string[] = [];
      for (let i = 0; i < ruleBatches.length; i++) {
        setGenerateRuleProgress(`TC 생성 중... (${i + 1}/${ruleBatches.length}배치)`);
        const result = await planAnalysisApi.generateSatisfiedTc(designText, ruleBatches[i]);
        if (result.testCases.length === 0 && result.warning) warnings.push(result.warning);
        newResults = newResults.concat(
          attributeSource(result.testCases, ruleBatches[i], 1, 'policy_rule', (item) => `${item.label}${item.note ? ` (근거: ${item.note})` : ''}`)
        );
      }
      if (warnings.length > 0) {
        setError(`AI가 일부 규칙의 TC를 만들지 못했습니다: ${warnings[0]}`);
      }

      const startIdx = testCases.length;
      const updated = [...testCases, ...newResults];
      setTestCases(updated);
      setSelectedTcIdx((prev) => {
        const next = new Set(prev);
        for (let i = startIdx; i < updated.length; i++) next.add(i);
        return next;
      });
      setSaveRuleTcMessage('');
      persistState({ draftTestCases: updated });
    } catch (err: any) {
      setError(err.message || 'TC 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingRuleTc(false);
      setGenerateRuleProgress('');
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

  // categories를 넘기면 그 출처들의 TC만 저장 (탭별 저장 버튼용).
  // 안 넘기면 선택된 전체를 저장.
  async function handleSaveTestCases(categories?: GeneratedTc['source_category'][]) {
    const idxToSave = Array.from(selectedTcIdx).filter(
      (idx) => !savedTcIdx.has(idx) && (!categories || categories.includes(testCases[idx]?.source_category))
    );
    if (idxToSave.length === 0) return;

    const isRuleOnly = categories?.length === 1 && categories[0] === 'policy_rule';
    const setSavingFlag = isRuleOnly ? setSavingRuleTc : setSaving;
    const setMsg = isRuleOnly ? setSaveRuleTcMessage : setSaveMessage;

    setError('');
    setMsg('');
    setSavingFlag(true);
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
          source_category: tc.source_category || null,
          source_snippet: tc.source_snippet || null,
        };
      });

      const result = await testCasesApi.bulkCreate(embeddedProjectId, itemsToSave);
      setMsg(`${result.created_count}개 TC가 Test Case 목록에 저장되었습니다.`);
      const updatedSavedTcIdx = new Set([...savedTcIdx, ...idxToSave]);
      setSavedTcIdx(updatedSavedTcIdx);
      persistState({ savedTcIdx: Array.from(updatedSavedTcIdx) });
    } catch (err: any) {
      setError(err.message || 'TC 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingFlag(false);
    }
  }

  const groupedIssues: Record<ConsistencyIssue['category'], { issue: ConsistencyIssue; idx: number }[]> = {
    mismatch: [], internal_contradiction: [], no_basis: [],
  };
  issues.forEach((issue, idx) => groupedIssues[issue.category].push({ issue, idx }));

  const tabDone: Record<PlanAnalysisTab, boolean> = {
    type: !!projectType && typeConfirmed === true,
    rules: rules.length > 0,
    consistency: issues.length > 0,
    exception: checklist.length > 0,
    basic: basicTestCases.length > 0,
  };

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <h3 style={{ marginBottom: 16 }}>기획 자료 분석</h3>

      {error && (
        <div style={{ background: '#fdecea', color: '#a33', padding: '8px 12px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {restoringState && (
        <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>이전 분석 결과 불러오는 중... (완료될 때까지 업로드는 잠시 비활성화됩니다)</p>
      )}

      {/* 1. 요구사항 문서 업로드 (다중 업로드 가능) */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 600 }}>
          ① 요구사항 문서 업로드 (RFP / 사업수익계획서 / 요구사항 정의서 등 — 여러 개 선택 가능, PDF / PPTX / XLSX / TXT)
        </p>
        <input
          type="file"
          accept=".pdf,.pptx,.xlsx,.xls,.txt"
          multiple
          onChange={handleRequirementUpload}
          disabled={extractingRequirement || restoringState}
        />
        {extractingRequirement && <p style={{ fontSize: 12, color: '#888', marginTop: 6 }}>텍스트 추출 중...</p>}

        {requirementFiles.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {requirementFiles.map((f, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f7f7f8', borderRadius: 6, padding: '6px 10px', fontSize: 12.5 }}>
                <span>📄 {f.name} · {f.text.length}자</span>
                <button onClick={() => handleRemoveRequirementFile(idx)} style={{ fontSize: 12, color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer' }}>
                  제거
                </button>
              </div>
            ))}
          </div>
        )}

        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 12, color: '#888', cursor: 'pointer' }}>또는 텍스트 직접 붙여넣기로 추가</summary>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            style={{ width: '100%', marginTop: 8, fontSize: 13 }}
            placeholder="요구사항 문서 내용을 여기에 붙여넣으세요"
          />
          <button onClick={handleAddPastedText} disabled={!pasteText.trim()} style={{ marginTop: 6, fontSize: 12 }}>
            목록에 추가
          </button>
        </details>
      </div>

      {/* 3. 화면설계서 업로드 */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 600 }}>
          ② 화면설계서 업로드 (PDF / PPTX / XLSX / TXT)
        </p>
        <input
          type="file"
          accept=".pdf,.pptx,.xlsx,.xls,.txt"
          onChange={handleDesignUpload}
          disabled={extractingDesign || restoringState}
        />
        {designFileName && (
          <p style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
            {designFileName} {extractingDesign ? '- 텍스트 추출 중...' : `- ${designText.length}자 추출됨`}
          </p>
        )}
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 12, color: '#888', cursor: 'pointer' }}>또는 텍스트 직접 붙여넣기</summary>
          <textarea
            value={designText}
            onChange={(e) => setDesignText(e.target.value)}
            rows={6}
            style={{ width: '100%', marginTop: 8, fontSize: 13 }}
            placeholder="화면설계서 내용을 여기에 붙여넣으세요"
          />
        </details>
      </div>

      {/* 단계별 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid #e5e5e5', flexWrap: 'wrap' }}>
        {TAB_CONFIG.map((tab) => {
          const isActive = activeTab === tab.key;
          const done = tabDone[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                border: 'none',
                borderBottom: isActive ? '2px solid #333' : '2px solid transparent',
                background: 'none',
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#111' : '#777',
                cursor: 'pointer',
              }}
            >
              {tab.label}
              {done && <span style={{ marginLeft: 5, color: '#2a8f4d' }}>✓</span>}
            </button>
          );
        })}
      </div>

      {activeTab === 'type' && (
        <>
          {!(requirementText.trim()) && (
            <p style={{ fontSize: 13, color: '#c77700' }}>⚠ 먼저 위에서 요구사항 문서를 업로드해주세요.</p>
          )}
        {/* 2. 프로젝트 유형 판별 (요구사항 문서 기준) */}
  <div style={{ marginBottom: 16 }}>
    <button onClick={() => { handleClassify(); setTypeConfirmed(null); setEditingType(false); }} disabled={classifying || !requirementText.trim()}>
      {classifying ? '판별 중...' : '프로젝트 유형 판별'}
    </button>
    {projectType && (
      <div style={{ marginTop: 10, background: '#f5f5f5', borderRadius: 8, padding: 12 }}>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 4px' }}>프로젝트명</p>
        {!editingServiceName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <p style={{ fontWeight: 600, fontSize: 16, margin: 0, color: serviceName ? '#111' : '#999' }}>
              {serviceName || '(자동으로 찾지 못했어요 — 직접 입력해주세요)'}
            </p>
            <button
              onClick={() => { setManualServiceNameInput(serviceName); setEditingServiceName(true); }}
              style={{ fontSize: 11, padding: '2px 8px' }}
            >
              수정
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              value={manualServiceNameInput}
              onChange={(e) => setManualServiceNameInput(e.target.value)}
              placeholder="프로젝트명을 입력하세요 (예: 아모레퍼시픽 뷰티포인트 공식몰)"
              style={{ fontSize: 14, padding: '4px 8px', flex: 1 }}
            />
            <button
              onClick={() => {
                const trimmed = manualServiceNameInput.trim();
                setServiceName(trimmed);
                setEditingServiceName(false);
                persistState({ serviceName: trimmed });
              }}
              style={{ fontSize: 12, padding: '2px 10px' }}
            >
              적용
            </button>
            <button onClick={() => setEditingServiceName(false)} style={{ fontSize: 12, padding: '2px 10px' }}>
              취소
            </button>
          </div>
        )}
        <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>유형: {projectType} · {reason}</p>

        {typeConfirmed === null && !editingType && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>이 유형이 맞나요?</span>
            <button onClick={() => setTypeConfirmed(true)} style={{ fontSize: 12, padding: '2px 10px' }}>예</button>
            <button onClick={() => setEditingType(true)} style={{ fontSize: 12, padding: '2px 10px' }}>아니오, 직접 입력</button>
          </div>
        )}

        {editingType && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <input
              value={manualTypeInput}
              onChange={(e) => setManualTypeInput(e.target.value)}
              placeholder="정확한 유형을 입력하세요"
              style={{ fontSize: 13, padding: '4px 8px' }}
            />
            <button
              onClick={() => {
                setProjectType(manualTypeInput.trim());
                setTypeConfirmed(true);
                setEditingType(false);
                persistState({ projectType: manualTypeInput.trim() });
              }}
              disabled={!manualTypeInput.trim()}
              style={{ fontSize: 12, padding: '2px 10px' }}
            >
              적용
            </button>
          </div>
        )}

        {typeConfirmed === true && (
          <p style={{ fontSize: 12, color: '#2a8f4d', marginTop: 6 }}>✓ 확인 완료</p>
        )}
      </div>
    )}
  </div>
        </>
      )}

      {activeTab === 'rules' && (
        <>
          {!(requirementText.trim()) && (
            <p style={{ fontSize: 13, color: '#c77700' }}>⚠ 먼저 위에서 요구사항 문서를 업로드해주세요.</p>
          )}
        {requirementText.trim() && (
          <div style={{ marginBottom: 16, fontSize: 12.5, color: '#555', background: '#f0f5fa', border: '1px solid #dde6ee', borderRadius: 6, padding: '10px 12px', lineHeight: 1.6 }}>
            <b>② 정책·제한사항 분석</b> → 이 프로젝트만의 특이 규칙을 찾아 검증 TC 생성. 생성된 TC는 이 탭 안에서 바로 확인·저장할 수 있어요.
          </div>
        )}
        {/* 2.5. 기획서 정책·제한사항 분석 (요구사항 문서 기준) */}
        {requirementText.trim() && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={handleExtractRules} disabled={extractingRules}>
              {extractingRules ? '분석 중...' : '요구사항 정책·제한사항 분석'}
            </button>
            <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>
              요구사항 문서에만 있는 구체적인 조건·숫자·예외 규정을 찾아냅니다. "👍 맞음"으로 확인한 항목이 화면설계서가 이 규정대로 동작하는지 검증하는 TC로 만들어집니다.
            </p>
            {rules.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 8px' }}>
                <span style={{ fontSize: 12, color: '#888' }}>빠른 선택:</span>
                <button onClick={handleSelectAllRulesCorrect} style={{ fontSize: 12, padding: '2px 8px' }}>
                  맞음 전체 선택
                </button>
                <button onClick={() => setSelectedRuleIdx(new Set(rules.map((_, idx) => idx)))} style={{ fontSize: 12, padding: '2px 8px' }}>
                  전체 선택
                </button>
                <button onClick={() => setSelectedRuleIdx(new Set())} style={{ fontSize: 12, padding: '2px 8px' }}>
                  전체 해제
                </button>
              </div>
            )}
            {rules.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rules.map((r, idx) => {
                  const isIncorrect = r.confirmed === 'incorrect';
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                        border: `1px solid ${isIncorrect ? '#e0e0e0' : '#e8dff5'}`,
                        background: isIncorrect ? '#f4f4f4' : '#faf7ff',
                        borderRadius: 6, padding: '8px 12px', fontSize: 13,
                        opacity: isIncorrect ? 0.6 : 1,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 500, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {r.summary}
                          {r.needsReview && (
                            <span style={{ background: '#fdf1e0', color: '#c77700', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
                              ⚠ 재검토 필요
                            </span>
                          )}
                        </p>
                        {isIncorrect ? (
                          <>
                            <p style={{ color: '#c0392b', margin: '4px 0 0', fontSize: 12 }}>
                              👎 틀림으로 표시됨 — TC 생성 대상에서 자동으로 제외됐어요. 판단이 바뀌었다면 "틀림" 버튼을 다시 눌러 원래 내용을 확인하세요.
                            </p>
                            <input
                              value={r.reasonNote || ''}
                              onChange={(e) => setRuleReasonNote(idx, e.target.value)}
                              onBlur={persistRuleReasonNote}
                              placeholder="틀리다고 판단한 사유를 남겨주세요"
                              style={{ width: '100%', fontSize: 12, padding: '4px 8px', marginTop: 6, boxSizing: 'border-box' }}
                            />
                          </>
                        ) : (
                          <>
                            <p style={{ color: '#888', margin: '4px 0 0', fontSize: 12 }}>근거: {r.source}</p>
                            <p style={{ color: '#a35ec2', margin: '4px 0 0', fontSize: 12 }}>파생 위험: {r.risk}</p>
                            {r.verify && (
                              <p style={{ color: '#2a6f8f', margin: '4px 0 0', fontSize: 12 }}>확인해야 할 것: {r.verify}</p>
                            )}
                          </>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                         <button
                           onClick={() => setRuleConfirmed(idx, r.confirmed === 'correct' ? null : 'correct')}
                           style={{ fontSize: 11, padding: '2px 8px', background: r.confirmed === 'correct' ? '#2a8f4d' : '#fff', color: r.confirmed === 'correct' ? '#fff' : '#333' }}
                         >
                         👍 맞음
                         </button>
                         <button
                           onClick={() => setRuleConfirmed(idx, isIncorrect ? null : 'incorrect')}
                           style={{ fontSize: 11, padding: '2px 8px', background: isIncorrect ? '#c0392b' : '#fff', color: isIncorrect ? '#fff' : '#333' }}
                          >
                         👎 틀림
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {rules.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed #ddd' }}>
                <button onClick={handleGenerateRuleTc} disabled={generatingRuleTc || selectedRuleIdx.size === 0}>
                  {generatingRuleTc ? (generateRuleProgress || 'TC 생성 중...') : `선택한 ${selectedRuleIdx.size}개 규칙으로 TC 생성`}
                </button>
                {error && (
                  <div style={{ background: '#fdecea', color: '#a33', padding: '8px 12px', borderRadius: 6, marginTop: 10, fontSize: 13 }}>
                    {error}
                  </div>
                )}

                {(() => {
                  const ruleTcEntries = testCases
                    .map((tc, idx) => ({ tc, idx }))
                    .filter(({ tc }) => tc.source_category === 'policy_rule');
                  if (ruleTcEntries.length === 0) return null;
                  const unsavedCount = ruleTcEntries.filter(({ idx }) => selectedTcIdx.has(idx) && !savedTcIdx.has(idx)).length;
                  return (
                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => handleSaveTestCases(['policy_rule'])} disabled={savingRuleTc || unsavedCount === 0}>
                          {savingRuleTc ? '저장 중...' : `선택한 ${unsavedCount}개를 Test Case에 저장`}
                        </button>
                        {saveRuleTcMessage && <span style={{ fontSize: 13, color: '#2a8f4d' }}>{saveRuleTcMessage}</span>}
                      </div>
                      {ruleTcEntries.map(({ tc, idx }) => {
                        const stepLines = tc.steps.split('\n').filter(Boolean);
                        const isSaved = savedTcIdx.has(idx);
                        return (
                          <div key={idx} style={{ border: '1px solid #ddd', borderRadius: 8, padding: '16px 18px', background: isSaved ? '#f7f7f7' : '#fff', display: 'flex', gap: 12, opacity: isSaved ? 0.7 : 1 }}>
                            <input type="checkbox" checked={selectedTcIdx.has(idx)} onChange={() => toggleTc(idx)} disabled={isSaved} style={{ marginTop: 4 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ marginBottom: 12 }}>
                                <span style={{ background: '#fdf1e0', color: '#c77700', fontSize: 12, padding: '3px 10px', borderRadius: 4, marginRight: 8 }}>{tc.priority}</span>
                                {tc.source_category && (
                                  <span style={{ background: '#f2f2f2', color: SOURCE_CATEGORY_META[tc.source_category].color, fontSize: 11.5, padding: '3px 10px', borderRadius: 4, marginRight: 8 }}>
                                    {SOURCE_CATEGORY_META[tc.source_category].label}
                                  </span>
                                )}
                                {isSaved && <span style={{ background: '#eee', color: '#888', fontSize: 12, padding: '3px 10px', borderRadius: 4, marginRight: 8 }}>저장됨</span>}
                                <span style={{ fontSize: 15, fontWeight: 600 }}>{tc.title}</span>
                              </div>
                              {tc.source_snippet && (
                                <p style={{ fontSize: 12, color: '#888', margin: '0 0 10px', background: '#fafafa', border: '1px solid #eee', borderRadius: 4, padding: '6px 10px' }}>
                                  📎 근거: {tc.source_snippet}
                                </p>
                              )}
                              <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>사전조건</p>
                              <p style={{ fontSize: 14, color: '#333', margin: '0 0 14px' }}>{tc.precondition}</p>
                              <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>테스트 절차</p>
                              <div style={{ fontSize: 14, color: '#333', margin: '0 0 14px', lineHeight: 1.8 }}>
                                {stepLines.map((line, i) => (<div key={i}>{line}</div>))}
                              </div>
                              <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>기대 결과</p>
                              <p style={{ fontSize: 14, color: '#333', margin: 0 }}>{tc.expected_result}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
        </>
      )}

      {activeTab === 'consistency' && (
        <>
          {!(designText.trim()) && (
            <p style={{ fontSize: 13, color: '#c77700' }}>⚠ 먼저 위에서 화면설계서를 업로드해주세요.</p>
          )}
        {/* 안내 - 이 탭에서 할 수 있는 것 */}
        {designText.trim() && (
          <div style={{ marginBottom: 16, fontSize: 12.5, color: '#555', background: '#f0f5fa', border: '1px solid #dde6ee', borderRadius: 6, padding: '10px 12px', lineHeight: 1.6 }}>
            <b>③ 정합성 검수</b> → 요구사항 문서와 화면설계서를 비교해서 값 불일치/문서 내부 모순/근거 없는 항목을 찾아 검증 TC 생성. 생성된 TC는 이 탭 안에서 바로 확인·저장할 수 있어요.
          </div>
        )}

        {/* 4. 정합성 검수 */}
        {designText.trim() && (
          <div style={{ marginBottom: 20, border: '1px solid #eee', borderRadius: 8, padding: 16 }}>
            <p style={{ fontWeight: 600, margin: '0 0 4px' }}>요구사항 - 화면설계서 정합성 검수</p>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 10px' }}>
              요구사항 문서와 화면설계서를 비교해서 값 불일치, 문서 내부 모순, 근거 없는 항목을 찾아줍니다.
            </p>
            <button onClick={handleCheckConsistency} disabled={checkingConsistency || !requirementText.trim()}>
              {checkingConsistency ? '검수 중... (시간이 걸릴 수 있어요)' : '정합성 검수 실행'}
            </button>

            {issues.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
                    발견된 이슈 {issues.length}건 · 확정 필요 {issues.filter((i) => !i.confirmedValue?.trim()).length}건 · 확정 완료 {issues.filter((i) => i.confirmedValue?.trim()).length}건
                  </p>
                  <button onClick={handleExportIssuesExcel} style={{ fontSize: 12, padding: '4px 10px' }}>
                    📥 엑셀로 다운로드
                  </button>
                </div>
                {(['mismatch', 'internal_contradiction', 'no_basis'] as const).map((cat) => {
                  const items = groupedIssues[cat];
                  if (items.length === 0) return null;
                  const meta = CATEGORY_META[cat];
                  return (
                    <div key={cat} style={{ marginBottom: 20 }}>
                      <div style={{ marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{meta.icon} {meta.label} ({items.length}건)</span>
                        <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>{meta.desc}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {items.map(({ issue, idx }) => (
                          <div
                            key={idx}
                            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: `1px solid ${meta.color}`, borderRadius: 8, padding: 14 }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{issue.title}</div>
                              <div style={{ fontSize: 13, color: '#333', marginBottom: 8, background: '#f7f7f8', padding: '8px 10px', borderRadius: 6 }}>
                                ❓ {issue.question}
                              </div>
                              <div style={{ fontSize: 12.5, color: '#555', marginBottom: 3 }}>
                                <b>요구사항</b>: {issue.reqContent || '명시 없음'}
                              </div>
                              <div style={{ fontSize: 12.5, color: '#555', marginBottom: 3 }}>
                                <b>화면설계서</b>: {issue.designContent}
                              </div>
                              <div style={{ fontSize: 11.5, color: '#999', marginBottom: 8 }}>위치: {issue.location}</div>

                              <p style={{ fontSize: 12, color: '#888', margin: '0 0 4px' }}>확정값 입력</p>
                              <input
                                value={issue.confirmedValue || ''}
                                onChange={(e) => updateIssueConfirmedValue(idx, e.target.value)}
                                onBlur={persistIssueConfirmedValue}
                                placeholder="실제 확정된 값을 입력하세요"
                                style={{ width: '100%', fontSize: 13, padding: '6px 8px', boxSizing: 'border-box' }}
                              />
                              <p style={{ fontSize: 11, color: '#c77700', margin: '4px 0 0' }}>
                                ⚠️ 이 확정값은 이 화면에만 기록되며, 요구사항 문서나 화면설계서 원본을 자동으로 바꾸지 않습니다. 원본 문서를 다시 확인하여 업데이트해주세요.
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {resolvedIssues.length > 0 && (
              <details style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed #ddd' }}>
                <summary style={{ fontSize: 13, color: '#2a8f4d', cursor: 'pointer', fontWeight: 600 }}>
                  ✅ 해결됨 ({resolvedIssues.length}건) — 이전 검수에는 있었지만 이번엔 발견되지 않은 이슈
                </summary>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {resolvedIssues.map((issue, idx) => (
                    <div key={idx} style={{ border: '1px solid #d8ecd8', background: '#f6fbf6', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, color: '#555' }}>
                      {issue.title}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
        </>
      )}

      {activeTab === 'exception' && (
        <>
          {!(projectType && designText.trim()) && (
            <p style={{ fontSize: 13, color: '#c77700' }}>⚠ 먼저 "유형 인지" 탭에서 프로젝트 유형을 판별하고, 화면설계서를 업로드해주세요.</p>
          )}
        {projectType && designText.trim() && (
          <div style={{ marginBottom: 16, fontSize: 12.5, color: '#555', background: '#f0f5fa', border: '1px solid #dde6ee', borderRadius: 6, padding: '10px 12px', lineHeight: 1.6 }}>
            <b>④ 예외 케이스</b> → 이 프로젝트라면 보통 챙겨야 할 예외 항목 중, 화면설계서에 없는 것(누락 의심)과 이미 명시된 항목(충족)이 실제로 지켜지는지 찾아 TC 생성. 생성된 TC는 이 탭 안에서 바로 확인·저장할 수 있어요.
          </div>
        )}
        {/* 6. 예외 케이스 점검 리스트 (화면설계서 기준) */}
        {projectType && designText.trim() && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={handleGetChecklist} disabled={loadingChecklist}>
              {loadingChecklist ? '점검 중...' : '예외 케이스 점검 리스트 생성'}
            </button>
            <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>
              이 프로젝트라면 일반적으로 요구되는 항목 중, 화면설계서에 명시되지 않은 것을 찾아냅니다. 체크한 항목은 아래 TC 생성 시 반영됩니다.
            </p>

            {checklist.length > 0 && (
              <>
                <div style={{ marginTop: 12, marginBottom: 8, fontSize: 12, color: '#888', background: '#fafafa', border: '1px solid #eee', borderRadius: 6, padding: '8px 12px' }}>
                  <b>충족</b> = 화면설계서에 명시됨 (체크하면 "문서대로 실제 동작하는지" 검증하는 TC 생성) · <b>누락 의심</b> = 체크리스트 기준으로 봤을 때 화면설계서에 언급이 없어 TC 생성 대상 (각 항목의 "근거 보기"를 눌러 판단 근거를 확인할 수 있습니다)
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

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#888' }}>빠른 선택 (충족 항목 검증 — 문서대로 실제 동작하는지 확인):</span>
                  <button
                    onClick={() => setSelectedSatisfied(new Set(checklist.filter((i) => !i.missing).map((i) => i.label)))}
                    style={{ fontSize: 12, padding: '2px 8px' }}
                  >
                    전체 선택
                  </button>
                  <button
                    onClick={() => setSelectedSatisfied(new Set())}
                    style={{ fontSize: 12, padding: '2px 8px' }}
                  >
                    전체 해제
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {checklist.map((item) => {
                    const isExpanded = expandedChecklist.has(item.label);
                    const prevMissing = checklistChanges[item.label];
                    const changed = prevMissing !== undefined;
                    return (
                      <div key={item.label} style={{ border: '1px solid #eee', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {item.missing ? (
                              <input
                                type="checkbox"
                                checked={selectedGaps.has(item.label)}
                                onChange={() => toggleGap(item.label)}
                              />
                            ) : (
                              <input
                                type="checkbox"
                                checked={selectedSatisfied.has(item.label)}
                                onChange={() => toggleSatisfied(item.label)}
                              />
                            )}
                            {item.label}
                            {changed && (
                              <span style={{ background: '#fdf1e0', color: '#c77700', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
                                변경됨: 이전 {prevMissing ? '누락 의심' : '충족'} → 현재 {item.missing ? '누락 의심' : '충족'}
                              </span>
                            )}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ color: item.missing ? '#c77700' : '#2a8f4d', fontSize: 12 }}>
                              {item.status}
                            </span>
                            <button
                              onClick={(e) => { e.preventDefault(); toggleChecklistExpand(item.label); }}
                              style={{ fontSize: 11, padding: '2px 8px' }}
                            >
                              {isExpanded ? '근거 접기' : '근거 보기'}
                            </button>
                          </span>
                        </label>
                        {isExpanded && (
                          <p style={{ fontSize: 12, color: '#666', margin: '8px 0 0', paddingTop: 8, borderTop: '1px dashed #eee' }}>
                            {item.note}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
        {/* 7. TC 생성 (예외 케이스: 누락 의심 + 충족 항목) */}
        {checklist.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {rules.length === 0 && (
              <p style={{ fontSize: 12, color: '#c77700', marginBottom: 6 }}>
                ⚠ 아직 "요구사항 정책·제한사항 분석"을 하지 않았어요. 먼저 분석하면 이 프로젝트만의 특이 예외가 TC에 반영돼서 퀄리티가 더 좋아져요.
              </p>
            )}
            <button
              onClick={handleGenerateTc}
              disabled={generatingTc || (selectedGaps.size === 0 && selectedSatisfied.size === 0)}
            >
              {generatingTc
                ? (generateProgress || 'TC 생성 중...')
                : `선택한 ${selectedGaps.size + selectedSatisfied.size}개 항목으로 TC 생성`}
            </button>
            {error && (
              <div style={{ background: '#fdecea', color: '#a33', padding: '8px 12px', borderRadius: 6, marginTop: 10, fontSize: 13 }}>
                {error}
              </div>
            )}
          </div>
        )}
        {(() => {
          const gapCheckEntries = testCases
            .map((tc, idx) => ({ tc, idx }))
            .filter(({ tc }) => tc.source_category === 'exception_gap' || tc.source_category === 'satisfied_check');
          if (gapCheckEntries.length === 0) return null;
          const unsavedCount = gapCheckEntries.filter(({ idx }) => selectedTcIdx.has(idx) && !savedTcIdx.has(idx)).length;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <button
                  onClick={() => handleSaveTestCases(['exception_gap', 'satisfied_check'])}
                  disabled={saving || unsavedCount === 0}
                >
                  {saving ? '저장 중...' : `선택한 ${unsavedCount}개를 Test Case에 저장`}
                </button>
                {saveMessage && <span style={{ fontSize: 13, color: '#2a8f4d' }}>{saveMessage}</span>}
              </div>

              {gapCheckEntries.map(({ tc, idx }) => {
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
                      {tc.source_category && (
                        <span style={{ background: '#f2f2f2', color: SOURCE_CATEGORY_META[tc.source_category].color, fontSize: 11.5, padding: '3px 10px', borderRadius: 4, marginRight: 8 }}>
                          {SOURCE_CATEGORY_META[tc.source_category].label}
                        </span>
                      )}
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{tc.title}</span>
                    </div>
                    {tc.source_snippet && (
                      <p style={{ fontSize: 12, color: '#888', margin: '0 0 10px', background: '#fafafa', border: '1px solid #eee', borderRadius: 4, padding: '6px 10px' }}>
                        📎 근거: {tc.source_snippet}
                      </p>
                    )}
                    <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>사전조건</p>
                    <p style={{ fontSize: 14, color: '#333', margin: '0 0 14px' }}>{tc.precondition}</p>
                    <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>테스트 절차</p>
                    <div style={{ fontSize: 14, color: '#333', margin: '0 0 14px', lineHeight: 1.8 }}>
                      {stepLines.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                    <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>기대 결과</p>
                    <p style={{ fontSize: 14, color: '#333', margin: 0 }}>{tc.expected_result}</p>
                  </div>
                </div>
              );
            })}
          </div>
          );
        })()}
        </>
      )}

      {activeTab === 'basic' && (
        <>
          {!(designText.trim()) && (
            <p style={{ fontSize: 13, color: '#c77700' }}>⚠ 먼저 위에서 화면설계서를 업로드해주세요.</p>
          )}
        {designText.trim() && (
          <div style={{ marginBottom: 16, fontSize: 12.5, color: '#555', background: '#f0f5fa', border: '1px solid #dde6ee', borderRadius: 6, padding: '10px 12px', lineHeight: 1.6 }}>
            <b>⑤ 기본 기능 TC</b> → 화면설계서에 정의된 기능이 정상적으로 동작하는지 확인하는 TC (독립 실행). 생성된 TC는 이 탭 안에서 바로 확인·저장할 수 있어요.
          </div>
        )}
        {/* 5. 기본 기능(정상 케이스) TC 생성 - 화면설계서 기준, 독립 실행 */}
        {designText.trim() && (
          <div style={{ marginBottom: 20, border: '1px solid #d8ecd8', background: '#f6fbf6', borderRadius: 8, padding: 16 }}>
            <p style={{ fontWeight: 600, margin: '0 0 4px' }}>기본 기능(정상 케이스) TC 생성</p>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 10px' }}>
              화면설계서에 정의된 기능들이 "정상적으로 잘 동작하는지" 확인하는 TC를 만듭니다. 예외/에러 상황은 다루지 않아요.
            </p>

            <button onClick={handleExtractFeatures} disabled={extractingFeatures || !designText.trim() || features.length > 0}>
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
                  {error && (
                    <div style={{ background: '#fdecea', color: '#a33', padding: '8px 12px', borderRadius: 6, marginTop: 10, fontSize: 13 }}>
                      {error}
                    </div>
                  )}
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
                        {tc.source_snippet && (
                          <p style={{ fontSize: 12, color: '#888', margin: '0 0 10px', background: '#fafafa', border: '1px solid #eee', borderRadius: 4, padding: '6px 10px' }}>
                            📎 대상 기능: {tc.source_snippet}
                          </p>
                        )}
                        <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>사전조건</p>
                        <p style={{ fontSize: 14, color: '#333', margin: '0 0 14px' }}>{tc.precondition}</p>
                        <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>테스트 절차</p>
                        <div style={{ fontSize: 14, color: '#333', margin: '0 0 14px', lineHeight: 1.8 }}>
                          {stepLines.map((line, i) => (
                            <div key={i}>{line}</div>
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
        )}
        </>
      )}
    </div>
  );
}
