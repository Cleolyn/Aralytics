const { createClerkClient, getAuth } = require('@clerk/express');
const db = require('../config/database');
const { getEnrollment } = require('../services/enrollmentService');

const JWT_SECRET = process.env.JWT_SECRET || 'aralytics_jwt_secret_ponce_ap10_secure_key_2026';
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
 * 1. Verify Clerk Session Token (replaces JWT verifyToken)
 * Reads the Bearer token from Authorization header (or query param token),
 * fetches Clerk user metadata, and attaches req.user with the same shape
 * that the rest of the API middleware/controllers expect:
 *   { user_id, id, email, full_name, first_name, last_name, role, section_id, section }
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
    const { rows } = await db.query('SELECT id, role, full_name, first_name, last_name, section, section_id, lrn_or_id FROM users WHERE id = ?', [userId]);
    const meta = clerkUser.publicMetadata || {};
    req.user = {
      user_id: userId,
      id: userId,
      email: primaryEmail.emailAddress,
      email_verified: true,
      full_name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' '),
      first_name: clerkUser.firstName,
      last_name: clerkUser.lastName,
      role: rows[0]?.role || (meta.role === 'TEACHER' ? 'TEACHER' : 'STUDENT'),
      ...(rows[0] || {})
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

// Every learning endpoint uses this guard, including endpoints without a role check.
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

/**
 * 2. Generic Role Gatekeeper (FR-03, FR-04, NFR-01)
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Requires role [${allowed.join(', ')}]. Current role: ${req.user ? req.user.role : 'None'}.`
      });
    }
    next();
  };
}

/**
 * 3. Teacher Role Guard (FR-01, FR-03, FR-05..44, NFR-01)
 */
const requireTeacher = requireRole('TEACHER');

/**
 * 4. Student Role Guard (FR-01, FR-04, FR-06..50, NFR-01)
 */
const requireStudent = requireRole('STUDENT');

/**
 * 5. Student Data Isolation Guard (FR-04, NFR-01)
 */
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
  requireOwnStudentData,
  invalidateUserCache,
  clerkClient,
  JWT_SECRET
};
