/**
 * Demo / test data seeding.
 *
 *   node src/db/seeds                 initialize schema + seed demo users, course, and sample cohort
 *   node src/db/seeds --outputs       ...and regenerate docs/sample-outputs (XLSX, PDF, JSON)
 *   node src/db/seeds --allow-remote  permit seeding a non-SQLite database (Turso/MySQL)
 *
 * Startup never seeds demo data; production accounts are provisioned by Clerk sign-in.
 */
const db = require('../../config/database');
const { initializeDatabase } = require('../init');
const { seedUsers } = require('./users');
const { seedCourse } = require('./course');
const { seedSampleCohort, writeSampleOutputs } = require('./samples');

async function seedDemoData({ outputs = false } = {}) {
  await seedUsers();
  await seedCourse();
  await seedSampleCohort();
  if (outputs) await writeSampleOutputs();
}

if (require.main === module) {
  const args = new Set(process.argv.slice(2));

  if (db.dialect !== 'sqlite' && !args.has('--allow-remote')) {
    console.error(
      `[SEED] Refusing to write demo data to a ${db.dialect} database. ` +
      'Demo records are for local SQLite development. Re-run with --allow-remote if this is intentional.'
    );
    process.exit(1);
  }

  initializeDatabase()
    .then(() => seedDemoData({ outputs: args.has('--outputs') }))
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[SEED ERROR]', err);
      process.exit(1);
    });
}

module.exports = { seedDemoData };
