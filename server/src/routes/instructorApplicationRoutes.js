const router = require('express').Router();
const { verifyIdentity } = require('../middleware/auth');
const { getApplication, submitApplication } = require('../services/instructorApplicationService');

// Applicants are ordinary signed-in accounts (no class enrollment required).
router.use(verifyIdentity);

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

router.get('/me', wrap(async (req, res) => res.json({ success: true, application: await getApplication(req.user.id) })));

router.post('/', wrap(async (req, res) => {
  res.status(201).json({ success: true, application: await submitApplication(req.user, req.body) });
}));

module.exports = router;
