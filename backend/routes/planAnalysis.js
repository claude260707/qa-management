// backend/routes/planAnalysis.js (제안 경로)
const express = require('express');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../src/db');
const {
  buildPlanTextBlock,
  buildSkillMdBlock,
  buildTypeClassificationPrompt,
  parseTypeClassificationResult,
  buildRuleExtractionPrompt,
  parseRuleExtractionResult,
  buildFeatureExtractionPrompt,
  parseFeatureExtractionResult,
  buildBasicTcGenerationPrompt,
  buildRequirementChecklistPrompt,
  parseRequirementChecklistResult,
  buildTcGenerationPrompt,
  buildSatisfiedRuleVerificationPrompt,
  parseTcGenerationResult,
  buildRequirementDocBlock,
  buildDesignDocBlock,
  buildConsistencyCheckPrompt,
  buildRequirementDocBlockPerFile,
  parseConsistencyCheckResult,
} = require('../utils/planAnalysisPrompts');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 유형 -> 스킬 MD 파일 매핑 (필요시 파일 추가하면서 확장)
const SKILL_MAP = {
  '쇼핑몰': 'shopping-mall-tc-skill.md',
  '내부 관리 시스템': 'internal-system-tc-skill.md',
  '웹/게임 소개': 'website-tc-skill.md',
};

function loadSkillMd(type) {
  const filename = SKILL_MAP[type];
  if (!filename) return '';
  const filePath = path.join(__dirname, '..', 'skills', filename);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

// contentBlocks: messages[0].content로 그대로 들어갈 배열.
// 캐시 가능한 블록(기획서 원문, 스킬 MD)은 cache_control이 붙어서 앞쪽에 오고,
// 매번 달라지는 지시문 블록은 맨 뒤에 캐시 없이 붙는다.
// (Anthropic 캐싱은 "접두사" 단위로 동작하므로, 캐시 블록들의 순서/내용이
//  이전 호출과 동일해야 캐시가 적중한다 — 순서를 바꾸면 안 됨)

async function callClaude(contentBlocks, { model = 'claude-sonnet-5', maxTokens = 4000, label = '' } = {}) {
  const stream = await anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: contentBlocks }],
  });

  const res = await stream.finalMessage();

  console.log(`=== [${label}] stop_reason: ${res.stop_reason}, block_types: ${res.content.map((b) => b.type).join(',')}, usage: ${JSON.stringify(res.usage)} ===`);

  // max_tokens에 걸려 응답이 중간에 잘린 경우: 깨진 JSON을 그대로 파싱 시도하면
  // "결과가 비어있음/생성 안 됨"처럼 보이는 조용한 실패로 이어지므로, 여기서 바로 명확한 에러로 처리.
  if (res.stop_reason === 'max_tokens') {
    const err = new Error(
      `[${label}] 응답이 max_tokens(${maxTokens}) 한도에 걸려 중간에 잘렸습니다. maxTokens를 늘리거나 입력 범위를 줄여주세요.`
    );
    err.isTruncated = true;
    throw err;
  }

  return res.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

// 신규 - 독립 기능: 기획서에서 조작 가능한 기능 단위만 추출 (정책분석/체크리스트와 무관)
router.post('/extract-features', async (req, res) => {
  try {
    const { planText } = req.body;
    if (!planText) return res.status(400).json({ error: 'planText가 필요합니다.' });

    const blocks = [buildPlanTextBlock(planText), { type: 'text', text: buildFeatureExtractionPrompt() }];
    const raw = await callClaude(blocks, { label: 'extract-features' });
    const features = parseFeatureExtractionResult(raw);
    res.json({ features });
  } catch (err) {
    console.error('extract-features error:', err);
    res.status(500).json({ error: err.isTruncated ? err.message : '기능 목록 추출 중 오류가 발생했습니다.' });
  }
});

