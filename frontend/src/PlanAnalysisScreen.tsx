import { useEffect, useMemo, useState } from 'react';
import { planAnalysisApi, testCasesApi } from './api';
import { extractFileText } from './fileExtract';

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
}

interface ConsistencyIssue {
  category: 'mismatch' | 'internal_contradiction' | 'no_basis';
  categoryLabel: string;
  title: string;
  reqContent: string;
  designContent: string;
  location: string;
  question: string;
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

  const [extractingRules, setExtractingRules] = useState(false);
  const [rules, setRules] = useState<{ summary: string; source: string; risk: string; verify: string }[]>([]);
  const [selectedRuleIdx, setSelectedRuleIdx] = useState<Set<number>>(new Set());

  // --- 섹션 2: 화면설계서 ---
  const [designText, setDesignText] = useState('');
  const [designFileName, setDesignFileName] = useState('');
  const [extractingDesign, setExtractingDesign] = useState(false);

  // --- 정합성 검수 (요구사항 vs 화면설계서) ---
  const [checkingConsistency, setCheckingConsistency] = useState(false);
  const [issues, setIssues] = useState<ConsistencyIssue[]>([]);
  const [selectedIssueIdx, setSelectedIssueIdx] = useState<Set<number>>(new Set());

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

  // --- TC 생성 (통합: 누락의심 + 충족항목 + 정책규칙 + 정합성검수 이슈) ---
  const [generatingTc, setGeneratingTc] = useState(false);
  const [generateProgress, setGenerateProgress] = useState('');
  const [testCases, setTestCases] = useState<GeneratedTc[]>([]);
  const [selectedTcIdx, setSelectedTcIdx] = useState<Set<number>>(new Set());
  const [savedTcIdx, setSavedTcIdx] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const [error, setError] = useState('');
  const [restoringState, setRestoringState] = useState(true);

