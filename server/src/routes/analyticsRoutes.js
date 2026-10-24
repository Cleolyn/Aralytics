const express = require('express');
const router = express.Router();
const controller = require('../controllers/analyticsController');
const { verifyToken, requireRole } = require('../middleware/auth');

// 1. Proficiency Profiling Aggregator
router.get('/proficiency', verifyToken, requireRole('TEACHER'), controller.getProficiencyAnalytics);

// 2. Remediation Routing Queue
router.get('/remediation-queue', verifyToken, requireRole('TEACHER'), controller.getRemediationQueue);

// 2B. Teacher Decision Actions: Approve, Modify, Override, Create, Delete
router.post('/intervention/:id/action', verifyToken, requireRole('TEACHER'), controller.handleInterventionAction);
router.post('/interventions', verifyToken, requireRole('TEACHER'), controller.createIntervention);
router.delete('/interventions/:id', verifyToken, requireRole('TEACHER'), controller.deleteIntervention);

// 3. Exporters
router.get('/export/xlsx', verifyToken, requireRole('TEACHER'), controller.exportGradebookXLSX);
router.get('/export/pdf', verifyToken, requireRole('TEACHER'), controller.exportReportPDF);

// 4. Psychometric Item Analysis (FR-21, FR-40)
router.get('/quizzes/:quiz_id/item-analysis', verifyToken, requireRole('TEACHER'), controller.getItemAnalysis);

module.exports = router;

