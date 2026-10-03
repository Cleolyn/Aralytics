const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

async function getAllMaterials(req, res, next) {
  try {
    const { competency_id, file_type } = req.query;

    let query = `
      SELECT m.*, lc.melc_code, lc.ilaw_tag, lc.description as competency_description,
             u.first_name as author_first_name, u.last_name as author_last_name
      FROM instructional_materials m
      JOIN learning_competencies lc ON m.competency_id = lc.id
      JOIN users u ON m.created_by = u.id
    `;
    const params = [];

    const conditions = [];
    if (competency_id) {
      conditions.push(`m.competency_id = ?`);
      params.push(competency_id);
    }
    if (file_type) {
      conditions.push(`m.file_type = ?`);
      params.push(file_type.toUpperCase());
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY m.created_at DESC`;

    const { rows: materials } = await db.query(query, params);

    res.json({
      success: true,
      count: materials.length,
      materials
    });
  } catch (err) {
    next(err);
  }
}

async function getMaterialById(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT m.*, lc.melc_code, lc.ilaw_tag, lc.description as competency_description
       FROM instructional_materials m
       JOIN learning_competencies lc ON m.competency_id = lc.id
       WHERE m.id = ? LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Material not found.' });
    }

    res.json({ success: true, material: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function createMaterial(req, res, next) {
  try {
    const { competency_id, title, description, file_type, storage_url, file_size_bytes } = req.body;

    if (!competency_id || !title || !file_type || !storage_url) {
      return res.status(400).json({
        success: false,
        message: 'competency_id, title, file_type, and storage_url are required.'
      });
    }

    const materialId = `mat-${uuidv4()}`;
    const contentHash = crypto.createHash('sha256').update(title + storage_url).digest('hex');

    await db.query(
      `INSERT INTO instructional_materials 
       (id, competency_id, title, description, file_type, storage_url, file_size_bytes, content_hash, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        materialId,
        competency_id,
        title.trim(),
        description || null,
        file_type.toUpperCase(),
        storage_url.trim(),
        Number(file_size_bytes) || 1024,
        contentHash,
        req.user.id
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Instructional material uploaded and indexed for offline caching.',
      materialId
    });
  } catch (err) {
    next(err);
  }
}

// Download/Content Stream endpoint providing deterministic sample payloads with ETags
function streamMaterialFile(req, res) {
  const { filename } = req.params;
  const etag = crypto.createHash('md5').update(filename).digest('hex');

  res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  res.setHeader('ETag', `"${etag}"`);

  if (req.headers['if-none-match'] === `"${etag}"`) {
    return res.status(304).end();
  }

  if (filename.endsWith('.pdf')) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.send(`%PDF-1.4\n1 0 obj\n<< /Title (Aralytics AP10 Module) /Author (Cleo Ponce) >>\nendobj\n%%EOF`);
  } else if (filename.endsWith('.pptx')) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from('ARALYTICS_POWERPOINT_RESOURCE_STREAM'));
  } else if (filename.endsWith('.mp4')) {
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.send(Buffer.from('ARALYTICS_MP4_VIDEO_STREAM'));
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  return res.send(Buffer.from('ARALYTICS_GENERIC_LEARNING_RESOURCE'));
}

/**
 * POST /api/materials/sync-read-logs
 * Synchronizes offline material completion and read timestamps queued by student (FR-50).
 */
async function syncReadLogs(req, res, next) {
  try {
    const studentId = req.user.id;
    const { logs } = req.body;

    if (!Array.isArray(logs) || logs.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'logs must be a non-empty array of read log objects.'
      });
    }

    const synced = [];
    for (const log of logs) {
      const materialId = log.material_id;
      const readAt = log.read_at || new Date().toISOString();
      const logId = `mrl-${uuidv4().slice(0, 8)}`;

      if (!materialId) continue;

      const { rows: existing } = await db.query(
        `SELECT id FROM material_read_logs WHERE student_id = ? AND material_id = ? LIMIT 1`,
        [studentId, materialId]
      );

      if (existing.length > 0) {
        await db.query(
          `UPDATE material_read_logs 
           SET read_at = ?, synced_from_offline = 1 
           WHERE id = ?`,
          [readAt, existing[0].id]
        );
        synced.push(existing[0].id);
      } else {
        await db.query(
          `INSERT INTO material_read_logs (id, student_id, material_id, read_at, synced_from_offline)
           VALUES (?, ?, ?, ?, 1)`,
          [logId, studentId, materialId, readAt]
        );
        synced.push(logId);
      }
    }

    res.json({
      success: true,
      message: `Synchronized ${synced.length} offline reading log(s) to server.`,
      synced_count: synced.length,
      synced_ids: synced
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/materials/read-logs
 * Retrieves read logs for current student or all logs if teacher.
 */
async function getReadLogs(req, res, next) {
  try {
    const isTeacher = req.user.role === 'TEACHER';
    const userId = req.user.id;

    let query = `
      SELECT mrl.*, im.title as material_title, im.file_type,
             u.first_name || ' ' || u.last_name as student_name,
             u.lrn_or_id
      FROM material_read_logs mrl
      JOIN instructional_materials im ON mrl.material_id = im.id
      JOIN users u ON mrl.student_id = u.id
    `;
    const params = [];

    if (!isTeacher) {
      query += ` WHERE mrl.student_id = ?`;
      params.push(userId);
    }

    query += ` ORDER BY mrl.read_at DESC`;

    const { rows: logs } = await db.query(query, params);

    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllMaterials,
  getMaterialById,
  createMaterial,
  streamMaterialFile,
  syncReadLogs,
  getReadLogs
};

