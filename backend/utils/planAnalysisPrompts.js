// backend/utils/planAnalysisPrompts.js (제안 경로)
// 기존 TestCasesScreen.tsx의 buildBatchPrompt / parseBatchResult 스타일과
// 통일된 마커 기반 파싱 방식을 사용합니다.
//
// [프롬프트 캐싱 구조]
// 기획서 원문(planText)과 스킬 체크리스트(skillMdContent)는 한 번의 분석 세션 안에서
// classify-type / extract-rules / checklist / generate-tc(배치마다) / generate-satisfied-tc(배치마다)
// 등 거의 모든 호출에 매번 반복해서 들어간다. 이 두 덩어리를 별도의 "캐시 가능한 콘텐츠 블록"으로
// 분리해서, Anthropic 프롬프트 캐싱(cache_control)을 태우면 두 번째 호출부터는 훨씬 싼 비용으로
// 처리된다. 그래서 아래 build*Prompt 함수들은 더 이상 planText/skillMdContent를 문자열 안에 직접
// interpolate하지 않고, "지시문(instructions)"만 만들어서 반환한다. 실제 API 호출 시
// [캐시 블록: 기획서] + [캐시 블록: 체크리스트] + [일반 블록: 지시문] 순서로 messages content 배열을
// 구성해야 하며, 이 조립은 routes/planAnalysis.js의 callClaude 호출부에서 한다.

/**
 * 캐시 가능한 콘텐츠 블록: 기획서(혹은 관련 문서) 원문.
 * 한 분석 세션 내 거의 모든 호출에서 재사용되므로 항상 맨 앞에 두고 캐시 브레이크포인트를 찍는다.
 */
function buildPlanTextBlock(planText) {
  return {
    type: 'text',
    text: `다음은 기획서(또는 관련 문서) 전체 내용이다. 아래 지시문에서 이 내용을 참고해서 작업해줘.\n\n${planText}`,
    cache_control: { type: 'ephemeral', ttl: '1h' },
  };
}

/**
 * 캐시 가능한 콘텐츠 블록: 프로젝트 유형별 참고 체크리스트(스킬 MD).
 * checklist / generate-tc 두 호출에서만 쓰이지만, 같은 유형이면 내용이 완전히 동일하게 반복되므로
 * 별도 블록 + 캐시 브레이크포인트로 분리한다. (기획서 블록 뒤에 이어붙여야 함 — 캐시는 접두사 단위로 적용됨)
 */
function buildSkillMdBlock(skillMdContent) {
  return {
    type: 'text',
    text: `다음은 이 프로젝트 유형에서 참고할 체크리스트다.\n\n${skillMdContent}`,
    cache_control: { type: 'ephemeral' },
  };
}

/**
 * 1단계: 기획서 텍스트로 프로젝트 유형 판별
 */
