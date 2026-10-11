const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');
const { verifyToken, requireTeacher } = require('../middleware/auth.middleware');

// ENFORCE STRICT TEACHER GUARDRAILS ACROSS ENTIRE ROUTER (FR-01, FR-05..44, NFR-01)
router.use(verifyToken, requireTeacher);

// 1. Dashboard Overview & Real-Time Monitoring Feed (FR-05, FR-07)
router.get('/dashboard', teacherController.getDashboardOverview);
router.get('/classes', teacherController.getClasses);

// 2. Gradebook (FR-27..30)
router.get('/gradebook', teacherController.getGradebook);

// 3. Proficiency Profiling & 3-Tier Classification (FR-31..33)
router.get('/profiling', teacherController.getProficiencyProfiling);

// 4. Remediation Decision Queue & Actions (FR-34..36)
router.get('/remediation-queue', teacherController.getRemediationQueue);
router.post('/intervention/:id/action', teacherController.handleInterventionAction);

// 5. Psychometric Item Analysis (FR-21, FR-40)
router.get('/quizzes/:quiz_id/item-analysis', teacherController.getItemAnalysis);

// 6. Assessment Authoring (FR-15)
router.post('/quizzes', teacherController.createQuiz);

// 7. Materials Upload & ILAW Tagging (FR-08..14)
router.post('/materials', teacherController.createMaterial);

// 8. Performance Tasks Management & Review Queue (FR-44)
router.post('/performance-tasks', teacherController.createPerformanceTask);
router.get('/performance-tasks/:id/submissions', teacherController.getPerformanceTaskSubmissions);
router.patch('/performance-tasks/submissions/:id/grade', teacherController.gradePerformanceTask);

// 9. Proctoring Security Watchdog Audit Trail (FR-23..25)
router.get('/proctoring/trail/:submissionId', teacherController.getProctoringTrail);

// 10. Multi-Format Exporters (FR-41, FR-42)
router.get('/export/xlsx', teacherController.exportGradebookXLSX);
router.get('/export/pdf', teacherController.exportReportPDF);

module.exports = router;
