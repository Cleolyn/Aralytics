/**
 * Grant the ADMIN role to an existing account (the person must have signed in once).
 *
 *   npm run admin:grant -- someone@example.com            show what would change
 *   npm run admin:grant -- someone@example.com --apply    make the change
 *
 * Runs against the database configured in server/.env (Turso in production).
 * ADMIN replaces the account's previous role; admins manage instructor access
 * from /admin and do not use the teacher or student workspaces.
 */
const db = require('../config/database');
const { initializeDatabase } = require('./init');

async function grantAdmin(email, { apply = false } = {}) {
  const { rows } = await db.query('SELECT id, email, role, full_name FROM users WHERE lower(email) = lower(?)', [email]);
  if (!rows.length) throw new Error(`No account found for ${email}. They must sign in to Aralytics once first.`);
  const user = rows[0];
  console.log(`[ADMIN] ${user.email} (${user.full_name || 'no name'}) on ${db.dialect}: ${user.role} -> ADMIN`);
  if (user.role === 'ADMIN') {
    console.log('[ADMIN] Already an admin. Nothing to change.');
    return user;
  }
  if (!apply) {
    console.log('[ADMIN] Dry run. Re-run with --apply to make this change.');
    return user;
  }
  await db.query(`UPDATE users SET role = 'ADMIN', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);
  console.log('[ADMIN] Done.');
  return { ...user, role: 'ADMIN' };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const email = args.find(arg => !arg.startsWith('--'));
  if (!email) {
    console.error('Usage: npm run admin:grant -- <email> [--apply]');
    process.exit(1);
  }
  initializeDatabase()
    .then(() => grantAdmin(email, { apply: args.includes('--apply') }))
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[ADMIN ERROR]', err.message);
      process.exit(1);
    });
}

module.exports = { grantAdmin };