function buildTypeClassificationPrompt() {
  return `위에서 제공된 기획서 내용을 보고, 이 프로젝트가 아래 유형 중 어디에 가장 가까운지 판별해줘.

유형 정의 (중요 — 반드시 이 기준으로 판단):
- 쇼핑몰: 최종 고객(회원/비회원)이 직접 사용하는 화면으로, 상품 구매뿐 아니라
  쿠폰/포인트/적립/응모/당첨/혜택 등 거래·보상 성격의 기능이 포함된 서비스.
  화면 안에 "BO", "Admin", "관리자 등록" 같은 단어가 일부 언급되더라도,
  그 화면 자체가 "고객이 보는 화면(FO)"이면 쇼핑몰로 분류해야 함.
- 내부 관리 시스템: 관리자/직원/운영자가 "직접 로그인해서 사용하는" 백오피스,
  어드민 도구, 사내 업무 시스템. 고객이 보는 화면(FO)이 아니라
  화면 자체의 사용자가 내부 직원인 경우에만 이 유형에 해당함.
- 웹/게임 소개: 제품·서비스·게임을 홍보/소개하는 랜딩페이지, 소개 사이트.
- 기타: 위 셋에 해당하지 않는 경우.

판단 시 "이 화면을 실제로 사용하는 사람이 최종 고객인지, 내부 직원인지"를
최우선 기준으로 삼아줘. 문서 안에 관리자/Admin/BO 관련 언급이 있다는 이유만으로
내부 관리 시스템으로 분류하지 마.

예시로 판단 기준을 명확히 할게:
- "관리자가 등록한 쿠폰/이벤트/포인트 혜택에, 고객이 응모하거나 다운로드하거나
  참여해서 당첨/보상을 받는 화면"은 관리자 언급이 있어도 반드시 "쇼핑몰"로 분류해야 함.
  (예: 이벤트 응모, 쿠폰 다운로드, 포인트 적립/차감, 당첨자 발표를 고객이 직접 보는 화면)
  이런 화면은 관리자가 "백엔드에서 무언가를 등록/관리"한다는 설명이 있어도,
  실제 화면의 사용자(응모하기 버튼을 누르는 사람)는 최종 고객이므로 쇼핑몰임.
- "관리자가 로그인해서 직접 쿠폰을 등록하거나, 회원 목록을 조회/수정하는 화면 자체"를
  설계한 문서일 때만 내부 관리 시스템으로 분류해야 함.

체크리스트: 이 화면에서 버튼을 누르는 주체가 고객이면 → 쇼핑몰.
관리자가 그 화면에서 직접 데이터를 입력/조회/관리하면 → 내부 관리 시스템.

추가로, 문서에 실제로 적혀 있는 고유명사(회사명/서비스명/브랜드명)를 찾아서
아래 규칙대로 이 프로젝트를 가리키는 구체적인 이름을 하나 만들어줘:
- 회사명 + 서비스명이 둘 다 있으면: "회사명 서비스명 + 접미사" (예: "아모레퍼시픽 뷰티포인트 공식몰")
- 회사명만 있으면: "회사명 + 접미사" (예: "㈜씨엠아이파트너스 공식몰")
- 서비스명만 있으면: "서비스명 + 접미사"
- 회사명/서비스명 둘 다 문서에서 찾을 수 없으면: 지어내지 말고 빈 값으로 둬.
접미사는 위에서 판별한 유형에 따라 다르게 붙여줘: 쇼핑몰 → "공식몰", 웹/게임 소개 → "공식 사이트",
내부 관리 시스템 → "관리 시스템", 기타 → "서비스".

중요: 반드시 아래 형식 그대로만 답변해줘. 다른 설명은 절대 붙이지 마.
[TYPE]: (유형 하나만)
[CONFIDENCE]: (0~100 사이 숫자)
[REASON]: (판단 근거 한 문장 — 이 화면을 누가 사용하는지를 포함해서)
[SERVICE_NAME]: (위 규칙으로 조합한 이름, 못 찾았으면 빈 값)`;
}

function parseTypeClassificationResult(text) {
  const typeMatch = text.match(/\[TYPE\]:\s*(.+)/);
  const confMatch = text.match(/\[CONFIDENCE\]:\s*(\d+)/);
  const reasonMatch = text.match(/\[REASON\]:\s*(.+)/);
  const serviceNameMatch = text.match(/\[SERVICE_NAME\]:\s*(.*)/);
  return {
    type: typeMatch ? typeMatch[1].trim() : '알 수 없음',
    confidence: confMatch ? parseInt(confMatch[1], 10) : null,
    reason: reasonMatch ? reasonMatch[1].trim() : '',
    serviceName: serviceNameMatch ? serviceNameMatch[1].trim() : '',
  };
}

/**
 * 1.5단계 (신규): 기획서에서 이 프로젝트만의 구체적인 비즈니스 규칙 추출
 * 일반 체크리스트가 못 잡는, 숫자/조건/예외가 담긴 문장만 뽑아낸다.
 */
function buildRuleExtractionPrompt() {
  return `위에서 제공된 기획서 내용에서, 이 프로젝트에만 있는 구체적인 비즈니스 규칙을 찾아서 추출해줘.
일반적인 서비스라면 다 있을 법한 뻔한 내용(로그인, 목록 조회 등)은 제외하고,
아래 성격을 가진 문장만 골라줘.

- 숫자/기간이 명시된 제한 (예: "최대 3개", "반기 기준", "24시간 이내")
- 조건부 예외 규정 (예: "단, ~인 경우는 제외", "~와 상관없이 ~가능")
- 되돌릴 수 없는 처리 (예: "즉시 차감되며 환불 불가")
- 수정/변경이 금지된 항목
- 두 가지 이상 조건이 동시에 걸리는 규칙

중요: 각 규칙마다 아래 형식으로, 개수만큼 반복해서 답변해줘. 다른 설명은 붙이지 마.
[RULE_START]
[SUMMARY]: (규칙을 한 문장으로 요약)
[SOURCE]: (원문에서 해당하는 부분을 짧게 인용)
[RISK]: (이 규칙 때문에 발생할 수 있는 예외 상황을 한 문장으로)
[VERIFY]: (테스터가 실제로 무엇을 확인해야 하는지 — 구체적인 시나리오/조건을 한 문장으로.
  예: "반기 전환 시점 근처에 당첨 이력이 있는 사용자가 응모를 시도했을 때,
  시스템이 정확한 반기 기준으로 판단하는지 확인")
[RULE_END]`;
}

