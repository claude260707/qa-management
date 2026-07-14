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
      conditions.push(`status = $${values.length}`);
    }
    if (keyword) {
      values.push(`%${keyword}%`);
      conditions.push(`(name ILIKE $${values.length} OR description ILIKE $${values.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM projects ${whereClause} ORDER BY created_at DESC`,
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
    const result = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
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
    const { name, description, status, manager, start_date, end_date, progress } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '프로젝트명은 필수입니다.' });
    }
    const result = await pool.query(
      `INSERT INTO projects (name, description, status, manager, start_date, end_date, progress)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, description || null, status || 'planning', manager || null, start_date || null, end_date || null, progress || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '프로젝트 생성에 실패했습니다.' });
  }
});

// PUT /api/projects/:id - 수정
router.put('/:id', async (req, res) => {
  try {
    const { name, description, status, manager, start_date, end_date, progress } = req.body;
    const result = await pool.query(
      `UPDATE projects SET
        name = COALESCE($1, name),
        description = $2,
        status = COALESCE($3, status),
        manager = $4,
        start_date = $5,
        end_date = $6,
        progress = COALESCE($7, progress),
        updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [name, description, status, manager, start_date, end_date, progress, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    }
    res.json(result.rows[0]);
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
