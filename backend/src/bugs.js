const express = require('express');
const router = express.Router();
const pool = require('./db');

// GET /api/bugs - 목록 (project_id, test_case_id, release_id, status, severity, keyword 필터)
router.get('/', async (req, res) => {
  try {
    const { project_id, test_case_id, release_id, status, severity, keyword } = req.query;
    const conditions = [];
    const values = [];

    if (project_id) {
      values.push(project_id);
      conditions.push(`b.project_id = $${values.length}`);
    }
    if (test_case_id) {
      values.push(test_case_id);
      conditions.push(`b.test_case_id = $${values.length}`);
    }
    if (release_id) {
      values.push(release_id);
      conditions.push(`b.release_id = $${values.length}`);
    }
    if (status && status !== 'all') {
      values.push(status);
      conditions.push(`b.status = $${values.length}`);
    }
    if (severity && severity !== 'all') {
      values.push(severity);
      conditions.push(`b.severity = $${values.length}`);
    }
    if (keyword) {
      values.push(`%${keyword}%`);
      conditions.push(`(b.title ILIKE $${values.length} OR b.description ILIKE $${values.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT b.*,
              p.name AS project_name,
              tc.title AS test_case_title,
              r.title AS requirement_title,
              rl.version AS release_version
       FROM bugs b
       JOIN projects p ON p.id = b.project_id
       LEFT JOIN test_cases tc ON tc.id = b.test_case_id
       LEFT JOIN requirements r ON r.id = b.requirement_id
       LEFT JOIN releases rl ON rl.id = b.release_id
       ${whereClause}
       ORDER BY b.created_at DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bug 목록을 불러오지 못했습니다.' });
  }
});

// GET /api/bugs/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, p.name AS project_name, tc.title AS test_case_title, r.title AS requirement_title, rl.version AS release_version
       FROM bugs b
       JOIN projects p ON p.id = b.project_id
       LEFT JOIN test_cases tc ON tc.id = b.test_case_id
       LEFT JOIN requirements r ON r.id = b.requirement_id
       LEFT JOIN releases rl ON rl.id = b.release_id
       WHERE b.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bug를 찾을 수 없습니다.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bug를 불러오지 못했습니다.' });
  }
});

// POST /api/bugs - 생성 (실패한 TC에서 등록 시 test_case_id 포함, 독립 등록 시 null)
router.post('/', async (req, res) => {
  try {
    const { project_id, test_case_id, requirement_id, release_id, title, description, steps_to_reproduce, expected_result, actual_result, severity, status, reporter, assignee } = req.body;
    if (!project_id) {
      return res.status(400).json({ error: '프로젝트를 선택해주세요.' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Bug 제목은 필수입니다.' });
    }
    const result = await pool.query(
      `INSERT INTO bugs (project_id, test_case_id, requirement_id, release_id, title, description, steps_to_reproduce, expected_result, actual_result, severity, status, reporter, assignee)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [project_id, test_case_id || null, requirement_id || null, release_id || null, title, description || null, steps_to_reproduce || null, expected_result || null, actual_result || null, severity || 'medium', status || 'open', reporter || null, assignee || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bug 생성에 실패했습니다.' });
  }
});

// PUT /api/bugs/:id - 수정
router.put('/:id', async (req, res) => {
  try {
    const { project_id, test_case_id, requirement_id, release_id, title, description, steps_to_reproduce, expected_result, actual_result, severity, status, reporter, assignee } = req.body;
    const result = await pool.query(
      `UPDATE bugs SET
        project_id = COALESCE($1, project_id),
        test_case_id = $2,
        requirement_id = $3,
        release_id = $4,
        title = COALESCE($5, title),
        description = $6,
        steps_to_reproduce = $7,
        expected_result = $8,
        actual_result = $9,
        severity = COALESCE($10, severity),
        status = COALESCE($11, status),
        reporter = $12,
        assignee = $13,
        updated_at = NOW()
       WHERE id = $14 RETURNING *`,
      [project_id, test_case_id || null, requirement_id || null, release_id || null, title, description, steps_to_reproduce, expected_result, actual_result, severity, status, reporter, assignee, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bug를 찾을 수 없습니다.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bug 수정에 실패했습니다.' });
  }
});

// DELETE /api/bugs/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM bugs WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bug를 찾을 수 없습니다.' });
    }
    res.json({ message: '삭제되었습니다.', deleted: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bug 삭제에 실패했습니다.' });
  }
});

module.exports = router;
