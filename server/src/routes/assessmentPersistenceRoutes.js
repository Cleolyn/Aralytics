const express = require('express');
const router = express.Router();
const controller = require('../controllers/assessmentPersistenceController');
const { verifyToken, requireRole } = require('../middleware/auth');

// POST /api/assessment/submit - Saves attempt, logs security flags, triggers remediation
router.post('/assessment/submit', verifyToken, requireRole('STUDENT'), controller.submitAssessment);

// GET /api/interventions/flagged - Retrieves flagged students with recommended remediation sets
router.get('/interventions/flagged', verifyToken, requireRole('TEACHER'), controller.getFlaggedInterventions);

// POST /api/security/log-event - Asynchronously logs visibilitychange and blur timestamps
router.post('/security/log-event', verifyToken, controller.logSecurityEvent);

// PATCH /api/interventions/:id/approve - Teacher approval hook
router.patch('/interventions/:id/approve', verifyToken, requireRole('TEACHER'), controller.approveIntervention);

module.exports = router;
