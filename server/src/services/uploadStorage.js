/**
 * Legacy upload storage (read and delete only).
 *
 * Files uploaded before chunked file storage (src/services/fileService.js) live either as
 * base64 rows in the D1 `upload_chunks` table or on local disk. New uploads never go here;
 * this module only serves and removes the old ones.
 */
const fs = require('node:fs/promises');
const path = require('node:path');

function database(req) {
  const env = req.app?.locals?.env;
  return env?.UPLOADS_DB || env?.FILES_DB_1;
}

module.exports = {
  async get(req, prefix, root, filename) {
    if (database(req)) {
      const { results } = await database(req).prepare('SELECT content FROM upload_chunks WHERE object_key = ? ORDER BY chunk_index').bind(`${prefix}/${filename}`).all();
      return results.length ? Buffer.from(results.map(row => row.content).join(''), 'base64') : null;
    }
    try { return await fs.readFile(path.join(root, filename)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  },
  async exists(req, prefix, root, filename) {
    if (database(req)) return Boolean(await database(req).prepare('SELECT 1 AS found FROM upload_chunks WHERE object_key = ? AND chunk_index = 0').bind(`${prefix}/${filename}`).first());
    try { await fs.access(path.join(root, filename)); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  },
  async remove(req, prefix, root, filename) {
    if (database(req)) return database(req).prepare('DELETE FROM upload_chunks WHERE object_key = ?').bind(`${prefix}/${filename}`).run();
    try { await fs.unlink(path.join(root, filename)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
};
