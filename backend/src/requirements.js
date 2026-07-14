const express = require('express');
const router = express.Router();
const pool = require('./db');
const { notifyRequirementStatusChange } = require('./notify');

// GET /api/requirements - 전체 목록 (프로젝트/상태/우선순위/검색 필터)
router.get('/', async (req, res) => {
  try {
    const { project_id, status, priority, keyword } = req.query;
    const conditions = [];
    const values = [];

    if (project_id) {
      values.push(project_id);
      conditions.push(`r.project_id = $${values.length}`);
    }
    if (status && status !== 'all') {
      values.push(status);
      conditions.push(`r.status = $${values.length}`);
    }
    if (priority && priority !== 'all') {
      values.push(priority);
      conditions.push(`r.priority = $${values.length}`);
    }
    if (keyword) {
      values.push(`%${keyword}%`);
      conditions.push(`(r.title ILIKE $${values.length} OR r.description ILIKE $${values.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT r.*, p.name AS project_name
       FROM requirements r
       JOIN projects p ON p.id = r.project_id
       ${whereClause}
       ORDER BY r.created_at DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '요구사항 목록을 불러오지 못했습니다.' });
  }
});

// GET /api/requirements/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, p.name AS project_name FROM requirements r JOIN projects p ON p.id = r.project_id WHERE r.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '요구사항을 찾을 수 없습니다.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '요구사항을 불러오지 못했습니다.' });
  }
});

// POST /api/requirements - 생성
router.post('/', async (req, res) => {
  try {
    const { project_id, title, description, category, priority, status, requester } = req.body;
    if (!project_id) {
      return res.status(400).json({ error: '프로젝트를 선택해주세요.' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ error: '요구사항 제목은 필수입니다.' });
    }
    const result = await pool.query(
      `INSERT INTO requirements (project_id, title, description, category, priority, status, requester)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [project_id, title, description || null, category || 'functional', priority || 'medium', status || 'draft', requester || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '요구사항 생성에 실패했습니다.' });
  }
});

// PUT /api/requirements/:id - 수정
router.put('/:id', async (req, res) => {
  try {
    const { project_id, title, description, category, priority, status, requester } = req.body;

    // 알림을 위해 변경 전 상태와 프로젝트명을 먼저 조회
    const before = await pool.query(
      `SELECT r.status, r.title, p.name AS project_name
       FROM requirements r JOIN projects p ON p.id = r.project_id
       WHERE r.id = $1`,
      [req.params.id]
    );

    const result = await pool.query(
      `UPDATE requirements SET
        project_id = COALESCE($1, project_id),
        title = COALESCE($2, title),
        description = $3,
        category = COALESCE($4, category),
        priority = COALESCE($5, priority),
        status = COALESCE($6, status),
        requester = $7,
        updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [project_id, title, description, category, priority, status, requester, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '요구사항을 찾을 수 없습니다.' });
    }

    const updated = result.rows[0];
    if (before.rows.length > 0) {
      notifyRequirementStatusChange({
        requirementTitle: updated.title,
        projectName: before.rows[0].project_name,
        oldStatus: before.rows[0].status,
        newStatus: updated.status,
        requester: updated.requester,
      }); // 알림은 실패해도 응답에 영향 없도록 await 안 함
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '요구사항 수정에 실패했습니다.' });
  }
});

// DELETE /api/requirements/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM requirements WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '요구사항을 찾을 수 없습니다.' });
    }
    res.json({ message: '삭제되었습니다.', deleted: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '요구사항 삭제에 실패했습니다.' });
  }
});

module.exports = router;