function parseRuleExtractionResult(text) {
  const blocks = [...text.matchAll(/\[RULE_START\]([\s\S]*?)\[RULE_END\]/g)];
  return blocks.map((b) => {
    const block = b[1];
    const summary = block.match(/\[SUMMARY\]:\s*(.+)/);
    const source = block.match(/\[SOURCE\]:\s*(.+)/);
    const risk = block.match(/\[RISK\]:\s*(.+)/);
    const verify = block.match(/\[VERIFY\]:\s*(.+)/);
    return {
      summary: summary ? summary[1].trim() : '',
      source: source ? source[1].trim() : '',
      risk: risk ? risk[1].trim() : '',
      verify: verify ? verify[1].trim() : '',
    };
  });
}

/**
 * 신규: 기획서에서 "사용자가 조작 가능한 기능 단위"만 추출 (배경/일정/디자인가이드 등은 제외)
 * 정책 분석/예외 케이스 점검과 완전히 독립적으로 동작 - planText만 있으면 호출 가능.
 */
function buildFeatureExtractionPrompt() {
  return `위에서 제공된 기획서 내용에서, 사용자가 직접 조작하거나 시스템이 처리하는 "기능 단위"만 추출해줘.

포함해야 할 것:
- 기능 정의, 정책 정의, Service Flow(사용자 흐름도)에 나오는 기능/화면 단위
- 사용자가 클릭/입력하는 화면 요소, API 연동, 데이터 처리 흐름

제외해야 할 것:
- 기획 배경/목적, 시장조사, 경쟁사 비교
- 일정, 예산, 담당자 배정
- 순수 디자인 가이드(색상/폰트/여백 등 비주얼 스타일만 다루는 내용)
- 용어 정의, 참고 자료 링크

중요: 각 기능마다 아래 형식으로, 개수만큼 반복해서 답변해줘. 다른 설명은 붙이지 마.
[FEATURE_START]
[NAME]: (기능명, 간결하게)
[DESC]: (이 기능이 정상적으로 하는 일을 한 문장으로)
[FEATURE_END]`;
}

function parseFeatureExtractionResult(text) {
  const blocks = [...text.matchAll(/\[FEATURE_START\]([\s\S]*?)\[FEATURE_END\]/g)];
  return blocks.map((b) => {
    const block = b[1];
    const name = block.match(/\[NAME\]:\s*(.+)/);
    const desc = block.match(/\[DESC\]:\s*(.+)/);
    return {
      name: name ? name[1].trim() : '',
      desc: desc ? desc[1].trim() : '',
    };
  });
}

/**
 * 신규: 선택된 기능들에 대해 "정상적으로 동작하는지" 확인하는 TC 생성 (예외 케이스 아님)
 */
function buildBasicTcGenerationPrompt(selectedFeatureNames) {
  const featureList = selectedFeatureNames.map((f) => `- ${f}`).join('\n');

  return `위에서 제공된 기획서를 바탕으로, 다음 기능들이 "정상적인 시나리오에서 의도대로 동작하는지"
확인하는 테스트 케이스를 각 기능당 정확히 1개씩 설계해줘. 이건 예외/에러 상황이 아니라
정상 케이스(happy path)만 다뤄줘 — 잘못된 입력, 경계값, 동시성, 권한 오류 같은 예외는
포함하지 마.

테스트 절차는 실제 사용자가 화면 조작만으로 재현 가능한 방법으로 작성해줘.

--- 대상 기능 ---
${featureList}
---

중요: 각 TC마다 아래 형식으로, 개수만큼 반복해서 답변해줘. 다른 설명은 절대 붙이지 마.
[TC_START]
[TITLE]: (TC 제목)
[PRIORITY]: 높음 또는 중간 또는 낮음
[PRECONDITION]: (사전조건)
[STEPS]:
- (절차 1)
- (절차 2)
[EXPECTED]: (기대 결과)
[TC_END]`;
}

