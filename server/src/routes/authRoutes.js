const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { getAuth } = require('@clerk/express');
const db = require('../config/database');
const { verifyToken, invalidateUserCache, clerkClient, JWT_SECRET } = require('../middleware/authMiddleware');

const NAME_REGEX = /^[a-zA-ZÀ-ÿ\s'-]+$/;
const NUMERIC_ID_REGEX = /^[0-9]+$/;

/**
 * Look up an existing user's immutable role in the Turso/SQLite `users` table.
 */
async function getDatabaseUserRole(userPayload) {
  const userId = userPayload.id || userPayload.user_id;
  const email = userPayload.email;
  if (!userId && !email) return null;

  const { rows } = await db.query(
    `SELECT id, role, section, section_id, lrn_or_id, first_name, last_name FROM users WHERE id = ? OR email = ? LIMIT 1`,
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
  const numericFallback = String(Math.abs(Array.from(userId).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 100000000000))).padStart(12, '0').slice(0, 12);
  const lrnOrId = userPayload.lrn_or_id ? String(userPayload.lrn_or_id).replace(/\D/g, '') || numericFallback : numericFallback;
  const section = role === 'STUDENT' ? (userPayload.section || userPayload.section_id || '10-Rizal') : null;

  const { rows: existing } = await db.query(
    `SELECT id FROM users WHERE id = ? OR email = ? LIMIT 1`,
    [userId, email]
  );

  if (existing.length > 0) {
    let safeLrn = null;
    if (userPayload.lrn_or_id) {
      const { rows: lrnConflict } = await db.query(
        `SELECT id FROM users WHERE lrn_or_id = ? AND id != ? LIMIT 1`,
        [userPayload.lrn_or_id, existing[0].id]
      );
      if (lrnConflict.length === 0) {
        safeLrn = userPayload.lrn_or_id;
      }
    }
    await db.query(
      `UPDATE users
       SET lrn_or_id = COALESCE(?, lrn_or_id), first_name = ?, last_name = ?, full_name = ?, role = ?, section = ?, section_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [safeLrn, firstName, lastName, fullName, role, section, section, existing[0].id]
    );
  } else {
    const { rows: lrnConflict } = await db.query(
      `SELECT id FROM users WHERE lrn_or_id = ? LIMIT 1`,
      [lrnOrId]
    );
    const finalLrn = lrnConflict.length === 0 ? lrnOrId : numericFallback;
    await db.query(
      `INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role, section, section_id)
       VALUES (?, ?, ?, ?, ?, ?, 'CLERK_MANAGED_AUTH', ?, ?, ?)`,
      [userId, finalLrn, firstName, lastName, fullName, email, role, section, section]
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
  const { lrn_or_id, first_name, middle_name, last_name, section } = req.body || {};

  // Server-side input sanitization & validation for student/employee number and names
  if (lrn_or_id !== undefined && String(lrn_or_id).trim() !== '') {
    if (!NUMERIC_ID_REGEX.test(String(lrn_or_id).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Student / ID number must contain numeric digits (0-9) only.'
      });
    }
  }
  for (const [label, val] of [['First name', first_name], ['Middle name', middle_name], ['Last name', last_name]]) {
    if (val !== undefined && String(val).trim() !== '' && !NAME_REGEX.test(String(val).trim())) {
      return res.status(400).json({
        success: false,
        message: `${label} must contain alphabetical characters and standard name punctuation only.`
      });
    }
  }

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
    const cleanLrn = lrn_or_id ? String(lrn_or_id).replace(/\D/g, '') : (dbRecord?.lrn_or_id || req.user.lrn_or_id);
    const cleanFirst = first_name ? String(first_name).trim() : (req.user.first_name || dbRecord?.first_name);
    const cleanLast = last_name ? String(last_name).trim() : (req.user.last_name || dbRecord?.last_name);
    const cleanSection = finalRole === 'STUDENT' ? (section || req.user.section || dbRecord?.section || '10-Rizal') : null;

    // Ensure Clerk profile & publicMetadata match the authoritative role & validated profile
    if (req.user.role !== finalRole || lrn_or_id || first_name || last_name || section) {
      if (cleanFirst || cleanLast) {
        await clerkClient.users.updateUser(userId, {
          ...(cleanFirst ? { firstName: cleanFirst } : {}),
          ...(cleanLast ? { lastName: cleanLast } : {})
        }).catch(() => {});
      }
      await clerkClient.users.updateUserMetadata(userId, {
        publicMetadata: {
          role: finalRole,
          ...(cleanLrn ? { lrn_or_id: cleanLrn } : {}),
          ...(cleanFirst ? { first_name: cleanFirst } : {}),
          ...(cleanLast ? { last_name: cleanLast } : {}),
          ...(cleanSection ? { section: cleanSection, section_id: cleanSection } : {})
        }
      });
      invalidateUserCache(userId);
    }

    const updatedUser = {
      ...req.user,
      first_name: cleanFirst,
      last_name: cleanLast,
      lrn_or_id: cleanLrn,
      role: finalRole,
      section: cleanSection,
      section_id: cleanSection
    };

    await syncUserToDatabase(updatedUser, finalRole);

    return res.json({ success: true, role: finalRole, user: updatedUser });
  } catch (err) {
    console.error('[AUTH] Role sync error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not verify account role.' });
  }
});

/**
 * POST /api/auth/student-login
 * Direct learner authentication using required Student Number/LRN, Class Section,
 * First Name, and Last Name (strictly no middle name field).
 */
router.post('/student-login', async (req, res) => {
  try {
    const { lrn_or_id, section, first_name, last_name } = req.body || {};
    const cleanLrn = String(lrn_or_id || '').trim();
    const cleanSection = String(section || '').trim();
    const cleanFirst = String(first_name || '').trim();
    const cleanLast = String(last_name || '').trim();

    if (!cleanLrn || !NUMERIC_ID_REGEX.test(cleanLrn)) {
      return res.status(400).json({
        success: false,
        message: 'Student Number / LRN is required and must contain numeric digits (0–9) only.'
      });
    }
    if (!cleanSection) {
      return res.status(400).json({
        success: false,
        message: 'Class section is required.'
      });
    }
    if (!cleanFirst || !NAME_REGEX.test(cleanFirst)) {
      return res.status(400).json({
        success: false,
        message: 'First name is required and must contain alphabetical characters only.'
      });
    }
    if (!cleanLast || !NAME_REGEX.test(cleanLast)) {
      return res.status(400).json({
        success: false,
        message: 'Last name is required and must contain alphabetical characters only.'
      });
    }

    const fullName = `${cleanFirst} ${cleanLast}`.trim();
    const { rows: existing } = await db.query(
      `SELECT * FROM users WHERE lrn_or_id = ? LIMIT 1`,
      [cleanLrn]
    );

    if (existing.length > 0 && existing[0].role === 'TEACHER') {
      return res.status(403).json({
        success: false,
        code: 'ROLE_MISMATCH',
        message: 'Access Denied: This ID belongs to a Teacher account and cannot log in through the Learner portal.'
      });
    }

    const targetEmail = existing.length > 0 && existing[0].email
      ? existing[0].email
      : `student.${cleanLrn}@student.deped.gov.ph`;

    // 1. Find or create the Student user in Clerk so the session is 100% Clerk-backed
    let clerkUser = null;
    let clerkTicket = null;
    try {
      const clerkList = await clerkClient.users.getUserList({ emailAddress: [targetEmail] });
      if (clerkList.data && clerkList.data.length > 0) {
        clerkUser = await clerkClient.users.updateUser(clerkList.data[0].id, {
          firstName: cleanFirst,
          lastName: cleanLast
        });
        await clerkClient.users.updateUserMetadata(clerkUser.id, {
          publicMetadata: {
            role: 'STUDENT',
            lrn_or_id: cleanLrn,
            section: cleanSection,
            section_id: cleanSection,
            first_name: cleanFirst,
            last_name: cleanLast
          }
        });
      } else {
        clerkUser = await clerkClient.users.createUser({
          emailAddress: [targetEmail],
          password: `Aralytics#${cleanLrn}!`,
          firstName: cleanFirst,
          lastName: cleanLast,
          skipPasswordChecks: true,
          publicMetadata: {
            role: 'STUDENT',
            lrn_or_id: cleanLrn,
            section: cleanSection,
            section_id: cleanSection,
            first_name: cleanFirst,
            last_name: cleanLast
          }
        });
      }
      invalidateUserCache(clerkUser.id);
      const tokObj = await clerkClient.signInTokens.createSignInToken({
        userId: clerkUser.id,
        expiresInSeconds: 300
      });
      clerkTicket = tokObj?.token || null;
    } catch (clerkErr) {
      console.warn('[AUTH] Clerk student provisioning warning:', clerkErr.message);
    }

    let studentRecord = null;
    if (existing.length > 0) {
      const found = existing[0];
      await db.query(
        `UPDATE users
         SET first_name = ?, last_name = ?, full_name = ?, section = ?, section_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [cleanFirst, cleanLast, fullName, cleanSection, cleanSection, found.id]
      );
      studentRecord = {
        id: clerkUser?.id || found.id,
        user_id: clerkUser?.id || found.id,
        lrn_or_id: cleanLrn,
        first_name: cleanFirst,
        last_name: cleanLast,
        full_name: fullName,
        email: targetEmail,
        role: 'STUDENT',
        section: cleanSection,
        section_id: cleanSection
      };
    } else {
      const newId = clerkUser?.id || `usr-student-${cleanLrn}`;
      await db.query(
        `INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role, section, section_id)
         VALUES (?, ?, ?, ?, ?, ?, 'CLERK_MANAGED_AUTH', 'STUDENT', ?, ?)`,
        [newId, cleanLrn, cleanFirst, cleanLast, fullName, targetEmail, cleanSection, cleanSection]
      );
      studentRecord = {
        id: newId,
        user_id: newId,
        lrn_or_id: cleanLrn,
        first_name: cleanFirst,
        last_name: cleanLast,
        full_name: fullName,
        email: targetEmail,
        role: 'STUDENT',
        section: cleanSection,
        section_id: cleanSection
      };
    }

    const token = jwt.sign(studentRecord, JWT_SECRET, { expiresIn: '12h' });
    return res.json({
      success: true,
      role: 'STUDENT',
      clerkTicket,
      token,
      user: studentRecord
    });
  } catch (err) {
    console.error('[AUTH] Student login error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Could not complete learner sign-in. Please check your details and try again.'
    });
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
