const router = require('express').Router();
const { verifyIdentity, requireAdmin } = require('../middleware/auth');
const service = require('../services/instructorApplicationService');

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

module.exports = router;