function buildRequirementChecklistPrompt() {
  return `위에서 제공된 기획서 내용과 참고 체크리스트를 바탕으로, 기획서 내용에 명시적으로 있는
요구사항은 [충족]으로, 체크리스트에는 있지만 기획서에 언급이 없거나 애매한 항목은
[누락 의심]으로 표시해서 통합 리스트를 만들어줘.

중요: 각 항목마다 아래 형식으로, 항목 수만큼 반복해서 답변해줘. 다른 설명은 붙이지 마.
[ITEM_START]
[LABEL]: (항목명, 간결하게)
[STATUS]: 충족 또는 누락 의심
[NOTE]: (한 줄 근거)
[ITEM_END]`;
}

function parseRequirementChecklistResult(text) {
  const blocks = [...text.matchAll(/\[ITEM_START\]([\s\S]*?)\[ITEM_END\]/g)];
  return blocks.map((b) => {
    const block = b[1];
    const label = block.match(/\[LABEL\]:\s*(.+)/);
    const status = block.match(/\[STATUS\]:\s*(.+)/);
    const note = block.match(/\[NOTE\]:\s*(.+)/);
    return {
      label: label ? label[1].trim() : '',
      status: status ? status[1].trim() : '충족',
      missing: status ? status[1].trim().includes('누락') : false,
      note: note ? note[1].trim() : '',
    };
  });
}

/**
 * 3단계: 선택된 누락 항목에 대해 실제 TC 생성
 * selectedGapLabels: 사용자가 체크박스로 선택한 [LABEL] 값들의 배열
 * 기존 TestCase 타입(title/precondition/steps/expected_result)과 동일한 필드로 반환
 */
function buildTcGenerationPrompt(selectedGapLabels, extractedRules = []) {
  const gapList = selectedGapLabels.map((l) => `- ${l}`).join('\n');
  const rulesBlock = extractedRules.length
    ? extractedRules
        .map((r) => `- 규칙: ${r.summary}\n  위험: ${r.risk}\n  확인할 것: ${r.verify || '(명시 없음)'}`)
        .join('\n')
    : '(추출된 규칙 없음)';

  return `위에서 제공된 기획서와 참고 체크리스트를 바탕으로, 다음 누락 항목들에 대한 테스트 케이스를
각 항목당 정확히 2개씩 설계해줘. 경계값 / 잘못된 입력 / 권한·인증 / 동시성 / 네트워크 장애 /
데이터 정합성 관점을 적극 활용해줘.

테스트 절차 작성 시 지켜야 할 것:
- 가능하면 실제 사용자가 화면(UI) 조작만으로 재현 가능한 방법을 우선 써줘.
- 화면 조작만으로는 재현이 불가능하고 API 요청 조작이 꼭 필요한 경우에만,
  절차에 "(Postman 등으로 API 직접 호출 필요)"라고 짧게 한 번만 명시해줘.
  구체적인 도구 사용법이나 여러 단계로 나눠 설명하지 마.
- 기대 결과는 테스터가 실제로 확인 가능한 것만 적어줘: 화면에 보이는 메시지/상태,
  또는 API 응답의 상태코드나 본문 내용. DB에 데이터가 어떻게 저장되는지처럼
  테스터가 직접 접근할 수 없는 내용은 기대 결과에 포함하지 마.

특히 아래 "이 프로젝트만의 규칙"에서 파생되는 예외 상황은, 일반적인 체크리스트보다
우선순위를 높여서 최소 1개 이상 TC로 반드시 반영해줘. 각 규칙의 [VERIFY] 내용을
참고해서, 그 시나리오를 구체적인 TC로 만들어줘. 이 규칙들은 이 프로젝트에만
있는 조건이라, 일반적인 서비스라면 없을 예외이니 특히 신경 써줘.

--- 이 프로젝트만의 규칙 ---
${rulesBlock}

--- 대상 누락 항목 ---
${gapList}
---

중요: 각 TC마다 아래 형식으로, 개수만큼 반복해서 답변해줘. 다른 설명은 절대 붙이지 마.
[TC_START]
[TITLE]: (TC 제목)
[PRIORITY]: 높음 또는 중간 또는 낮음
[PRECONDITION]: (사전조건)
[STEPS]:
- (절차 1)
- (절차 2)
[EXPECTED]: (기대 결과)
[TC_END]`;
}

