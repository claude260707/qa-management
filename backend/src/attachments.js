const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('./db');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB 제한
});

// GET /api/attachments?project_id=1&requirement_id=2 - 파일 목록
router.get('/', async (req, res) => {
  try {
    const { project_id, requirement_id } = req.query;
    const conditions = [];
    const values = [];
    if (project_id) {
      values.push(project_id);
      conditions.push(`a.project_id = $${values.length}`);
    }
    if (requirement_id) {
      values.push(requirement_id);
      conditions.push(`a.requirement_id = $${values.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT a.*, p.name AS project_name, r.title AS requirement_title
       FROM attachments a
       JOIN projects p ON p.id = a.project_id
       LEFT JOIN requirements r ON r.id = a.requirement_id
       ${whereClause}
       ORDER BY a.created_at DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '파일 목록을 불러오지 못했습니다.' });
  }
});

// POST /api/attachments - 파일 업로드 (multipart/form-data: file, project_id, requirement_id, uploader)
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '업로드할 파일을 선택해주세요.' });
    }
    const { project_id, requirement_id, uploader } = req.body;
    if (!project_id) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '프로젝트를 선택해주세요.' });
    }

    // multer/busboy는 원본 파일명을 latin1으로 디코딩하므로 한글 파일명은 UTF-8로 재변환 필요
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    const result = await pool.query(
      `INSERT INTO attachments (project_id, requirement_id, type, stored_name, original_name, mime_type, file_size, uploader)
       VALUES ($1, $2, 'file', $3, $4, $5, $6, $7) RETURNING *`,
      [project_id, requirement_id || null, req.file.filename, originalName, req.file.mimetype, req.file.size, uploader || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '파일 업로드에 실패했습니다.' });
  }
});

// POST /api/attachments/links - 링크(URL) 추가 (JSON body: project_id, requirement_id, title, url, uploader)
router.post('/links', async (req, res) => {
  try {
    const { project_id, requirement_id, title, url, uploader, summary } = req.body;
    if (!project_id) {
      return res.status(400).json({ error: '프로젝트를 선택해주세요.' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ error: '링크 제목을 입력해주세요.' });
    }
    if (!url || !/^https?:\/\//.test(url.trim())) {
      return res.status(400).json({ error: 'http:// 또는 https://로 시작하는 올바른 URL을 입력해주세요.' });
    }

    const result = await pool.query(
      `INSERT INTO attachments (project_id, requirement_id, type, original_name, url, file_size, uploader, summary)
       VALUES ($1, $2, 'link', $3, $4, 0, $5, $6) RETURNING *`,
      [project_id, requirement_id || null, title.trim(), url.trim(), uploader || null, summary?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '링크 추가에 실패했습니다.' });
  }
});

// GET /api/attachments/:id/download - 파일 다운로드
router.get('/:id/download', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
    const file = result.rows[0];
    if (file.type === 'link') {
      return res.status(400).json({ error: '링크 항목은 다운로드할 수 없습니다. URL로 직접 접속해주세요.' });
    }
    const filePath = path.join(UPLOAD_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '서버에서 파일이 삭제되었습니다.' });
    }
    res.download(filePath, file.original_name);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '파일 다운로드에 실패했습니다.' });
  }
});

// DELETE /api/attachments/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM attachments WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
    const deleted = result.rows[0];
    if (deleted.type === 'file' && deleted.stored_name) {
      const filePath = path.join(UPLOAD_DIR, deleted.stored_name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    res.json({ message: '삭제되었습니다.', deleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '파일 삭제에 실패했습니다.' });
  }
});

module.exports = router;
