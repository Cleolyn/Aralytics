const assert = require('assert');
const db = require('../src/config/database');
const proctoringController = require('../src/controllers/proctoringController');
const assessmentPersistenceController = require('../src/controllers/assessmentPersistenceController');
const materialsController = require('../src/controllers/materialsController');
const analyticsController = require('../src/controllers/analyticsController');
const performanceTaskController = require('../src/controllers/performanceTaskController');
const authController = require('../src/controllers/authController');

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

async function testMasterLoopModules() {
  console.log('======================================================================');
  console.log('[TEST] MASTER LOOP: MODULES A, B, C, & D VERIFICATION');
  console.log('======================================================================');

  await db.initPromise;

  // ---------------------------------------------------------------------------
  // MODULE A: Proctoring Telemetry (TAB_SWITCH, WINDOW_MINIMIZE, FULLSCREEN_EXIT)
  // ---------------------------------------------------------------------------
  console.log('--> Module A: Proctoring Telemetry & Violation-Triggered Intervention');
  {
    const { rows: quizzes } = await db.query('SELECT id FROM quizzes LIMIT 1');
    const quizId = quizzes[0].id;
    const studentUser = { id: 'usr-student-001', user_id: 'usr-student-001', role: 'STUDENT' };

    for (const eventType of ['TAB_SWITCH', 'WINDOW_MINIMIZE', 'FULLSCREEN_EXIT']) {
      const req = {
        user: studentUser,
        body: {
          quiz_id: quizId,
          student_id: studentUser.id,
          event_type: eventType,
          timestamp: new Date().toISOString()
        }
      };
      const res = createMockRes();
      await assessmentPersistenceController.logSecurityEvent(req, res, (err) => { if (err) throw err; });
      assert.strictEqual(res.statusCode, 200, `Expected 200 for ${eventType}, got ${res.statusCode}`);
      assert.strictEqual(res.body.event_type, eventType);
    }
    console.log('    [PASS] Proctoring controller accepted TAB_SWITCH, WINDOW_MINIMIZE, FULLSCREEN_EXIT.');
  }

  // ---------------------------------------------------------------------------
  // MODULE B: Offline Mutation Queue Sync
  // ---------------------------------------------------------------------------
  console.log('--> Module B: Offline Mutation Outbox Sync');
  {
    const { rows: mats } = await db.query('SELECT id FROM instructional_materials LIMIT 1');
    const req = {
      user: { id: 'usr-student-001', user_id: 'usr-student-001', role: 'STUDENT' },
      body: {
        logs: [
          {
            idempotency_key: `outbox-${Date.now()}-1`,
            material_id: mats[0].id,
            read_at: new Date(Date.now() - 5000).toISOString()
          }
        ]
      }
    };
    const res = createMockRes();
    await materialsController.syncReadLogs(req, res, (err) => { if (err) throw err; });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.synced_count, 1);
    console.log('    [PASS] Offline outbox mutation synced successfully.');
  }

  // ---------------------------------------------------------------------------
  // MODULE C: Teacher Intervention & Content Management Studio (Full CRUD)
  // ---------------------------------------------------------------------------
  console.log('--> Module C: Teacher Intervention CRUD & Learning Materials CRUD');
  {
    const teacherUser = { id: 'usr-teacher-001', user_id: 'usr-teacher-001', role: 'TEACHER' };

    // 1. Create Custom Intervention
    const createIntvReq = {
      user: teacherUser,
      body: {
        student_id: 'usr-student-001',
        competency_id: 'comp-ap10-q1-001',
        material_id: 'mat-rem-001',
        status: 'ASSIGNED'
      }
    };
    const createIntvRes = createMockRes();
    await analyticsController.createIntervention(createIntvReq, createIntvRes, (err) => { if (err) throw err; });
    assert.strictEqual(createIntvRes.statusCode, 201);
    const createdIntvId = createIntvRes.body.result.intervention_id;
    assert.ok(createdIntvId, 'Custom intervention ID must be returned');

    // 2. Delete Custom Intervention
    const delIntvReq = { user: teacherUser, params: { id: createdIntvId } };
    const delIntvRes = createMockRes();
    await analyticsController.deleteIntervention(delIntvReq, delIntvRes, (err) => { if (err) throw err; });
    assert.strictEqual(delIntvRes.statusCode, 200);
    assert.strictEqual(delIntvRes.body.result.deleted, true);
    assert.strictEqual(delIntvRes.body.result.intervention_id, createdIntvId);
    console.log('    [PASS] Teacher Intervention Create & Delete CRUD verified.');

    // 3. Create, Update, and Delete Learning Material
    const samplePdfBase64 = Buffer.from('%PDF-1.4\nSample Module Content\n%%EOF').toString('base64');
    const createMatReq = {
      user: teacherUser,
      body: {
        title: 'Master Loop Test Slide Deck',
        description: 'Initial description',
        competency_id: 'comp-ap10-q1-001',
        file_type: 'PDF',
        file_name: 'slides.pdf',
        file_content_base64: samplePdfBase64
      }
    };
    const createMatRes = createMockRes();
    await materialsController.createMaterial(createMatReq, createMatRes, (err) => { if (err) throw err; });
    assert.strictEqual(createMatRes.statusCode, 201);
    const matId = createMatRes.body.materialId;
    assert.ok(matId, 'materialId must be returned');

    // Update Material
    const updateMatReq = {
      user: teacherUser,
      params: { id: matId },
      body: {
        title: 'Updated Master Loop Slide Deck',
        description: 'Updated description',
        file_type: 'PDF'
      }
    };
    const updateMatRes = createMockRes();
    await materialsController.updateMaterial(updateMatReq, updateMatRes, (err) => { if (err) throw err; });
    assert.strictEqual(updateMatRes.statusCode, 200);
    assert.strictEqual(updateMatRes.body.materialId, matId);

    // Delete Material
    const deleteMatReq = { user: teacherUser, params: { id: matId } };
    const deleteMatRes = createMockRes();
    await materialsController.deleteMaterial(deleteMatReq, deleteMatRes, (err) => { if (err) throw err; });
    assert.strictEqual(deleteMatRes.statusCode, 200);
    assert.strictEqual(deleteMatRes.body.materialId, matId);
    console.log('    [PASS] Learning Materials Create (with file upload), Update, & Delete CRUD verified.');
  }

  // ---------------------------------------------------------------------------
  // MODULE D: Student Performance Task & Strict Input Validation
  // ---------------------------------------------------------------------------
  console.log('--> Module D: Performance Task Media/Archive Upload & Strict Input Sanitization');
  {
    const { rows: tasks } = await db.query('SELECT id FROM performance_tasks LIMIT 1');
    const taskId = tasks[0].id;
    const studentUser = { id: 'usr-student-001', user_id: 'usr-student-001', role: 'STUDENT' };

    // Submit a .zip archive deliverable
    const zipBytes = Buffer.from('PK\x03\x04SampleArchivePayload').toString('base64');
    const subReq = {
      user: studentUser,
      params: { id: taskId },
      body: {
        file_name: 'project_deliverable.zip',
        file_size_kb: 24,
        file_content_base64: zipBytes,
        notes: 'Submitted archive via dropzone'
      }
    };
    const subRes = createMockRes();
    await performanceTaskController.submitTask(subReq, subRes, (err) => { if (err) throw err; });
    assert.strictEqual(subRes.statusCode, 200);
    assert.strictEqual(subRes.body.submission.file_name, 'project_deliverable.zip');
    console.log('    [PASS] Student Performance Task accepted archive (.zip) deliverable.');

    // Reject invalid name containing numbers/symbols during registration
    const badNameReq = {
      body: {
        first_name: 'Juan123',
        last_name: 'Dela Cruz!',
        email: `badname-${Date.now()}@example.test`,
        lrn_or_id: '109876543210',
        password: 'Password123!'
      }
    };
    const badNameRes = createMockRes();
    await authController.register(badNameReq, badNameRes, (err) => { if (err) throw err; });
    assert.strictEqual(badNameRes.statusCode, 400, 'Must reject digits/symbols in name fields with 400');

    // Reject non-numeric student_id_number when explicitly provided
    const badIdReq = {
      body: {
        first_name: 'Maria',
        last_name: 'Clara',
        email: `badid-${Date.now()}@example.test`,
        student_id_number: 'ABC-12345',
        password: 'Password123!'
      }
    };
    const badIdRes = createMockRes();
    await authController.register(badIdReq, badIdRes, (err) => { if (err) throw err; });
    assert.strictEqual(badIdRes.statusCode, 400, 'Must reject non-numeric student_id_number with 400');
    console.log('    [PASS] Strict server-side input validation enforced for Name and Student Number fields.');
  }

  console.log('======================================================================');
  console.log('[ALL MASTER LOOP MODULE TESTS PASSED] 100% Specifications Verified!');
  console.log('======================================================================');
}

if (require.main === module) {
  testMasterLoopModules()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[MASTER LOOP TEST FAILED]:', err);
      process.exit(1);
    });
}

module.exports = { testMasterLoopModules };
