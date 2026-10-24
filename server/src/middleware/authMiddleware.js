const { createClerkClient, getAuth } = require('@clerk/express');

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
  _userCache.set(userId, { clerkUser, expiresAt: Date.now() + CACHE_TTL });
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
async function verifyToken(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied: Missing or invalid authorization token.'
    });
  }
  try {
    const clerkUser = await _getCachedClerkUser(userId);
    const meta = clerkUser.publicMetadata || {};
    req.user = {
      user_id: userId,
      id: userId,
      email: clerkUser.primaryEmailAddress?.emailAddress,
      full_name: `${clerkUser.firstName} ${clerkUser.lastName}`,
      first_name: clerkUser.firstName,
      last_name: clerkUser.lastName,
      role: meta.role,
      section_id: meta.section_id,
      section: meta.section
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
  verifyToken,
  requireRole,
  requireTeacher,
  requireStudent,
  requireOwnStudentData,
  invalidateUserCache,
  clerkClient
};
