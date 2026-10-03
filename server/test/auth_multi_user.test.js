const assert = require('assert');
const jwt = require('jsonwebtoken');
const authController = require('../src/controllers/authController');
const {
  verifyToken,
  requireRole,
  requireTeacher,
  requireStudent,
  requireOwnStudentData,
  JWT_SECRET
} = require('../src/middleware/authMiddleware');
const db = require('../src/config/database');
const { seedUsers } = require('../scripts/seedUsers');

async function testAuthMultiUserSystem() {
  console.log('======================================================================');
  console.log('[TEST] MODULE: AUTHENTICATION & MULTI-USER ACCOUNT SYSTEM (FR-01..04)');
  console.log('======================================================================');

  // Step 0: Ensure database has seeded test users
  await seedUsers();

  // Mock response builder
  const createMockRes = () => {
    return {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      }
    };
  };

  // Test 1: Teacher Login (teacher@ap10.edu.ph / Teacher123!)
  console.log('--> Test 1: Teacher Single Sign-In (FR-01, FR-02)');
  {
    const req = {
      body: {
        identifier: 'teacher@ap10.edu.ph',
        password: 'Teacher123!',
        role: 'TEACHER'
      }
    };
    const res = createMockRes();
    let nextCalled = false;
    await authController.login(req, res, (err) => { nextCalled = true; if (err) throw err; });

    assert.strictEqual(res.statusCode, 200, `Expected 200 OK, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.token, 'Token must be present in response');
    
    // Verify decoded JWT claims
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    assert.strictEqual(decoded.role, 'TEACHER', 'Decoded token role must be TEACHER');
    assert.strictEqual(decoded.email, 'teacher@ap10.edu.ph');
    assert.ok(decoded.user_id, 'user_id claim must be present');
    assert.ok(decoded.full_name, 'full_name claim must be present');
    console.log(`    [PASS] Teacher token issued with verified payload: user_id=${decoded.user_id}, role=${decoded.role}`);
  }

  // Test 2: Role mismatch prevention during login
  console.log('--> Test 2: Role Selector Mismatch Prevention (FR-01)');
  {
    const req = {
      body: {
        identifier: 'teacher@ap10.edu.ph',
        password: 'Teacher123!',
        role: 'STUDENT' // Mismatched requested role
      }
    };
    const res = createMockRes();
    await authController.login(req, res, () => {});

    assert.strictEqual(res.statusCode, 403, `Expected 403 Forbidden for mismatched role, got ${res.statusCode}`);
    assert.strictEqual(res.body.success, false);
    console.log('    [PASS] Blocked login when user role does not match selected role.');
  }

  // Test 3: Student 1 Login (student1@ap10.edu.ph / Student123! - Section 10-Rizal)
  console.log('--> Test 3: Student 1 Login & Section Ingestion (FR-01, FR-02)');
  {
    const req = {
      body: {
        identifier: 'student1@ap10.edu.ph',
        password: 'Student123!',
        role: 'STUDENT'
      }
    };
    const res = createMockRes();
    await authController.login(req, res, () => {});

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    assert.strictEqual(decoded.role, 'STUDENT');
    assert.strictEqual(decoded.section_id, '10-Rizal');
    assert.strictEqual(decoded.email, 'student1@ap10.edu.ph');
    console.log(`    [PASS] Student 1 token issued: section_id=${decoded.section_id}, full_name=${decoded.full_name}`);
  }

  // Test 4: Student 2 Login (student2@ap10.edu.ph / Student123! - Section 10-Bonifacio)
  console.log('--> Test 4: Student 2 Login (FR-01, Section 10-Bonifacio)');
  {
    const req = {
      body: {
        identifier: 'student2@ap10.edu.ph',
        password: 'Student123!'
      }
    };
    const res = createMockRes();
    await authController.login(req, res, () => {});

    assert.strictEqual(res.statusCode, 200);
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    assert.strictEqual(decoded.role, 'STUDENT');
    assert.strictEqual(decoded.section_id, '10-Bonifacio');
    console.log(`    [PASS] Student 2 token issued: section_id=${decoded.section_id}`);
  }

  // Test 5: Student 3 Login (student3@ap10.edu.ph / Student123! - Section 10-Luna)
  console.log('--> Test 5: Student 3 Login (FR-01, Section 10-Luna)');
  {
    const req = {
      body: {
        identifier: 'student3@ap10.edu.ph',
        password: 'Student123!'
      }
    };
    const res = createMockRes();
    await authController.login(req, res, () => {});

    assert.strictEqual(res.statusCode, 200);
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    assert.strictEqual(decoded.role, 'STUDENT');
    assert.strictEqual(decoded.section_id, '10-Luna');
    console.log(`    [PASS] Student 3 token issued: section_id=${decoded.section_id}`);
  }

  // Test 6: Invalid Credentials Error Feedback
  console.log('--> Test 6: Invalid Credentials Error Feedback (FR-01)');
  {
    const req = {
      body: {
        identifier: 'student1@ap10.edu.ph',
        password: 'WrongPassword123!'
      }
    };
    const res = createMockRes();
    await authController.login(req, res, () => {});

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('Maling kredensyal'));
    console.log('    [PASS] Correctly rejected invalid password with 401 and descriptive message.');
  }

  // Test 7: Logout Handshake (FR-01)
  console.log('--> Test 7: Logout Handshake (FR-01)');
  {
    const req = {};
    const res = createMockRes();
    await authController.logout(req, res, () => {});

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    console.log('    [PASS] Logout endpoint acknowledged session termination.');
  }

  // Test 8: Token Validation Middleware (verifyToken & validateToken)
  console.log('--> Test 8: Token Validation & Session Verification (FR-02)');
  {
    const studentToken = jwt.sign(
      { user_id: 'usr-student-ap10-1', id: 'usr-student-ap10-1', role: 'STUDENT', email: 'student1@ap10.edu.ph' },
      JWT_SECRET
    );

    const req = {
      headers: { authorization: `Bearer ${studentToken}` }
    };
    const res = createMockRes();
    let verified = false;
    verifyToken(req, res, () => { verified = true; });

    assert.strictEqual(verified, true, 'verifyToken middleware must call next() on valid token');
    assert.strictEqual(req.user.user_id, 'usr-student-ap10-1');

    // Test validateToken controller
    await authController.validateToken(req, res, () => {});
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.valid, true);
    assert.strictEqual(res.body.user.email, 'student1@ap10.edu.ph');
    console.log('    [PASS] verifyToken and validateToken successfully verified active session.');
  }

  // Test 9: Strict Role Isolation Middleware (requireTeacher & requireStudent)
  console.log('--> Test 9: Strict Role Boundary Guards (FR-03, FR-04, NFR-01)');
  {
    const teacherReq = { user: { role: 'TEACHER', id: 'usr-teacher-001' } };
    const studentReq = { user: { role: 'STUDENT', id: 'usr-student-ap10-1' } };

    // Teacher accessing teacher route -> Allowed
    let teacherPassed = false;
    requireTeacher(teacherReq, createMockRes(), () => { teacherPassed = true; });
    assert.strictEqual(teacherPassed, true);

    // Student accessing teacher route -> Blocked 403
    const blockedTeacherRes = createMockRes();
    let studentPassedTeacherGuard = false;
    requireTeacher(studentReq, blockedTeacherRes, () => { studentPassedTeacherGuard = true; });
    assert.strictEqual(studentPassedTeacherGuard, false);
    assert.strictEqual(blockedTeacherRes.statusCode, 403);

    // Student accessing student route -> Allowed
    let studentPassed = false;
    requireStudent(studentReq, createMockRes(), () => { studentPassed = true; });
    assert.strictEqual(studentPassed, true);

    // Teacher accessing student route -> Blocked 403
    const blockedStudentRes = createMockRes();
    let teacherPassedStudentGuard = false;
    requireStudent(teacherReq, blockedStudentRes, () => { teacherPassedStudentGuard = true; });
    assert.strictEqual(teacherPassedStudentGuard, false);
    assert.strictEqual(blockedStudentRes.statusCode, 403);

    console.log('    [PASS] requireTeacher and requireStudent strictly enforce role boundaries.');
  }

  // Test 10: Student Data Isolation Guard (requireOwnStudentData)
  console.log('--> Test 10: Student Data Isolation Guard (FR-04)');
  {
    const student1Req = {
      user: { role: 'STUDENT', id: 'usr-student-ap10-1', user_id: 'usr-student-ap10-1' },
      params: { student_id: 'usr-student-ap10-2' } // Attempting to inspect student 2
    };
    const snoopRes = createMockRes();
    let snoopAllowed = false;
    requireOwnStudentData('student_id')(student1Req, snoopRes, () => { snoopAllowed = true; });

    assert.strictEqual(snoopAllowed, false);
    assert.strictEqual(snoopRes.statusCode, 403);
    console.log('    [PASS] Student blocked with 403 from inspecting peer student record.');
  }

  console.log('======================================================================');
  console.log('[ALL AUTH & MULTI-USER TESTS PASSED] 10/10 Assertions Verified!');
  console.log('======================================================================');
}

if (require.main === module) {
  testAuthMultiUserSystem()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[TEST SUITE FAILED]:', err);
      process.exit(1);
    });
}

module.exports = { testAuthMultiUserSystem };
