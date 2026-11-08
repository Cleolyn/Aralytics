const db = require('../config/database');
const { clerkClient, invalidateUserCache } = require('../middleware/auth');
const { DEMO_PASSWORD } = require('../db/seeds/demoRosterData');
const { buildAllAccountDefinitions } = require('../db/seeds/demoAccounts');

const ALL_DEMO_ACCOUNTS = buildAllAccountDefinitions();
const DEMO_BY_EMAIL = new Map(ALL_DEMO_ACCOUNTS.map(acc => [acc.email.toLowerCase(), acc]));

function isDemoEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return DEMO_BY_EMAIL.has(email.trim().toLowerCase());
}

function getDemoAccountByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  return DEMO_BY_EMAIL.get(email.trim().toLowerCase()) || null;
}

function listDemoAccountsForDirectory() {
  return ALL_DEMO_ACCOUNTS.map(acc => ({
    key: acc.key,
    full_name: acc.full_name || `${acc.first_name} ${acc.last_name}`,
    email: acc.email,
    role: acc.application_status === 'PENDING' ? 'TEACHER_APPLICANT' : acc.role,
    section: Array.isArray(acc.sections) && acc.sections.length ? acc.sections.join(', ') : (acc.section || null),
    cohort_group: acc.cohort_group,
    profile_type: acc.profile_type,
    class_code: acc.class_code || null,
    lrn_or_id: acc.suggested_lrn || acc.employee_id || acc.lrn_or_id,
    quick_pick: Boolean(acc.quick_pick)
  }));
}

async function migrateDemoUserIdInDb(acc, newClerkId) {
  const { rows: existingRows } = await db.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR lrn_or_id = ? OR id = ?',
    [acc.email, acc.lrn_or_id, acc.fallback_id]
  );
  const oldIds = existingRows.map(r => r.id).filter(id => id && id !== newClerkId);

  if (oldIds.length > 0) {
    for (const [idx, oldId] of oldIds.entries()) {
      await db.query(
        'UPDATE users SET email = ?, lrn_or_id = ? WHERE id = ?',
        [`migrating-${idx}-${Date.now()}@stale.local`, `migrating-${idx}-${Date.now()}`, oldId]
      );
    }
  }

  await db.query(
    `INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role, section, section_id, status)
     VALUES (?, ?, ?, ?, ?, ?, 'CLERK_MANAGED_AUTH', ?, ?, ?, 'ACTIVE')
     ON CONFLICT(id) DO UPDATE SET
       lrn_or_id = excluded.lrn_or_id,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       full_name = excluded.full_name,
       email = excluded.email,
       role = excluded.role,
       section = excluded.section,
       section_id = excluded.section_id,
       status = 'ACTIVE'`,
    [
      newClerkId,
      acc.lrn_or_id,
      acc.first_name,
      acc.last_name,
      acc.full_name || `${acc.first_name} ${acc.last_name}`,
      acc.email,
      acc.role,
      acc.section || null,
      acc.section || null
    ]
  );

  for (const oldId of oldIds) {
    for (const [sql, params] of [
      ['UPDATE enrollment_requests SET user_id = ? WHERE user_id = ?', [newClerkId, oldId]],
      ['UPDATE instructor_applications SET user_id = ? WHERE user_id = ?', [newClerkId, oldId]],
      ['UPDATE instructor_applications SET reviewed_by = ? WHERE reviewed_by = ?', [newClerkId, oldId]],
      ['UPDATE quiz_attempts SET student_id = ? WHERE student_id = ?', [newClerkId, oldId]],
      ['UPDATE quiz_submissions SET student_id = ? WHERE student_id = ?', [newClerkId, oldId]],
      ['UPDATE interventions SET student_id = ? WHERE student_id = ?', [newClerkId, oldId]],
      ['UPDATE remedial_interventions SET student_id = ? WHERE student_id = ?', [newClerkId, oldId]],
      ['UPDATE performance_task_submissions SET student_id = ? WHERE student_id = ?', [newClerkId, oldId]],
      ['UPDATE material_read_logs SET student_id = ? WHERE student_id = ?', [newClerkId, oldId]],
      ['UPDATE quizzes SET created_by = ? WHERE created_by = ?', [newClerkId, oldId]],
      ['UPDATE instructional_materials SET created_by = ? WHERE created_by = ?', [newClerkId, oldId]],
      ['UPDATE materials SET uploaded_by = ? WHERE uploaded_by = ?', [newClerkId, oldId]],
      ['UPDATE performance_tasks SET created_by = ? WHERE created_by = ?', [newClerkId, oldId]],
      ['UPDATE class_invitations SET teacher_id = ? WHERE teacher_id = ?', [newClerkId, oldId]]
    ]) {
      try { await db.query(sql, params); } catch { /* ignore optional table / constraint */ }
    }
    try { await db.query('DELETE FROM users WHERE id = ?', [oldId]); } catch { /* ignore */ }
  }

  invalidateUserCache(newClerkId);
}