// 신규 - 독립 기능: 선택된 기능들에 대한 정상 케이스(happy path) TC 생성
router.post('/generate-basic-tc', async (req, res) => {
  try {
    const { planText, selectedFeatureNames } = req.body;
    if (!planText || !Array.isArray(selectedFeatureNames)) {
      return res.status(400).json({ error: 'planText, selectedFeatureNames(array)가 필요합니다.' });
    }

    const blocks = [buildPlanTextBlock(planText), { type: 'text', text: buildBasicTcGenerationPrompt(selectedFeatureNames) }];
    const raw = await callClaude(blocks, { maxTokens: 8000, label: 'generate-basic-tc' });
    const testCases = parseTcGenerationResult(raw);
    let warning;
    if (testCases.length === 0 && raw.length > 0) {
      // AI가 형식을 안 지켰거나(드묾), 근거 부족 등으로 TC 생성을 거부한 경우(자주 있음) 둘 다 여기 해당.
      // 조용히 빈 배열만 내려주면 사용자는 아무 반응이 없는 것처럼 보이므로, AI의 답변을 그대로 사용자에게 보여준다.
      console.warn(`[TC 파싱 0건] 응답 미리보기(앞 1500자):
${raw.slice(0, 1500)}`);
      warning = raw.slice(0, 800);
    }
    res.json({ testCases, warning });
  } catch (err) {
    console.error('generate-basic-tc error:', err);
    res.status(500).json({ error: err.isTruncated ? err.message : '기본 기능 TC 생성 중 오류가 발생했습니다.' });
  }
});

// 1단계: 유형 판별
router.post('/classify-type', async (req, res) => {
  try {
    const { planText } = req.body;
    if (!planText) return res.status(400).json({ error: 'planText가 필요합니다.' });

    const blocks = [buildPlanTextBlock(planText), { type: 'text', text: buildTypeClassificationPrompt() }];
    const raw = await callClaude(blocks, { model: 'claude-haiku-4-5', label: 'classify-type' });
    const result = parseTypeClassificationResult(raw);
    res.json(result);
  } catch (err) {
    console.error('classify-type error:', err);
    res.status(500).json({ error: err.isTruncated ? err.message : '유형 판별 중 오류가 발생했습니다.' });
  }
});

// 1.5단계: 이 프로젝트만의 비즈니스 규칙 추출
router.post('/extract-rules', async (req, res) => {
  try {
    const { planText } = req.body;
    if (!planText) return res.status(400).json({ error: 'planText가 필요합니다.' });

    const blocks = [buildPlanTextBlock(planText), { type: 'text', text: buildRuleExtractionPrompt() }];
    const raw = await callClaude(blocks, { maxTokens: 8000, label: 'extract-rules' });
    const rules = parseRuleExtractionResult(raw);
    res.json({ rules });
  } catch (err) {
    console.error('extract-rules error:', err);
    res.status(500).json({ error: err.isTruncated ? err.message : '규칙 추출 중 오류가 발생했습니다.' });
  }
});

// 2단계: 요구사항 체크리스트 (유형 판별 이후 호출)
router.post('/checklist', async (req, res) => {
  try {
    const { planText, projectType } = req.body;
    if (!planText || !projectType) {
      return res.status(400).json({ error: 'planText와 projectType이 필요합니다.' });
    }

    const skillMd = loadSkillMd(projectType);
    // 캐시 브레이크포인트 순서: [기획서(캐시)] -> [체크리스트(캐시)] -> [지시문(매번 새로 계산)]
    // generate-tc 호출도 같은 순서/내용의 기획서+체크리스트 블록을 쓰므로, 같은 세션이면 캐시가 이어서 적중한다.
    const blocks = [buildPlanTextBlock(planText)];
    if (skillMd) blocks.push(buildSkillMdBlock(skillMd));
    blocks.push({ type: 'text', text: buildRequirementChecklistPrompt() });
    const raw = await callClaude(blocks, { maxTokens: 8000, label: 'checklist' });
    const items = parseRequirementChecklistResult(raw);
    res.json({ items });
  } catch (err) {
    console.error('checklist error:', err);
    res.status(500).json({ error: err.isTruncated ? err.message : '체크리스트 생성 중 오류가 발생했습니다.' });
  }
});