  // 프로젝트를 열 때 이전에 저장해둔 분석 상태를 복구.
  // TC 초안이나 체크박스 선택 상태는 의도적으로 복구 대상에서 제외 (저장 전 임시값이라 큰 의미 없음).
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
  }> = {}) {
    planAnalysisApi.saveState(embeddedProjectId, {
      requirementFiles,
      designText, designFileName,
      projectType, reason, serviceName, rules, checklist, features,
      consistencyIssues: issues,
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
    setSelectedIssueIdx(new Set());
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
      });
    } catch (err) {
      console.error(err);
      setError('요구사항 문서 텍스트 추출 중 오류가 발생했습니다. (PDF/PPTX/XLSX/TXT만 지원)');
    } finally {
      setExtractingRequirement(false);
      e.target.value = ''; // 같은 파일을 다시 선택해도 onChange가 또 발생하도록 초기화
    }
  }

  function handleRemoveRequirementFile(idx: number) {
    const updatedFiles = requirementFiles.filter((_, i) => i !== idx);
    setRequirementFiles(updatedFiles);
    resetDownstreamAfterRequirementChange();
    persistState({
      requirementFiles: updatedFiles,
      projectType: '', reason: '', serviceName: '',
      rules: [], checklist: [], features: [], consistencyIssues: [],
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
      setSelectedIssueIdx(new Set());
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
      setRules(result.rules);
      setSelectedRuleIdx(new Set(result.rules.map((_, idx) => idx)));
      persistState({ rules: result.rules });
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

  async function handleCheckConsistency() {
    if (!requirementText.trim() || !designText.trim()) {
      setError('정합성 검수를 하려면 요구사항 문서와 화면설계서가 둘 다 필요합니다.');
      return;
    }
    setError('');
    setCheckingConsistency(true);
    setIssues([]);
    setSelectedIssueIdx(new Set());
    try {
      const result = await planAnalysisApi.checkConsistency(requirementFilesPayload, designText);
      setIssues(result.issues);
      // 기본값: "값 불일치"만 기본 선택 (제일 확실한 문제이므로), 나머지는 사람이 보고 선택
      const defaultSelected = new Set(
        result.issues.map((iss, idx) => (iss.category === 'mismatch' ? idx : -1)).filter((idx) => idx >= 0)
      );
      setSelectedIssueIdx(defaultSelected);
      persistState({ consistencyIssues: result.issues });
    } catch (err: any) {
      setError(err.message || '정합성 검수 중 오류가 발생했습니다.');
    } finally {
      setCheckingConsistency(false);
    }
  }

  function toggleIssue(idx: number) {
    setSelectedIssueIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
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
      for (let i = 0; i < nameBatches.length; i++) {
        setGenerateBasicProgress(`TC 생성 중... (${i + 1}/${nameBatches.length}배치)`);
        const result = await planAnalysisApi.generateBasicTc(designText, nameBatches[i]);
        allResults = allResults.concat(result.testCases);
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
    if (
      selectedGaps.size === 0 && selectedSatisfied.size === 0 &&
      selectedRuleIdx.size === 0 && selectedIssueIdx.size === 0
    ) {
      setError('TC를 생성할 항목을 하나 이상 선택해주세요.');
      return;
    }
    if (!designText.trim()) {
      setError('화면설계서 내용이 없습니다. TC는 화면설계서를 기준으로 생성됩니다.');
      return;
    }
    setError('');
    setGeneratingTc(true);
    setTestCases([]);
    try {
      const rulesToSend = rules.filter((_, idx) => selectedRuleIdx.has(idx));
      const gapList = Array.from(selectedGaps);
      const satisfiedItems = checklist
        .filter((i) => selectedSatisfied.has(i.label))
        .map((i) => ({ label: i.label, note: i.note }));
      // 규칙과 정합성 검수 이슈도 "충족 항목"과 동일한 방식(화면설계서가 실제로 맞게 동작하는지 검증)으로 처리.
      const ruleItems = rulesToSend.map((r) => ({ label: r.summary, note: r.verify || r.risk }));
      const issueItems = Array.from(selectedIssueIdx).map((idx) => ({ label: issues[idx].title, note: issues[idx].question }));

      const BATCH_SIZE = 5;
      const batches: string[][] = [];
      for (let i = 0; i < gapList.length; i += BATCH_SIZE) {
        batches.push(gapList.slice(i, i + BATCH_SIZE));
      }
      const satisfiedBatches: { label: string; note: string }[][] = [];
      for (let i = 0; i < satisfiedItems.length; i += BATCH_SIZE) {
        satisfiedBatches.push(satisfiedItems.slice(i, i + BATCH_SIZE));
      }
      const ruleBatches: { label: string; note: string }[][] = [];
      for (let i = 0; i < ruleItems.length; i += BATCH_SIZE) {
        ruleBatches.push(ruleItems.slice(i, i + BATCH_SIZE));
      }
      const issueBatches: { label: string; note: string }[][] = [];
      for (let i = 0; i < issueItems.length; i += BATCH_SIZE) {
        issueBatches.push(issueItems.slice(i, i + BATCH_SIZE));
      }
      const totalBatches = batches.length + satisfiedBatches.length + ruleBatches.length + issueBatches.length;

      let allResults: GeneratedTc[] = [];
      let batchDone = 0;
      for (let i = 0; i < batches.length; i++) {
        setGenerateProgress(`TC 생성 중... (${++batchDone}/${totalBatches}배치 · 누락 의심)`);
        const result = await planAnalysisApi.generateTc(designText, projectType, batches[i], rulesToSend);
        allResults = allResults.concat(result.testCases);
      }
      for (let i = 0; i < satisfiedBatches.length; i++) {
        setGenerateProgress(`TC 생성 중... (${++batchDone}/${totalBatches}배치 · 충족 항목 검증)`);
        const result = await planAnalysisApi.generateSatisfiedTc(designText, satisfiedBatches[i]);
        allResults = allResults.concat(result.testCases);
      }
      for (let i = 0; i < ruleBatches.length; i++) {
        setGenerateProgress(`TC 생성 중... (${++batchDone}/${totalBatches}배치 · 정책·제한사항 규칙 검증)`);
        const result = await planAnalysisApi.generateSatisfiedTc(designText, ruleBatches[i]);
        allResults = allResults.concat(result.testCases);
      }
      for (let i = 0; i < issueBatches.length; i++) {
        setGenerateProgress(`TC 생성 중... (${++batchDone}/${totalBatches}배치 · 정합성 검수 이슈 검증)`);
        const result = await planAnalysisApi.generateSatisfiedTc(designText, issueBatches[i]);
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

  const groupedIssues: Record<ConsistencyIssue['category'], { issue: ConsistencyIssue; idx: number }[]> = {
    mismatch: [], internal_contradiction: [], no_basis: [],
  };
  issues.forEach((issue, idx) => groupedIssues[issue.category].push({ issue, idx }));

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

      {/* 2. 프로젝트 유형 판별 (요구사항 문서 기준) */}
      <div style={{ marginBottom: 16 }}>
        <button onClick={handleClassify} disabled={classifying || !requirementText.trim()}>
          {classifying ? '판별 중...' : '프로젝트 유형 판별'}
        </button>
        {projectType && (
          <div style={{ marginTop: 10, background: '#f5f5f5', borderRadius: 8, padding: 12 }}>
            {serviceName && <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{serviceName}</p>}
            <p style={{ fontSize: 13, color: '#666' }}>{reason}</p>
          </div>
        )}
      </div>

      {/* 2.5. 기획서 정책·제한사항 분석 (요구사항 문서 기준) */}
      {requirementText.trim() && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={handleExtractRules} disabled={extractingRules}>
            {extractingRules ? '분석 중...' : '요구사항 정책·제한사항 분석'}
          </button>
          <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>
            요구사항 문서에만 있는 구체적인 조건·숫자·예외 규정을 찾아냅니다. 체크한 항목은 화면설계서가 이 규정대로 동작하는지 검증하는 TC로 만들어집니다.
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

      <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '24px 0' }} />

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

      {/* 3.5. 안내 박스 - 아래 기능들의 차이 설명 */}
      {designText.trim() && (
        <div style={{ marginBottom: 16, fontSize: 12, color: '#555', background: '#f0f5fa', border: '1px solid #dde6ee', borderRadius: 6, padding: '10px 12px', lineHeight: 1.7 }}>
          아래 세 기능은 서로 다른 결과를 만들어요, 순서 상관없이 <b>다 진행하시는 걸 추천</b>드려요.
          <br />
          <b>① 정합성 검수</b> → 요구사항 문서와 화면설계서를 비교해서 값 불일치/문서 내부 모순/근거 없는 항목을 찾아줌
          <br />
          <b>② 기본 기능(정상 케이스) TC 생성</b> → 화면설계서에 정의된 기능이 정상적으로 동작하는지 확인하는 TC
          <br />
          <b>③ 예외 케이스 점검 리스트 생성</b> → 이 프로젝트라면 보통 챙겨야 할 예외 항목 중, 화면설계서에 없는 것을 찾아줌
          <br />
          ①③에서 체크한 항목 + 위에서 체크한 정책 규칙이 모두 합쳐져서 <b>TC 생성</b>에 반영됩니다.
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
              <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                총 {issues.length}건 발견 · TC 생성 대상 선택 {selectedIssueIdx.size}건
              </p>
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
                        <label
                          key={idx}
                          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: `1px solid ${meta.color}`, borderRadius: 8, padding: 14, cursor: 'pointer' }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIssueIdx.has(idx)}
                            onChange={() => toggleIssue(idx)}
                            style={{ marginTop: 3 }}
                          />
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
                            <div style={{ fontSize: 11.5, color: '#999' }}>위치: {issue.location}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
                <b>충족</b> = 화면설계서에 명시됨 (체크하면 "문서대로 실제 동작하는지" 검증하는 TC 생성) · <b>누락 의심</b> = 체크리스트 기준으로 봤을 때 화면설계서에 언급이 없어 TC 생성 대상 (각 항목에 마우스를 올리면 판단 근거가 보입니다)
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
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

      {/* 7. TC 생성 (통합) */}
      {(checklist.length > 0 || rules.length > 0 || issues.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          {rules.length === 0 && (
            <p style={{ fontSize: 12, color: '#c77700', marginBottom: 6 }}>
              ⚠ 아직 "요구사항 정책·제한사항 분석"을 하지 않았어요. 먼저 분석하면 이 프로젝트만의 특이 예외가 TC에 반영돼서 퀄리티가 더 좋아져요.
            </p>
          )}
          <button
            onClick={handleGenerateTc}
            disabled={generatingTc || (selectedGaps.size === 0 && selectedSatisfied.size === 0 && selectedRuleIdx.size === 0 && selectedIssueIdx.size === 0)}
          >
            {generatingTc
              ? (generateProgress || 'TC 생성 중...')
              : `선택한 ${selectedGaps.size + selectedSatisfied.size + selectedRuleIdx.size + selectedIssueIdx.size}개 항목으로 TC 생성`}
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
