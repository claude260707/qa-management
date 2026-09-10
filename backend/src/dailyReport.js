const express = require('express');
const router = express.Router();
const pool = require('./db');
const ExcelJS = require('exceljs');

const STATUS_LABEL = {
  not_run: '미진행',
  pass: 'Pass',
  fail: 'Fail',
  n_a: 'N/A',
  n_t: 'N/T',
  blocked: 'Blocked',
};

async function getSnapshot(projectId, round, cutoff) {
  const result = await pool.query(
    `SELECT DISTINCT ON (h.test_case_id)
       h.test_case_id, h.status, h.executed_by, h.executed_at, h.status_note
     FROM test_execution_history h
     JOIN test_cases tc ON tc.id = h.test_case_id
     WHERE tc.project_id = $1 AND h.round = $2 AND h.executed_at <= $3
     ORDER BY h.test_case_id, h.executed_at DESC`,
    [projectId, round, cutoff]
  );
  return result.rows;
}

// getSnapshot은 "그 차수/시점까지 실행 이력이 있는 TC"만 돌려주기 때문에, 한 번도
// 실행된 적 없는 TC는 아예 빠져서 "전체 TC" 개수가 실제 등록된 TC 수보다 작게 나오는
// 문제가 있었다. 프로젝트에 등록된 전체 TC id를 기준으로, 이력이 없는 TC는
// status: 'not_run'으로 채워 넣어 항상 "전체 TC = 등록된 TC 수"가 되도록 한다.
async function getFullSnapshot(projectId, round, cutoff) {
  const [historyRows, allTcResult] = await Promise.all([
    getSnapshot(projectId, round, cutoff),
    pool.query('SELECT id FROM test_cases WHERE project_id = $1', [projectId]),
  ]);
  const byId = new Map(historyRows.map((r) => [r.test_case_id, r]));
  return allTcResult.rows.map((tc) => byId.get(tc.id) || {
    test_case_id: tc.id,
    status: 'not_run',
    executed_by: null,
    executed_at: null,
    status_note: null,
  });
}

function summarize(rows) {
  const summary = { total: rows.length, by_status: {}, by_executor: { automated: {}, manual: {} } };
  for (const row of rows) {
    summary.by_status[row.status] = (summary.by_status[row.status] || 0) + 1;
    // executed_by가 없는 건(한 번도 실행 안 한 TC) 자동/수동 어느 쪽에도 안 들어가야 함 -
    // 예전엔 이게 무조건 '수동'으로 잘못 집계됐음.
    if (row.executed_by) {
      const bucket = row.executed_by === 'playwright' ? 'automated' : 'manual';
      summary.by_executor[bucket][row.status] = (summary.by_executor[bucket][row.status] || 0) + 1;
    }
  }
  return summary;
}

function summarizeByStatus(rows) {
  const counts = {};
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  return counts;
}

// GET /api/daily-report?project_id=10&date=2026-07-28&round=2
router.get('/', async (req, res) => {
  try {
    const { project_id, date, round } = req.query;
    if (!project_id) {
      return res.status(400).json({ error: 'project_id가 필요합니다.' });
    }

    let currentRound = round;
    if (!currentRound) {
      const roundResult = await pool.query(
        `SELECT MAX(h.round) AS max_round
         FROM test_execution_history h
         JOIN test_cases tc ON tc.id = h.test_case_id
         WHERE tc.project_id = $1`,
        [project_id]
      );
      currentRound = roundResult.rows[0].max_round;
      if (!currentRound) {
        return res.json({ round: null, message: '아직 실행 이력이 없습니다.' });
      }
    }

    const targetDate = date ? new Date(date) : new Date();
    const todayCutoff = new Date(targetDate);
    todayCutoff.setHours(23, 59, 59, 999);
    const yesterdayCutoff = new Date(todayCutoff);
    yesterdayCutoff.setDate(yesterdayCutoff.getDate() - 1);

    const [todayRows, yesterdayRows] = await Promise.all([
      getFullSnapshot(project_id, currentRound, todayCutoff),
      getFullSnapshot(project_id, currentRound, yesterdayCutoff),
    ]);

    res.json({
      round: Number(currentRound),
      date: todayCutoff.toISOString().slice(0, 10),
      today: summarize(todayRows),
      yesterday: summarize(yesterdayRows),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '데일리 리포트 생성에 실패했습니다.' });
  }
});

