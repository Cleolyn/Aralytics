const { createClerkClient, getAuth } = require('@clerk/express');
const db = require('../config/database');
const { getEnrollment } = require('../services/enrollmentService');

const ROLES = ['STUDENT', 'TEACHER', 'ADMIN'];
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// ---------------------------------------------------------------------------
// Simple in-memory user cache (avoids an API call to Clerk on every request)
// ---------------------------------------------------------------------------
const _userCache = new Map(); // userId → { clerkUser, expiresAt }
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function _getCachedClerkUser(userId) {
  const entry = _userCache.get(userId);
  if (entry && entry.expiresAt > Date.now()) return entry.clerkUser;
  const clerkUser = await clerkClient.users.getUser(userId);
  const primary = clerkUser.emailAddresses?.find(email => email.id === clerkUser.primaryEmailAddressId);
  if (primary?.verification?.status === 'verified') {
    if (_userCache.size >= 10000) _userCache.delete(_userCache.keys().next().value);
    _userCache.set(userId, { clerkUser, expiresAt: Date.now() + CACHE_TTL });
  }
  return clerkUser;
}

/**
 * Invalidate cache after metadata updates (e.g. role assignment).
 */
function invalidateUserCache(userId) {
  _userCache.delete(userId);
}

/**
 * Verifies the Clerk session (Bearer header, or `?token=` bridged in app.js),
 * requires a verified primary email, and attaches `req.user`:
 *   { user_id, id, email, full_name, first_name, last_name, role, section_id, section, lrn_or_id }
 * The role comes only from the database: new accounts are STUDENT, TEACHER is granted
 * by an admin approving an instructor application, and ADMIN by `npm run admin:grant`.
 * Clerk metadata is deliberately ignored so instructor access stays admin-verified.
 */
async function verifyIdentity(req, res, next) {
  res.set('Cache-Control', 'no-store');
  let userId = null;
  try {
    const authObj = getAuth(req);
    userId = authObj?.userId || null;
  } catch {
    userId = null;
  }

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied: Missing or invalid authorization token.'
    });
  }
  try {
    const clerkUser = await _getCachedClerkUser(userId);
    const primaryEmail = clerkUser.emailAddresses?.find(email => email.id === clerkUser.primaryEmailAddressId);
    if (primaryEmail?.verification?.status !== 'verified') {
      return res.status(403).json({ success: false, code: 'EMAIL_UNVERIFIED', message: 'Verify your email address before continuing.' });
    }
    const { rows } = await db.query('SELECT id, role, full_name, first_name, last_name, section, section_id, lrn_or_id, status, suspended_reason FROM users WHERE id = ?', [userId]);
    if (rows[0]?.status === 'SUSPENDED' && !req.allowSuspended) {
      return res.status(403).json({
        success: false, code: 'ACCOUNT_SUSPENDED',
        message: 'Your account is suspended. Contact your school administrator.',
        suspended_reason: rows[0].suspended_reason || null
      });
    }
    req.user = {
      user_id: userId,
      id: userId,
      email: primaryEmail.emailAddress,
      email_verified: true,
      full_name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' '),
      first_name: clerkUser.firstName,
      last_name: clerkUser.lastName,
      ...(rows[0] || {}),
      role: ROLES.includes(rows[0]?.role) ? rows[0].role : 'STUDENT'
    };
    next();
  } catch (err) {
    console.error('[AUTH] Clerk user fetch error:', err.message);
    return res.status(401).json({
      success: false,
      message: 'Access Denied: Could not verify session.'
    });
  }
}

/**
 * verifyIdentity + enrollment gate. Every learning endpoint uses this guard;
 * students must have an APPROVED enrollment.
 */
async function verifyToken(req, res, next) {
  return verifyIdentity(req, res, async () => {
    try {
      if (req.user.role === 'STUDENT') {
        const enrollment = await getEnrollment(req.user.id);
        if (enrollment?.status !== 'APPROVED') return res.status(403).json({
          success: false, code: 'ENROLLMENT_REQUIRED', message: 'Your adviser must approve your enrollment before you can access your class.'
        });
      }
      return next();
    } catch (err) { next(err); }
  });
}

/** Role gatekeeper (FR-03, FR-04, NFR-01). */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        code: 'ROLE_REQUIRED',
        message: `Forbidden: Requires role [${allowed.join(', ')}]. Current role: ${req.user ? req.user.role : 'None'}.`
      });
    }
    next();
  };
}

const requireTeacher = requireRole('TEACHER');

const requireStudent = requireRole('STUDENT');
const requireAdmin = requireRole('ADMIN');

/** Students may only request their own records; teachers have oversight (FR-04, NFR-01). */
function requireOwnStudentData(paramKey = 'student_id') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthenticated.' });
    }
    if (req.user.role === 'TEACHER') {
      return next(); // Teachers have pedagogical oversight across their sections
    }
    const requestedStudentId = req.params[paramKey] || req.query[paramKey] || req.body[paramKey];
    const currentUserId = req.user.id || req.user.user_id;
    if (requestedStudentId && requestedStudentId !== currentUserId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Students are strictly restricted to querying their own personal records.'
      });
    }
    next();
  };
}

module.exports = {
  verifyIdentity,
  verifyToken,
  requireRole,
  requireTeacher,
  requireStudent,
  requireAdmin,
  requireOwnStudentData,
  ROLES,
  invalidateUserCache,
  clerkClient
};
