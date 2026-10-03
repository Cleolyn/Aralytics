const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

/**
 * POST /api/assessment/submit
 * Requirements:
 * - Saves quiz attempt
 * - Logs proctoring security flags (TAB_SWITCH / WINDOW_BLUR)
 * - Updates gradebook
 * - Automated Hook Logic: if (score / total_points) < 0.75, queries materials matching
 *   competency_id where is_remedial = true, and automatically inserts an entry into interventions.
 */
async function submitAssessment(req, res, next) {
  try {
    const {
      quiz_id,
      student_id,
      score,
      total_points,
      tab_switch_count = 0,
      security_events = []
    } = req.body;

    // 1. Parameter Validation
    if (!quiz_id || !student_id || score === undefined || total_points === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: quiz_id, student_id, score, and total_points are mandatory.'
      });
    }

    const numericScore = Number(score);
    const numericTotal = Number(total_points);

    if (numericTotal <= 0) {
      return res.status(400).json({
        success: false,
        message: 'total_points must be a positive number greater than 0.'
      });
    }

    if (numericScore < 0 || numericScore > numericTotal) {
      return res.status(400).json({
        success: false,
        message: 'score must be between 0 and total_points.'
      });
    }

    // 2. Query Quiz and Competency
    const { rows: quizRows } = await db.query(
      `SELECT q.*, c.id as comp_id, c.topic_title, c.ilaw_category, q.passing_score
       FROM quizzes q
       JOIN competencies c ON q.competency_id = c.id
       WHERE q.id = ? LIMIT 1`,
      [quiz_id]
    );

    if (quizRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Quiz with ID '${quiz_id}' not found.`
      });
    }

    const quiz = quizRows[0];
    const isPassed = (quiz.passing_score && numericTotal === quiz.total_points)
      ? numericScore >= quiz.passing_score
      : (numericScore / numericTotal) >= 0.75;
    const percentage = Number(((numericScore / numericTotal) * 100).toFixed(2));
    const ratio = numericScore / numericTotal;

    const attemptId = `att-${uuidv4()}`;
    let interventionTriggered = false;
    let createdInterventionId = null;
    let recommendedMaterial = null;

    // 3. Atomic Database Transaction
    await db.transaction(async (tx) => {
      // A. Insert Quiz Attempt
      await tx.query(
        `INSERT INTO quiz_attempts 
         (id, quiz_id, student_id, score, total_points, is_passed, tab_switch_count, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          attemptId,
          quiz_id,
          student_id,
          numericScore,
          numericTotal,
          isPassed ? 1 : 0,
          Number(tab_switch_count) || 0
        ]
      );

      // A2. Synchronize with quiz_submissions and quiz_submission_answers for Unified Item Analysis
      const subId = `sub-${attemptId.slice(4)}`;
      await tx.query(
        `INSERT OR REPLACE INTO quiz_submissions 
         (id, quiz_id, student_id, started_at, submitted_at, score_obtained, percentage, is_passed, blur_count, is_flagged_for_cheating, status)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 'SUBMITTED')`,
        [
          subId,
          quiz_id,
          student_id,
          numericScore,
          percentage,
          isPassed ? 1 : 0,
          Number(tab_switch_count) || 0,
          Number(tab_switch_count) >= 3 ? 1 : 0
        ]
      );

      if (Array.isArray(req.body.answers) && req.body.answers.length > 0) {
        const { rows: questions } = await tx.query(
          `SELECT id, question_type, correct_answer, points FROM quiz_questions WHERE quiz_id = ?`,
          [quiz_id]
        );
        const qMap = new Map();
        questions.forEach(q => qMap.set(q.id, q));

        for (const ans of req.body.answers) {
          const q = qMap.get(ans.question_id);
          if (!q) continue;

          const sRaw = String(ans.selected_answer || '').trim();
          const cRaw = String(q.correct_answer || '').trim();
          let isCorrect = false;

          if (q.question_type === 'IDENTIFICATION') {
            const norm = sRaw.toLowerCase().replace(/['".,]/g, '').trim();
            const aliases = cRaw.split('|').map(s => s.toLowerCase().replace(/['".,]/g, '').trim());
            isCorrect = aliases.includes(norm);
          } else if (q.question_type === 'MATCHING') {
            try {
              const sObj = typeof ans.selected_answer === 'object' ? ans.selected_answer : JSON.parse(sRaw);
              const cObj = JSON.parse(cRaw);
              let allMatch = true;
              for (const k of Object.keys(cObj)) {
                if (String(sObj[k] || '').trim().toLowerCase() !== String(cObj[k] || '').trim().toLowerCase()) {
                  allMatch = false;
                  break;
                }
              }
              isCorrect = allMatch;
            } catch (e) {
              isCorrect = sRaw.toLowerCase() === cRaw.toLowerCase();
            }
          } else if (q.question_type === 'TRUE_FALSE') {
            const sNorm = sRaw.toUpperCase();
            const cNorm = cRaw.toUpperCase();
            const isTrueEquiv = (v) => v === 'TRUE' || v === 'TAMA' || v === 'T' || v === '1';
            const isFalseEquiv = (v) => v === 'FALSE' || v === 'MALI' || v === 'F' || v === '0';
            isCorrect = (isTrueEquiv(sNorm) && isTrueEquiv(cNorm)) || (isFalseEquiv(sNorm) && isFalseEquiv(cNorm));
          } else {
            isCorrect = sRaw.toLowerCase() === cRaw.toLowerCase();
          }

          const ansId = `qsa-${uuidv4()}`;
          await tx.query(
            `INSERT INTO quiz_submission_answers 
             (id, submission_id, question_id, selected_answer, is_correct, points_awarded)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              ansId,
              subId,
              q.id,
              typeof ans.selected_answer === 'object' ? JSON.stringify(ans.selected_answer) : sRaw,
              isCorrect ? 1 : 0,
              isCorrect ? q.points : 0
            ]
          );
        }
      }

      // B. Insert Security Logs (TAB_SWITCH / WINDOW_BLUR)

      if (Array.isArray(security_events) && security_events.length > 0) {
        for (const evt of security_events) {
          const logId = `sec-${uuidv4()}`;
          const eventType = evt.event_type === 'WINDOW_BLUR' ? 'WINDOW_BLUR' : 'TAB_SWITCH';
          await tx.query(
            `INSERT INTO security_logs (id, attempt_id, event_type, timestamp)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [logId, attemptId, eventType]
          );
        }
      }

      // C. Database Hook Logic: Automated Remediation Check (Percentage < 75%)
      if (ratio < 0.75) {
        // Query materials matching competency_id where is_remedial = true
        const { rows: matRows } = await tx.query(
          `SELECT id, title, file_path, file_type 
           FROM materials 
           WHERE competency_id = ? AND is_remedial = 1
           ORDER BY created_at ASC LIMIT 1`,
          [quiz.comp_id]
        );

        const materialId = matRows.length > 0 ? matRows[0].id : null;
        if (matRows.length > 0) {
          recommendedMaterial = matRows[0];
        }

        createdInterventionId = `intv-${uuidv4()}`;
        await tx.query(
          `INSERT INTO interventions 
           (id, student_id, competency_id, recommended_material_id, status, updated_at)
           VALUES (?, ?, ?, ?, 'RECOMMENDED', CURRENT_TIMESTAMP)`,
          [createdInterventionId, student_id, quiz.comp_id, materialId]
        );

        interventionTriggered = true;
      } else if (isPassed) {
        await tx.query(
          `UPDATE interventions 
           SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
           WHERE student_id = ? AND competency_id = ? AND status IN ('ASSIGNED', 'RECOMMENDED')`,
          [student_id, quiz.comp_id]
        );
      }
    });


    // 4. Return Unified Response
    return res.status(201).json({
      success: true,
      message: 'Assessment attempt saved, security flags logged, and gradebook updated successfully.',
      attempt: {
        id: attemptId,
        quiz_id,
        student_id,
        score: numericScore,
        total_points: numericTotal,
        percentage,
        is_passed: Boolean(isPassed),
        tab_switch_count: Number(tab_switch_count) || 0
      },
      security: {
        flags_recorded: security_events.length,
        is_flagged: Number(tab_switch_count) >= 3
      },
      intervention: {
        triggered: interventionTriggered,
        intervention_id: createdInterventionId,
        threshold_percentage: 75.0,
        recommended_material: recommendedMaterial
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/interventions/flagged
 * Requirements:
 * - Retrieves flagged students with recommended remediation sets for teacher approval.
 * - Includes:
 *   * Student details (id, full_name, email, section_id)
 *   * Competency & ILAW details
 *   * Triggering attempt score, tab switches, and submission timestamp
 *   * Recommended remedial material metadata
 *   * Remediation status ('RECOMMENDED' | 'ASSIGNED' | 'COMPLETED')
 */
async function getFlaggedInterventions(req, res, next) {
  try {
    const { section_id, status } = req.query;

    let query = `
      SELECT 
        i.id as intervention_id,
        i.status as intervention_status,
        i.updated_at as intervention_updated_at,
        u.id as student_id,
        u.full_name as student_name,
        u.email as student_email,
        u.section_id,
        c.id as competency_id,
        c.quarter,
        c.topic_title,
        c.ilaw_category,
        c.description as competency_description,
        m.id as material_id,
        m.title as material_title,
        m.file_path as material_file_path,
        m.file_type as material_file_type,
        qa.id as latest_attempt_id,
        qa.score as latest_score,
        qa.total_points as latest_total_points,
        qa.tab_switch_count as latest_tab_switches,
        qa.submitted_at as latest_submitted_at,
        ROUND((CAST(qa.score AS REAL) / CAST(qa.total_points AS REAL)) * 100, 2) as calculated_percentage
      FROM interventions i
      JOIN users u ON i.student_id = u.id
      JOIN competencies c ON i.competency_id = c.id
      LEFT JOIN materials m ON i.recommended_material_id = m.id
      LEFT JOIN (
        SELECT qa.*, q.competency_id,
               ROW_NUMBER() OVER (PARTITION BY qa.student_id, q.competency_id ORDER BY qa.submitted_at DESC, qa.rowid DESC) as rn
        FROM quiz_attempts qa
        JOIN quizzes q ON qa.quiz_id = q.id
      ) qa ON qa.student_id = i.student_id AND qa.competency_id = i.competency_id AND qa.rn = 1
      WHERE 1=1
    `;

    const params = [];

    if (section_id) {
      query += ` AND u.section_id = ?`;
      params.push(section_id);
    }

    if (status) {
      query += ` AND i.status = ?`;
      params.push(status.toUpperCase());
    } else {
      // Default: Return pending items for teacher approval ('RECOMMENDED' or 'ASSIGNED')
      query += ` AND i.status IN ('RECOMMENDED', 'ASSIGNED')`;
    }

    query += ` ORDER BY qa.tab_switch_count DESC, i.updated_at DESC`;

    const { rows: flaggedRecords } = await db.query(query, params);

    res.json({
      success: true,
      count: flaggedRecords.length,
      data: flaggedRecords.map((r) => ({
        intervention_id: r.intervention_id,
        status: r.intervention_status,
        updated_at: r.intervention_updated_at,
        student: {
          id: r.student_id,
          name: r.student_name,
          email: r.student_email,
          section: r.section_id
        },
        competency: {
          id: r.competency_id,
          quarter: r.quarter,
          topic_title: r.topic_title,
          ilaw_category: r.ilaw_category,
          description: r.competency_description
        },
        assessment_metrics: {
          attempt_id: r.latest_attempt_id,
          score: r.latest_score,
          total_points: r.latest_total_points,
          percentage: r.calculated_percentage !== null ? Number(r.calculated_percentage) : null,
          tab_switch_count: r.latest_tab_switches || 0,
          is_proctoring_flagged: (r.latest_tab_switches || 0) >= 3,
          submitted_at: r.latest_submitted_at
        },
        recommended_remediation: r.material_id ? {
          material_id: r.material_id,
          title: r.material_title,
          file_path: r.material_file_path,
          file_type: r.material_file_type
        } : null
      }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/interventions/:id/approve
 * Approves a recommended intervention and assigns it to the student.
 */
async function approveIntervention(req, res, next) {
  try {
    const { id } = req.params;
    const { material_id } = req.body;

    const { rows } = await db.query(`SELECT * FROM interventions WHERE id = ? LIMIT 1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Intervention not found.' });
    }

    let query = `UPDATE interventions SET status = 'ASSIGNED', updated_at = CURRENT_TIMESTAMP`;
    const params = [];

    if (material_id) {
      query += `, recommended_material_id = ?`;
      params.push(material_id);
    }

    query += ` WHERE id = ?`;
    params.push(id);

    await db.query(query, params);

    res.json({
      success: true,
      message: 'Intervention approved and officially assigned to student in Ways Forward.',
      intervention_id: id,
      new_status: 'ASSIGNED'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/security/log-event
 * Asynchronously posts browser visibilitychange and blur event timestamps.
 */
async function logSecurityEvent(req, res, next) {
  try {
    const { attempt_id, quiz_id, student_id, event_type, timestamp } = req.body;
    const resolvedType = event_type === 'WINDOW_BLUR' ? 'WINDOW_BLUR' : 'TAB_SWITCH';
    const logId = `sec-${uuidv4()}`;

    if (attempt_id) {
      await db.query(
        `INSERT INTO security_logs (id, attempt_id, event_type, timestamp)
         VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
        [logId, attempt_id, resolvedType, timestamp || null]
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Security event recorded successfully.',
      log_id: logId,
      event_type: resolvedType,
      timestamp: timestamp || new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submitAssessment,
  getFlaggedInterventions,
  approveIntervention,
  logSecurityEvent
};
