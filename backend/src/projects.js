const express = require('express');
const router = express.Router();
const pool = require('./db');

// GET /api/projects - 전체 목록 (검색/필터 지원)
router.get('/', async (req, res) => {
  try {
    const { status, keyword } = req.query;
    const conditions = [];
    const values = [];

    if (status && status !== 'all') {
      values.push(status);
      conditions.push(`p.status = $${values.length}`);
    }
    if (keyword) {
      values.push(`%${keyword}%`);
      conditions.push(`(p.name ILIKE $${values.length} OR p.description ILIKE $${values.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    // progress는 더 이상 사용자가 입력하는 값이 아니라, 해당 프로젝트 Test Case 중
    // Pass 상태 비율로 매번 계산한다. TC가 하나도 없으면 0%로 처리.
    const result = await pool.query(
      `SELECT
        p.id, p.name, p.description, p.status, p.manager,
        p.start_date, p.end_date, p.created_at, p.updated_at,
        COALESCE(ROUND(100.0 * COUNT(tc.id) FILTER (WHERE tc.status = 'pass') / NULLIF(COUNT(tc.id), 0)), 0)::int AS progress
       FROM projects p
       LEFT JOIN test_cases tc ON tc.project_id = p.id
       ${whereClause}
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '프로젝트 목록을 불러오지 못했습니다.' });
  }
});

// GET /api/projects/:id - 단건 조회
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        p.id, p.name, p.description, p.status, p.manager,
        p.start_date, p.end_date, p.created_at, p.updated_at,
        COALESCE(ROUND(100.0 * COUNT(tc.id) FILTER (WHERE tc.status = 'pass') / NULLIF(COUNT(tc.id), 0)), 0)::int AS progress
       FROM projects p
       LEFT JOIN test_cases tc ON tc.project_id = p.id
       WHERE p.id = $1
       GROUP BY p.id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '프로젝트를 불러오지 못했습니다.' });
  }
});

// POST /api/projects - 생성
router.post('/', async (req, res) => {
  try {
    const { name, description, status, manager, start_date, end_date } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '프로젝트명은 필수입니다.' });
    }
    // progress는 더 이상 사용자가 입력하지 않고 Test Case 통과율로 자동 계산되므로 여기서 받지 않는다.
    const result = await pool.query(
      `INSERT INTO projects (name, description, status, manager, start_date, end_date, progress)
       VALUES ($1, $2, $3, $4, $5, $6, 0) RETURNING id`,
      [name, description || null, status || 'planning', manager || null, start_date || null, end_date || null]
    );
    const created = await pool.query(
      `SELECT
        p.id, p.name, p.description, p.status, p.manager,
        p.start_date, p.end_date, p.created_at, p.updated_at,
        0::int AS progress
       FROM projects p WHERE p.id = $1`,
      [result.rows[0].id]
    );
    res.status(201).json(created.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '프로젝트 생성에 실패했습니다.' });
  }
});

// PUT /api/projects/:id - 수정
router.put('/:id', async (req, res) => {
  try {
    const { name, description, status, manager, start_date, end_date } = req.body;
    // progress는 더 이상 사용자가 수정하지 않고 Test Case 통과율로 자동 계산되므로 여기서 받지 않는다.
    const result = await pool.query(
      `UPDATE projects SET
        name = COALESCE($1, name),
        description = $2,
        status = COALESCE($3, status),
        manager = $4,
        start_date = $5,
        end_date = $6,
        updated_at = NOW()
       WHERE id = $7 RETURNING id`,
      [name, description, status, manager, start_date, end_date, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    }
    const updated = await pool.query(
      `SELECT
        p.id, p.name, p.description, p.status, p.manager,
        p.start_date, p.end_date, p.created_at, p.updated_at,
        COALESCE(ROUND(100.0 * COUNT(tc.id) FILTER (WHERE tc.status = 'pass') / NULLIF(COUNT(tc.id), 0)), 0)::int AS progress
       FROM projects p
       LEFT JOIN test_cases tc ON tc.project_id = p.id
       WHERE p.id = $1
       GROUP BY p.id`,
      [req.params.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '프로젝트 수정에 실패했습니다.' });
  }
});

// DELETE /api/projects/:id - 삭제
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    }
    res.json({ message: '삭제되었습니다.', deleted: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '프로젝트 삭제에 실패했습니다.' });
  }
});

module.exports = router;