function parseTcGenerationResult(text) {
  const blocks = [...text.matchAll(/\[TC_START\]([\s\S]*?)\[TC_END\]/g)];
  return blocks.map((b) => {
    const block = b[1];
    const title = block.match(/\[TITLE\]:\s*(.+)/);
    const priority = block.match(/\[PRIORITY\]:\s*(.+)/);
    const precondition = block.match(/\[PRECONDITION\]:\s*(.+)/);
    const expected = block.match(/\[EXPECTED\]:\s*(.+)/);
    const stepsMatch = block.match(/\[STEPS\]:\s*([\s\S]*?)(?=\[EXPECTED\]:)/);
    const steps = stepsMatch
      ? stepsMatch[1]
        .split('\n')
        .map((s) => s.replace(/^-\s*/, '').trim())
        .filter(Boolean)
        .map((s, i) => `${i + 1}. ${s}`)
        .join('\n')
      : '';

    return {
      title: title ? title[1].trim() : '(제목 없음)',
      priority: priority ? priority[1].trim() : '중간',
      precondition: precondition ? precondition[1].trim() : '',
      steps,
      expected_result: expected ? expected[1].trim() : '',
    };
  });
}

/**
 * 신규: 체크리스트에서 "충족"으로 판정된 항목 검증용 TC 생성
 * "이 예외는 기획서에 이미 규정돼 있다"는 것과 "그 규정대로 실제로 동작한다"는 건 다른 얘기이므로,
 * 문서화된 규칙이 실제로 지켜지는지 확인하는 TC를 각 항목당 정확히 1개씩 만든다.
 * selectedItems: [{ label, note }] - note는 체크리스트 생성 시 나온 근거 문장(충족 판단 이유)
 */
function buildSatisfiedRuleVerificationPrompt(selectedItems) {
  const itemList = selectedItems.map((i) => `- ${i.label}${i.note ? ` (근거: ${i.note})` : ''}`).join('\n');

  return `위에서 제공된 기획서에는 이미 명시적으로 정의된 규칙/정책들이 있어. "기획서에 규칙이
문서화되어 있다"는 것과 "그 규칙대로 실제로 정확히 구현되어 동작한다"는 건 다른 문제야.
아래 항목들이 기획서에 명시된 조건(숫자, 기준, 예외 처리 방식 등)대로 정확히 동작하는지
검증하는 테스트 케이스를 각 항목당 정확히 1개씩 설계해줘.

이건 누락된 예외를 찾는 게 아니라, 이미 기획서에 있는 구체적인 규칙이 실제로 그 기준대로
지켜지는지 확인하는 목적이야. 기획서 원문에서 정확한 숫자/조건/기준을 찾아서 테스트 절차와
기대 결과에 최대한 구체적으로 반영해줘 (예: "3개월"이라고 적혀 있으면 "3개월"을 그대로 사용).

테스트 절차 작성 시 지켜야 할 것:
- 가능하면 실제 사용자가 화면(UI) 조작만으로 재현 가능한 방법을 우선 써줘.
- 화면 조작만으로는 재현이 불가능하고 API 요청 조작이 꼭 필요한 경우에만,
  절차에 "(Postman 등으로 API 직접 호출 필요)"라고 짧게 한 번만 명시해줘.
- 기대 결과는 테스터가 실제로 확인 가능한 것만 적어줘: 화면에 보이는 메시지/상태,
  또는 API 응답의 상태코드나 본문 내용.

매우 중요 - 화면설계서에 해당 항목을 검증할 화면 자체가 없는 경우:
절대 항목을 건너뛰거나 TC 생성을 거부하지 마. 대신 아래처럼 "확인 필요" TC로 만들어줘:
[TITLE]에 "[확인 필요] " 접두사를 붙이고, [PRECONDITION]과 [STEPS]에는 "화면설계서에서
이 규칙과 관련된 화면을 찾을 수 없음"이라고 명시하고, [EXPECTED]에는 "해당 화면(또는 별도
문서)을 추가로 확인해서 이 규칙이 실제로 지켜지는지 검증 필요"라고 적어줘. 근거 없이 숫자나
조건을 지어내지는 말되, 각 항목마다 반드시 TC 형식의 출력은 하나씩 내놓아야 해.

--- 검증 대상 (체크리스트에서 "충족"으로 판정된 항목) ---
${itemList}
---

중요: 각 항목마다 정확히 1개씩, 아래 형식으로 빠짐없이 답변해줘 (화면을 못 찾은 항목도
위 지침대로 "확인 필요" TC로 반드시 포함). 다른 설명은 절대 붙이지 마.
[TC_START]
[TITLE]: (TC 제목)
[PRIORITY]: 높음 또는 중간 또는 낮음
[PRECONDITION]: (사전조건)
[STEPS]:
- (절차 1)
- (절차 2)
[EXPECTED]: (기대 결과)
[TC_END]`;
}

