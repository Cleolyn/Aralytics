/**
 * Unified database adapter.
 *
 * Every dialect exposes the same interface so controllers stay dialect-agnostic:
 *   db.dialect                      'sqlite' | 'turso' | 'mysql'
 *   db.query(sql, params)        -> { rows, insertId, affectedRows }
 *   db.transaction(async tx => …)   tx.query has the same signature
 *
 * Dialect selection: DB_DIALECT, otherwise 'turso' when TURSO_DATABASE_URL is set,
 * otherwise a local SQLite file at DB_SQLITE_PATH (default: server/aralytics.sqlite).
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const dialect = process.env.DB_DIALECT || (process.env.TURSO_DATABASE_URL ? 'turso' : 'sqlite');

function createTursoAdapter() {
  const { createLibsqlClient } = require('./libsql');
  const client = createLibsqlClient();

  const run = async (executor, sql, args = []) => {
    const result = await executor.execute({ sql: sql.trim(), args });
    return {
      rows: result.rows || [],
      insertId: result.lastInsertRowid != null ? Number(result.lastInsertRowid) : null,
      affectedRows: result.rowsAffected || 0
    };
  };

  return {
    dialect: 'turso',
    query: (sql, params) => run(client, sql, params),
    async transaction(callback) {
      const tx = await client.transaction('write');
      try {
        const result = await callback({ query: (sql, params) => run(tx, sql, params) });
        await tx.commit();
        return result;
      } catch (err) {
        await tx.rollback();
        throw err;
      } finally {
        tx.close();
      }
    }
  };
}

function createMysqlAdapter() {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'aralytics_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
  });

  const run = async (executor, sql, params = []) => {
    const [rows] = await executor.query(sql, params);
    return {
      rows: Array.isArray(rows) ? rows : [rows],
      insertId: rows.insertId,
      affectedRows: rows.affectedRows
    };
  };

  return {
    dialect: 'mysql',
    query: (sql, params) => run(pool, sql, params),
    async transaction(callback) {
      const connection = await pool.getConnection();
      await connection.beginTransaction();
      try {
        const result = await callback({ query: (sql, params) => run(connection, sql, params) });
        await connection.commit();
        return result;
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    }
  };
}

/** Local SQLite: better-sqlite3 when installed, otherwise Node's built-in node:sqlite. */
function createSqliteAdapter() {
  const dbPath = process.env.DB_SQLITE_PATH === ':memory:'
    ? ':memory:'
    : path.resolve(__dirname, '../../', process.env.DB_SQLITE_PATH || 'aralytics.sqlite');

  let sqlite;
  try {
    const Database = require('better-sqlite3');
    sqlite = new Database(dbPath);
  } catch {
    const { DatabaseSync } = require('node:sqlite');
    sqlite = new DatabaseSync(dbPath);
  }
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec('PRAGMA journal_mode = WAL');

  const READ_STATEMENT = /^(SELECT|PRAGMA|SHOW|DESCRIBE)/i;
  const query = async (sql, params = []) => {
    const cleanSql = sql.trim();
    const stmt = sqlite.prepare(cleanSql);
    if (READ_STATEMENT.test(cleanSql)) {
      const rows = stmt.all(...params);
      return { rows, insertId: null, affectedRows: rows.length };
    }
    const info = stmt.run(...params);
    return { rows: [], insertId: info.lastInsertRowid, affectedRows: info.changes };
  };

  return {
    dialect: 'sqlite',
    query,
    async transaction(callback) {
      sqlite.exec('BEGIN');
      try {
        const result = await callback({ query });
        sqlite.exec('COMMIT');
        return result;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    }
  };
}

const adapters = {
  turso: createTursoAdapter,
  libsql: createTursoAdapter,
  mysql: createMysqlAdapter,
  sqlite: createSqliteAdapter
};

if (!adapters[dialect]) {
  throw new Error(`Unsupported DB_DIALECT "${dialect}". Use one of: sqlite, turso, mysql.`);
}

module.exports = adapters[dialect]();