// GET /api/daily-report/detail?project_id=10 - 차수별 비교 + TC별 상세
router.get('/detail', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ error: 'project_id가 필요합니다.' });
    }

    const roundsResult = await pool.query(
      `SELECT DISTINCT h.round FROM test_execution_history h
       JOIN test_cases tc ON tc.id = h.test_case_id
       WHERE tc.project_id = $1 ORDER BY h.round`,
      [project_id]
    );
    const rounds = roundsResult.rows.map((r) => r.round);
    if (rounds.length === 0) {
      return res.json({ rounds: [], roundSummary: {}, testCases: [] });
    }

    const now = new Date();
    const perRoundRows = {};
    for (const round of rounds) {
      perRoundRows[round] = await getFullSnapshot(project_id, round, now);
    }

    const roundSummary = {};
    for (const round of rounds) {
      roundSummary[round] = summarizeByStatus(perRoundRows[round]);
    }

    const tcResult = await pool.query(
      `SELECT id, title, priority FROM test_cases WHERE project_id = $1 ORDER BY id`,
      [project_id]
    );
    const testCases = tcResult.rows.map((tc) => {
      const byRound = {};
      let latestNote = null;
      let latestExecutor = null;
      let latestAt = null;
      for (const round of rounds) {
        const row = perRoundRows[round].find((r) => r.test_case_id === tc.id);
        if (row) {
          byRound[round] = row.status;
          if (!latestAt || row.executed_at > latestAt) {
            latestAt = row.executed_at;
            latestExecutor = row.executed_by;
            latestNote = row.status_note;
          }
        }
      }
      return { id: tc.id, title: tc.title, priority: tc.priority, byRound, latestExecutor, latestNote };
    });

    res.json({ rounds, roundSummary, testCases });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '상세 리포트 생성에 실패했습니다.' });
  }
});

