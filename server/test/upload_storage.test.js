const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const storage = require('../src/services/uploadStorage');

test('local uploads persist, round trip, and handle missing files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aralytics-storage-'));
  const req = { app: { locals: {} } };
  try {
    assert.equal(await storage.get(req, 'materials', root, 'missing.pdf'), null);
    await storage.put(req, 'materials', root, 'test.pdf', Buffer.from('%PDF-test'));
    assert.equal(await storage.exists(req, 'materials', root, 'test.pdf'), true);
    assert.equal((await storage.get(req, 'materials', root, 'test.pdf')).toString(), '%PDF-test');
    await storage.remove(req, 'materials', root, 'test.pdf');
    assert.equal(await storage.exists(req, 'materials', root, 'test.pdf'), false);
    await storage.remove(req, 'materials', root, 'test.pdf');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('R2 uploads use isolated prefixes without touching the local filesystem', async () => {
  const objects = new Map();
  const req = { app: { locals: { env: { UPLOADS: {
    async put(key, value) { objects.set(key, Buffer.from(value)); },
    async get(key) { return objects.has(key) ? { async arrayBuffer() { return objects.get(key); } } : null; },
    async head(key) { return objects.has(key) ? {} : null; },
    async delete(key) { objects.delete(key); }
  } } } } };
  const root = '/unwritable-upload-root';
  await storage.put(req, 'performance-tasks', root, 'file.pdf', Buffer.from('student work'));
  await storage.put(req, 'materials', root, 'file.pdf', Buffer.from('lesson'));
  assert.equal((await storage.get(req, 'performance-tasks', root, 'file.pdf')).toString(), 'student work');
  assert.equal((await storage.get(req, 'materials', root, 'file.pdf')).toString(), 'lesson');
  await storage.remove(req, 'performance-tasks', root, 'file.pdf');
  assert.equal(await storage.get(req, 'performance-tasks', root, 'file.pdf'), null);
  assert.equal(await storage.exists(req, 'materials', root, 'file.pdf'), true);
});

test('D1 chunk storage round trips 5 MB and atomically replaces existing files', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const sql = new DatabaseSync(':memory:');
  sql.exec(await fs.readFile(path.join(__dirname, '../migrations/uploads/0001_upload_chunks.sql'), 'utf8'));
  const database = {
    prepare(query) {
      return { bind(...args) { return {
        async all() { return { results: sql.prepare(query).all(...args) }; },
        async first() { return sql.prepare(query).get(...args) || null; },
        async run() { return sql.prepare(query).run(...args); }
      }; } };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { for (const statement of statements) await statement.run(); sql.exec('COMMIT'); }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    }
  };
  const req = { app: { locals: { env: { UPLOADS_DB: database } } } };
  try {
    const content = Buffer.alloc(5 * 1024 * 1024, 123);
    await storage.put(req, 'materials', '/invalid', 'lesson.pdf', content);
    assert.deepEqual(await storage.get(req, 'materials', '/invalid', 'lesson.pdf'), content);
    assert.equal(await storage.exists(req, 'materials', '/invalid', 'lesson.pdf'), true);
    await storage.put(req, 'materials', '/invalid', 'lesson.pdf', Buffer.from('replacement'));
    assert.equal((await storage.get(req, 'materials', '/invalid', 'lesson.pdf')).toString(), 'replacement');
    await storage.remove(req, 'materials', '/invalid', 'lesson.pdf');
    assert.equal(await storage.get(req, 'materials', '/invalid', 'lesson.pdf'), null);
    assert.equal(await storage.exists(req, 'materials', '/invalid', 'lesson.pdf'), false);
  } finally { sql.close(); }
});
