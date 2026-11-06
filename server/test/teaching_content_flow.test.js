// Teaching content over the real Express app: edit, delete, archive and restore for quizzes and
// performance tasks, the "never destroy gradebook data" rules, and adviser-scoped student views.
// Uses an in-memory main database, fake D1 shards (node:sqlite) and a fake verified identity provider.
process.env.DB_DIALECT = 'sqlite';
process.env.DB_SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');

const sdkPath = require.resolve('@clerk/express');
require(sdkPath);
const originalSDK = require.cache[sdkPath].exports;
const identities = new Map();
require.cache[sdkPath].exports = {
  getAuth: req => ({ userId: req.headers['x-test-user'] || null }),
  clerkMiddleware: () => (_req, _res, next) => next(),
  createClerkClient: () => ({ users: { getUser: async id => identities.get(id) } })
};
const db = require('../src/config/database');
const app = require('../src/app');
require.cache[sdkPath].exports = originalSDK;
const { initializeDatabase } = require('../src/db/init');
const { createFakeD1 } = require('./helpers/fakeD1');

const COMPETENCY = 'comp-ap10-q1-001';
const OTHER_COMPETENCY = 'comp-ap10-q1-002';

const pdf = size => {
  const bytes = Buffer.alloc(size, 7);
  bytes.write('%PDF-1.4\n', 0);
  return bytes;
};

function addIdentity(id) {
  identities.set(id, {
    firstName: 'Test', lastName: id, primaryEmailAddressId: 'email',
    emailAddresses: [{ id: 'email', emailAddress: `${id}@example.test`, verification: { status: 'verified' } }]
  });
}
async function addStaff(id, role) {
  await db.query(`INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role)
    VALUES (?, ?, 'Test', ?, ?, ?, 'CLERK_MANAGED_AUTH', ?)`, [id, `account:${id}`, id, `Test ${id}`, `${id}@example.test`, role]);
  addIdentity(id);
}

const question = (text, answer = 'A') => ({ question_text: text, question_type: 'MULTIPLE_CHOICE', options: ['A', 'B'], correct_answer: answer, points: 1 });

