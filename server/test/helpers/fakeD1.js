// A fake Cloudflare D1 database backed by node:sqlite. It applies every migration in
// server/migrations/uploads, binds ArrayBuffers as BLOBs, and returns BLOBs as ArrayBuffer like D1 does.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS = path.join(__dirname, '../../migrations/uploads');

function toSql(value) {
  return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
}

function fromSql(row) {
  if (!row) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value instanceof Uint8Array ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) : value
  ]));
}

function createFakeD1() {
  const sql = new DatabaseSync(':memory:');
  for (const file of fs.readdirSync(MIGRATIONS).filter(name => name.endsWith('.sql')).sort()) {
    sql.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
  const queries = { count: 0 };
  const database = {
    sql,
    queries,
    prepare(query) {
      return {
        bind(...args) {
          const params = args.map(toSql);
          const statement = {
            async all() { queries.count++; return { results: sql.prepare(query).all(...params).map(fromSql) }; },
            async first() { queries.count++; return fromSql(sql.prepare(query).get(...params)) || null; },
            async run() { queries.count++; const info = sql.prepare(query).run(...params); return { meta: { changes: info.changes } }; }
          };
          return statement;
        }
      };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { for (const statement of statements) await statement.run(); sql.exec('COMMIT'); }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
    chunkCount() { return sql.prepare('SELECT COUNT(*) AS n FROM file_chunks').get().n; },
    close() { sql.close(); }
  };
  return database;
}

module.exports = { createFakeD1 };
