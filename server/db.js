const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@libsql/client');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const localDbPath = path.resolve(__dirname, process.env.DB_SQLITE_PATH || 'aralytics.sqlite');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${localDbPath}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

module.exports = db;
