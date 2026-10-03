const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'aralytics_jwt_secret_ponce_ap10_secure_key_2026';

/**
 * 1. Verify JWT Authentication Token (FR-01, FR-02)
 * Validates Bearer token in headers or query string.
 * Decodes user claims and attaches req.user:
 * { user_id, email, full_name, role ['TEACHER'|'STUDENT'], section_id }
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied: Missing or invalid authorization token.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied: Token expired or signature invalid.'
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
 * Express middleware rejecting any request from non-Teacher tokens with HTTP 403 Forbidden.
 */
const requireTeacher = requireRole('TEACHER');

/**
 * 4. Student Role Guard (FR-01, FR-04, FR-06..50, NFR-01)
 * Express middleware restricting access strictly to authenticated STUDENT accounts.
 */
const requireStudent = requireRole('STUDENT');

/**
 * 5. Student Data Isolation Guard (FR-04, NFR-01)
 * Enforces that students can ONLY read or modify their own student records.
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
  JWT_SECRET
};
