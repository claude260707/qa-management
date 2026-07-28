const { diffWords } = require('diff');

/**
 * 이전 텍스트와 새 텍스트를 비교해서 변경된 구간만 추출
 * @param {string} oldText - 이전 원문 (project_plan_analysis에 저장된 값)
 * @param {string} newText - 새로 업로드된 원문
 * @returns {Array<{type: 'added'|'removed', text: string, contextStart: number}>}
 */
function computeChangedSegments(oldText, newText) {
  const parts = diffWords(oldText || '', newText || '');
  const changedSegments = [];
  let cursor = 0;

  for (const part of parts) {
    if (part.added || part.removed) {
      changedSegments.push({
        type: part.added ? 'added' : 'removed',
        text: part.value,
        contextStart: cursor,
      });
    }
    if (!part.removed) cursor += part.value.length;
  }
  return changedSegments;
}

/**
 * 변경 사항이 실질적으로 있는지 빠르게 체크 (공백/줄바꿈만 다른 경우 무시)
 */
function hasSignificantChanges(oldText, newText) {
  const normalize = (t) => (t || '').replace(/\s+/g, ' ').trim();
  return normalize(oldText) !== normalize(newText);
}

module.exports = { computeChangedSegments, hasSignificantChanges };