// GET /api/daily-report/export?project_id=10&date=2026-07-28&round=2 - 엑셀 다운로드
router.get('/export', async (req, res) => {
  try {
    const { project_id, date, round } = req.query;
    if (!project_id) {
      return res.status(400).json({ error: 'project_id가 필요합니다.' });
    }

    let currentRound = round;
    if (!currentRound) {
      const roundResult = await pool.query(
        `SELECT MAX(h.round) AS max_round
         FROM test_execution_history h
         JOIN test_cases tc ON tc.id = h.test_case_id
         WHERE tc.project_id = $1`,
        [project_id]
      );
      currentRound = roundResult.rows[0].max_round;
      if (!currentRound) {
        return res.status(400).json({ error: '아직 실행 이력이 없어 리포트를 만들 수 없습니다.' });
      }
    }

    const targetDate = date ? new Date(date) : new Date();
    const todayCutoff = new Date(targetDate);
    todayCutoff.setHours(23, 59, 59, 999);
    const yesterdayCutoff = new Date(todayCutoff);
    yesterdayCutoff.setDate(yesterdayCutoff.getDate() - 1);

    const [todayRows, yesterdayRows] = await Promise.all([
      getFullSnapshot(project_id, currentRound, todayCutoff),
      getFullSnapshot(project_id, currentRound, yesterdayCutoff),
    ]);
    const todaySummary = summarize(todayRows);
    const yesterdaySummary = summarize(yesterdayRows);

    // 차수별 비교 + TC별 상세 (detail 라우트와 동일 로직)
    const roundsResult = await pool.query(
      `SELECT DISTINCT h.round FROM test_execution_history h
       JOIN test_cases tc ON tc.id = h.test_case_id
       WHERE tc.project_id = $1 ORDER BY h.round`,
      [project_id]
    );
    const rounds = roundsResult.rows.map((r) => r.round);
    const now = new Date();
    const perRoundRows = {};
    for (const r of rounds) {
      perRoundRows[r] = await getFullSnapshot(project_id, r, now);
    }
    const roundSummary = {};
    for (const r of rounds) {
      roundSummary[r] = summarizeByStatus(perRoundRows[r]);
    }
    const tcResult = await pool.query(
      `SELECT id, title, priority FROM test_cases WHERE project_id = $1 ORDER BY id`,
      [project_id]
    );
    const testCases = tcResult.rows.map((tc) => {
      const byRound = {};
      for (const r of rounds) {
        const row = perRoundRows[r].find((x) => x.test_case_id === tc.id);
        if (row) byRound[r] = row.status;
      }
      return { id: tc.id, title: tc.title, priority: tc.priority, byRound };
    });

    const projectResult = await pool.query('SELECT name FROM projects WHERE id = $1', [project_id]);
    const projectName = projectResult.rows[0]?.name || `project_${project_id}`;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QA Management';
    workbook.created = new Date();

    // --- 시트 1: 요약 ---
    const summarySheet = workbook.addWorksheet('요약');
    summarySheet.columns = [{ width: 22 }, { width: 30 }];
    summarySheet.addRow(['프로젝트', projectName]);
    summarySheet.addRow(['차수', `${currentRound}차`]);
    summarySheet.addRow(['기준일', todayCutoff.toISOString().slice(0, 10)]);
    summarySheet.addRow([]);
    const passCount = todaySummary.by_status['pass'] || 0;
    const passRate = todaySummary.total > 0 ? Math.round((passCount / todaySummary.total) * 1000) / 10 : 0;
    const yesterdayPassCount = yesterdaySummary.by_status['pass'] || 0;
    const passDiff = passCount - yesterdayPassCount;
    summarySheet.addRow(['전체 TC', todaySummary.total]);
    summarySheet.addRow(['통과율', `${passRate}%`]);
    summarySheet.addRow(['어제 대비 통과', `${passDiff >= 0 ? '+' : ''}${passDiff}`]);
    summarySheet.addRow([]);
    summarySheet.addRow(['상태별 현황 (오늘 기준)']).font = { bold: true };
    summarySheet.addRow(['상태', '건수']).font = { bold: true };
    for (const [status, count] of Object.entries(todaySummary.by_status)) {
      summarySheet.addRow([STATUS_LABEL[status] || status, count]);
    }
    summarySheet.addRow([]);
    summarySheet.addRow(['실행 방식별 현황 (오늘 기준)']).font = { bold: true };
    summarySheet.addRow(['방식', '상태', '건수']).font = { bold: true };
    for (const [method, statuses] of Object.entries(todaySummary.by_executor)) {
      const methodLabel = method === 'automated' ? '자동(Playwright)' : '수동';
      for (const [status, count] of Object.entries(statuses)) {
        summarySheet.addRow([methodLabel, STATUS_LABEL[status] || status, count]);
      }
    }

    // --- 시트 2: 차수별 비교 ---
    const roundSheet = workbook.addWorksheet('차수별 비교');
    roundSheet.addRow(['상태', ...rounds.map((r) => `${r}차`)]).font = { bold: true };
    const statusKeys = Object.keys(STATUS_LABEL);
    for (const status of statusKeys) {
      roundSheet.addRow([STATUS_LABEL[status], ...rounds.map((r) => roundSummary[r][status] || 0)]);
    }
    roundSheet.columns.forEach((col) => { col.width = 14; });

    // 데이터 막대 - 실제 차트 객체 대신, 숫자 크기만큼 셀 안에 막대가 채워지는 조건부 서식.
    // exceljs는 진짜 차트(canvas 렌더링) 삽입은 지원하지 않아 이 방식으로 대체함.
    if (rounds.length > 0 && statusKeys.length > 0) {
      // 차수가 25개(Z열)를 넘어가면 이 방식으로는 열 문자 계산이 깨짐 - 실제로 그 정도로
      // 차수가 쌓이는 경우는 없을 거라 간단하게 처리함.
      const lastCol = String.fromCharCode('B'.charCodeAt(0) + rounds.length - 1);
      const lastRow = 1 + statusKeys.length;
      roundSheet.addConditionalFormatting({
        ref: `B2:${lastCol}${lastRow}`,
        rules: [
          {
            type: 'dataBar',
            cfvo: [{ type: 'min' }, { type: 'max' }],
            color: { argb: 'FF638EC6' },
            priority: 1,
          },
        ],
      });
    }

    // --- 시트 3: TC별 상세 ---
    const tcSheet = workbook.addWorksheet('TC별 상세');
    tcSheet.addRow(['ID', '제목', '우선순위', ...rounds.map((r) => `${r}차`)]).font = { bold: true };
    for (const tc of testCases) {
      tcSheet.addRow([
        tc.id,
        tc.title,
        tc.priority,
        ...rounds.map((r) => (tc.byRound[r] ? STATUS_LABEL[tc.byRound[r]] : '')),
      ]);
    }
    tcSheet.getColumn(1).width = 8;
    tcSheet.getColumn(2).width = 45;
    tcSheet.getColumn(3).width = 12;
    for (let i = 4; i <= 3 + rounds.length; i++) tcSheet.getColumn(i).width = 12;

    const fileName = `daily-report_${projectName}_${currentRound}차_${todayCutoff.toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="report.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '엑셀 리포트 생성에 실패했습니다.' });
  }
});

module.exports = router;