/**
 * 신규 - 정합성 검수: 요구사항 문서 블록 (캐시 가능)
 */
function buildRequirementDocBlock(requirementText) {
  return {
    type: 'text',
    text: `다음은 "요구사항 문서"(제안서/RFP/요구사항 정의서 등) 전체 내용이다.\n\n${requirementText}`,
    cache_control: { type: 'ephemeral' },
  };
}


// 신규 - 파일 단위 요구사항 블록. 파일마다 내용이 달라 캐시 재사용이 안 되므로 cache_control 안 붙임
function buildRequirementDocBlockPerFile(fileName, text) {
  return {
    type: 'text',
    text: `[요구사항 문서: ${fileName}]\n${text}`,
  };
}

/**
 * 신규 - 정합성 검수: 화면설계서 문서 블록 (캐시 가능, 요구사항 블록 뒤에 이어붙임)
 */
function buildDesignDocBlock(designText) {
  return {
    type: 'text',
    text: `다음은 위 요구사항 문서를 바탕으로 만들어진 "화면설계서" 전체 내용이다.\n\n${designText}`,
    cache_control: { type: 'ephemeral', ttl: '1h' },
  };
}

/**
 * 신규 - 요구사항 문서 vs 화면설계서 정합성 검수.
 * 결과를 3개 카테고리로 분류한다:
 * - 값 불일치: 두 문서 모두에 있는데 값/내용이 다름
 * - 문서 내부 모순: 화면설계서 "안"에서 서로 다른 값이 나옴 (요구사항과 무관)
 * - 근거 없음: 화면설계서에는 있는데 요구사항 문서에 언급이 없는 내용
 */
