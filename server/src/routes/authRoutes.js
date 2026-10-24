const express = require('express');
const router = express.Router();
const { getAuth } = require('@clerk/express');
const db = require('../config/database');
const { verifyToken, invalidateUserCache, clerkClient } = require('../middleware/authMiddleware');

/**
 * Look up an existing user's immutable role in the Turso/SQLite `users` table.
 */
async function getDatabaseUserRole(userPayload) {
  const userId = userPayload.id || userPayload.user_id;
  const email = userPayload.email;
  if (!userId && !email) return null;

  const { rows } = await db.query(
    `SELECT id, role, section, section_id FROM users WHERE id = ? OR email = ? LIMIT 1`,
    [userId || '', email || '']
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Ensure the Clerk user exists in the Turso/SQLite `users` table with matching role
 * so foreign keys (quizzes, materials, submissions, etc.) and class lists stay in sync.
 */
async function syncUserToDatabase(userPayload, role) {
  const userId = userPayload.id || userPayload.user_id;
  if (!userId) return;

  const firstName = userPayload.first_name || 'Aralytics';
  const lastName = userPayload.last_name || (role === 'TEACHER' ? 'Teacher' : 'Learner');
  const fullName = `${firstName} ${lastName}`.trim();
  const email = userPayload.email || `${userId}@aralytics.local`;
  const lrnOrId = userPayload.lrn_or_id || `${role === 'TEACHER' ? 'EMP' : 'LRN'}-${userId.slice(-8).toUpperCase()}`;
  const section = role === 'STUDENT' ? (userPayload.section || userPayload.section_id || '10-Rizal') : null;

  const { rows: existing } = await db.query(
    `SELECT id FROM users WHERE id = ? OR email = ? LIMIT 1`,
    [userId, email]
  );

  if (existing.length > 0) {
    await db.query(
      `UPDATE users
       SET first_name = ?, last_name = ?, full_name = ?, role = ?, section = ?, section_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [firstName, lastName, fullName, role, section, section, existing[0].id]
    );
  } else {
    await db.query(
      `INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role, section, section_id)
       VALUES (?, ?, ?, ?, ?, ?, 'CLERK_MANAGED_AUTH', ?, ?, ?)`,
      [userId, lrnOrId, firstName, lastName, fullName, email, role, section, section]
    );
  }
}

/**
 * POST /api/auth/sync
 * Called by the client after Clerk sign-in/sign-up.
 * - If the account already has a role (in Turso DB or Clerk publicMetadata), its role is IMMUTABLE.
 *   - If `requestedRole` is provided and does not match the account's actual role, returns 403 ROLE_MISMATCH
 *     so a student cannot log in as a teacher and a teacher cannot log in as a student.
 * - If the account is brand new (first sign-up), assigns `requestedRole` (or defaults to STUDENT)
 *   and locks it in both Clerk publicMetadata and the Turso `users` table.
 */
router.post('/sync', verifyToken, async (req, res) => {
  const { userId } = getAuth(req);
  const requestedRole =
    req.body?.role === 'TEACHER' || req.body?.role === 'STUDENT'
      ? req.body.role
      : null;

  try {
    const dbRecord = await getDatabaseUserRole(req.user);
    const existingRole = dbRecord?.role || req.user.role || null;

    // 1. Existing user attempting to log in through the wrong role portal -> Reject (403)
    if (existingRole && requestedRole && existingRole !== requestedRole) {
      const accountLabel = existingRole === 'TEACHER' ? 'Teacher (Guro)' : 'Learner (Mag-aaral)';
      const attemptedLabel = requestedRole === 'TEACHER' ? 'Teacher' : 'Learner';
      return res.status(403).json({
        success: false,
        code: 'ROLE_MISMATCH',
        actualRole: existingRole,
        attemptedRole: requestedRole,
        message: `Access Denied: This account is registered as a ${accountLabel} and cannot log in through the ${attemptedLabel} portal.`
      });
    }

    // 2. Determine immutable role (existing role wins; brand-new sign-up uses requestedRole or STUDENT)
    const finalRole = existingRole || requestedRole || 'STUDENT';

    // Ensure Clerk publicMetadata matches the authoritative role
    if (req.user.role !== finalRole) {
      await clerkClient.users.updateUserMetadata(userId, {
        publicMetadata: {
          role: finalRole,
          ...(finalRole === 'STUDENT' && !req.user.section
            ? { section: dbRecord?.section || '10-Rizal', section_id: dbRecord?.section_id || '10-Rizal' }
            : {})
        }
      });
      invalidateUserCache(userId);
    }

    const updatedUser = {
      ...req.user,
      role: finalRole,
      section: finalRole === 'STUDENT' ? (req.user.section || dbRecord?.section || '10-Rizal') : null,
      section_id: finalRole === 'STUDENT' ? (req.user.section_id || dbRecord?.section_id || '10-Rizal') : null
    };

    await syncUserToDatabase(updatedUser, finalRole);

    return res.json({ success: true, role: finalRole, user: updatedUser });
  } catch (err) {
    console.error('[AUTH] Role sync error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not verify account role.' });
  }
});

/**
 * GET /api/auth/me
 * Returns the current authenticated user's profile (role, name, email, section).
 */
router.get('/me', verifyToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
