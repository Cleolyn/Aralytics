const path = require('node:path');
const crypto = require('node:crypto');
const storage = require('../services/uploadStorage');
const files = require('../services/fileService');
const materialRoot = path.resolve(__dirname, '../../resources/materials');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

/**
 * Adds download_url (signed, only when the viewer may read the file) and resource_available.
 * Uploaded files are looked up in the files table; older base64 uploads are probed in legacy storage.
 */
async function decorateMaterials(req, materials, markAvailable) {
  await files.decorateUrls(files.envOf(req), req.user, materials, { markAvailable });
  for (const material of materials) {
    if (!material.storage_url?.startsWith('/api/materials/download/')) continue;
    const filename = material.storage_url.split('/').pop();
    try {
      if (filename !== path.basename(filename)) throw new Error('Invalid name');
      if (!await storage.exists(req, 'materials', materialRoot, filename)) throw new Error('Missing file');
      material.resource_available = true;
    } catch { material.resource_available = false; }
  }
}

const mayManage = (req, material) => req.user.role === 'ADMIN' || material.created_by === req.user.id;

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

    await decorateMaterials(req, materials, true);
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

    await decorateMaterials(req, rows, true);
    res.json({ success: true, material: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function createMaterial(req, res, next) {
  try {
    const { competency_id, title, description, file_type, storage_url, file_size_bytes, file_id, file_content_base64 } = req.body;

    if (file_content_base64 !== undefined) {
      return res.status(400).json({ success: false, message: 'Upload the file with POST /api/files, then send its file_id.' });
    }
    if (!competency_id || !title || !file_type) {
      return res.status(400).json({
        success: false,
        message: 'competency_id, title, and file_type are required.'
      });
    }

    const upload = file_id ? await files.requireAttachable(file_id, req.user, 'material') : null;
    const effectiveUrl = upload ? `/api/files/${upload.id}/content` : (storage_url ? storage_url.trim() : '');
    const effectiveSize = upload ? Number(upload.size_bytes) : (Number(file_size_bytes) || 1024);

    if (!effectiveUrl) {
      return res.status(400).json({
        success: false,
        message: 'Either a resource link (storage_url) or an uploaded file is required.'
      });
    }

    const materialId = `mat-${uuidv4()}`;
    const contentHash = crypto.createHash('sha256').update(title + effectiveUrl).digest('hex');

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
        effectiveUrl,
        effectiveSize,
        contentHash,
        req.user.id
      ]
    );
    if (upload) {
      try { await files.attach(upload.id, req.user, 'material', { materialId }); }
      catch (error) {
        await db.query('DELETE FROM instructional_materials WHERE id = ?', [materialId]);
        throw error;
      }
    }

    res.status(201).json({
      success: true,
      message: 'Instructional material uploaded and indexed for offline caching.',
      materialId,
      storage_url: effectiveUrl
    });
  } catch (err) {
    next(err);
  }
}

async function updateMaterial(req, res, next) {
  try {
    const { id } = req.params;
    const { competency_id, title, description, file_type, storage_url, file_id, file_content_base64 } = req.body;

    if (file_content_base64 !== undefined) {
      return res.status(400).json({ success: false, message: 'Upload the file with POST /api/files, then send its file_id.' });
    }
    const { rows: existing } = await db.query(`SELECT * FROM instructional_materials WHERE id = ? LIMIT 1`, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Material not found.' });
    }

    const current = existing[0];
    if (!mayManage(req, current)) {
      return res.status(403).json({ success: false, message: 'Only the teacher who added this lesson can change it.' });
    }
    const upload = file_id ? await files.requireAttachable(file_id, req.user, 'material') : null;
    const newLink = storage_url ? storage_url.trim() : '';
    const effectiveUrl = upload ? `/api/files/${upload.id}/content` : (newLink || current.storage_url);
    const effectiveSize = upload ? Number(upload.size_bytes) : current.file_size_bytes;

    const nextTitle = title ? title.trim() : current.title;
    const nextComp = competency_id || current.competency_id;
    const nextDesc = description !== undefined ? description : current.description;
    const nextType = file_type ? file_type.toUpperCase() : current.file_type;
    const contentHash = crypto.createHash('sha256').update(nextTitle + effectiveUrl).digest('hex');

    await db.query(
      `UPDATE instructional_materials
       SET competency_id = ?, title = ?, description = ?, file_type = ?, storage_url = ?, file_size_bytes = ?, content_hash = ?
       WHERE id = ?`,
      [nextComp, nextTitle, nextDesc, nextType, effectiveUrl, effectiveSize, contentHash, id]
    );
    const env = files.envOf(req);
    if (upload) {
      await files.attach(upload.id, req.user, 'material', { materialId: id });
      await files.deleteForMaterial(env, id, upload.id);
    } else if (effectiveUrl !== current.storage_url) {
      // Switching to a link retires the previously uploaded file.
      await files.deleteForMaterial(env, id);
    }

    res.json({
      success: true,
      message: 'Instructional material updated successfully.',
      materialId: id
    });
  } catch (err) {
    next(err);
  }
}

async function deleteMaterial(req, res, next) {
  try {
    const { id } = req.params;
    const { rows: existing } = await db.query(`SELECT * FROM instructional_materials WHERE id = ? LIMIT 1`, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Material not found.' });
    }

    const current = existing[0];
    if (!mayManage(req, current)) {
      return res.status(403).json({ success: false, message: 'Only the teacher who added this lesson can remove it.' });
    }
    if (current.storage_url && current.storage_url.startsWith('/api/materials/download/')) {
      const fname = path.basename(current.storage_url);
      await storage.remove(req, 'materials', materialRoot, fname);
    }
    await files.deleteForMaterial(files.envOf(req), id);

    await db.query(`DELETE FROM instructional_materials WHERE id = ?`, [id]);

    res.json({
      success: true,
      message: 'Instructional material removed successfully.',
      materialId: id
    });
  } catch (err) {
    next(err);
  }
}

// Older base64 uploads. The route requires a signed ?sig= or a signed-in user.
async function streamMaterialFile(req, res, next) {
  const { filename } = req.params;
  if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename.includes('..')) return res.status(400).json({ success: false, message: 'Invalid resource name.' });
  try {
    const object = await storage.get(req, 'materials', materialRoot, filename);
    if (!object) return res.status(404).json({ success: false, message: 'This lesson file has not been provided yet. Ask your teacher for a working resource link.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(path.extname(filename));
    res.send(object);
  } catch (error) { next(error); }
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
  updateMaterial,
  deleteMaterial,
  streamMaterialFile,
  syncReadLogs,
  getReadLogs
};

