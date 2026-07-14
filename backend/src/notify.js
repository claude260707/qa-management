// Slack Incoming Webhook으로 알림을 보내는 유틸리티
// .env 파일에 SLACK_WEBHOOK_URL이 설정되어 있을 때만 동작. 설정 안 해도 앱은 정상 작동함 (알림만 스킵).

const STATUS_LABEL_KO = {
  draft: '초안',
  reviewing: '검토중',
  approved: '승인',
  rejected: '반려',
  implemented: '구현완료',
};

// 알림을 보낼 상태 목록 (승인, 반려, 구현완료로 바뀔 때만)
const NOTIFY_STATUSES = ['approved', 'rejected', 'implemented'];

async function notifyRequirementStatusChange({ requirementTitle, projectName, oldStatus, newStatus, requester }) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return; // 설정 안 되어 있으면 조용히 스킵

  if (oldStatus === newStatus) return; // 상태가 실제로 안 바뀌었으면 알림 안 보냄
  if (!NOTIFY_STATUSES.includes(newStatus)) return; // 관심 없는 상태 변경이면 스킵

  const emoji = { approved: '✅', rejected: '🚫', implemented: '🎉' }[newStatus] || '📋';
  const statusText = STATUS_LABEL_KO[newStatus] || newStatus;

  const text = [
    `${emoji} *요구사항 상태 변경: ${statusText}*`,
    `> 프로젝트: ${projectName}`,
    `> 요구사항: ${requirementTitle}`,
    requester ? `> 요청자: ${requester}` : null,
    `> 상태: ${STATUS_LABEL_KO[oldStatus] || oldStatus} → *${statusText}*`,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error('Slack 알림 전송 실패:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Slack 알림 전송 중 오류:', err.message);
  }
}

module.exports = { notifyRequirementStatusChange };
