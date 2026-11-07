const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createClient } = require('@libsql/client');
const { buildAllAccountDefinitions } = require('../src/db/seeds/demoAccounts');

(async () => {
  console.log('[TEST] Verifying 157-account classroom demo provisioner & credential exports...');

  // 1. Roster structure verification
  const accounts = buildAllAccountDefinitions();
  assert.strictEqual(accounts.length, 157, 'Total demo accounts must be 157');

  const admins = accounts.filter(a => a.role === 'ADMIN');
  const teachers = accounts.filter(a => a.role === 'TEACHER');
  const pendingApplicants = accounts.filter(a => a.application_status === 'PENDING');
  const enrolled = accounts.filter(a => a.enrollment_status === 'APPROVED');
  const unassigned = accounts.filter(a => a.cohort_group === 'Unassigned / Onboarding');
  const clerkPriority = accounts.filter(a => a.clerk_priority);

  assert.strictEqual(admins.length, 1, 'Should have 1 Admin account');
  assert.strictEqual(teachers.length, 3, 'Should have 3 Approved Teacher accounts');
  assert.strictEqual(pendingApplicants.length, 1, 'Should have 1 Pending Instructor Applicant');
  assert.strictEqual(enrolled.length, 140, 'Should have 140 Enrolled Students (35 x 4 sections)');
  assert.strictEqual(unassigned.length, 12, 'Should have 12 Unassigned/Onboarding Students');
  assert.strictEqual(clerkPriority.length, 99, 'Should prioritize 99 live Clerk sign-in accounts within Dev 100-user cap');

  for (const sec of ['10-Rizal', '10-Bonifacio', '10-Luna', '10-Mabini']) {
    const secStudents = enrolled.filter(s => s.section === sec);
    assert.strictEqual(secStudents.length, 35, `Section ${sec} must have 35 students`);
    const cleanSlate = secStudents.filter(s => s.slot >= 31);
    assert.strictEqual(cleanSlate.length, 5, `Section ${sec} must have 5 clean-slate students (#31-#35)`);
  }

  // 2. End-to-end execution in an isolated SQLite database + docs directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralytics-demo-suite-'));
  const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralytics-demo-docs-'));
  const sqlitePath = path.join(tmpDir, 'demo-test.sqlite');

  try {
    const res = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '../src/db/seeds/demoAccounts.js'), '--no-clerk'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          DB_DIALECT: 'sqlite',
          DB_SQLITE_PATH: sqlitePath,
          DEMO_DOCS_DIR: docsDir
        },
        stdio: 'pipe',
        encoding: 'utf8'
      }
    );
    assert.strictEqual(res.status, 0, `demoAccounts.js failed: ${res.stderr || res.stdout}`);

    assert.ok(fs.existsSync(path.join(docsDir, 'Aralytics_Demo_Accounts.xlsx')), 'Excel workbook should be generated');
    assert.ok(fs.existsSync(path.join(docsDir, 'Aralytics_Demo_Accounts.pdf')), 'PDF directory should be generated');
    assert.ok(fs.existsSync(path.join(docsDir, 'README.md')), 'Markdown guide should be generated');

    const client = createClient({ url: `file:${sqlitePath}` });
    const userCountRes = await client.execute('SELECT COUNT(*) AS c FROM users');
    const userCount = Number(userCountRes.rows[0].c);
    assert.ok(userCount >= 157, `Expected at least 157 users in DB, found ${userCount}`);

    const cleanQuizRes = await client.execute("SELECT COUNT(*) AS c FROM quiz_submissions WHERE student_id = 'usr-rizal-31'");
    assert.strictEqual(Number(cleanQuizRes.rows[0].c), 0, 'Clean-slate student (rizal.31) must have 0 quiz submissions');

    const ungradedRes = await client.execute("SELECT status, score FROM performance_task_submissions WHERE student_id = 'usr-rizal-26'");
    assert.strictEqual(ungradedRes.rows[0].status, 'SUBMITTED', 'Slot #26 student should have SUBMITTED task waiting for teacher grade');
    assert.strictEqual(ungradedRes.rows[0].score, null, 'Slot #26 task score should be null until graded');
    client.close();
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Windows sqlite handle cleanup */ }
    try { fs.rmSync(docsDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  console.log('[PASS] 157-account classroom demo provisioner verified.');
})();
