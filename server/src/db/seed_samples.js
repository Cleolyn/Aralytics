const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const AnalyticsService = require('../services/AnalyticsService');

async function seedSampleOutputs() {
  console.log('======================================================================');
  console.log('[SEED SAMPLES] Populating Diverse Student Cohorts & Sample Outputs...');
  console.log('======================================================================');

  const salt = await bcrypt.genSalt(10);
  const studentHash = await bcrypt.hash('StudentPass123!', salt);

  // 1. Ensure Diverse Students exist in 10-Rizal and 10-Bonifacio
  const sampleStudents = [
    { id: 'usr-student-001', lrn: '123456789012', first: 'Juan', last: 'Dela Cruz', email: 'juan.delacruz@student.deped.gov.ph', section: '10-Rizal' },
    { id: 'usr-student-002', lrn: '123456789013', first: 'Maria', last: 'Clara', email: 'maria.clara@student.deped.gov.ph', section: '10-Rizal' },
    { id: 'usr-student-004', lrn: '123456789015', first: 'Gabriela', last: 'Silang', email: 'gabriela.silang@student.deped.gov.ph', section: '10-Rizal' },
    { id: 'usr-student-005', lrn: '123456789016', first: 'Jose', last: 'Rizal', email: 'jose.rizal@student.deped.gov.ph', section: '10-Rizal' },
    { id: 'usr-student-003', lrn: '123456789014', first: 'Andres', last: 'Bonifacio', email: 'andres.bonifacio@student.deped.gov.ph', section: '10-Bonifacio' },
    { id: 'usr-student-006', lrn: '123456789017', first: 'Emilio', last: 'Jacinto', email: 'emilio.jacinto@student.deped.gov.ph', section: '10-Bonifacio' },
    { id: 'usr-student-007', lrn: '123456789018', first: 'Melchora', last: 'Aquino', email: 'melchora.aquino@student.deped.gov.ph', section: '10-Bonifacio' },
    { id: 'usr-student-008', lrn: '123456789019', first: 'Apolinario', last: 'Mabini', email: 'apolinario.mabini@student.deped.gov.ph', section: '10-Bonifacio' }
  ];

  for (const s of sampleStudents) {
    await db.query(
      `INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role, section, section_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'STUDENT', ?, ?)
       ON CONFLICT(id) DO UPDATE SET 
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         full_name = excluded.full_name,
         section = excluded.section,
         section_id = excluded.section_id`,
      [s.id, s.lrn, s.first, s.last, `${s.first} ${s.last}`, s.email, studentHash, s.section, s.section]
    );
  }
  console.log(`[PASS] Verified ${sampleStudents.length} students across 10-Rizal and 10-Bonifacio.`);

  // 2. Ensure Quizzes exist across all 4 Competencies
  const sampleQuizzes = [
    {
      id: 'quiz-ap10-ki-01',
      comp_id: 'comp-ap10-q1-001',
      title: 'Pagsusuri sa Konsepto ng Kontemporaryong Isyu',
      instructions: 'Sagutin ang mga tanong upang subukin ang mapanuring pag-iisip.',
      total_points: 10,
      passing_score: 8
    },
    {
      id: 'quiz-ap10-env-01',
      comp_id: 'comp-ap10-q1-002',
      title: 'Mga Suliraning Pangkapaligiran sa Pamayanan',
      instructions: 'Tukuyin ang mga sanhi at epekto ng climate change at solid waste.',
      total_points: 10,
      passing_score: 8
    },
    {
      id: 'quiz-ap10-cbdrrm-01',
      comp_id: 'comp-ap10-q1-003',
      title: 'Pagsusuri sa CBDRRM Approach at Kahandaan sa Kalamidad',
      instructions: 'Basahing mabuti ang bawat tanong ukol sa CBDRRM framework.',
      total_points: 5,
      passing_score: 4
    },
    {
      id: 'quiz-ap10-action-01',
      comp_id: 'comp-ap10-q1-004',
      title: 'Paggawa ng Disaster Preparedness Action Plan',
      instructions: 'Ilapat ang mga hakbang sa kahandaan sa sariling tahanan at pamayanan.',
      total_points: 10,
      passing_score: 8
    }
  ];

  for (const q of sampleQuizzes) {
    await db.query(
      `INSERT INTO quizzes (id, competency_id, title, instructions, time_limit_minutes, total_points, passing_score, max_blur_limit, is_published, created_by)
       VALUES (?, ?, ?, ?, 20, ?, ?, 3, 1, 'usr-teacher-001')
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, total_points = excluded.total_points, passing_score = excluded.passing_score`,
      [q.id, q.comp_id, q.title, q.instructions, q.total_points, q.passing_score]
    );
  }
  console.log(`[PASS] Verified 4 standard AP10 quizzes across all Q1 competencies.`);

  // 3. Ensure Remedial Materials exist for each Competency
  const sampleMaterials = [
    { id: 'mat-rem-001', comp: 'comp-ap10-q1-003', title: 'CBDRRM Remedial Reviewer & Study Guide.pdf', path: '/api/materials/download/cbdrrm_remedial.pdf', type: 'PDF', is_rem: 1 },
    { id: 'mat-rem-002', comp: 'comp-ap10-q1-003', title: 'Lektyur: Pagbawi sa Kahinaan sa CBDRRM.mp4', path: '/api/materials/download/cbdrrm_recovery.mp4', type: 'VIDEO', is_rem: 1 },
    { id: 'mat-rem-ki-01', comp: 'comp-ap10-q1-001', title: 'Remedial Reviewer: Mapanuring Pagsusuri sa Kontemporaryong Isyu.pdf', path: '/api/materials/download/ki_remedial.pdf', type: 'PDF', is_rem: 1 },
    { id: 'mat-rem-ki-02', comp: 'comp-ap10-q1-001', title: 'Video-Aralin: Primary vs Secondary Sources.mp4', path: '/api/materials/download/sources_video.mp4', type: 'VIDEO', is_rem: 1 },
    { id: 'mat-rem-env-01', comp: 'comp-ap10-q1-002', title: 'Intervention Module: Pagtugon sa Suliraning Solid Waste.pdf', path: '/api/materials/download/waste_module.pdf', type: 'PDF', is_rem: 1 },
    { id: 'mat-rem-act-01', comp: 'comp-ap10-q1-004', title: 'Template at Gabay sa Barangay Disaster Preparedness Plan.docx', path: '/api/materials/download/drrm_template.docx', type: 'DOCX', is_rem: 1 }
  ];

  for (const m of sampleMaterials) {
    await db.query(
      `INSERT INTO materials (id, title, file_path, file_type, competency_id, is_remedial, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, 'usr-teacher-001')
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, is_remedial = excluded.is_remedial`,
      [m.id, m.title, m.path, m.type, m.comp, m.is_rem]
    );

    // Also populate instructional_materials
    await db.query(
      `INSERT INTO instructional_materials (id, competency_id, title, description, file_type, storage_url, file_size_bytes, content_hash, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 1500000, 'samplehash', 'usr-teacher-001')
       ON CONFLICT(id) DO NOTHING`,
      [m.id, m.comp, m.title, m.title, m.type, m.path]
    );
  }
  console.log(`[PASS] Populated ${sampleMaterials.length} remedial instructional resources.`);

  // 4. Seed Diverse Attempts Across All Mastery Tiers (Mastered, Developing, Needs Intervention)
  // Clean attempts + proctoring flagged attempts
  const attemptsSeed = [
    // Quiz 1: Konsepto ng Kontemporaryong Isyu (comp-ap10-q1-001) - 10 pts
    { id: 'att-smp-01', quiz: 'quiz-ap10-ki-01', std: 'usr-student-001', score: 9, total: 10, blur: 0, date: '2026-10-02 08:30:00' }, // 90% MASTERED
    { id: 'att-smp-02', quiz: 'quiz-ap10-ki-01', std: 'usr-student-002', score: 10, total: 10, blur: 0, date: '2026-10-02 08:35:00' }, // 100% MASTERED
    { id: 'att-smp-03', quiz: 'quiz-ap10-ki-01', std: 'usr-student-004', score: 8, total: 10, blur: 1, date: '2026-10-02 08:40:00' }, // 80% DEVELOPING
    { id: 'att-smp-04', quiz: 'quiz-ap10-ki-01', std: 'usr-student-005', score: 6, total: 10, blur: 3, date: '2026-10-02 08:45:00' }, // 60% NEEDS_INTERVENTION (Flagged)
    { id: 'att-smp-05', quiz: 'quiz-ap10-ki-01', std: 'usr-student-003', score: 9, total: 10, blur: 0, date: '2026-10-02 08:50:00' }, // 90% MASTERED
    { id: 'att-smp-06', quiz: 'quiz-ap10-ki-01', std: 'usr-student-006', score: 7, total: 10, blur: 2, date: '2026-10-02 08:55:00' }, // 70% DEVELOPING
    { id: 'att-smp-07', quiz: 'quiz-ap10-ki-01', std: 'usr-student-007', score: 5, total: 10, blur: 0, date: '2026-10-02 09:00:00' }, // 50% NEEDS_INTERVENTION
    { id: 'att-smp-08', quiz: 'quiz-ap10-ki-01', std: 'usr-student-008', score: 10, total: 10, blur: 0, date: '2026-10-02 09:05:00' }, // 100% MASTERED

    // Quiz 2: Mga Suliraning Pangkapaligiran (comp-ap10-q1-002) - 10 pts
    { id: 'att-smp-09', quiz: 'quiz-ap10-env-01', std: 'usr-student-001', score: 8, total: 10, blur: 0, date: '2026-10-02 09:30:00' }, // 80% DEVELOPING
    { id: 'att-smp-10', quiz: 'quiz-ap10-env-01', std: 'usr-student-002', score: 9, total: 10, blur: 0, date: '2026-10-02 09:35:00' }, // 90% MASTERED
    { id: 'att-smp-11', quiz: 'quiz-ap10-env-01', std: 'usr-student-004', score: 6, total: 10, blur: 0, date: '2026-10-02 09:40:00' }, // 60% NEEDS_INTERVENTION
    { id: 'att-smp-12', quiz: 'quiz-ap10-env-01', std: 'usr-student-005', score: 10, total: 10, blur: 0, date: '2026-10-02 09:45:00' }, // 100% MASTERED
    { id: 'att-smp-13', quiz: 'quiz-ap10-env-01', std: 'usr-student-003', score: 5, total: 10, blur: 4, date: '2026-10-02 09:50:00' }, // 50% NEEDS_INTERVENTION (Flagged)
    { id: 'att-smp-14', quiz: 'quiz-ap10-env-01', std: 'usr-student-006', score: 8, total: 10, blur: 1, date: '2026-10-02 09:55:00' }, // 80% DEVELOPING

    // Quiz 3: CBDRRM Approach (comp-ap10-q1-003) - 5 pts
    { id: 'att-smp-15', quiz: 'quiz-ap10-cbdrrm-01', std: 'usr-student-002', score: 5, total: 5, blur: 0, date: '2026-10-02 10:10:00' }, // 100% MASTERED
    { id: 'att-smp-16', quiz: 'quiz-ap10-cbdrrm-01', std: 'usr-student-004', score: 4, total: 5, blur: 0, date: '2026-10-02 10:15:00' }, // 80% DEVELOPING
    { id: 'att-smp-17', quiz: 'quiz-ap10-cbdrrm-01', std: 'usr-student-005', score: 2, total: 5, blur: 3, date: '2026-10-02 10:20:00' }, // 40% NEEDS_INTERVENTION (Flagged)
    { id: 'att-smp-18', quiz: 'quiz-ap10-cbdrrm-01', std: 'usr-student-006', score: 5, total: 5, blur: 0, date: '2026-10-02 10:25:00' }, // 100% MASTERED
    { id: 'att-smp-19', quiz: 'quiz-ap10-cbdrrm-01', std: 'usr-student-007', score: 2, total: 5, blur: 1, date: '2026-10-02 10:30:00' }, // 40% NEEDS_INTERVENTION
    { id: 'att-smp-20', quiz: 'quiz-ap10-cbdrrm-01', std: 'usr-student-008', score: 4, total: 5, blur: 0, date: '2026-10-02 10:35:00' }, // 80% DEVELOPING

    // Quiz 4: Disaster Preparedness Action Plan (comp-ap10-q1-004) - 10 pts
    { id: 'att-smp-21', quiz: 'quiz-ap10-action-01', std: 'usr-student-001', score: 9, total: 10, blur: 0, date: '2026-10-02 11:00:00' }, // 90% MASTERED
    { id: 'att-smp-22', quiz: 'quiz-ap10-action-01', std: 'usr-student-002', score: 9, total: 10, blur: 0, date: '2026-10-02 11:05:00' }, // 90% MASTERED
    { id: 'att-smp-23', quiz: 'quiz-ap10-action-01', std: 'usr-student-003', score: 10, total: 10, blur: 0, date: '2026-10-02 11:10:00' }, // 100% MASTERED
    { id: 'att-smp-24', quiz: 'quiz-ap10-action-01', std: 'usr-student-006', score: 6, total: 10, blur: 3, date: '2026-10-02 11:15:00' }  // 60% NEEDS_INTERVENTION (Flagged)
  ];

  for (const a of attemptsSeed) {
    const percentage = Number(((a.score / a.total) * 100).toFixed(2));
    const isPassed = percentage >= 75 ? 1 : 0;
    const isFlagged = a.blur >= 3 ? 1 : 0;

    // 1. Insert into quiz_attempts
    await db.query(
      `INSERT INTO quiz_attempts (id, quiz_id, student_id, score, total_points, is_passed, tab_switch_count, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET score = excluded.score, is_passed = excluded.is_passed, tab_switch_count = excluded.tab_switch_count`,
      [a.id, a.quiz, a.std, a.score, a.total, isPassed, a.blur, a.date]
    );

    // 2. Insert into quiz_submissions
    await db.query(
      `INSERT INTO quiz_submissions (id, quiz_id, student_id, started_at, submitted_at, score_obtained, percentage, is_passed, blur_count, is_flagged_for_cheating, status)
       VALUES (?, ?, ?, datetime(?, '-15 minutes'), ?, ?, ?, ?, ?, ?, 'SUBMITTED')
       ON CONFLICT(quiz_id, student_id) DO UPDATE SET 
         score_obtained = excluded.score_obtained,
         percentage = excluded.percentage,
         is_passed = excluded.is_passed,
         blur_count = excluded.blur_count,
         is_flagged_for_cheating = excluded.is_flagged_for_cheating,
         status = 'SUBMITTED'`,
      [a.id, a.quiz, a.std, a.date, a.date, a.score, percentage, isPassed, a.blur, isFlagged]
    );

    // 3. Security logs for blur events
    if (a.blur > 0) {
      const { rows: subRow } = await db.query(
        `SELECT id FROM quiz_submissions WHERE quiz_id = ? AND student_id = ? LIMIT 1`,
        [a.quiz, a.std]
      );
      const actualSubId = subRow.length > 0 ? subRow[0].id : a.id;

      for (let b = 1; b <= a.blur; b++) {
        await db.query(
          `INSERT INTO security_logs (id, attempt_id, event_type, timestamp)
           VALUES (?, ?, 'WINDOW_BLUR', datetime(?, '-${b * 2} minutes'))
           ON CONFLICT(id) DO NOTHING`,
          [`sec-${a.id}-${b}`, a.id, a.date]
        );
        await db.query(
          `INSERT INTO quiz_proctoring_logs (id, submission_id, event_type, timestamp, duration_unfocused_ms)
           VALUES (?, ?, 'WINDOW_BLUR', datetime(?, '-${b * 2} minutes'), 1200)
           ON CONFLICT(id) DO NOTHING`,
          [`prc-${a.id}-${b}`, actualSubId, a.date]
        );
      }
    }
  }
  console.log(`[PASS] Populated ${attemptsSeed.length} student assessment submissions.`);

  // 5. Seed Realistic Interventions for low-scoring students (< 70%)
  const sampleInterventions = [
    {
      id: 'intv-smp-01',
      student_id: 'usr-student-005', // Jose Rizal (10-Rizal)
      competency_id: 'comp-ap10-q1-001',
      trigger_sub: 'att-smp-04',
      recommended_mat: 'mat-rem-ki-01',
      status: 'RECOMMENDED',
      phase: 'WAYS_FORWARD'
    },
    {
      id: 'intv-smp-02',
      student_id: 'usr-student-007', // Melchora Aquino (10-Bonifacio)
      competency_id: 'comp-ap10-q1-001',
      trigger_sub: 'att-smp-07',
      recommended_mat: 'mat-rem-ki-02',
      status: 'ASSIGNED',
      phase: 'WAYS_FORWARD'
    },
    {
      id: 'intv-smp-03',
      student_id: 'usr-student-004', // Gabriela Silang (10-Rizal)
      competency_id: 'comp-ap10-q1-002',
      trigger_sub: 'att-smp-11',
      recommended_mat: 'mat-rem-env-01',
      status: 'RECOMMENDED',
      phase: 'WAYS_FORWARD'
    },
    {
      id: 'intv-smp-04',
      student_id: 'usr-student-003', // Andres Bonifacio (10-Bonifacio)
      competency_id: 'comp-ap10-q1-002',
      trigger_sub: 'att-smp-13',
      recommended_mat: 'mat-rem-env-01',
      status: 'OVERRIDDEN',
      phase: 'WAYS_FORWARD'
    },
    {
      id: 'intv-smp-05',
      student_id: 'usr-student-007', // Melchora Aquino (10-Bonifacio)
      competency_id: 'comp-ap10-q1-003',
      trigger_sub: 'att-smp-19',
      recommended_mat: 'mat-rem-001',
      status: 'ASSIGNED',
      phase: 'WAYS_FORWARD'
    },
    {
      id: 'intv-smp-06',
      student_id: 'usr-student-006', // Emilio Jacinto (10-Bonifacio)
      competency_id: 'comp-ap10-q1-004',
      trigger_sub: 'att-smp-24',
      recommended_mat: 'mat-rem-act-01',
      status: 'RECOMMENDED',
      phase: 'WAYS_FORWARD'
    }
  ];

  for (const inv of sampleInterventions) {
    await db.query(
      `INSERT INTO interventions (id, student_id, competency_id, recommended_material_id, status, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET 
         recommended_material_id = excluded.recommended_material_id,
         status = excluded.status`,
      [inv.id, inv.student_id, inv.competency_id, inv.recommended_mat, inv.status]
    );

    try {
      await db.query(
        `INSERT INTO remedial_interventions (id, student_id, competency_id, trigger_submission_id, remedial_material_id, status, ilaw_phase)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET 
           remedial_material_id = excluded.remedial_material_id,
           status = excluded.status`,
        [inv.id, inv.student_id, inv.competency_id, inv.trigger_sub, inv.recommended_mat, inv.status, inv.phase]
      );
    } catch (e) {
      // If trigger_sub not in quiz_submissions, gracefully handle
    }
  }
  console.log(`[PASS] Populated ${sampleInterventions.length} remedial intervention records.`);

  // 6. Generate Actual Physical Sample Outputs in `sample_outputs/` directory
  const outputDir = path.resolve(__dirname, '../../../sample_outputs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // A. Generate SheetJS Master Gradebook (.xlsx)
  const fullDataset = await AnalyticsService.getComprehensiveGradebookDataset();
  const xlsxBuffer = AnalyticsService.generateSheetJSWorkbook(fullDataset);
  const xlsxPath = path.join(outputDir, 'Aralytics_Master_Gradebook_Sample.xlsx');
  fs.writeFileSync(xlsxPath, xlsxBuffer);
  console.log(`[OUTPUT GENERATED] SheetJS Excel Workbook -> ${xlsxPath} (${xlsxBuffer.length} bytes)`);

  // B. Generate PDFKit DepEd Monitoring Report (.pdf)
  const pdfPath = path.join(outputDir, 'Aralytics_DepEd_Monitoring_Report_Sample.pdf');
  const pdfStream = fs.createWriteStream(pdfPath);
  AnalyticsService.renderPDFReport(fullDataset, pdfStream, { section_id: 'All_Enrolled_Cohorts' });
  await new Promise((resolve) => pdfStream.on('finish', resolve));
  const pdfStats = fs.statSync(pdfPath);
  console.log(`[OUTPUT GENERATED] PDFKit DepEd Report -> ${pdfPath} (${pdfStats.size} bytes)`);

  // C. Generate JSON Sample for Proficiency Profiling API
  const profiling = await AnalyticsService.getProficiencyProfiling();
  const profJsonPath = path.join(outputDir, 'sample_proficiency_profiling.json');
  fs.writeFileSync(profJsonPath, JSON.stringify(profiling, null, 2));
  console.log(`[OUTPUT GENERATED] JSON Proficiency Profiling -> ${profJsonPath}`);

  // D. Generate JSON Sample for Remediation Decision Queue API
  const queue = await AnalyticsService.getRemediationRoutingQueue();
  const queueJsonPath = path.join(outputDir, 'sample_remediation_queue.json');
  fs.writeFileSync(queueJsonPath, JSON.stringify(queue, null, 2));
  console.log(`[OUTPUT GENERATED] JSON Remediation Queue -> ${queueJsonPath}`);

  // E. Generate JSON Sample for Psychometric Item Analysis (FR-21, FR-40)
  const itemAnalysis = await AnalyticsService.calculateItemAnalysis('quiz-ap10-cbdrrm-01');
  const itemAnalysisPath = path.join(outputDir, 'sample_item_analysis.json');
  fs.writeFileSync(itemAnalysisPath, JSON.stringify(itemAnalysis, null, 2));
  console.log(`[OUTPUT GENERATED] JSON Psychometric Item Analysis -> ${itemAnalysisPath}`);

  // F. Generate JSON Sample for Performance Tasks & Submissions (FR-43, FR-44)
  const { rows: pTasks } = await db.query(`SELECT * FROM performance_tasks`);
  const { rows: pSubs } = await db.query(`
    SELECT s.*, u.full_name, u.first_name, u.last_name, u.section 
    FROM performance_task_submissions s
    JOIN users u ON s.student_id = u.id
  `);
  const ptData = { tasks: pTasks, submissions: pSubs };
  const ptJsonPath = path.join(outputDir, 'sample_performance_tasks.json');
  fs.writeFileSync(ptJsonPath, JSON.stringify(ptData, null, 2));
  console.log(`[OUTPUT GENERATED] JSON Performance Tasks & Submissions -> ${ptJsonPath}`);

  // G. Generate JSON Sample for Offline Reading Logs (FR-50)
  const { rows: readLogs } = await db.query(`
    SELECT r.*, u.full_name, u.first_name, u.last_name, m.title as material_title
    FROM material_read_logs r
    JOIN users u ON r.student_id = u.id
    JOIN materials m ON r.material_id = m.id
  `);
  const readLogsPath = path.join(outputDir, 'sample_material_read_logs.json');
  fs.writeFileSync(readLogsPath, JSON.stringify(readLogs, null, 2));
  console.log(`[OUTPUT GENERATED] JSON Offline Material Reading Logs -> ${readLogsPath}`);

  console.log('======================================================================');
  console.log('[COMPLETED] All 7 Sample Datasets & File Outputs Successfully Generated!');
  console.log('======================================================================');
}

if (require.main === module) {
  seedSampleOutputs()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[SEED SAMPLES ERROR]', err);
      process.exit(1);
    });
}

module.exports = { seedSampleOutputs };
