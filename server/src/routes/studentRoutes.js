const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { verifyToken, requireStudent } = require('../middleware/auth.middleware');

// ENFORCE STRICT STUDENT GUARDRAILS ACROSS ENTIRE ROUTER (FR-01, FR-04, FR-06..50, NFR-01)
router.use(verifyToken, requireStudent);

// 1. Student Personal Dashboard Feed (FR-03, FR-04, FR-06)
router.get('/dashboard', studentController.getStudentDashboard);

// 2. Student Lessons & Curriculum View (FR-12, FR-45..46)
router.get('/lessons', studentController.getStudentLessons);

// 3. Personal Score History & Own Submissions (FR-22)
router.get('/scores', studentController.getPersonalScores);
router.get('/submissions/:id', studentController.getOwnSubmissionDetail);

// 4. Online Quiz Taking Session (FR-19, FR-22)
router.post('/quizzes/start', studentController.startQuiz);
router.post('/quizzes/submit', studentController.submitQuiz);

// 5. Assigned Remedial Interventions (Ways Forward) (FR-36, FR-37)
router.get('/practice', studentController.getPractice);
router.get('/interventions', studentController.getAssignedInterventions);

// 6. Performance Task Submission Dropzone (FR-43)
router.post('/performance-tasks/:id/submit', studentController.submitPerformanceTask);

// 7. Offline Reading Action Sync (FR-50)
router.post('/sync-read-logs', studentController.syncOfflineReadLogs);

module.exports = router;
