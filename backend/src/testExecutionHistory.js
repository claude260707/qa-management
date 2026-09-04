const express = require('express');
const router = express.Router();
const pool = require('./db');

// GET /api/test-execution-history?test_case_id=84 - 특정 TC의 회차별 이력 조회
router.get('/', async (req, res) => {
  try {
    const { test_case_id, round, project_id } = req.query;
    const conditions = [];
    const values = [];

    if (test_case_id) {
      values.push(test_case_id);
      conditions.push(`h.test_case_id = $${values.length}`);
    }
    if (round) {
      values.push(round);
      conditions.push(`h.round = $${values.length}`);
    }
    if (project_id) {
      values.push(project_id);
      conditions.push(`tc.project_id = $${values.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT h.*, tc.title AS test_case_title, tc.priority
       FROM test_execution_history h
       JOIN test_cases tc ON tc.id = h.test_case_id
       ${whereClause}
       ORDER BY h.round DESC, h.executed_at DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '실행 이력을 불러오지 못했습니다.' });
  }
});

// POST /api/test-execution-history - 실행 결과 1건 기록 (Playwright 러너 또는 수동 저장에서 호출)
router.post('/', async (req, res) => {
  try {
    const { test_case_id, round, executed_by, status, status_note } = req.body;
    if (!test_case_id || !round || !executed_by || !status) {
      return res.status(400).json({ error: 'test_case_id, round, executed_by, status는 필수입니다.' });
    }
    const result = await pool.query(
      `INSERT INTO test_execution_history (test_case_id, round, executed_by, status, status_note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [test_case_id, round, executed_by, status, status_note || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '실행 이력 저장에 실패했습니다.' });
  }
});

// POST /api/test-execution-history/bulk - Playwright 결과 여러 건 한 번에 저장
router.post('/bulk', async (req, res) => {
  const { round, items } = req.body;
  if (!round || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'round, items(array)가 필요합니다.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];
    for (const item of items) {
      if (!item.test_case_id || !item.status) continue;
      const result = await client.query(
        `INSERT INTO test_execution_history (test_case_id, round, executed_by, status, status_note)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [item.test_case_id, round, item.executed_by || 'playwright', item.status, item.status_note || null]
      );
      created.push(result.rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json({ created_count: created.length, created });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: '일괄 저장에 실패했습니다.' });
  } finally {
    client.release();
  }
});

module.exports = router;