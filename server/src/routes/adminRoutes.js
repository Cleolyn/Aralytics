const router = require('express').Router();
const { verifyIdentity, requireAdmin } = require('../middleware/auth');
const service = require('../services/instructorApplicationService');
const files = require('../services/fileService');
const accounts = require('../services/accountAdminService');
const audit = require('../services/auditLog');
const notifier = require('../services/notifier');
const { clerkClient, invalidateUserCache } = require('../middleware/auth');

// Every admin endpoint requires a verified session with the ADMIN role.
router.use(verifyIdentity, requireAdmin);

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

router.get('/summary', wrap(async (_req, res) => res.json({ success: true, summary: await service.applicationSummary() })));

router.get('/applications', wrap(async (req, res) => {
  res.json({ success: true, applications: await service.listApplications(req.query.status || '') });
}));

router.patch('/applications/:userId', wrap(async (req, res) => {
  const application = await service.reviewApplication(req.user.id, req.params.userId, req.body.status, req.body.reason);
  invalidateUserCache(req.params.userId);
  const approved = application.status === 'APPROVED';
  await audit.record(null, { actor: req.user, action: approved ? 'APPLICATION_APPROVED' : 'APPLICATION_RETURNED', targetType: 'USER',
    targetId: application.user_id, targetLabel: application.email, details: approved ? null : { reason: application.reason } });
  notifier.notify(req, approved ? 'instructor_application.approved' : 'instructor_application.returned',
    { to: application.email, name: application.full_name, reason: application.reason });
  res.json({ success: true, application });
}));

router.get('/instructors', wrap(async (_req, res) => res.json({ success: true, instructors: await service.listInstructors() })));

// Storage overview and per-user clean-up (the only admin file actions are read and delete).
router.get('/storage', wrap(async (req, res) => {
  res.json({ success: true, ...await files.adminStorage(files.envOf(req)) });
}));

router.delete('/users/:userId/files', wrap(async (req, res) => {
  const target = await accounts.getUser(req.params.userId);
  const removed = await files.deleteForOwner(files.envOf(req), req.params.userId);
  await audit.record(null, { actor: req.user, action: 'STORAGE_PURGED', targetType: 'USER', targetId: req.params.userId,
    targetLabel: target?.email, details: { removed } });
  res.json({ success: true, removed });
}));

// People directory and account actions.
router.get('/users', wrap(async (req, res) => {
  const { q, role, status, page } = req.query;
  res.json({ success: true, ...await accounts.listUsers({ q, role, status, page }) });
}));

router.post('/users/:id/suspend', wrap(async (req, res) => {
  const user = await accounts.suspend(req.user, req.params.id, req.body.reason);
  invalidateUserCache(req.params.id);
  notifier.notify(req, 'account.suspended', { to: user.email, name: user.full_name, reason: user.suspended_reason });
  res.json({ success: true, user });
}));

router.post('/users/:id/unsuspend', wrap(async (req, res) => {
  const user = await accounts.unsuspend(req.user, req.params.id);
  invalidateUserCache(req.params.id);
  res.json({ success: true, user });
}));

router.post('/users/:id/revoke-instructor', wrap(async (req, res) => {
  const result = await accounts.revokeInstructor(req.user, req.params.id, req.body.reason);
  invalidateUserCache(req.params.id);
  notifier.notify(req, 'instructor.revoked', { to: result.user.email, name: result.user.full_name, reason: String(req.body.reason).trim() });
  res.json({ success: true, ...result });
}));

router.delete('/users/:id', async (req, res, next) => {
  try {
    const result = await accounts.deleteAccount(req.user, req.params.id, req.body?.confirm_email,
      { env: files.envOf(req), clerk: clerkClient, invalidateCache: invalidateUserCache });
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.content) return res.status(err.status).json({ success: false, code: err.code, message: err.message, content: err.content });
    next(err);
  }
});

router.get('/audit', wrap(async (req, res) => {
  const { action, before, limit } = req.query;
  res.json({ success: true, ...await audit.list({ action, before, limit }) });
}));

module.exports = router;