async function ensureClerkDemoUser(acc) {
  const lookup = await clerkClient.users.getUserList({ emailAddress: [acc.email] });
  const list = Array.isArray(lookup) ? lookup : (lookup?.data || []);
  if (list[0]) {
    await migrateDemoUserIdInDb(acc, list[0].id);
    return list[0];
  }

  // User is one of the 58 mid-pack roster accounts not yet in Clerk; create on the fly
  try {
    const created = await clerkClient.users.createUser({
      emailAddress: [acc.email],
      password: DEMO_PASSWORD,
      firstName: acc.first_name,
      lastName: acc.last_name,
      skipPasswordChecks: true,
      skipPasswordRequirement: true
    });
    await migrateDemoUserIdInDb(acc, created.id);
    return created;
  } catch (err) {
    const status = err?.status || err?.statusCode;
    if (status === 403) {
      // Clerk Dev 100-user cap reached: reclaim 1 non-staff demo student slot in Clerk
      const allClerkRes = await clerkClient.users.getUserList({ limit: 100 });
      const allClerkUsers = Array.isArray(allClerkRes) ? allClerkRes : (allClerkRes?.data || []);
      const evictCandidate = allClerkUsers.find(u => {
        const primary = (u.emailAddresses || [])[0]?.emailAddress?.toLowerCase() || '';
        const match = DEMO_BY_EMAIL.get(primary);
        return match && match.role === 'STUDENT' && !match.quick_pick && primary !== acc.email.toLowerCase();
      });
      if (evictCandidate) {
        await clerkClient.users.deleteUser(evictCandidate.id);
        const created = await clerkClient.users.createUser({
          emailAddress: [acc.email],
          password: DEMO_PASSWORD,
          firstName: acc.first_name,
          lastName: acc.last_name,
          skipPasswordChecks: true,
          skipPasswordRequirement: true
        });
        await migrateDemoUserIdInDb(acc, created.id);
        return created;
      }
    }
    throw err;
  }
}

async function issueDemoSignInTicket({ email, password, autoBypass = false }) {
  const acc = getDemoAccountByEmail(email);
  if (!acc) {
    const err = new Error('That email is not a registered Aralytics demo account.');
    err.status = 404;
    throw err;
  }

  if (!autoBypass && password !== DEMO_PASSWORD) {
    const err = new Error('Invalid demo account password.');
    err.status = 401;
    throw err;
  }

  const clerkUser = await ensureClerkDemoUser(acc);
  const tokenRes = await clerkClient.signInTokens.createSignInToken({
    userId: clerkUser.id,
    expiresInSeconds: 120
  });

  return {
    ticket: tokenRes.token,
    userId: clerkUser.id,
    email: acc.email,
    role: acc.role,
    full_name: acc.full_name || `${acc.first_name} ${acc.last_name}`
  };
}

module.exports = {
  DEMO_PASSWORD,
  isDemoEmail,
  getDemoAccountByEmail,
  listDemoAccountsForDirectory,
  issueDemoSignInTicket
};
