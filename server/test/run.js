/**
 * Server test runner.
 *
 *   npm test                         run every *.test.js against a fresh, seeded SQLite file
 *   npm test -- enrollment_flow      run only matching test files
 *
 * Tests always use a disposable database in the OS temp directory, regardless of
 * server/.env, so they can never touch a Turso/MySQL or working school database.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SERVER_DIR = path.resolve(__dirname, '..');

// Some suites build on records created by earlier ones; keep this order.
const ORDER = [
  'persistence_module',
  'analytics_engine',
  'verification_gate',
  'srs_compliance',
  'rbac_security',
  'redesign_flow',
  'offline_policy',
  'master_loop_modules',
  'enrollment_flow'
];

const discovered = fs.readdirSync(__dirname)
  .filter(file => file.endsWith('.test.js'))
  .map(file => file.replace(/\.test\.js$/, ''));
const suites = [...ORDER.filter(name => discovered.includes(name)), ...discovered.filter(name => !ORDER.includes(name)).sort()];

const filters = process.argv.slice(2);
const selected = filters.length ? suites.filter(name => filters.some(f => name.includes(f))) : suites;
if (!selected.length) {
  console.error(`No test files match: ${filters.join(', ')}`);
  process.exit(1);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralytics-test-'));
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DB_DIALECT: 'sqlite',
  DB_SQLITE_PATH: path.join(tmpDir, 'aralytics-test.sqlite')
};

const run = (args, label) => {
  const result = spawnSync(process.execPath, args, { cwd: SERVER_DIR, env, stdio: 'inherit' });
  return { label, ok: result.status === 0 };
};

let results = [];
try {
  console.log(`[TEST] Disposable database: ${env.DB_SQLITE_PATH}`);
  const seed = run(['src/db/seeds'], 'seed fixtures');
  if (!seed.ok) {
    console.error('[TEST] Fixture seeding failed; aborting.');
    process.exit(1);
  }
  results = selected.map(name => run([path.join('test', `${name}.test.js`)], name));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

const failed = results.filter(r => !r.ok);
console.log('\n======================================================================');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}`);
console.log(`${results.length - failed.length}/${results.length} test files passed.`);
process.exit(failed.length ? 1 : 0);
