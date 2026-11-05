const path = require('path');
const { createClient } = require('@libsql/client');

/**
 * LibSQL / Turso client. Used when DB_DIALECT=turso (or TURSO_DATABASE_URL is set).
 * Falls back to a local libsql file if no remote URL is configured.
 */
function createLibsqlClient() {
  const localDbPath = path.resolve(__dirname, '../../', process.env.DB_SQLITE_PATH || 'aralytics.sqlite');
  return createClient({
    url: process.env.TURSO_DATABASE_URL || `file:${localDbPath}`,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
}

module.exports = { createLibsqlClient };
