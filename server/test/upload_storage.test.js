const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const storage = require('../src/services/uploadStorage');
const { createFakeD1 } = require('./helpers/fakeD1');

// Legacy storage is read and delete only: new uploads go through fileService.
test('legacy disk uploads are read, checked, and removed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aralytics-storage-'));
  const req = { app: { locals: {} } };
  try {
    assert.equal(await storage.get(req, 'materials', root, 'missing.pdf'), null);
    assert.equal(storage.put, undefined, 'the legacy store no longer accepts new files');
    await fs.writeFile(path.join(root, 'test.pdf'), '%PDF-test');
    assert.equal(await storage.exists(req, 'materials', root, 'test.pdf'), true);
    assert.equal((await storage.get(req, 'materials', root, 'test.pdf')).toString(), '%PDF-test');
    await storage.remove(req, 'materials', root, 'test.pdf');
    assert.equal(await storage.exists(req, 'materials', root, 'test.pdf'), false);
    await storage.remove(req, 'materials', root, 'test.pdf');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('legacy base64 rows are read from FILES_DB_1 (or the old UPLOADS_DB binding) and removed', async () => {
  const database = createFakeD1();
  const content = Buffer.alloc(300 * 1024, 123);
  const encoded = content.toString('base64');
  const rows = [encoded.slice(0, 262144), encoded.slice(262144)];
  rows.forEach((part, index) => database.sql.prepare('INSERT INTO upload_chunks (object_key, chunk_index, content) VALUES (?, ?, ?)').run('materials/lesson.pdf', index, part));
  try {
    for (const binding of ['FILES_DB_1', 'UPLOADS_DB']) {
      const req = { app: { locals: { env: { [binding]: database } } } };
      assert.deepEqual(await storage.get(req, 'materials', '/invalid', 'lesson.pdf'), content);
      assert.equal(await storage.exists(req, 'materials', '/invalid', 'lesson.pdf'), true);
      assert.equal(await storage.get(req, 'performance-tasks', '/invalid', 'lesson.pdf'), null, 'prefixes are isolated');
    }
    const req = { app: { locals: { env: { FILES_DB_1: database } } } };
    await storage.remove(req, 'materials', '/invalid', 'lesson.pdf');
    assert.equal(await storage.get(req, 'materials', '/invalid', 'lesson.pdf'), null);
    assert.equal(await storage.exists(req, 'materials', '/invalid', 'lesson.pdf'), false);
  } finally { database.close(); }
});
