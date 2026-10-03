const db = require('../config/database');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

/**
 * ARALYTICS ANALYTICS SERVICE
 * Powers competency proficiency profiling, automated remediation routing,
 * teacher decision workflows (Approve/Modify/Override), and multi-format exporters.
 */
class AnalyticsService {
  /**
   * 1. PROFICIENCY PROFILING AGGREGATOR
   * Groups mastery into 3 tiers:
   * - Mastered: >= 85%
   * - Developing: 70% - 84.99%
   * - Needs Intervention: < 70%
   */
  static classifyMasteryTier(percentage) {
    const val = Number(percentage);
    if (val >= 85.0) return 'MASTERED';
    if (val >= 70.0) return 'DEVELOPING';
    return 'NEEDS_INTERVENTION';
  }

  static async getProficiencyProfiling(options = {}) {
    const section = options.section_id || options.section;
    const { quarter } = options;

    // Pre-populate all curriculum competencies so all tiers appear in profiling
    let compQuery = `SELECT * FROM competencies WHERE 1=1`;
    const compParams = [];
    if (quarter) {
      compQuery += ` AND quarter = ?`;
      compParams.push(quarter);
    }
    compQuery += ` ORDER BY id ASC`;
    const { rows: allCompetencies } = await db.query(compQuery, compParams);

    const competencyMap = new Map();
    for (const comp of allCompetencies) {
      competencyMap.set(comp.id, {
        competency_id: comp.id,
        quarter: comp.quarter,
        topic_title: comp.topic_title,
        ilaw_category: comp.ilaw_category,
        description: comp.description,
        total_assessed: 0,
        total_percentage_sum: 0,
        students: [],
        tiers: {
          mastered_count: 0,
          developing_count: 0,
          needs_intervention_count: 0
        }
      });
    }

    let query = `
      SELECT 
        c.id as competency_id,
        c.quarter,
        c.topic_title,
        c.ilaw_category,
        c.description as competency_desc,
        u.id as student_id,
        COALESCE(u.full_name, u.first_name || ' ' || u.last_name) as student_name,
        COALESCE(u.section_id, u.section) as section_id,
        qa.id as attempt_id,
        qa.score,
        qa.total_points,
        qa.tab_switch_count,
        qa.submitted_at,
        ROUND((CAST(qa.score AS REAL) / CAST(qa.total_points AS REAL)) * 100, 2) as percentage
      FROM competencies c
      JOIN quizzes q ON q.competency_id = c.id
      JOIN quiz_attempts qa ON qa.quiz_id = q.id
      JOIN users u ON qa.student_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (section) {
      query += ` AND (u.section_id = ? OR u.section = ?)`;
      params.push(section, section);
    }
    if (quarter) {
      query += ` AND c.quarter = ?`;
      params.push(quarter);
    }

    query += ` ORDER BY c.id ASC, qa.submitted_at DESC`;

    const { rows } = await db.query(query, params);

    for (const row of rows) {
      if (!competencyMap.has(row.competency_id)) {
        competencyMap.set(row.competency_id, {
          competency_id: row.competency_id,
          quarter: row.quarter,
          topic_title: row.topic_title,
          ilaw_category: row.ilaw_category,
          description: row.competency_desc,
          total_assessed: 0,
          total_percentage_sum: 0,
          students: [],
          tiers: {
            mastered_count: 0,
            developing_count: 0,
            needs_intervention_count: 0
          }
        });
      }

      const compData = competencyMap.get(row.competency_id);
      const tier = this.classifyMasteryTier(row.percentage);

      if (tier === 'MASTERED') compData.tiers.mastered_count++;
      else if (tier === 'DEVELOPING') compData.tiers.developing_count++;
      else compData.tiers.needs_intervention_count++;

      compData.total_assessed++;
      compData.total_percentage_sum += Number(row.percentage);
      compData.students.push({
        student_id: row.student_id,
        student_name: row.student_name,
        section_id: row.section_id,
        score: row.score,
        total_points: row.total_points,
        percentage: Number(row.percentage),
        tab_switch_count: row.tab_switch_count,
        mastery_tier: tier,
        submitted_at: row.submitted_at
      });
    }

    const aggregated = Array.from(competencyMap.values()).map((comp) => {
      const avgPercentage = comp.total_assessed > 0 
        ? Number((comp.total_percentage_sum / comp.total_assessed).toFixed(2)) 
        : 0;

      return {
        competency_id: comp.competency_id,
        quarter: comp.quarter,
        topic_title: comp.topic_title,
        ilaw_category: comp.ilaw_category,
        description: comp.description,
        total_assessed: comp.total_assessed,
        cohort_average_percentage: avgPercentage,
        mastery_distribution: {
          mastered: {
            count: comp.tiers.mastered_count,
            percentage: comp.total_assessed > 0 ? Number(((comp.tiers.mastered_count / comp.total_assessed) * 100).toFixed(1)) : 0
          },
          developing: {
            count: comp.tiers.developing_count,
            percentage: comp.total_assessed > 0 ? Number(((comp.tiers.developing_count / comp.total_assessed) * 100).toFixed(1)) : 0
          },
          needs_intervention: {
            count: comp.tiers.needs_intervention_count,
            percentage: comp.total_assessed > 0 ? Number(((comp.tiers.needs_intervention_count / comp.total_assessed) * 100).toFixed(1)) : 0
          }
        },
        student_breakdown: comp.students
      };
    });

    return aggregated;
  }

  /**
   * 2. REMEDIATION ROUTING LOGIC
   * Link low-performing students (< 70%) with specific remedial material IDs matching the target competency.
   */
  static async getRemediationRoutingQueue(options = {}) {
    const section = options.section_id || options.section;
    const { status } = options;

    let query = `
      SELECT 
        i.id as intervention_id,
        i.status as intervention_status,
        i.updated_at,
        u.id as student_id,
        COALESCE(u.full_name, u.first_name || ' ' || u.last_name) as student_name,
        u.email as student_email,
        COALESCE(u.section_id, u.section) as section_id,
        c.id as competency_id,
        c.quarter,
        c.topic_title,
        c.ilaw_category,
        m.id as assigned_material_id,
        m.title as assigned_material_title,
        m.file_type as assigned_material_type,
        m.file_path as assigned_material_path,
        qa.id as trigger_attempt_id,
        qa.score,
        qa.total_points,
        qa.tab_switch_count,
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

    if (section) {
      query += ` AND (u.section_id = ? OR u.section = ?)`;
      params.push(section, section);
    }
    if (status) {
      query += ` AND i.status = ?`;
      params.push(status.toUpperCase());
    }

    query += ` ORDER BY i.updated_at DESC`;

    const { rows } = await db.query(query, params);

    // Fetch all available remedial materials per competency to allow Teacher "Modify" selection
    const { rows: remedialCatalog } = await db.query(
      `SELECT id, competency_id, title, file_path, file_type 
       FROM materials 
       WHERE is_remedial = 1`
    );

    const catalogMap = new Map();
    remedialCatalog.forEach(mat => {
      if (!catalogMap.has(mat.competency_id)) catalogMap.set(mat.competency_id, []);
      catalogMap.get(mat.competency_id).push(mat);
    });

    return rows.map(r => ({
      intervention_id: r.intervention_id,
      status: r.intervention_status,
      updated_at: r.updated_at,
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
        ilaw_category: r.ilaw_category
      },
      assessment_performance: {
        attempt_id: r.trigger_attempt_id,
        score: r.score,
        total_points: r.total_points,
        percentage: r.calculated_percentage !== null ? Number(r.calculated_percentage) : null,
        tab_switch_count: r.tab_switch_count || 0,
        is_proctoring_flagged: (r.tab_switch_count || 0) >= 3,
        tier: this.classifyMasteryTier(r.calculated_percentage || 0)
      },
      assigned_remedial_material: r.assigned_material_id ? {
        id: r.assigned_material_id,
        title: r.assigned_material_title,
        file_type: r.assigned_material_type,
        file_path: r.assigned_material_path
      } : null,
      available_competency_remedials: catalogMap.get(r.competency_id) || []
    }));
  }

  /**
   * 2B. TEACHER INTERVENTION DECISION ACTIONS:
   * - "APPROVE": Transitions status from 'RECOMMENDED' -> 'ASSIGNED'
   * - "MODIFY": Changes the recommended remedial material ID and sets to 'ASSIGNED'
   * - "OVERRIDE": Manually overrides (e.g. 'COMPLETED', dismisses, or custom resolution)
   */
  static async updateInterventionDecision(interventionId, action, options = {}) {
    const { material_id, override_status } = options;
    const cleanAction = String(action || '').toUpperCase();

    const { rows: existing } = await db.query(
      `SELECT * FROM interventions WHERE id = ? LIMIT 1`,
      [interventionId]
    );

    if (existing.length === 0) {
      throw new Error(`Intervention with ID '${interventionId}' not found.`);
    }

    let newStatus = 'ASSIGNED';
    let newMaterialId = existing[0].recommended_material_id;

    if (cleanAction === 'APPROVE') {
      newStatus = 'ASSIGNED';
    } else if (cleanAction === 'MODIFY') {
      newStatus = 'ASSIGNED';
      if (material_id) {
        newMaterialId = material_id;
      }
    } else if (cleanAction === 'OVERRIDE') {
      newStatus = override_status ? override_status.toUpperCase() : 'COMPLETED';
    } else {
      throw new Error(`Invalid action '${action}'. Allowed actions: 'APPROVE', 'MODIFY', 'OVERRIDE'.`);
    }

    await db.query(
      `UPDATE interventions 
       SET status = ?, recommended_material_id = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [newStatus, newMaterialId, interventionId]
    );

    return {
      intervention_id: interventionId,
      action: cleanAction,
      new_status: newStatus,
      assigned_material_id: newMaterialId
    };
  }

  /**
   * 3. GRADEBOOK DATA EXPORTERS
   * Formats raw queries into clean structures for SheetJS (.xlsx) and PDFKit (.pdf).
   * Includes: Student Name, Competency Mastery Flags, Tab-Switch Audit Warnings, Raw Scores, Assigned Interventions.
   */
  static async getComprehensiveGradebookDataset(options = {}) {
    const section = options.section_id || options.section;

    let query = `
      SELECT 
        u.id as student_id,
        COALESCE(u.full_name, u.first_name || ' ' || u.last_name) as student_name,
        u.email as student_email,
        COALESCE(u.section_id, u.section) as section_id,
        c.id as competency_id,
        c.quarter,
        c.topic_title,
        c.ilaw_category,
        q.title as quiz_title,
        qa.id as attempt_id,
        qa.score,
        qa.total_points,
        qa.is_passed,
        qa.tab_switch_count,
        qa.submitted_at,
        ROUND((CAST(qa.score AS REAL) / CAST(qa.total_points AS REAL)) * 100, 2) as percentage,
        i.id as intervention_id,
        i.status as intervention_status,
        m.title as remedial_material_title
      FROM quiz_attempts qa
      JOIN quizzes q ON qa.quiz_id = q.id
      JOIN competencies c ON q.competency_id = c.id
      JOIN users u ON qa.student_id = u.id
      LEFT JOIN interventions i ON i.student_id = u.id AND i.competency_id = c.id
      LEFT JOIN materials m ON i.recommended_material_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (section) {
      query += ` AND (u.section_id = ? OR u.section = ?)`;
      params.push(section, section);
    }

    query += ` ORDER BY COALESCE(u.section_id, u.section) ASC, COALESCE(u.full_name, u.first_name || ' ' || u.last_name) ASC, qa.submitted_at DESC`;

    const { rows } = await db.query(query, params);
    return rows;
  }

  static generateSheetJSWorkbook(records) {
    const rows = records.map((r, index) => {
      const tier = this.classifyMasteryTier(r.percentage);
      const isFlagged = Number(r.tab_switch_count) >= 3;

      return {
        'No.': index + 1,
        'Student Name': r.student_name,
        'Class Section': r.section_id || 'N/A',
        'Quarter': r.quarter,
        'Competency Topic': r.topic_title,
        'ILAW Phase': r.ilaw_category,
        'Raw Score': `${r.score} / ${r.total_points}`,
        'Percentage': `${r.percentage}%`,
        'Competency Mastery Flag': tier,
        'Tab-Switch Audit Warnings': isFlagged ? `FLAGGED (${r.tab_switch_count} switches)` : `CLEAN (${r.tab_switch_count})`,
        'Assigned Intervention': r.remedial_material_title ? `${r.remedial_material_title} [${r.intervention_status || 'ASSIGNED'}]` : (tier === 'NEEDS_INTERVENTION' ? 'Pending Routing' : 'None Needed'),
        'Submission Timestamp': r.submitted_at
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Auto-fit column widths
    worksheet['!cols'] = [
      { wch: 6 },  // No.
      { wch: 25 }, // Name
      { wch: 15 }, // Section
      { wch: 10 }, // Quarter
      { wch: 35 }, // Topic
      { wch: 18 }, // ILAW
      { wch: 14 }, // Raw Score
      { wch: 14 }, // Percentage
      { wch: 26 }, // Mastery Flag
      { wch: 28 }, // Tab-Switch Audit
      { wch: 38 }, // Assigned Intervention
      { wch: 22 }  // Timestamp
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Master_Gradebook');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  static renderPDFReport(records, res, options = {}) {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const filename = `Aralytics_AP10_Analytical_Report_${options.section_id || 'All'}.pdf`;

    if (res.setHeader) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }

    doc.pipe(res);

    // DepEd Header
    doc.fontSize(9).font('Helvetica').text('REPUBLIC OF THE PHILIPPINES', { align: 'center' });
    doc.fontSize(11).font('Helvetica-Bold').text('DEPARTMENT OF EDUCATION', { align: 'center' });
    doc.fontSize(9).font('Helvetica').text('PONCE AP10 LEARNING HUB • INTERVENTION & ANALYTICS ENGINE', { align: 'center' });
    doc.moveDown(0.4);

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1e3a8a')
      .text('OFFICIAL COMPETENCY MASTERY & INTERVENTION AUDIT REPORT', { align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor('#4b5563')
      .text(`Generated: ${new Date().toLocaleString()} | Scope: ${options.section_id ? 'Section ' + options.section_id : 'All Enrolled Cohorts'}`, { align: 'center' });
    doc.moveDown(0.8);

    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(36, doc.y).lineTo(560, doc.y).stroke();
    doc.moveDown(0.8);

    // Summary Metric Cards
    const totalRecords = records.length;
    const masteredCount = records.filter(r => Number(r.percentage) >= 85).length;
    const developingCount = records.filter(r => Number(r.percentage) >= 70 && Number(r.percentage) < 85).length;
    const interventionCount = records.filter(r => Number(r.percentage) < 70).length;
    const flaggedAuditCount = records.filter(r => Number(r.tab_switch_count) >= 3).length;

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('COHORT PROFICIENCY BREAKDOWN:');
    doc.font('Helvetica').fontSize(8).fillColor('#374151');
    doc.text(`Mastered (>=85%): ${masteredCount}  |  Developing (70%-84%): ${developingCount}  |  Needs Intervention (<70%): ${interventionCount}  |  Proctoring Flags: ${flaggedAuditCount}`);
    doc.moveDown(0.8);

    // Table Header
    const startY = doc.y;
    doc.rect(36, startY, 524, 20).fill('#f1f5f9');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#1e293b');
    doc.text('Student Name', 40, startY + 6);
    doc.text('Section', 140, startY + 6);
    doc.text('Score', 190, startY + 6);
    doc.text('%', 235, startY + 6);
    doc.text('Mastery Tier', 265, startY + 6);
    doc.text('Proctoring Audit', 355, startY + 6);
    doc.text('Assigned Remediation', 440, startY + 6);

    let curY = startY + 22;

    records.forEach((r, idx) => {
      if (curY > 740) {
        doc.addPage();
        curY = 40;
      }

      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(36, curY, 524, 20).fill(rowBg);

      doc.font('Helvetica').fontSize(7.5).fillColor('#0f172a');
      doc.text(r.student_name, 40, curY + 6, { width: 95, ellipsis: true });
      doc.text(r.section_id || '-', 140, curY + 6);
      doc.text(`${r.score}/${r.total_points}`, 190, curY + 6);
      doc.text(`${r.percentage}%`, 235, curY + 6);

      // Mastery Tier Color
      const tier = this.classifyMasteryTier(r.percentage);
      const tierColor = tier === 'MASTERED' ? '#15803d' : (tier === 'DEVELOPING' ? '#b45309' : '#b91c1c');
      doc.font('Helvetica-Bold').fillColor(tierColor).text(tier, 265, curY + 6);

      // Tab Switch Warnings
      const isFlagged = Number(r.tab_switch_count) >= 3;
      if (isFlagged) {
        doc.fillColor('#dc2626').text(`FLAGGED (${r.tab_switch_count})`, 355, curY + 6);
      } else {
        doc.fillColor('#166534').text(`CLEAN (${r.tab_switch_count})`, 355, curY + 6);
      }

      // Remediation Status
      doc.font('Helvetica').fillColor('#334155');
      const remText = r.remedial_material_title ? r.remedial_material_title : (tier === 'NEEDS_INTERVENTION' ? 'Pending Approval' : 'None');
      doc.text(remText, 440, curY + 6, { width: 115, ellipsis: true });

      curY += 22;
    });

    // Verification Signatures
    doc.moveDown(2);
    if (curY > 710) {
      doc.addPage();
      curY = 50;
    }

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827').text('VERIFICATION & ENDORSEMENT', 36, curY + 16);
    const signY = curY + 40;
    doc.font('Helvetica').fontSize(8).fillColor('#374151');
    doc.text('Evaluated by:', 36, signY);
    doc.font('Helvetica-Bold').text('CLEO PONCE', 36, signY + 20);
    doc.font('Helvetica').text('AP10 Subject Coordinator', 36, signY + 30);

    doc.text('Approved by:', 360, signY);
    doc.font('Helvetica-Bold').text('ACADEMIC HEAD / PRINCIPAL', 360, signY + 20);
    doc.font('Helvetica').text('Department of Education', 360, signY + 30);

    doc.end();
  }

  /**
   * 4. ITEM ANALYSIS ENGINE (SRS FR-21, FR-40)
   * Computes Difficulty Index P = R / T and Discrimination Index D = (R_H - R_L) / N,
   * along with distractor frequencies for upper and lower performance groups.
   */
  static async calculateItemAnalysis(quizId) {
    // 1. Fetch Quiz Info
    const { rows: quizzes } = await db.query(
      `SELECT q.*, c.topic_title, c.ilaw_category, c.quarter 
       FROM quizzes q
       LEFT JOIN competencies c ON q.competency_id = c.id
       WHERE q.id = ? LIMIT 1`,
      [quizId]
    );

    if (quizzes.length === 0) {
      throw new Error(`Quiz with ID '${quizId}' not found.`);
    }

    const quiz = quizzes[0];

    // 2. Fetch Questions
    const { rows: questions } = await db.query(
      `SELECT id, question_text, question_type, options_json, correct_answer, points, order_index
       FROM quiz_questions
       WHERE quiz_id = ?
       ORDER BY order_index ASC`,
      [quizId]
    );

    // 3. Fetch Submissions with Answers
    const { rows: answerRows } = await db.query(
      `SELECT qsa.question_id, qsa.selected_answer, qsa.is_correct, qsa.points_awarded,
              qs.id as submission_id, qs.student_id, qs.score_obtained, qs.percentage, qs.submitted_at
       FROM quiz_submissions qs
       JOIN quiz_submission_answers qsa ON qsa.submission_id = qs.id
       WHERE qs.quiz_id = ? AND qs.status = 'SUBMITTED'
       ORDER BY qs.score_obtained DESC`,
      [quizId]
    );

    // Map answers by student
    const studentSubmissions = new Map();
    answerRows.forEach(row => {
      if (!studentSubmissions.has(row.student_id)) {
        studentSubmissions.set(row.student_id, {
          student_id: row.student_id,
          submission_id: row.submission_id,
          score: row.score_obtained,
          percentage: row.percentage,
          answers: {}
        });
      }
      studentSubmissions.get(row.student_id).answers[row.question_id] = row;
    });

    const examinees = Array.from(studentSubmissions.values()).sort((a, b) => b.score - a.score);
    const totalExaminees = examinees.length;

    // Group examinees into Upper (top 27%) and Lower (bottom 27%) groups
    let upperGroup = [];
    let lowerGroup = [];
    let groupSize = 0;

    if (totalExaminees >= 10) {
      groupSize = Math.max(1, Math.round(totalExaminees * 0.27));
      upperGroup = examinees.slice(0, groupSize);
      lowerGroup = examinees.slice(totalExaminees - groupSize);
    } else if (totalExaminees > 1) {
      groupSize = Math.max(1, Math.floor(totalExaminees / 2));
      upperGroup = examinees.slice(0, groupSize);
      lowerGroup = examinees.slice(totalExaminees - groupSize);
    } else if (totalExaminees === 1) {
      groupSize = 1;
      upperGroup = examinees;
      lowerGroup = examinees;
    }

    const itemsAnalysis = questions.map((q, idx) => {
      let options = [];
      try {
        if (q.options_json) {
          options = typeof q.options_json === 'string' ? JSON.parse(q.options_json) : q.options_json;
        }
      } catch (e) {
        options = [];
      }

      if (q.question_type === 'TRUE_FALSE' && (!options || options.length === 0)) {
        options = [
          { id: 'TRUE', text: 'Tama (True)' },
          { id: 'FALSE', text: 'Mali (False)' }
        ];
      }

      let totalCorrect = 0;
      let upperCorrect = 0;
      let lowerCorrect = 0;

      const distractorDistribution = {};
      if (Array.isArray(options)) {
        options.forEach(opt => {
          distractorDistribution[opt.id] = {
            id: opt.id,
            text: opt.text,
            is_key: String(opt.id).trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase(),
            total_chosen: 0,
            upper_chosen: 0,
            lower_chosen: 0
          };
        });
      }

      examinees.forEach(ex => {
        const studentAns = ex.answers[q.id];
        if (studentAns) {
          if (studentAns.is_correct) totalCorrect++;
          const choice = String(studentAns.selected_answer || '').trim();
          if (distractorDistribution[choice]) {
            distractorDistribution[choice].total_chosen++;
          }
        }
      });

      upperGroup.forEach(ex => {
        const studentAns = ex.answers[q.id];
        if (studentAns) {
          if (studentAns.is_correct) upperCorrect++;
          const choice = String(studentAns.selected_answer || '').trim();
          if (distractorDistribution[choice]) {
            distractorDistribution[choice].upper_chosen++;
          }
        }
      });

      lowerGroup.forEach(ex => {
        const studentAns = ex.answers[q.id];
        if (studentAns) {
          if (studentAns.is_correct) lowerCorrect++;
          const choice = String(studentAns.selected_answer || '').trim();
          if (distractorDistribution[choice]) {
            distractorDistribution[choice].lower_chosen++;
          }
        }
      });

      const pValue = totalExaminees > 0 ? Number((totalCorrect / totalExaminees).toFixed(3)) : 0;
      let difficultyInterpretation = 'KATAMTAMAN (IDEAL DIFFICULTY)';
      let difficultyAction = 'Retain';

      if (pValue >= 0.86) {
        difficultyInterpretation = 'NAPAKADALI (VERY EASY)';
        difficultyAction = 'Revise or Discard (Excessively Easy)';
      } else if (pValue >= 0.71) {
        difficultyInterpretation = 'MADALI (EASY)';
        difficultyAction = 'Retain / Good for introductory reinforcement';
      } else if (pValue >= 0.30) {
        difficultyInterpretation = 'KATAMTAMAN (IDEAL DIFFICULTY)';
        difficultyAction = 'Retain (Standard Quality Item)';
      } else if (pValue >= 0.15) {
        difficultyInterpretation = 'MAHIRAP (DIFFICULT)';
        difficultyAction = 'Retain (Challenging Discriminator)';
      } else {
        difficultyInterpretation = 'NAPAKAHIRAP (VERY DIFFICULT)';
        difficultyAction = 'Revise or Discard (Overly Ambiguous/Strict)';
      }

      const dValue = groupSize > 0 ? Number(((upperCorrect - lowerCorrect) / groupSize).toFixed(3)) : 0;
      let discriminationInterpretation = 'VERY GOOD';
      let discriminationAction = 'Retain';

      if (dValue >= 0.40) {
        discriminationInterpretation = 'NAPAKAGANDA (VERY GOOD ITEM)';
        discriminationAction = 'Retain item unconditionally';
      } else if (dValue >= 0.30) {
        discriminationInterpretation = 'MAGANDA (GOOD ITEM)';
        discriminationAction = 'Retain item';
      } else if (dValue >= 0.20) {
        discriminationInterpretation = 'KATAMTAMAN (MARGINAL ITEM)';
        discriminationAction = 'Revise item distractors / question clarity';
      } else {
        discriminationInterpretation = 'MAHINA (POOR / DEFECTIVE ITEM)';
        discriminationAction = 'Discard or major rewrite';
      }

      const distractors = Object.values(distractorDistribution).map(dist => {
        let efficiency = 'FUNCTIONAL';
        if (dist.is_key) {
          efficiency = 'KEY (CORRECT ANSWER)';
        } else if (dist.total_chosen === 0) {
          efficiency = 'NON-FUNCTIONAL (NEVER CHOSEN)';
        } else if (dist.upper_chosen > dist.lower_chosen) {
          efficiency = 'ATTRACTS HIGHER PERFORMERS (REVISE DISTRACTOR)';
        } else {
          efficiency = 'EFFECTIVE DISTRACTOR';
        }
        return {
          ...dist,
          efficiency
        };
      });

      return {
        item_number: idx + 1,
        question_id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        correct_answer: q.correct_answer,
        points: q.points,
        metrics: {
          total_examinees: totalExaminees,
          total_correct: totalCorrect,
          upper_group_size: groupSize,
          upper_group_correct: upperCorrect,
          lower_group_size: groupSize,
          lower_group_correct: lowerCorrect,
          difficulty_index_p: pValue,
          difficulty_interpretation: difficultyInterpretation,
          difficulty_action: difficultyAction,
          discrimination_index_d: dValue,
          discrimination_interpretation: discriminationInterpretation,
          discrimination_action: discriminationAction
        },
        distractors
      };
    });

    return {
      quiz: {
        id: quiz.id,
        title: quiz.title,
        quarter: quiz.quarter,
        topic_title: quiz.topic_title,
        ilaw_category: quiz.ilaw_category,
        total_points: quiz.total_points,
        passing_score: quiz.passing_score
      },
      summary: {
        total_items: questions.length,
        total_examinees: totalExaminees,
        upper_group_size: groupSize,
        lower_group_size: groupSize,
        average_difficulty_p: itemsAnalysis.length > 0
          ? Number((itemsAnalysis.reduce((acc, it) => acc + it.metrics.difficulty_index_p, 0) / itemsAnalysis.length).toFixed(3))
          : 0,
        average_discrimination_d: itemsAnalysis.length > 0
          ? Number((itemsAnalysis.reduce((acc, it) => acc + it.metrics.discrimination_index_d, 0) / itemsAnalysis.length).toFixed(3))
          : 0
      },
      items: itemsAnalysis
    };
  }
}


module.exports = AnalyticsService;
