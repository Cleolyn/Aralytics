const express = require('express');
const router = express.Router();
const proctoringController = require('../controllers/proctoringController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.post('/event', verifyToken, proctoringController.logProctoringEvent);
router.get('/trail/:submissionId', verifyToken, requireRole('TEACHER'), proctoringController.getProctoringAuditTrail);

module.exports = router;
