const router = require('express').Router();
const db = require('../config/database');
const { verifyIdentity } = require('../middleware/auth');
const { getEnrollment } = require('../services/enrollmentService');
const { getApplication } = require('../services/instructorApplicationService');
const { listDemoAccountsForDirectory, issueDemoSignInTicket } = require('../services/demoTicketService');

// Students see their class enrollment and any instructor application (for onboarding routing).
async function accountStatus(user) {
  if (user.role !== 'STUDENT') return { enrollment: null, enrollment_status: 'NOT_ENROLLED', instructor_application: null };
  const [enrollment, application] = await Promise.all([getEnrollment(user.id), getApplication(user.id)]);
  return {
    enrollment,
    enrollment_status: enrollment?.status || 'NOT_ENROLLED',
    instructor_application: application ? { status: application.status, reason: application.reason } : null
  };
}

function accountConflict(err) {
  return /UNIQUE constraint failed: users\.(email|lrn_or_id)|Duplicate entry/i.test(err.message || '');
}

// Profile fields and roles are never assigned from sign-in payloads; new accounts are always STUDENT.
const allowSuspended = (req, _res, next) => { req.allowSuspended = true; next(); };

router.post('/sync', allowSuspended, verifyIdentity, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    let user = rows[0];
    if (!user) {
      await db.query(`INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?, ?, 'CLERK_MANAGED_AUTH', ?)
        ${db.dialect === 'mysql' ? 'ON DUPLICATE KEY UPDATE id = id' : 'ON CONFLICT(id) DO NOTHING'}`,
      [req.user.id, `account:${req.user.id}`, req.user.first_name || '', req.user.last_name || '',
        req.user.full_name || '', req.user.email, 'STUDENT']);
      const result = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
      user = result.rows[0];
    }
    const { password_hash, ...profile } = user;
    return res.json({ success: true, role: user.role, user: { ...profile, status: user.status || 'ACTIVE', email_verified: true, ...(await accountStatus(user)) } });
  } catch (err) {
    if (accountConflict(err)) return res.status(409).json({ success: false, code: 'ACCOUNT_LINK_REQUIRED',
      message: 'This email is already connected to another Aralytics profile. Contact your adviser to link the existing account.' });
    next(err);
  }
});

router.get('/demo-accounts', (_req, res) => {
  res.json({ success: true, accounts: listDemoAccountsForDirectory() });
});

router.post('/demo-ticket', async (req, res, next) => {
  try {
    const { email, password, autoBypass } = req.body || {};
    const data = await issueDemoSignInTicket({ email, password, autoBypass: Boolean(autoBypass) });
    return res.json({ success: true, ...data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
});

router.post('/student-login', (_req, res) => res.status(410).json({
  success: false, message: 'Sign in with Google or your verified email address. LRN sign-in is no longer supported.'
}));

router.get('/me', allowSuspended, verifyIdentity, async (req, res, next) => {
  try {
    res.json({ success: true, user: { ...req.user, status: req.user.status || 'ACTIVE', ...(await accountStatus(req.user)) } });
  } catch (err) { next(err); }
});
module.exports = router;
