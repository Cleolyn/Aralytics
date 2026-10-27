const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dialect = process.env.DB_DIALECT || (process.env.TURSO_DATABASE_URL ? 'turso' : 'sqlite');

let dbInstance = null;

if (dialect === 'turso' || dialect === 'libsql') {
  const libsqlClient = require('../../db');

  dbInstance = {
    dialect: 'turso',
    client: libsqlClient,
    async execute(sql, args = []) {
      return libsqlClient.execute({ sql: sql.trim(), args });
    },
    async query(sql, params = []) {
      const cleanSql = sql.trim();
      const result = await libsqlClient.execute({ sql: cleanSql, args: params });
      return {
        rows: result.rows || [],
        insertId: result.lastInsertRowid != null ? Number(result.lastInsertRowid) : null,
        affectedRows: result.rowsAffected || 0
      };
    },
    async transaction(callback) {
      const tx = await libsqlClient.transaction('write');
      try {
        const txDb = {
          async query(sql, params = []) {
            const cleanSql = sql.trim();
            const result = await tx.execute({ sql: cleanSql, args: params });
            return {
              rows: result.rows || [],
              insertId: result.lastInsertRowid != null ? Number(result.lastInsertRowid) : null,
              affectedRows: result.rowsAffected || 0
            };
          }
        };
        const result = await callback(txDb);
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
} else if (dialect === 'mysql') {
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

  dbInstance = {
    dialect: 'mysql',
    async query(sql, params = []) {
      const [rows, fields] = await pool.query(sql, params);
      return {
        rows: Array.isArray(rows) ? rows : [rows],
        insertId: rows.insertId,
        affectedRows: rows.affectedRows
      };
    },
    async transaction(callback) {
      const connection = await pool.getConnection();
      await connection.beginTransaction();
      try {
        const txDb = {
          async query(sql, params = []) {
            const [rows] = await connection.query(sql, params);
            return {
              rows: Array.isArray(rows) ? rows : [rows],
              insertId: rows.insertId,
              affectedRows: rows.affectedRows
            };
          }
        };
        const result = await callback(txDb);
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
} else {
  // SQLite relational engine (uses better-sqlite3 if available, otherwise Node's built-in node:sqlite)
  const dbPath = process.env.DB_SQLITE_PATH === ':memory:' ? ':memory:' : path.resolve(__dirname, '../../', process.env.DB_SQLITE_PATH || 'aralytics.sqlite');
  let sqlite;
  try {
    const Database = require('better-sqlite3');
    sqlite = new Database(dbPath);
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('journal_mode = WAL');
  } catch {
    const { DatabaseSync } = require('node:sqlite');
    sqlite = new DatabaseSync(dbPath);
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec('PRAGMA journal_mode = WAL');
  }

  dbInstance = {
    dialect: 'sqlite',
    async query(sql, params = []) {
      // Normalize parameter markers if needed, or query directly
      const cleanSql = sql.trim();
      const isSelect = /^SELECT|^PRAGMA|^SHOW|^DESCRIBE/i.test(cleanSql);

      const stmt = sqlite.prepare(cleanSql);
      if (isSelect) {
        const rows = stmt.all(...params);
        return { rows, insertId: null, affectedRows: rows.length };
      } else {
        const info = stmt.run(...params);
        return {
          rows: [],
          insertId: info.lastInsertRowid,
          affectedRows: info.changes
        };
      }
    },
    async transaction(callback) {
      sqlite.prepare('BEGIN').run();
      try {
        const txDb = {
          async query(sql, params = []) {
            const cleanSql = sql.trim();
            const isSelect = /^SELECT|^PRAGMA|^SHOW/i.test(cleanSql);
            const stmt = sqlite.prepare(cleanSql);
            if (isSelect) {
              const rows = stmt.all(...params);
              return { rows, insertId: null, affectedRows: rows.length };
            } else {
              const info = stmt.run(...params);
              return {
                rows: [],
                insertId: info.lastInsertRowid,
                affectedRows: info.changes
              };
            }
          }
        };
        const result = await callback(txDb);
        sqlite.prepare('COMMIT').run();
        return result;
      } catch (err) {
        sqlite.prepare('ROLLBACK').run();
        throw err;
      }
    }
  };
}

module.exports = dbInstance;