// 3단계: 선택된 누락 항목으로 TC 생성
router.post('/generate-tc', async (req, res) => {
  try {
    const { planText, projectType, selectedGapLabels } = req.body;
    if (!planText || !projectType || !Array.isArray(selectedGapLabels)) {
      return res.status(400).json({
        error: 'planText, projectType, selectedGapLabels(array)가 필요합니다.',
      });
    }

    const skillMd = loadSkillMd(projectType);
    const blocks = [buildPlanTextBlock(planText)];
    if (skillMd) blocks.push(buildSkillMdBlock(skillMd));
    blocks.push({ type: 'text', text: buildTcGenerationPrompt(selectedGapLabels) });
    const raw = await callClaude(blocks, { maxTokens: 8000, label: 'generate-tc' });
    const testCases = parseTcGenerationResult(raw);
    let warning;
    if (testCases.length === 0 && raw.length > 0) {
      // AI가 형식을 안 지켰거나(드묾), 근거 부족 등으로 TC 생성을 거부한 경우(자주 있음) 둘 다 여기 해당.
      // 조용히 빈 배열만 내려주면 사용자는 아무 반응이 없는 것처럼 보이므로, AI의 답변을 그대로 사용자에게 보여준다.
      console.warn(`[TC 파싱 0건] 응답 미리보기(앞 1500자):
${raw.slice(0, 1500)}`);
      warning = raw.slice(0, 800);
    }
    res.json({ testCases, warning });
  } catch (err) {
    console.error('generate-tc error:', err);
    res.status(500).json({ error: err.isTruncated ? err.message : 'TC 생성 중 오류가 발생했습니다.' });
  }
});

// 신규 - 체크리스트에서 "충족"으로 판정된 항목이 문서대로 실제 동작하는지 검증하는 TC 생성
router.post('/generate-satisfied-tc', async (req, res) => {
  try {
    const { planText, selectedItems } = req.body;
    if (!planText || !Array.isArray(selectedItems) || selectedItems.length === 0) {
      return res.status(400).json({ error: 'planText, selectedItems(array)가 필요합니다.' });
    }

    const blocks = [buildPlanTextBlock(planText), { type: 'text', text: buildSatisfiedRuleVerificationPrompt(selectedItems) }];
    const raw = await callClaude(blocks, { maxTokens: 8000, label: 'generate-satisfied-tc' });
    const testCases = parseTcGenerationResult(raw);
    let warning;
    if (testCases.length === 0 && raw.length > 0) {
      // AI가 형식을 안 지켰거나(드묾), 근거 부족 등으로 TC 생성을 거부한 경우(자주 있음) 둘 다 여기 해당.
      // 조용히 빈 배열만 내려주면 사용자는 아무 반응이 없는 것처럼 보이므로, AI의 답변을 그대로 사용자에게 보여준다.
      console.warn(`[TC 파싱 0건] 응답 미리보기(앞 1500자):
${raw.slice(0, 1500)}`);
      warning = raw.slice(0, 800);
    }
    res.json({ testCases, warning });
  } catch (err) {
    console.error('generate-satisfied-tc error:', err);
    res.status(500).json({ error: err.isTruncated ? err.message : '충족 항목 검증 TC 생성 중 오류가 발생했습니다.' });
  }
});

// 신규 - 프로젝트별 분석 중간 상태 조회 (새로고침해도 유형판별/정책분석/체크리스트 복구용)
router.get('/state/:projectId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM project_plan_analysis WHERE project_id = $1',
      [req.params.projectId]
    );
    if (result.rows.length === 0) {
      // 아직 저장된 분석 상태가 없는 프로젝트 - 빈 기본값 반환 (에러 아님)
      return res.json({
        requirementFiles: [],
        designText: '',
        designFileName: '',
        projectType: '',
        reason: '',
        serviceName: '',
        rules: [],
        checklist: [],
        features: [],
        consistencyIssues: [],
        draftTestCases: [],
        draftBasicTestCases: [],
        savedTcIdx: [],
        savedBasicTcIdx: [],
      });
    }
    const row = result.rows[0];
    res.json({
      requirementFiles: row.requirement_files || [],
      designText: row.design_text || '',
      designFileName: row.design_file_name || '',
      projectType: row.project_type || '',
      reason: row.classification_reason || '',
      serviceName: row.service_name || '',
      rules: row.rules || [],
      checklist: row.checklist || [],
      features: row.features || [],
      consistencyIssues: row.consistency_issues || [],
      draftTestCases: row.draft_test_cases || [],
      draftBasicTestCases: row.draft_basic_test_cases || [],
      savedTcIdx: row.saved_tc_idx || [],
      savedBasicTcIdx: row.saved_basic_tc_idx || [],
    });
  } catch (err) {
    console.error('get plan-analysis state error:', err);
    res.status(500).json({ error: '분석 상태를 불러오지 못했습니다.' });
  }
});

