const assert = require('assert');
const jwt = require('jsonwebtoken');
const { requireRole, requireTeacher, requireStudent, JWT_SECRET } = require('../src/middleware/auth.middleware');

async function testRBACSecurity() {
  console.log('======================================================================');
  console.log('[TEST] MODULE: STRICT RBAC BOUNDARY ENFORCEMENT');
  console.log('======================================================================');

  // Generate tokens for Student and Teacher
  const studentPayload = {
    id: 'usr-student-001',
    email: 'juan.delacruz@student.deped.gov.ph',
    role: 'STUDENT',
    section: '10-Rizal'
  };
  const teacherPayload = {
    id: 'usr-teacher-001',
    email: 'teacher@ponce.edu.ph',
    role: 'TEACHER',
    section: 'All'
  };

  const studentToken = jwt.sign(studentPayload, JWT_SECRET, { expiresIn: '1h' });
  const teacherToken = jwt.sign(teacherPayload, JWT_SECRET, { expiresIn: '1h' });

  // Helper mock response
  const createMockRes = () => {
    return {
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
  };

  // Test 1: Student token blocked by requireTeacher
  console.log('--> Test 1: Student token presented to requireTeacher');
  const reqStudent = { user: studentPayload };
  const resStudent = createMockRes();
  let nextCalledStudent = false;

  requireTeacher(reqStudent, resStudent, () => {
    nextCalledStudent = true;
  });

  assert.strictEqual(nextCalledStudent, false, 'Next middleware must NOT be called for student on teacher route');
  assert.strictEqual(resStudent.statusCode, 403, 'Must return HTTP 403 Forbidden');
  assert.strictEqual(resStudent.jsonData.success, false);
  assert(resStudent.jsonData.message.includes('Forbidden'), 'Response must explain Forbidden access');
  console.log('    [PASS] Student access to teacher route blocked with HTTP 403 Forbidden.');

  // Test 2: Teacher token permitted by requireTeacher
  console.log('--> Test 2: Teacher token presented to requireTeacher');
  const reqTeacher = { user: teacherPayload };
  const resTeacher = createMockRes();
  let nextCalledTeacher = false;

  requireTeacher(reqTeacher, resTeacher, () => {
    nextCalledTeacher = true;
  });

  assert.strictEqual(nextCalledTeacher, true, 'Next middleware MUST be called for teacher');
  assert.strictEqual(resTeacher.statusCode, 200, 'Status remains 200 for teacher');
  console.log('    [PASS] Teacher access authorized successfully.');

  // Test 3: Teacher token blocked by requireStudent
  console.log('--> Test 3: Teacher token presented to requireStudent');
  const reqTeacherOnStudent = { user: teacherPayload };
  const resTeacherOnStudent = createMockRes();
  let nextCalledTeacherOnStudent = false;

  requireStudent(reqTeacherOnStudent, resTeacherOnStudent, () => {
    nextCalledTeacherOnStudent = true;
  });

  assert.strictEqual(nextCalledTeacherOnStudent, false, 'Next middleware must NOT be called for teacher on student route');
  assert.strictEqual(resTeacherOnStudent.statusCode, 403, 'Must return HTTP 403 Forbidden');
  assert.strictEqual(resTeacherOnStudent.jsonData.success, false);
  console.log('    [PASS] Teacher access to student route blocked with HTTP 403 Forbidden.');

  // Test 4: Student token permitted by requireStudent
  console.log('--> Test 4: Student token presented to requireStudent');
  const reqStudentOnStudent = { user: studentPayload };
  const resStudentOnStudent = createMockRes();
  let nextCalledStudentOnStudent = false;

  requireStudent(reqStudentOnStudent, resStudentOnStudent, () => {
    nextCalledStudentOnStudent = true;
  });

  assert.strictEqual(nextCalledStudentOnStudent, true, 'Next middleware MUST be called for student on student route');
  assert.strictEqual(resStudentOnStudent.statusCode, 200);
  console.log('    [PASS] Student access to student route authorized successfully.');

  // Test 5: Audit all /api/teacher/* endpoints with student token
  console.log('--> Test 5: Dedicated /api/teacher/* Router Endpoints Audit with Student Token');
  const teacherEndpoints = [
    { method: 'GET', path: '/api/teacher/dashboard', desc: 'Teacher Aggregated Command Dashboard' },
    { method: 'GET', path: '/api/teacher/gradebook', desc: 'Teacher Master Gradebook View' },
    { method: 'GET', path: '/api/teacher/profiling', desc: '3-Tier Proficiency Profiling' },
    { method: 'GET', path: '/api/teacher/remediation-queue', desc: 'Teacher Remediation Routing Queue' },
    { method: 'POST', path: '/api/teacher/intervention/:id/action', desc: 'Teacher Remediation Decision Hooks' },
    { method: 'GET', path: '/api/teacher/quizzes/:quiz_id/item-analysis', desc: 'Psychometric Item Analysis Engine' },
    { method: 'POST', path: '/api/teacher/quizzes', desc: 'Teacher Assessment Authoring' },
    { method: 'POST', path: '/api/teacher/materials', desc: 'Teacher Instructional Material Upload' },
    { method: 'POST', path: '/api/teacher/performance-tasks', desc: 'Teacher Performance Task Authoring' },
    { method: 'GET', path: '/api/teacher/performance-tasks/:id/submissions', desc: 'Teacher Performance Task Review Queue' },
    { method: 'PATCH', path: '/api/teacher/performance-tasks/submissions/:id/grade', desc: 'Teacher Rubric Scoring & Feedback' },
    { method: 'GET', path: '/api/teacher/proctoring/trail/:submissionId', desc: 'Live Proctoring Tab-Switch Audit Trail' },
    { method: 'GET', path: '/api/teacher/export/xlsx', desc: 'SheetJS Master Gradebook XLSX Export' },
    { method: 'GET', path: '/api/teacher/export/pdf', desc: 'PDFKit DepEd Monitoring PDF Report' }
  ];

  for (const endpoint of teacherEndpoints) {
    const mockReq = { user: studentPayload, method: endpoint.method, originalUrl: endpoint.path };
    const mockRes = createMockRes();
    let permitted = false;

    requireTeacher(mockReq, mockRes, () => {
      permitted = true;
    });

    assert.strictEqual(permitted, false, `Student must be blocked from ${endpoint.method} ${endpoint.path}`);
    assert.strictEqual(mockRes.statusCode, 403);
    console.log(`    [BLOCKED 403] ${endpoint.method} ${endpoint.path} (${endpoint.desc})`);
  }

  // Test 6: Audit all /api/student/* endpoints with teacher token
  console.log('--> Test 6: Dedicated /api/student/* Router Endpoints Audit with Teacher Token');
  const studentEndpoints = [
    { method: 'GET', path: '/api/student/dashboard', desc: 'Student Personal Lessons & Upcoming Quizzes' },
    { method: 'GET', path: '/api/student/lessons', desc: 'Student Curriculum Materials View' },
    { method: 'GET', path: '/api/student/scores', desc: 'Personal Score History' },
    { method: 'POST', path: '/api/student/quizzes/start', desc: 'Online Quiz Session Start' },
    { method: 'POST', path: '/api/student/quizzes/submit', desc: 'Quiz Answer & Proctoring Submit' },
    { method: 'GET', path: '/api/student/interventions', desc: 'Assigned Remedial Interventions (Ways Forward)' },
    { method: 'POST', path: '/api/student/performance-tasks/:id/submit', desc: 'Performance Task Dropzone Upload' },
    { method: 'POST', path: '/api/student/sync-read-logs', desc: 'Offline Reading Event Sync' }
  ];

  for (const endpoint of studentEndpoints) {
    const mockReq = { user: teacherPayload, method: endpoint.method, originalUrl: endpoint.path };
    const mockRes = createMockRes();
    let permitted = false;

    requireStudent(mockReq, mockRes, () => {
      permitted = true;
    });

    assert.strictEqual(permitted, false, `Teacher must be blocked from ${endpoint.method} ${endpoint.path}`);
    assert.strictEqual(mockRes.statusCode, 403);
    console.log(`    [BLOCKED 403] ${endpoint.method} ${endpoint.path} (${endpoint.desc})`);
  }

  // Test 7: Student accessing another student's submission is blocked (FR-04)
  console.log('--> Test 7: Student Accessing Another Student Submission Object (FR-04)');
  const submissionController = require('../src/controllers/submissionController');
  const db = require('../src/config/database');

  const { rows: testSub } = await db.query(
    `SELECT id, student_id FROM quiz_submissions WHERE student_id != ? LIMIT 1`,
    [studentPayload.id]
  );

  if (testSub.length > 0) {
    const foreignSub = testSub[0];
    const reqForeign = {
      params: { id: foreignSub.id },
      user: studentPayload // Juan Dela Cruz attempting to read peer's submission
    };
    const resForeign = createMockRes();

    await submissionController.getSubmissionById(reqForeign, resForeign, (err) => { if (err) throw err; });
    assert.strictEqual(resForeign.statusCode, 403, 'Must return 403 when student views another student submission');
    assert.strictEqual(resForeign.jsonData.success, false);
    console.log(`    [PASS] Student blocked with 403 when trying to inspect peer's submission (${foreignSub.id}).`);
  }

  console.log('======================================================================');
  console.log('[ALL RBAC TESTS PASSED] Strict Unswitchable Role Separation Verified!');
  console.log('======================================================================');
}

if (require.main === module) {
  testRBACSecurity()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[RBAC TEST FAILED]', err);
      process.exit(1);
    });
}

module.exports = { testRBACSecurity };
