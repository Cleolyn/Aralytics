const router = require('express').Router();
const db = require('../config/database');
const { verifyIdentity } = require('../middleware/authMiddleware');
const { getEnrollment } = require('../services/enrollmentService');

function accountConflict(err) {
  return /UNIQUE constraint failed: users\.(email|lrn_or_id)|Duplicate entry/i.test(err.message || '');
}

// Profile fields and roles are never assigned from untrusted sign-in payloads.
router.post('/sync', verifyIdentity, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    let user = rows[0];
    if (!user) {
      await db.query(`INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?, ?, 'CLERK_MANAGED_AUTH', ?)
        ${db.dialect === 'mysql' ? 'ON DUPLICATE KEY UPDATE id = id' : 'ON CONFLICT(id) DO NOTHING'}`,
      [req.user.id, `account:${req.user.id}`, req.user.first_name || '', req.user.last_name || '',
        req.user.full_name || '', req.user.email, req.user.role]);
      const result = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
      user = result.rows[0];
    }
    const { password_hash, ...profile } = user;
    const enrollment = user.role === 'STUDENT' ? await getEnrollment(user.id) : null;
    return res.json({ success: true, role: user.role, user: { ...profile, email_verified: true,
      enrollment, enrollment_status: enrollment?.status || 'NOT_ENROLLED' } });
  } catch (err) {
    if (accountConflict(err)) return res.status(409).json({ success: false, code: 'ACCOUNT_LINK_REQUIRED',
      message: 'This email is already connected to another Aralytics profile. Contact your adviser to link the existing account.' });
    next(err);
  }
});

router.post('/student-login', (_req, res) => res.status(410).json({
  success: false, message: 'Sign in with Google or your verified email address. LRN sign-in is no longer supported.'
}));

router.get('/me', verifyIdentity, async (req, res, next) => {
  try {
    const enrollment = req.user.role === 'STUDENT' ? await getEnrollment(req.user.id) : null;
    res.json({ success: true, user: { ...req.user, enrollment, enrollment_status: enrollment?.status || 'NOT_ENROLLED' } });
  } catch (err) { next(err); }
});
module.exports = router;
