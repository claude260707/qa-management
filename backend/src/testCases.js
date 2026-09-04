const express = require('express');
const router = express.Router();
const pool = require('./db');

// GET /api/test-cases - 목록 (project_id, requirement_id, status, priority, keyword 필터)
router.get('/', async (req, res) => {
  try {
    const { project_id, requirement_id, status, priority, keyword } = req.query;
    const conditions = [];
    const values = [];

    if (project_id) {
      values.push(project_id);
      conditions.push(`tc.project_id = $${values.length}`);
    }
    if (requirement_id) {
      values.push(requirement_id);
      conditions.push(`tc.requirement_id = $${values.length}`);
    }
    if (status && status !== 'all') {
      values.push(status);
      conditions.push(`tc.status = $${values.length}`);
    }
    if (priority && priority !== 'all') {
      values.push(priority);
      conditions.push(`tc.priority = $${values.length}`);
    }
    if (keyword) {
      values.push(`%${keyword}%`);
      conditions.push(`(tc.title ILIKE $${values.length} OR tc.expected_result ILIKE $${values.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT tc.*,
              p.name AS project_name,
              r.title AS requirement_title,
              a.original_name AS attachment_name,
              a.type AS attachment_type,
              a.url AS attachment_url
       FROM test_cases tc
       JOIN projects p ON p.id = tc.project_id
       LEFT JOIN requirements r ON r.id = tc.requirement_id
       LEFT JOIN attachments a ON a.id = tc.attachment_id
       ${whereClause}
       ORDER BY tc.created_at DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Test Case 목록을 불러오지 못했습니다.' });
  }
});

// GET /api/test-cases/coverage?project_id=1 - 요구사항별 TC 커버리지 (누락 확인용)
router.get('/coverage', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ error: 'project_id가 필요합니다.' });
    }
    const result = await pool.query(
      `SELECT r.id, r.title, r.priority, r.status,
              COUNT(tc.id) AS test_case_count
       FROM requirements r
       LEFT JOIN test_cases tc ON tc.requirement_id = r.id
       WHERE r.project_id = $1
       GROUP BY r.id, r.title, r.priority, r.status
       ORDER BY test_case_count ASC, r.created_at DESC`,
      [project_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '커버리지 정보를 불러오지 못했습니다.' });
  }
});

// GET /api/test-cases/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tc.*, p.name AS project_name, r.title AS requirement_title,
              a.original_name AS attachment_name, a.type AS attachment_type, a.url AS attachment_url
       FROM test_cases tc
       JOIN projects p ON p.id = tc.project_id
       LEFT JOIN requirements r ON r.id = tc.requirement_id
       LEFT JOIN attachments a ON a.id = tc.attachment_id
       WHERE tc.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Test Case를 찾을 수 없습니다.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Test Case를 불러오지 못했습니다.' });
  }
});

// POST /api/test-cases/bulk - 엑셀 업로드 등으로 파싱된 여러 TC를 한 번에 저장 (트랜잭션)
router.post('/bulk', async (req, res) => {
  const { project_id, items } = req.body;
  if (!project_id) {
    return res.status(400).json({ error: '프로젝트를 선택해주세요.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '등록할 항목이 없습니다.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];
    for (const item of items) {
      if (!item.title || !item.title.trim()) continue;
      const result = await client.query(
        `INSERT INTO test_cases (project_id, requirement_id, title, precondition, steps, expected_result, priority, status, tester, source_category, source_snippet)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'not_run', $8, $9, $10) RETURNING *`,
        [
          project_id,
          item.requirement_id || null,
          item.title.trim(),
          item.precondition || null,
          item.steps || null,
          item.expected_result || null,
          item.priority || 'medium',
          item.tester || null,
          item.source_category || null,
          item.source_snippet || null,
        ]
      );
      created.push(result.rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json({ created_count: created.length, created });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: '일괄 등록에 실패했습니다. 아무 것도 저장되지 않았습니다.' });
  } finally {
    client.release();
  }
});

// POST /api/test-cases - 생성
router.post('/', async (req, res) => {
  try {
    const { project_id, requirement_id, attachment_id, title, precondition, steps, expected_result, priority, status, tester, automation_script, status_note, source_category, source_snippet } = req.body;
    if (!project_id) {
      return res.status(400).json({ error: '프로젝트를 선택해주세요.' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Test Case 제목은 필수입니다.' });
    }
    const result = await pool.query(
      `INSERT INTO test_cases (project_id, requirement_id, attachment_id, title, precondition, steps, expected_result, priority, status, tester, automation_script, status_note, source_category, source_snippet)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [project_id, requirement_id || null, attachment_id || null, title, precondition || null, steps || null, expected_result || null, priority || 'medium', status || 'not_run', tester || null, automation_script || null, status_note || null, source_category || null, source_snippet || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Test Case 생성에 실패했습니다.' });
  }
});

// PUT /api/test-cases/:id - 수정
router.put('/:id', async (req, res) => {
  try {
    const { project_id, requirement_id, attachment_id, title, precondition, steps, expected_result, priority, status, tester, automation_script, status_note} = req.body;
    const result = await pool.query(
      `UPDATE test_cases SET
        project_id = COALESCE($1, project_id),
        requirement_id = $2,
        attachment_id = $3,
        title = COALESCE($4, title),
        precondition = $5,
        steps = $6,
        expected_result = $7,
        priority = COALESCE($8, priority),
        status = COALESCE($9, status),
        tester = $10,
        automation_script = $11,
        status_note = $13,
        updated_at = NOW()
        WHERE id = $12 RETURNING *`,
      [project_id, requirement_id || null, attachment_id || null, title, precondition, steps, expected_result, priority, status, tester, automation_script, req.params.id, status_note || null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Test Case를 찾을 수 없습니다.' });
    }

    // 상태가 실제로 넘어온 경우, 프로젝트의 현재 차수를 조회해서 실행 이력에 기록
    if (status) {
      const savedTc = result.rows[0];
      const projectResult = await pool.query(
        'SELECT current_round FROM projects WHERE id = $1',
        [savedTc.project_id]
      );
      const currentRound = projectResult.rows[0]?.current_round || 1;

      await pool.query(
        `INSERT INTO test_execution_history (test_case_id, round, executed_by, status, status_note)
         VALUES ($1, $2, 'manual', $3, $4)`,
        [req.params.id, currentRound, status, status_note || null]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Test Case 수정에 실패했습니다.' });
  }
});

// DELETE /api/test-cases/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM test_cases WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Test Case를 찾을 수 없습니다.' });
    }
    res.json({ message: '삭제되었습니다.', deleted: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Test Case 삭제에 실패했습니다.' });
  }
});

module.exports = router;