async function run() {
  await initializeDatabase();
  const shard = createFakeD1();
  app.locals.env = { FILES_DB_1: shard, FILE_TOKEN_SECRET: 'teaching-content-test-secret' };

  await addStaff('teacher1', 'TEACHER');
  await addStaff('teacher2', 'TEACHER');
  await addStaff('admin', 'ADMIN');

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, user, { method = 'GET', body } = {}) => {
    const response = await fetch(`${origin}/api${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  };

  try {
    // -----------------------------------------------------------------------------
    // Setup: a student who joins teacher1's class through the real invitation routes
    // -----------------------------------------------------------------------------
    addIdentity('student1');
    assert.equal((await call('/auth/sync', 'student1', { method: 'POST', body: {} })).status, 200);
    const invitation = await call('/enrollment/invitations', 'teacher1', { method: 'POST', body: { school_year: '2026-2027', sections: ['10-Rizal'] } });
    assert.equal(invitation.status, 201);
    const requested = await call('/enrollment/request', 'student1', { method: 'POST', body: { code: invitation.data.code, lrn: '123456789012', full_name: 'Student One', mobile: '09171234567', section: '10-Rizal' } });
    assert.equal(requested.status, 201);
    assert.equal((await call('/enrollment/requests/student1', 'teacher1', { method: 'PATCH', body: { status: 'APPROVED' } })).status, 200);

    // -----------------------------------------------------------------------------
    // Quizzes
    // -----------------------------------------------------------------------------
    const created = await call('/quizzes', 'teacher1', { method: 'POST', body: {
      competency_id: COMPETENCY, title: 'Quiz One', instructions: 'Read carefully', time_limit_minutes: 20, passing_score: 2, max_blur_limit: 3,
      questions: [question('Q1'), question('Q2')]
    } });
    assert.equal(created.status, 201);
    const quizId = created.data.quizId;

    // Before any attempt a full edit works, including the questions
    const fullEdit = await call(`/quizzes/${quizId}`, 'teacher1', { method: 'PUT', body: {
      title: 'Quiz One v2', competency_id: OTHER_COMPETENCY, passing_score: 3,
      questions: [question('Q1'), question('Q2'), question('Q3', 'B')]
    } });
    assert.equal(fullEdit.status, 200, JSON.stringify(fullEdit.data));
    assert.equal(fullEdit.data.quiz.title, 'Quiz One v2');
    assert.equal(fullEdit.data.quiz.total_points, 3);
    assert.equal(fullEdit.data.quiz.passing_score, 3);
    assert.equal(fullEdit.data.quiz.attempt_count, 0);
    const detail = await call(`/quizzes/${quizId}`, 'teacher1');
    assert.equal(detail.data.quiz.questions.length, 3);
    assert.equal(detail.data.quiz.attempt_count, 0);
    assert.equal((await call(`/quizzes/${quizId}`, 'teacher1', { method: 'PUT', body: { title: '   ' } })).status, 400);
    assert.equal((await call(`/quizzes/${quizId}`, 'teacher1', { method: 'PUT', body: { passing_score: 99 } })).status, 400, 'passing score cannot exceed total');
    assert.equal((await call('/quizzes/nope', 'teacher1', { method: 'PUT', body: { title: 'x' } })).data.code, 'QUIZ_NOT_FOUND');
    assert.equal((await call('/quizzes/nope', 'teacher1', { method: 'DELETE' })).status, 404);

    // A quiz with no attempts can be deleted (questions first)
    const throwaway = await call('/quizzes', 'teacher1', { method: 'POST', body: { competency_id: COMPETENCY, title: 'Throwaway', questions: [question('T1')] } });
    const gone = await call(`/quizzes/${throwaway.data.quizId}`, 'teacher1', { method: 'DELETE' });
    assert.equal(gone.status, 200); assert.equal(gone.data.id, throwaway.data.quizId);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM quiz_questions WHERE quiz_id = ?', [throwaway.data.quizId])).rows[0].n, 0);
    assert.equal((await call(`/quizzes/${throwaway.data.quizId}`, 'teacher1')).status, 404);

    // The student starts the quiz: now it has an attempt
    const started = await call('/student/quizzes/start', 'student1', { method: 'POST', body: { quiz_id: quizId } });
    assert.equal(started.status, 201);
    const submissionId = started.data.submission.id;
    assert.equal((await call(`/quizzes/${quizId}`, 'teacher1')).data.quiz.attempt_count, 1);
    const listed = (await call('/quizzes', 'teacher1')).data.quizzes.find(q => q.id === quizId);
    assert.equal(listed.attempt_count, 1); assert.equal(listed.archived_at, null);

    const locked = await call(`/quizzes/${quizId}`, 'teacher1', { method: 'PUT', body: { questions: [question('New')], passing_score: 1 } });
    assert.equal(locked.status, 409); assert.equal(locked.data.code, 'QUIZ_LOCKED');
    assert.deepEqual(locked.data.locked_fields.sort(), ['passing_score', 'questions']);
    assert.equal((await call(`/quizzes/${quizId}`, 'teacher1', { method: 'PUT', body: { competency_id: COMPETENCY } })).data.code, 'QUIZ_LOCKED');
    const titled = await call(`/quizzes/${quizId}`, 'teacher1', { method: 'PUT', body: { title: 'Quiz One v3', instructions: 'New text', time_limit_minutes: 25, max_blur_limit: 5, passing_score: 3 } });
    assert.equal(titled.status, 200, JSON.stringify(titled.data));
    assert.equal(titled.data.quiz.title, 'Quiz One v3'); assert.equal(titled.data.quiz.time_limit_minutes, 25);
    assert.equal(titled.data.quiz.passing_score, 3, 'an unchanged locked field is accepted');

    const noDelete = await call(`/quizzes/${quizId}`, 'teacher1', { method: 'DELETE' });
    assert.equal(noDelete.status, 409); assert.equal(noDelete.data.code, 'QUIZ_HAS_ATTEMPTS'); assert.equal(noDelete.data.attempts, 1);
    assert.equal((await call(`/quizzes/${quizId}`, 'teacher1')).status, 200, 'the quiz is still there');

    // Ownership: another teacher is refused, an admin may act
    for (const [method, route] of [['PUT', ''], ['DELETE', ''], ['POST', '/archive'], ['POST', '/restore']]) {
      const refused = await call(`/quizzes/${quizId}${route}`, 'teacher2', { method, body: method === 'PUT' ? { title: 'Hijack' } : undefined });
      assert.equal(refused.status, 403, `${method}${route}`); assert.equal(refused.data.code, 'NOT_OWNER');
    }
    assert.equal((await call(`/quizzes/${quizId}`, 'student1', { method: 'PUT', body: { title: 'x' } })).status, 403, 'students are not teachers');
    assert.equal((await call(`/quizzes/${quizId}`, 'admin', { method: 'PUT', body: { title: 'Quiz One v4' } })).status, 200, 'admin edits');

    // Archive hides the quiz from the student and blocks submission; restore brings it back
    const archived = await call(`/quizzes/${quizId}/archive`, 'teacher1', { method: 'POST' });
    assert.equal(archived.status, 200); assert.ok(archived.data.quiz.archived_at); assert.equal(archived.data.quiz.is_published, 0);
    assert.equal((await call('/quizzes', 'student1')).data.quizzes.some(q => q.id === quizId), false);
    assert.equal((await call(`/quizzes/${quizId}`, 'student1')).status, 404);
    assert.equal((await call('/quizzes', 'teacher1')).data.quizzes.find(q => q.id === quizId).archived_at !== null, true, 'teachers still see it');
    const blocked = await call('/student/quizzes/submit', 'student1', { method: 'POST', body: { submission_id: submissionId, answers: [] } });
    assert.equal(blocked.status, 409); assert.equal(blocked.data.code, 'QUIZ_ARCHIVED');
    assert.equal((await call('/student/quizzes/start', 'student1', { method: 'POST', body: { quiz_id: quizId } })).status, 404);
    const restored = await call(`/quizzes/${quizId}/restore`, 'teacher1', { method: 'POST' });
    assert.equal(restored.status, 200); assert.equal(restored.data.quiz.archived_at, null); assert.equal(restored.data.quiz.is_published, 1);
    assert.equal((await call('/quizzes', 'student1')).data.quizzes.some(q => q.id === quizId), true);
    const submitted = await call('/student/quizzes/submit', 'student1', { method: 'POST', body: { submission_id: submissionId, answers: [] } });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.data));
    assert.equal((await call(`/quizzes/${quizId}`, 'teacher1')).data.quiz.attempt_count, 1);

    // An attempt recorded only in quiz_attempts also locks the quiz
    const second = await call('/quizzes', 'teacher1', { method: 'POST', body: { competency_id: COMPETENCY, title: 'Second', questions: [question('S1')] } });
    await db.query(`INSERT INTO quiz_attempts (id, quiz_id, student_id, score, total_points, is_passed) VALUES ('att-x', ?, 'student1', 1, 1, 1)`, [second.data.quizId]);
    assert.equal((await call(`/quizzes/${second.data.quizId}`, 'teacher1', { method: 'DELETE' })).data.code, 'QUIZ_HAS_ATTEMPTS');

    // -----------------------------------------------------------------------------
    // Performance tasks (with real fake-D1 submission files)
    // -----------------------------------------------------------------------------
    const makeTask = async (user, title) => {
      const res = await call('/performance-tasks', user, { method: 'POST', body: { quarter: 'Q1', competency_id: COMPETENCY, title, instructions: 'Do it', rubric_criteria: 'Content 100%', total_points: 50 } });
      assert.equal(res.status, 201);
      return res.data.task.id;
    };
    async function upload(user, taskId) {
      const bytes = pdf(1500);
      const reserved = await call('/files', user, { method: 'POST', body: { purpose: 'submission', name: 'work.pdf', size: bytes.length, task_id: taskId } });
      assert.equal(reserved.status, 201, JSON.stringify(reserved.data));
      const { chunk_size: size, chunk_count: count, part_url: template } = reserved.data.upload;
      for (let i = 0; i < count; i++) {
        const response = await fetch(origin + template.replace('{index}', i), { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes.subarray(i * size, (i + 1) * size) });
        assert.equal(response.status, 200);
      }
      assert.equal((await call(`/files/${reserved.data.file.id}/complete`, user, { method: 'POST' })).status, 200);
      return reserved.data.file.id;
    }
    const submitWork = async taskId => {
      const fileId = await upload('student1', taskId);
      const res = await call(`/performance-tasks/${taskId}/submit`, 'student1', { method: 'POST', body: { file_id: fileId } });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      return { fileId, submissionId: res.data.submission.id };
    };
    const fileRows = taskId => db.query('SELECT id FROM files WHERE task_id = ?', [taskId]).then(r => r.rows.length);

    const taskId = await makeTask('teacher1', 'Task One');
    const edit = await call(`/performance-tasks/${taskId}`, 'teacher1', { method: 'PUT', body: { title: 'Task One v2', total_points: 80, quarter: 'Q2', competency_id: OTHER_COMPETENCY, due_date: '2026-12-01 12:00:00' } });
    assert.equal(edit.status, 200, JSON.stringify(edit.data));
    assert.equal(edit.data.task.total_points, 80); assert.equal(edit.data.task.quarter, 'Q2');
    assert.equal((await call('/performance-tasks/nope', 'teacher1', { method: 'DELETE' })).data.code, 'TASK_NOT_FOUND');

    const { fileId, submissionId: subId } = await submitWork(taskId);
    assert.equal(await fileRows(taskId), 1);
    const taskLocked = await call(`/performance-tasks/${taskId}`, 'teacher1', { method: 'PUT', body: { total_points: 10 } });
    assert.equal(taskLocked.status, 409); assert.equal(taskLocked.data.code, 'TASK_LOCKED'); assert.deepEqual(taskLocked.data.locked_fields, ['total_points']);
    const rubric = await call(`/performance-tasks/${taskId}`, 'teacher1', { method: 'PUT', body: { title: 'Task One v3', rubric_criteria: 'New rubric', due_date: null, total_points: 80 } });
    assert.equal(rubric.status, 200); assert.equal(rubric.data.task.rubric_criteria, 'New rubric');
    assert.equal((await call(`/performance-tasks/${taskId}`, 'teacher2', { method: 'PUT', body: { title: 'x' } })).data.code, 'NOT_OWNER');

    // Plain delete is refused; force removes submissions, their files rows and chunks
    const plain = await call(`/performance-tasks/${taskId}`, 'teacher1', { method: 'DELETE' });
    assert.equal(plain.status, 409); assert.equal(plain.data.code, 'TASK_HAS_SUBMISSIONS');
    assert.equal(plain.data.submissions, 1); assert.equal(plain.data.graded, 0);
    assert.equal((await call(`/performance-tasks/${taskId}`, 'teacher2', { method: 'DELETE' })).status, 403);
    assert.ok(shard.chunkCount() > 0);
    const forced = await call(`/performance-tasks/${taskId}?force=1`, 'teacher1', { method: 'DELETE' });
    assert.equal(forced.status, 200, JSON.stringify(forced.data));
    assert.equal(forced.data.id, taskId); assert.equal(forced.data.removed_files, 1);
    assert.equal(await fileRows(taskId), 0, 'files rows removed');
    assert.equal((await db.query('SELECT 1 FROM files WHERE id = ?', [fileId])).rows.length, 0);
    assert.equal(shard.chunkCount(), 0, 'chunks removed');
    assert.equal((await db.query('SELECT 1 FROM performance_task_submissions WHERE id = ?', [subId])).rows.length, 0);
    assert.equal((await call(`/performance-tasks/${taskId}`, 'teacher1')).status, 404);

    // A task nobody touched is simply deleted
    const emptyTask = await makeTask('teacher1', 'Empty task');
    assert.equal((await call(`/performance-tasks/${emptyTask}`, 'teacher1', { method: 'DELETE' })).data.removed_files, 0);

    // Graded work: only archive
    const gradedTask = await makeTask('teacher1', 'Graded task');
    const graded = await submitWork(gradedTask);
    const grade = await call(`/performance-tasks/submissions/${graded.submissionId}/grade`, 'teacher1', { method: 'PATCH', body: { score: 40, feedback: 'Good' } });
    assert.equal(grade.status, 200);
    for (const suffix of ['', '?force=1']) {
      const refused = await call(`/performance-tasks/${gradedTask}${suffix}`, 'teacher1', { method: 'DELETE' });
      assert.equal(refused.status, 409); assert.equal(refused.data.code, 'TASK_HAS_GRADES'); assert.equal(refused.data.graded, 1);
    }
    assert.equal(await fileRows(gradedTask), 1, 'graded work is kept');

    const taskArchived = await call(`/performance-tasks/${gradedTask}/archive`, 'teacher1', { method: 'POST' });
    assert.equal(taskArchived.status, 200); assert.ok(taskArchived.data.task.archived_at);
    assert.equal((await call('/performance-tasks', 'student1')).data.tasks.some(t => t.id === gradedTask), false);
    assert.equal((await call(`/performance-tasks/${gradedTask}`, 'student1')).status, 404);
    assert.equal((await call('/performance-tasks', 'teacher1')).data.tasks.find(t => t.id === gradedTask).archived_at !== null, true);
    const resubmit = await call(`/performance-tasks/${gradedTask}/submit`, 'student1', { method: 'POST', body: { file_name: 'late.pdf' } });
    assert.equal(resubmit.status, 409); assert.equal(resubmit.data.code, 'TASK_ARCHIVED');
    assert.equal((await call(`/performance-tasks/${gradedTask}/restore`, 'teacher2', { method: 'POST' })).status, 403);
    assert.equal((await call(`/performance-tasks/${gradedTask}/restore`, 'admin', { method: 'POST' })).data.task.archived_at, null);
    assert.equal((await call('/performance-tasks', 'student1')).data.tasks.some(t => t.id === gradedTask), true);

    // -----------------------------------------------------------------------------
    // Adviser filtering: the student only sees teacher1's lessons, quizzes and tasks
    // -----------------------------------------------------------------------------
    const lesson1 = await call('/materials', 'teacher1', { method: 'POST', body: { competency_id: COMPETENCY, title: 'Lesson T1', file_type: 'LINK', storage_url: 'https://example.test/one' } });
    const lesson2 = await call('/materials', 'teacher2', { method: 'POST', body: { competency_id: COMPETENCY, title: 'Lesson T2', file_type: 'LINK', storage_url: 'https://example.test/two' } });
    assert.equal(lesson1.status, 201); assert.equal(lesson2.status, 201);
    const quiz2 = await call('/quizzes', 'teacher2', { method: 'POST', body: { competency_id: COMPETENCY, title: 'Quiz T2', questions: [question('Z1')] } });
    const task2 = await makeTask('teacher2', 'Task T2');

    const titles = (res, key) => res.data[key].map(item => item.title).sort();
    const materialList = await call('/materials', 'student1');
    assert.ok(titles(materialList, 'materials').includes('Lesson T1'));
    assert.ok(!titles(materialList, 'materials').includes('Lesson T2'));
    const lessons = await call('/student/lessons', 'student1');
    assert.ok(lessons.data.materials.some(m => m.id === lesson1.data.materialId));
    assert.ok(!lessons.data.materials.some(m => m.id === lesson2.data.materialId));
    assert.equal((await call(`/materials/${lesson1.data.materialId}`, 'student1')).status, 200);
    assert.equal((await call(`/materials/${lesson2.data.materialId}`, 'student1')).status, 404);
    assert.ok(!titles(await call('/quizzes', 'student1'), 'quizzes').includes('Quiz T2'));
    assert.equal((await call(`/quizzes/${quiz2.data.quizId}`, 'student1')).status, 404);
    assert.equal((await call('/student/quizzes/start', 'student1', { method: 'POST', body: { quiz_id: quiz2.data.quizId } })).status, 404);
    assert.equal((await call('/submissions/start', 'student1', { method: 'POST', body: { quiz_id: quiz2.data.quizId } })).status, 404);
    assert.ok(!titles(await call('/performance-tasks', 'student1'), 'tasks').includes('Task T2'));
    assert.equal((await call(`/performance-tasks/${task2}`, 'student1')).status, 404);
    assert.equal((await call(`/performance-tasks/${task2}/submit`, 'student1', { method: 'POST', body: { file_name: 'x.pdf' } })).status, 404);
    assert.equal((await call(`/student/performance-tasks/${task2}/submit`, 'student1', { method: 'POST', body: { file_name: 'x.pdf' } })).status, 404);
    const assessment = await call('/assessment/submit', 'student1', { method: 'POST', body: { quiz_id: quiz2.data.quizId, student_id: 'student1', score: 1, total_points: 1, answers: [] } });
    assert.equal(assessment.status, 404, 'the persistence route is scoped too');

    // Teachers and admins still see everything
    for (const user of ['teacher1', 'teacher2', 'admin']) {
      assert.ok(titles(await call('/materials', user), 'materials').includes('Lesson T2'), `${user} sees lessons`);
      assert.equal((await call(`/materials/${lesson2.data.materialId}`, user)).status, 200);
      assert.equal((await call(`/performance-tasks/${task2}`, user)).status, 200);
    }
    assert.ok(titles(await call('/quizzes', 'teacher1'), 'quizzes').includes('Quiz T2'));
    assert.equal((await call(`/quizzes/${quiz2.data.quizId}`, 'teacher1')).status, 200);

    // A student with no approved adviser gets an empty scope
    const teaching = require('../src/services/teachingContentService');
    assert.equal((await teaching.adviserFilter({ id: 'nobody', role: 'STUDENT' }, 'm.created_by')).sql.trim(), 'AND 1 = 0');
    assert.equal((await teaching.adviserFilter({ id: 'teacher1', role: 'TEACHER' }, 'm.created_by')).sql, '');

    console.log('PASS: teaching content flow');
  } finally {
    server.close();
  }
}

run().then(() => process.exit(0)).catch(err => { console.error('[TEST FAILURE]', err); process.exit(1); });