function buildConsistencyCheckPrompt() {
  return `위에서 제공된 "요구사항 문서"와 "화면설계서" 두 문서를 비교해서, 다음 세 가지 문제를
찾아줘. 세 가지는 성격이 다르니 반드시 구분해서 분류해야 해:

1. 값 불일치 (mismatch): 요구사항 문서와 화면설계서 양쪽 모두에 같은 항목에 대한 내용이
   있는데, 구체적인 값(숫자, 기간, 조건, 정책)이 서로 다른 경우.
   예: 요구사항엔 "반기(6개월)마다 1회"라고 되어 있는데 화면설계서엔 "연 1회"라고 되어 있는 경우.

2. 문서 내부 모순 (internal_contradiction): 화면설계서 "한 문서 안에서" 같은 항목에 대해
   서로 다른 값이 등장하는 경우. 요구사항 문서와는 비교할 필요 없이, 화면설계서 자체만 봐도
   발견 가능한 모순. 예: 어떤 페이지엔 "3개월"이라고 써 있는데 다른 페이지엔 "8개월"이라고
   쓰여 있는 경우. 이건 보통 편집 실수일 가능성이 높다.

3. 근거 없음 (no_basis): 화면설계서에는 구체적인 값/정책이 명시되어 있는데, 요구사항
   문서에는 그 항목 자체가 전혀 언급되지 않은 경우. "틀렸다"는 게 아니라, 어느 문서에도
   근거가 없으니 실제 정책 담당자에게 확인이 필요하다는 의미로 찾아줘.
   중요: 요구사항 문서에 "유효기간", "제한 기간" 같은 항목/필드명(개념)만 언급되고
   구체적인 숫자·기간·조건 값이 안 나와 있다면, 이것도 "근거 없음"에 해당한다.
   개념 이름이 등장했다는 이유만으로 값 불일치 대상에서 제외하면 안 된다 — 비교 가능한
   구체적인 값이 요구사항에 없으면, 화면설계서의 값과 비교할 대상 자체가 없는 것이므로
   반드시 근거 없음으로 분류해야 한다.

찾을 때 주의할 점:
- 숫자/기간/조건이 명시된 정책성 항목 위주로 찾아줘. 단순 표현 차이(문구 워딩)는 대상이 아니다.
- 같은 값이 문서 여러 곳에 반복되어도 하나의 이슈로만 보고해줘 (중복 보고 금지).
- 화면설계서 안에서 위치를 알 수 있으면(슬라이드 번호, 화면코드 등) 반드시 [LOCATION]에 적어줘.
- 매우 중요: 훑어보고 눈에 띄는 것만 찾지 말고, 요구사항 문서에 요구사항 ID(REQ-XXXX 등)나
  항목 단위 구분이 있다면 그 항목들을 하나하나 순서대로 확인해줘. 특히 문서 중간이나 비고/추가
  설명 칸에 짧게 덧붙여진 숫자·기간·횟수(예: "며칠", "몇 회", "몇 개월", "몇 %") 조건도 절대
  놓치지 말고 모두 화면설계서의 해당 항목과 대조해줘. 헤드라인성 정책 문구뿐 아니라 부가 설명에
  묻혀 있는 조건까지 빠짐없이 확인하는 게 이 작업의 핵심이다.
- 답변 길이 제약이 중요하다: 이슈가 많을 수 있으니, [REQ_CONTENT]와 [DESIGN_CONTENT]는 원문을
  그대로 길게 인용하지 말고 핵심만 한 문장(1줄, 최대 40자 내외)으로 요약해줘. [QUESTION]도
  한 문장으로 짧게. 장황한 설명 없이 최대한 간결하게 답해야, 이슈가 많아도 응답이 잘리지 않는다.

중요: 각 이슈마다 아래 형식으로, 개수만큼 반복해서 답변해줘. 이슈가 없으면 아무것도 출력하지 마.
다른 설명은 절대 붙이지 마.
[ISSUE_START]
[CATEGORY]: 값 불일치 또는 문서 내부 모순 또는 근거 없음
[TITLE]: (이슈를 한 줄로 요약)
[REQ_CONTENT]: (요구사항 문서에 있는 내용 — 근거 없음 카테고리면 "명시 없음"이라고 적기)
[DESIGN_CONTENT]: (화면설계서에 있는 내용 — 문서 내부 모순이면 서로 다른 두 부분을 모두 인용)
[LOCATION]: (화면설계서상 위치 — 슬라이드 번호/화면코드 등, 모르면 "확인 불가")
[QUESTION]: (담당자에게 확인을 요청할 질문 형식 문장 한 줄)
[ISSUE_END]`;
}

function parseConsistencyCheckResult(text) {
  const blocks = [...text.matchAll(/\[ISSUE_START\]([\s\S]*?)(?=\[ISSUE_START\]|$)/g)];
  return blocks.map((b) => {
    const block = b[1];
    const category = block.match(/\[CATEGORY\]:\s*(.+)/);
    const title = block.match(/\[TITLE\]:\s*(.+)/);
    const reqContent = block.match(/\[REQ_CONTENT\]:\s*(.+)/);
    const designContent = block.match(/\[DESIGN_CONTENT\]:\s*(.+)/);
    const location = block.match(/\[LOCATION\]:\s*(.+)/);
    const question = block.match(/\[QUESTION\]:\s*(.+)/);

    const rawCategory = category ? category[1].trim() : '';
    let categoryCode = 'mismatch';
    if (rawCategory.includes('내부 모순')) categoryCode = 'internal_contradiction';
    else if (rawCategory.includes('근거 없음')) categoryCode = 'no_basis';

    return {
      category: categoryCode,
      categoryLabel: rawCategory || '값 불일치',
      title: title ? title[1].trim() : '(제목 없음)',
      reqContent: reqContent ? reqContent[1].trim() : '',
      designContent: designContent ? designContent[1].trim() : '',
      location: location ? location[1].trim() : '확인 불가',
      question: question ? question[1].trim() : '',
    };
  });
}

module.exports = {
  buildPlanTextBlock,
  buildSkillMdBlock,
  buildRequirementDocBlock,
  buildDesignDocBlock,
  buildConsistencyCheckPrompt,
  parseConsistencyCheckResult,
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
  buildRequirementDocBlockPerFile,
};
