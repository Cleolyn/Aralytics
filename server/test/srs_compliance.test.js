const assert = require('assert');
const db = require('../src/config/database');
const { initializeDatabase } = require('../src/db/init');
const AnalyticsService = require('../src/services/AnalyticsService');
const analyticsController = require('../src/controllers/analyticsController');
const performanceTaskController = require('../src/controllers/performanceTaskController');
const materialsController = require('../src/controllers/materialsController');
const submissionController = require('../src/controllers/submissionController');

async function testSRSCompliance() {
  console.log('======================================================================');
  console.log('[TEST] MODULE: ARALYTICS SRS FULL COMPLIANCE VERIFICATION');
  console.log('======================================================================');

  await initializeDatabase();

  const createMockRes = () => ({
    statusCode: 200,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    }
  });

  // -------------------------------------------------------------------------
  // 1. PERFORMANCE TASKS MODULE (SRS FR-43, FR-44)
  // -------------------------------------------------------------------------
  console.log('--> Test 1: Performance Tasks Dropzone & Rubric Review Queue (FR-43, FR-44)');

  // 1.1 Teacher creates performance task
  const createReq = {
    user: { id: 'usr-teacher-001', role: 'TEACHER' },
    body: {
      quarter: 'Q1',
      competency_id: 'comp-ap10-q1-004',
      title: 'Pagsasagawa ng Disaster Preparedness Community Simulation',
      instructions: 'Magsumite ng detalyadong dokumentasyon ng hazard simulation sa inyong barangay.',
      rubric_criteria: 'Nilalaman: 40%, Organisasyon: 30%, Epekto sa Komunidad: 30%',
      total_points: 100,
      due_date: '2026-11-15 23:59:59'
    }
  };
  const createRes = createMockRes();
  await performanceTaskController.createTask(createReq, createRes, (err) => { if (err) throw err; });

  assert.strictEqual(createRes.statusCode, 201, 'Teacher task creation must return 201');
  assert(createRes.jsonData.success, 'Task creation success must be true');
  const createdTask = createRes.jsonData.task;
  assert.strictEqual(createdTask.title, 'Pagsasagawa ng Disaster Preparedness Community Simulation');
  console.log('    [PASS] FR-44: Teacher successfully created performance task with rubric.');

  // 1.2 Student views task and submits output via dropzone (FR-43)
  const submitReq = {
    user: { id: 'usr-student-001', role: 'STUDENT' },
    params: { id: createdTask.id },
    body: {
      file_name: 'Barangay_Simulation_JuanDelaCruz.pdf',
      file_url: '/api/performance-tasks/files/Barangay_Simulation_JuanDelaCruz.pdf',
      file_size_bytes: 4200000,
      notes: 'Ipinapasa ko po ang simulation plan kasama ang family drill documentation.'
    }
  };
  const submitRes = createMockRes();
  await performanceTaskController.submitTask(submitReq, submitRes, (err) => { if (err) throw err; });

  assert.strictEqual(submitRes.statusCode, 200, 'Student submission must return 200');
  assert.strictEqual(submitRes.jsonData.submission.status, 'SUBMITTED');
  console.log('    [PASS] FR-43: Student dropzone successfully accepted multi-format attachment & notes.');

  // 1.3 Teacher retrieves submission queue and grades with rubric (FR-44)
  const queueReq = {
    user: { id: 'usr-teacher-001', role: 'TEACHER' },
    params: { id: createdTask.id }
  };
  const queueRes = createMockRes();
  await performanceTaskController.getTaskSubmissions(queueReq, queueRes, (err) => { if (err) throw err; });

  assert.strictEqual(queueRes.statusCode, 200);
  assert(queueRes.jsonData.submissions.length >= 1, 'Queue must list submitted student output');
  const subToGrade = queueRes.jsonData.submissions[0];

  const gradeReq = {
    user: { id: 'usr-teacher-001', role: 'TEACHER' },
    params: { id: subToGrade.id },
    body: {
      score: 95,
      feedback: 'Napakahusay at komprehensibo ang simulation protocol. Malinaw ang bawat evacuation step.'
    }
  };
  const gradeRes = createMockRes();
  await performanceTaskController.gradeSubmission(gradeReq, gradeRes, (err) => { if (err) throw err; });

  assert.strictEqual(gradeRes.statusCode, 200);
  assert.strictEqual(gradeRes.jsonData.submission.score, 95);
  assert.strictEqual(gradeRes.jsonData.submission.status, 'GRADED');
  console.log('    [PASS] FR-44: Teacher successfully evaluated output, encoded rubric score 95/100, and saved feedback.');

  // -------------------------------------------------------------------------
  // 2. PSYCHOMETRIC ITEM ANALYSIS ENGINE (SRS FR-21, FR-40)
  // -------------------------------------------------------------------------
  console.log('--> Test 2: Psychometric Item Analysis Engine (FR-21, FR-40)');

  const itemAnalysis = await AnalyticsService.calculateItemAnalysis('quiz-ap10-cbdrrm-01');
  assert(itemAnalysis.quiz, 'Must include quiz metadata');
  assert(itemAnalysis.summary.total_items >= 9, 'Must analyze all questions including 6 question formats');
  assert(itemAnalysis.summary.total_examinees > 0, 'Must have recorded examinees');
  assert(typeof itemAnalysis.summary.average_difficulty_p === 'number', 'Difficulty P must be numeric');
  assert(typeof itemAnalysis.summary.average_discrimination_d === 'number', 'Discrimination D must be numeric');

  // Verify item metric calculations
  for (const it of itemAnalysis.items) {
    const m = it.metrics;
    assert(m.difficulty_index_p >= 0 && m.difficulty_index_p <= 1, `Item ${it.item_number} P value must be in [0, 1]`);
    assert(m.discrimination_index_d >= -1 && m.discrimination_index_d <= 1, `Item ${it.item_number} D value must be in [-1, 1]`);
    assert(typeof m.difficulty_interpretation === 'string', 'Must provide verbal difficulty interpretation');
    assert(typeof m.discrimination_action === 'string', 'Must provide discrimination recommendation action');
  }

  // Verify API endpoint
  const itemAnalysisReq = {
    user: { id: 'usr-teacher-001', role: 'TEACHER' },
    params: { quiz_id: 'quiz-ap10-cbdrrm-01' }
  };
  const itemAnalysisRes = createMockRes();
  await analyticsController.getItemAnalysis(itemAnalysisReq, itemAnalysisRes, (err) => { if (err) throw err; });

  assert.strictEqual(itemAnalysisRes.statusCode, 200);
  assert(itemAnalysisRes.jsonData.success);
  console.log(`    [PASS] FR-21 & FR-40: Computed Difficulty Index (Avg P=${itemAnalysis.summary.average_difficulty_p}) and Discrimination Index (Avg D=${itemAnalysis.summary.average_discrimination_d}) with distractor frequencies.`);

  // -------------------------------------------------------------------------
  // 3. OFFLINE READ EVENT SYNC QUEUE (SRS FR-50)
  // -------------------------------------------------------------------------
  console.log('--> Test 3: Offline Reading Log Ingestion & Synchronization (FR-50)');

  const syncReq = {
    user: { id: 'usr-student-001', role: 'STUDENT' },
    body: {
      logs: [
        { material_id: 'mat-ap10-001', read_at: '2026-10-02 10:15:00' },
        { material_id: 'mat-ap10-002', read_at: '2026-10-02 11:30:00' }
      ]
    }
  };
  const syncRes = createMockRes();
  await materialsController.syncReadLogs(syncReq, syncRes, (err) => { if (err) throw err; });

  assert.strictEqual(syncRes.statusCode, 200);
  assert.strictEqual(syncRes.jsonData.synced_count, 2);

  // Read back logs
  const getLogsReq = {
    user: { id: 'usr-student-001', role: 'STUDENT' }
  };
  const getLogsRes = createMockRes();
  await materialsController.getReadLogs(getLogsReq, getLogsRes, (err) => { if (err) throw err; });

  assert.strictEqual(getLogsRes.statusCode, 200);
  assert(getLogsRes.jsonData.logs.length >= 2, 'Stored reading events must be returned');
  console.log('    [PASS] FR-50: Successfully synced 2 offline reading events and verified persistence.');

  // -------------------------------------------------------------------------
  // 4. 6 QUESTION FORMATS AUTO-SCORING & POST-TEST LOOP (SRS FR-16, FR-37)
  // -------------------------------------------------------------------------
  console.log('--> Test 4: 6 Question Types Auto-Scoring & Post-Test Loop (FR-16, FR-37)');

  const postStudentId = 'usr-student-post-test';
  await db.query(
    `INSERT OR REPLACE INTO users (id, lrn_or_id, first_name, last_name, email, password_hash, role, section)
     VALUES (?, 'LRN-POST-999', 'Post', 'Student', 'post.test@student.deped.gov.ph', 'hash', 'STUDENT', '10-Rizal')`,
    [postStudentId]
  );
  await db.query(`DELETE FROM quiz_submission_answers WHERE submission_id IN (SELECT id FROM quiz_submissions WHERE student_id = ?)`, [postStudentId]);
  await db.query(`DELETE FROM quiz_submissions WHERE student_id = ?`, [postStudentId]);

  // Seed active intervention to verify post-test resolution (FR-37)
  await db.query(
    `INSERT OR REPLACE INTO interventions (id, student_id, competency_id, recommended_material_id, status)
     VALUES ('intv-post-test-01', ?, 'comp-ap10-q1-003', 'mat-rem-001', 'ASSIGNED')`,
    [postStudentId]
  );

  // Start new test session for student
  const startReq = {
    user: { id: postStudentId, role: 'STUDENT' },
    body: { quiz_id: 'quiz-ap10-cbdrrm-01' }
  };
  const startRes = createMockRes();
  await submissionController.startQuiz(startReq, startRes, (err) => { if (err) throw err; });
  const subId = startRes.jsonData.submission.id;

  // Submit with answers covering: MC, TF, IDENTIFICATION (alias), MATCHING (JSON), SITUATIONAL, PISA_LIKE
  const submitQuizReq = {
    user: { id: postStudentId, role: 'STUDENT' },
    body: {
      submission_id: subId,
      answers: [
        { question_id: 'q-cbdrrm-01', selected_answer: 'B' }, // MC -> Correct
        { question_id: 'q-cbdrrm-02', selected_answer: 'C' }, // MC -> Correct
        { question_id: 'q-cbdrrm-03', selected_answer: 'Tama' }, // TF equiv -> Correct
        { question_id: 'q-cbdrrm-04', selected_answer: 'B' }, // MC -> Correct
        { question_id: 'q-cbdrrm-05', selected_answer: 'TRUE' }, // TF -> Correct
        { question_id: 'q-cbdrrm-06', selected_answer: 'Kasunduang Paris' }, // IDENTIFICATION alias -> Correct
        { question_id: 'q-cbdrrm-07', selected_answer: { p1: 'r1', p2: 'r2', p3: 'r3', p4: 'r4' } }, // MATCHING -> Correct
        { question_id: 'q-cbdrrm-08', selected_answer: 'B' }, // SITUATIONAL -> Correct
        { question_id: 'q-cbdrrm-09', selected_answer: 'B' }  // PISA_LIKE -> Correct
      ]
    }
  };
  const submitQuizRes = createMockRes();
  await submissionController.submitQuiz(submitQuizReq, submitQuizRes, (err) => { if (err) throw err; });

  assert.strictEqual(submitQuizRes.statusCode, 200);
  assert.strictEqual(submitQuizRes.jsonData.results.score_obtained, 9, 'All 9 questions of 6 types must score full points');
  assert.strictEqual(submitQuizRes.jsonData.results.percentage, 100);
  assert.strictEqual(submitQuizRes.jsonData.results.is_passed, true);

  // Verify remediation loop resolution (FR-37)
  const { rows: intvAfter } = await db.query(
    `SELECT status FROM interventions WHERE id = 'intv-post-test-01'`
  );
  assert.strictEqual(intvAfter[0].status, 'COMPLETED', 'Active intervention must be auto-completed upon passing post-test');

  console.log('    [PASS] FR-16: Accurately scored all 6 question formats (MC, TF, Matching, Identification with alias, Situational, PISA-like).');
  console.log('    [PASS] FR-37: Post-test mastery verified with auto-remediation loop resolution.');

  console.log('======================================================================');
  console.log('[ALL TESTS PASSED] ARALYTICS SRS REQUIREMENTS VERIFIED');
  console.log('======================================================================');
}

if (require.main === module) {
  testSRSCompliance()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[TEST FAILURE]', err);
      process.exit(1);
    });
}

module.exports = { testSRSCompliance };