// 신규 - 프로젝트별 분석 중간 상태 저장 (각 분석 단계 완료 시마다 호출, upsert)
router.put('/state/:projectId', async (req, res) => {
  try {
    const {
      requirementFiles, designText, designFileName,
      projectType, reason, serviceName, rules, checklist, features, consistencyIssues,
      draftTestCases, draftBasicTestCases, savedTcIdx, savedBasicTcIdx,
    } = req.body;

    await pool.query(
      `INSERT INTO project_plan_analysis
        (project_id, requirement_files, design_text, design_file_name,
         project_type, classification_reason, service_name, rules, checklist, features,
         consistency_issues, draft_test_cases, draft_basic_test_cases, saved_tc_idx, saved_basic_tc_idx, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
       ON CONFLICT (project_id) DO UPDATE SET
        requirement_files = EXCLUDED.requirement_files,
        design_text = EXCLUDED.design_text,
        design_file_name = EXCLUDED.design_file_name,
        project_type = EXCLUDED.project_type,
        classification_reason = EXCLUDED.classification_reason,
        service_name = EXCLUDED.service_name,
        rules = EXCLUDED.rules,
        checklist = EXCLUDED.checklist,
        features = EXCLUDED.features,
        consistency_issues = EXCLUDED.consistency_issues,
        draft_test_cases = EXCLUDED.draft_test_cases,
        draft_basic_test_cases = EXCLUDED.draft_basic_test_cases,
        saved_tc_idx = EXCLUDED.saved_tc_idx,
        saved_basic_tc_idx = EXCLUDED.saved_basic_tc_idx,
        updated_at = NOW()`,
      [
        req.params.projectId,
        JSON.stringify(requirementFiles || []),
        designText || '',
        designFileName || '',
        projectType || '',
        reason || '',
        serviceName || '',
        JSON.stringify(rules || []),
        JSON.stringify(checklist || []),
        JSON.stringify(features || []),
        JSON.stringify(consistencyIssues || []),
        JSON.stringify(draftTestCases || []),
        JSON.stringify(draftBasicTestCases || []),
        JSON.stringify(savedTcIdx || []),
        JSON.stringify(savedBasicTcIdx || []),
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('save plan-analysis state error:', err);
    res.status(500).json({ error: '분석 상태 저장에 실패했습니다.' });
  }
});

router.post('/consistency-check', async (req, res) => {
  try {
    const { requirementFiles, designText } = req.body;
    if (!requirementFiles || !requirementFiles.length || !designText) {
      return res.status(400).json({ error: 'requirementFiles, designText가 필요합니다.' });
    }

    const designBlock = buildDesignDocBlock(designText); // 캐시 블록, 모든 반복에서 재사용

    const allIssues = [];
    const failedFiles = [];

    for (const file of requirementFiles) {
      const blocks = [
        designBlock,
        buildRequirementDocBlockPerFile(file.name, file.text),
        { type: 'text', text: buildConsistencyCheckPrompt() },
      ];

      const runOnce = async (label) => {
        const raw = await callClaude(blocks, { maxTokens: 8000, label });
        console.log(`=== RAW CONSISTENCY CHECK (${file.name}, length: ${raw.length}) ===`);
        return parseConsistencyCheckResult(raw).map((issue) => ({ ...issue, sourceFile: file.name }));
      };

      try {
        const issues = await runOnce(`consistency-check:${file.name}`);
        console.log(`=== PARSED ISSUES (${file.name}): ${issues.length} ===`);
        allIssues.push(...issues);
      } catch (fileErr) {
        console.error(`consistency-check 실패, 재시도: ${file.name}`, fileErr);
        try {
          const issues = await runOnce(`consistency-check:${file.name}:retry`);
          allIssues.push(...issues);
        } catch (retryErr) {
          console.error(`consistency-check 재시도도 실패: ${file.name}`, retryErr);
          failedFiles.push(file.name);
        }
      }
    }

    res.json({ issues: allIssues, failedFiles });
  } catch (err) {
    console.error('consistency-check error:', err);
    res.status(500).json({ error: '정합성 검수 중 오류가 발생했습니다.' });
  }
});

module.exports = router;

// 메인 서버 파일(app.js 또는 index.js)에 아래 한 줄 추가 필요:
// app.use('/api/plan', require('./routes/planAnalysis'));
