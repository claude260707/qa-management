const express = require('express');
const router = express.Router();
const pool = require('./db');

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

function summarize(rows) {
  const summary = { total: rows.length, by_status: {}, by_executor: { automated: {}, manual: {} } };
  for (const row of rows) {
    summary.by_status[row.status] = (summary.by_status[row.status] || 0) + 1;
    const bucket = row.executed_by === 'playwright' ? 'automated' : 'manual';
    summary.by_executor[bucket][row.status] = (summary.by_executor[bucket][row.status] || 0) + 1;
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
      getSnapshot(project_id, currentRound, todayCutoff),
      getSnapshot(project_id, currentRound, yesterdayCutoff),
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
      perRoundRows[round] = await getSnapshot(project_id, round, now);
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

module.exports = router;