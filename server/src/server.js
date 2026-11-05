/**
 * API entry point: loads server/.env, prepares the database, then starts listening.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const app = require('./app');
const db = require('./config/database');
const { initializeDatabase } = require('./db/init');

const PORT = process.env.PORT || 5001;

async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`[ARALYTICS] API running on http://localhost:${PORT} (database: ${db.dialect})`);
      console.log(`[ARALYTICS] Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('[ARALYTICS] Fatal startup error:', err);
    process.exit(1);
  }
}

// Guarded so importing this file (e.g. from tooling) never opens a port.
if (require.main === module) startServer();
