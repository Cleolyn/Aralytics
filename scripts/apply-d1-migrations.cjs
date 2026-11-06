/**
 * Applies the file-storage migrations to every FILES_DB_* D1 database in wrangler.jsonc.
 *
 *   node scripts/apply-d1-migrations.cjs            apply to each database (--remote)
 *   node scripts/apply-d1-migrations.cjs --dry-run  print the commands only
 *
 * All shards share server/migrations/uploads. A database whose id is still the
 * "TODO-create-with-wrangler" placeholder has not been created yet, so the script stops and says which.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

/** Removes // and block comments (outside strings) and trailing commas so wrangler.jsonc parses as JSON. */
function parseJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\') out += text[++i];
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

const config = parseJsonc(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'));
const shards = (config.d1_databases || []).filter(db => /^FILES_DB_\d+$/.test(db.binding));
if (!shards.length) {
  console.error('wrangler.jsonc has no FILES_DB_* D1 bindings.');
  process.exit(1);
}

const missing = shards.filter(db => !db.database_id || /^TODO/i.test(db.database_id));
if (missing.length && !dryRun) {
  console.error(`These databases have no real database_id yet: ${missing.map(db => db.database_name).join(', ')}.`);
  console.error('Create each with "npx wrangler d1 create <name>" and paste its id into wrangler.jsonc (see docs/cloudflare-deployment.md).');
  process.exit(1);
}

for (const db of shards) {
  const args = ['wrangler', 'd1', 'migrations', 'apply', db.database_name, '--remote'];
  console.log(`> npx ${args.join(' ')}`);
  if (dryRun) continue;
  const result = spawnSync('npx', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`Migrations failed for ${db.database_name}.`);
    process.exit(result.status || 1);
  }
}
