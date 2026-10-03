const assert = require('assert');
const path = require('path');
const db = require('../src/config/database');
const { initializeDatabase } = require('../src/db/init');
const assessmentController = require('../src/controllers/assessmentPersistenceController');

async function testPersistenceLayer() {
  console.log('======================================================================');
  console.log('[TEST] MODULE: DATA-PERSISTENCE-LAYER');
  console.log('======================================================================');

  await initializeDatabase();

  // Mock response helper
  const createMockRes = () => {
    const res = {
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
    };
    return res;
  };

  const studentId = 'usr-student-001';
  const quizId = 'quiz-ap10-cbdrrm-01';

  // TEST 1: Passing Submission (Score >= 75%) -> No Intervention Triggered
  console.log('--> Test 1: POST /api/assessment/submit (Score >= 75% -> Clean Pass)');
  const reqPass = {
    body: {
      quiz_id: quizId,
      student_id: studentId,
      score: 5,
      total_points: 5,
      tab_switch_count: 0,
      security_events: []
    }
  };
  const resPass = createMockRes();
  await assessmentController.submitAssessment(reqPass, resPass, (err) => { throw err; });

  assert.strictEqual(resPass.statusCode, 201);
  assert.strictEqual(resPass.jsonData.attempt.is_passed, true);
  assert.strictEqual(resPass.jsonData.intervention.triggered, false);
  console.log('    [PASS] Clean submission saved without triggering intervention.');

  // TEST 2: Failing Submission (Score < 75%) -> Automated Hook Triggers Intervention
  console.log('--> Test 2: POST /api/assessment/submit (Score < 75% -> Auto-Trigger Remediation)');
  const reqFail = {
    body: {
      quiz_id: quizId,
      student_id: studentId,
      score: 2,
      total_points: 5, // 40% < 75%
      tab_switch_count: 3,
      security_events: [
        { event_type: 'TAB_SWITCH' },
        { event_type: 'WINDOW_BLUR' },
        { event_type: 'TAB_SWITCH' }
      ]
    }
  };
  const resFail = createMockRes();
  await assessmentController.submitAssessment(reqFail, resFail, (err) => { throw err; });

  assert.strictEqual(resFail.statusCode, 201);
  assert.strictEqual(resFail.jsonData.attempt.is_passed, false);
  assert.strictEqual(resFail.jsonData.intervention.triggered, true);
  assert(resFail.jsonData.intervention.intervention_id, 'Must generate intervention ID');
  assert(resFail.jsonData.intervention.recommended_material, 'Must attach recommended remedial material');
  console.log(`    [PASS] Automated hook inserted intervention (${resFail.jsonData.intervention.intervention_id}) linking remedial material: "${resFail.jsonData.intervention.recommended_material.title}"`);

  // Verify Security Logs table
  const { rows: secLogs } = await db.query(
    'SELECT * FROM security_logs WHERE attempt_id = ?',
    [resFail.jsonData.attempt.id]
  );
  assert.strictEqual(secLogs.length, 3, 'Must record all 3 proctoring security events');
  console.log('    [PASS] Security logs audit trail saved 3 events.');

  // TEST 3: Teacher Retrieves Flagged Students & Recommended Interventions
  console.log('--> Test 3: GET /api/interventions/flagged (Teacher Approval Queue)');
  const reqTeacher = {
    query: {}
  };
  const resTeacher = createMockRes();
  await assessmentController.getFlaggedInterventions(reqTeacher, resTeacher, (err) => { throw err; });

  assert.strictEqual(resTeacher.statusCode, 200);
  assert(resTeacher.jsonData.count > 0, 'Must retrieve flagged students');
  const found = resTeacher.jsonData.data.find(d => d.intervention_id === resFail.jsonData.intervention.intervention_id);
  assert(found, 'Created intervention must be present in teacher approval queue');
  assert.strictEqual(found.status, 'RECOMMENDED');
  assert(found.assessment_metrics.tab_switch_count >= 3);
  assert.strictEqual(found.assessment_metrics.is_proctoring_flagged, true);
  console.log(`    [PASS] Flagged intervention retrieved for student ${found.student.name} with ${found.assessment_metrics.tab_switch_count} tab switches.`);

  // TEST 4: Teacher Approves Intervention
  console.log('--> Test 4: PATCH /api/interventions/:id/approve');
  const reqApprove = {
    params: { id: found.intervention_id },
    body: {}
  };
  const resApprove = createMockRes();
  await assessmentController.approveIntervention(reqApprove, resApprove, (err) => { throw err; });

  assert.strictEqual(resApprove.statusCode, 200);
  assert.strictEqual(resApprove.jsonData.new_status, 'ASSIGNED');
  console.log('    [PASS] Teacher approved intervention and transitioned status to ASSIGNED.');

  console.log('======================================================================');
  console.log('[ALL TESTS PASSED] MODULE: DATA-PERSISTENCE-LAYER VERIFIED');
  console.log('======================================================================');
}

testPersistenceLayer()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[TEST FAILED]', err);
    process.exit(1);
  });
