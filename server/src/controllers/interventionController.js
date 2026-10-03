const db = require('../config/database');

async function getInterventions(req, res, next) {
  try {
    const isTeacher = req.user.role === 'TEACHER';
    const studentId = req.user.id;
    const { status, section } = req.query;

    let query = `
      SELECT ri.*, 
             lc.melc_code, lc.description as competency_desc, lc.ilaw_tag,
             m.title as remedial_material_title, m.file_type as remedial_file_type, m.storage_url as remedial_storage_url,
             u.id as student_id, u.first_name, u.last_name, u.lrn_or_id, u.section,
             s.score_obtained as trigger_score, s.percentage as trigger_percentage, s.submitted_at as trigger_date
      FROM remedial_interventions ri
      JOIN learning_competencies lc ON ri.competency_id = lc.id
      JOIN users u ON ri.student_id = u.id
      JOIN quiz_submissions s ON ri.trigger_submission_id = s.id
      LEFT JOIN instructional_materials m ON ri.remedial_material_id = m.id
    `;
    const params = [];
    const conditions = [];

    if (!isTeacher) {
      conditions.push(`ri.student_id = ?`);
      params.push(studentId);
    } else if (section) {
      conditions.push(`u.section = ?`);
      params.push(section);
    }

    if (status) {
      conditions.push(`ri.status = ?`);
      params.push(status.toUpperCase());
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY ri.assigned_at DESC`;

    const { rows: interventions } = await db.query(query, params);

    res.json({
      success: true,
      count: interventions.length,
      interventions
    });
  } catch (err) {
    next(err);
  }
}

async function resolveIntervention(req, res, next) {
  try {
    const { id } = req.params;
    const studentId = req.user.id;
    const isTeacher = req.user.role === 'TEACHER';

    const { rows } = await db.query(
      `SELECT * FROM remedial_interventions WHERE id = ? LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Intervention record not found.' });
    }

    const item = rows[0];
    if (!isTeacher && item.student_id !== studentId) {
      return res.status(403).json({ success: false, message: 'Unauthorized modification.' });
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    await db.query(
      `UPDATE remedial_interventions 
       SET status = 'RESOLVED', completed_at = ? 
       WHERE id = ?`,
      [now, id]
    );

    res.json({
      success: true,
      message: 'Remedial intervention completed and resolved successfully.',
      interventionId: id,
      completed_at: now
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getInterventions,
  resolveIntervention
};
