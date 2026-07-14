const express = require('express');
const router = express.Router();
const pool = require('./db');

async function linkRequirements(releaseId, requirementIds) {
  await pool.query('DELETE FROM release_requirements WHERE release_id = $1', [releaseId]);
  if (Array.isArray(requirementIds) && requirementIds.length > 0) {
    await pool.query(
      `INSERT INTO release_requirements (release_id, requirement_id)
       SELECT $1, unnest($2::int[])
       ON CONFLICT DO NOTHING`,
      [releaseId, requirementIds]
    );
  }
}

// GET /api/releases - 목록 (project_id, status, keyword 필터), Bug/요구사항 연결 개수 포함
router.get('/', async (req, res) => {
  try {
    const { project_id, status, keyword } = req.query;
    const conditions = [];
    const values = [];

    if (project_id) {
      values.push(project_id);
      conditions.push(`rl.project_id = $${values.length}`);
    }
    if (status && status !== 'all') {
      values.push(status);
      conditions.push(`rl.status = $${values.length}`);
    }
    if (keyword) {
      values.push(`%${keyword}%`);
      conditions.push(`(rl.version ILIKE $${values.length} OR rl.notes ILIKE $${values.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT rl.*,
              p.name AS project_name,
              COALESCE(bc.cnt, 0)::int AS bug_count,
              COALESCE(rc.cnt, 0)::int AS requirement_count
       FROM releases rl
       JOIN projects p ON p.id = rl.project_id
       LEFT JOIN (SELECT release_id, COUNT(*) cnt FROM bugs WHERE release_id IS NOT NULL GROUP BY release_id) bc ON bc.release_id = rl.id
       LEFT JOIN (SELECT release_id, COUNT(*) cnt FROM release_requirements GROUP BY release_id) rc ON rc.release_id = rl.id
       ${whereClause}
       ORDER BY rl.release_date DESC NULLS FIRST, rl.created_at DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Release 목록을 불러오지 못했습니다.' });
  }
});

// GET /api/releases/:id - 상세 (연결된 Bug 목록 + 요구사항 목록 포함)
router.get('/:id', async (req, res) => {
  try {
    const releaseResult = await pool.query(
      `SELECT rl.*, p.name AS project_name
       FROM releases rl
       JOIN projects p ON p.id = rl.project_id
       WHERE rl.id = $1`,
      [req.params.id]
    );
    if (releaseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Release를 찾을 수 없습니다.' });
    }

    const bugsResult = await pool.query(
      `SELECT id, title, severity, status FROM bugs WHERE release_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    const requirementsResult = await pool.query(
      `SELECT r.id, r.title, r.priority, r.status
       FROM release_requirements rr
       JOIN requirements r ON r.id = rr.requirement_id
       WHERE rr.release_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.id]
    );

    res.json({
      ...releaseResult.rows[0],
      bugs: bugsResult.rows,
      requirements: requirementsResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Release를 불러오지 못했습니다.' });
  }
});

// POST /api/releases - 생성 (requirement_ids로 완료된 요구사항 함께 연결 가능)
router.post('/', async (req, res) => {
  try {
    const { project_id, version, release_date, status, notes, requirement_ids } = req.body;
    if (!project_id) {
      return res.status(400).json({ error: '프로젝트를 선택해주세요.' });
    }
    if (!version || !version.trim()) {
      return res.status(400).json({ error: '버전명은 필수입니다.' });
    }
    const result = await pool.query(
      `INSERT INTO releases (project_id, version, release_date, status, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [project_id, version.trim(), release_date || null, status || 'planned', notes || null]
    );
    const release = result.rows[0];
    if (requirement_ids) {
      await linkRequirements(release.id, requirement_ids);
    }
    res.status(201).json(release);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Release 생성에 실패했습니다.' });
  }
});

// PUT /api/releases/:id - 수정 (requirement_ids 전달 시 연결 목록 전체 교체)
router.put('/:id', async (req, res) => {
  try {
    const { project_id, version, release_date, status, notes, requirement_ids } = req.body;
    const result = await pool.query(
      `UPDATE releases SET
        project_id = COALESCE($1, project_id),
        version = COALESCE($2, version),
        release_date = $3,
        status = COALESCE($4, status),
        notes = $5,
        updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [project_id, version, release_date || null, status, notes, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Release를 찾을 수 없습니다.' });
    }
    if (requirement_ids !== undefined) {
      await linkRequirements(req.params.id, requirement_ids);
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Release 수정에 실패했습니다.' });
  }
});

// DELETE /api/releases/:id (release_requirements는 CASCADE, bugs.release_id는 SET NULL 처리됨)
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM releases WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Release를 찾을 수 없습니다.' });
    }
    res.json({ message: '삭제되었습니다.', deleted: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Release 삭제에 실패했습니다.' });
  }
});

module.exports = router;
