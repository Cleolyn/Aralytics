const router = require('express').Router();
const { verifyIdentity, requireAdmin } = require('../middleware/auth');
const service = require('../services/instructorApplicationService');
const files = require('../services/fileService');

// Every admin endpoint requires a verified session with the ADMIN role.
router.use(verifyIdentity, requireAdmin);

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

router.get('/summary', wrap(async (_req, res) => res.json({ success: true, summary: await service.applicationSummary() })));

router.get('/applications', wrap(async (req, res) => {
  res.json({ success: true, applications: await service.listApplications(req.query.status || '') });
}));

router.patch('/applications/:userId', wrap(async (req, res) => {
  const application = await service.reviewApplication(req.user.id, req.params.userId, req.body.status, req.body.reason);
  res.json({ success: true, application });
}));

router.get('/instructors', wrap(async (_req, res) => res.json({ success: true, instructors: await service.listInstructors() })));

// Storage overview and per-user clean-up (the only admin file actions are read and delete).
router.get('/storage', wrap(async (req, res) => {
  res.json({ success: true, ...await files.adminStorage(files.envOf(req)) });
}));

router.delete('/users/:userId/files', wrap(async (req, res) => {
  const removed = await files.deleteForOwner(files.envOf(req), req.params.userId);
  res.json({ success: true, removed });
}));

module.exports = router;
