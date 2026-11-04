const fs = require('node:fs/promises');
const path = require('node:path');

function database(req) {
  return req.app.locals.env?.UPLOADS_DB;
}

function bucket(req) {
  return req.app.locals.env?.UPLOADS;
}

module.exports = {
  async put(req, prefix, root, filename, content) {
    if (bucket(req)) return bucket(req).put(`${prefix}/${filename}`, content);
    const db = database(req);
    if (db) {
      const key = `${prefix}/${filename}`;
      const encoded = content.toString('base64');
      const statements = [db.prepare('DELETE FROM upload_chunks WHERE object_key = ?').bind(key)];
      for (let offset = 0, index = 0; offset < Math.max(1, encoded.length); offset += 262144, index++) {
        statements.push(db.prepare('INSERT INTO upload_chunks (object_key, chunk_index, content) VALUES (?, ?, ?)').bind(key, index, encoded.slice(offset, offset + 262144)));
      }
      return db.batch(statements);
    }
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, filename), content, { flag: 'wx' });
  },
  async get(req, prefix, root, filename) {
    if (bucket(req)) {
      const object = await bucket(req).get(`${prefix}/${filename}`);
      return object ? Buffer.from(await object.arrayBuffer()) : null;
    }
    if (database(req)) {
      const { results } = await database(req).prepare('SELECT content FROM upload_chunks WHERE object_key = ? ORDER BY chunk_index').bind(`${prefix}/${filename}`).all();
      return results.length ? Buffer.from(results.map(row => row.content).join(''), 'base64') : null;
    }
    try { return await fs.readFile(path.join(root, filename)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  },
  async exists(req, prefix, root, filename) {
    if (bucket(req)) return Boolean(await bucket(req).head(`${prefix}/${filename}`));
    if (database(req)) return Boolean(await database(req).prepare('SELECT 1 AS found FROM upload_chunks WHERE object_key = ? AND chunk_index = 0').bind(`${prefix}/${filename}`).first());
    try { await fs.access(path.join(root, filename)); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  },
  async remove(req, prefix, root, filename) {
    if (bucket(req)) return bucket(req).delete(`${prefix}/${filename}`);
    if (database(req)) return database(req).prepare('DELETE FROM upload_chunks WHERE object_key = ?').bind(`${prefix}/${filename}`).run();
    try { await fs.unlink(path.join(root, filename)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
};
