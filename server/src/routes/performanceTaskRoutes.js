const express = require('express');
const router = express.Router();
const controller = require('../controllers/performanceTaskController');
const { verifyToken, requireRole } = require('../middleware/auth');

// Public/authenticated file stream
router.get('/files/:filename', verifyToken, controller.downloadFile);

// List performance tasks (accessible to both STUDENT and TEACHER)
router.get('/', verifyToken, controller.getAllTasks);

// Get single task detail
router.get('/:id', verifyToken, controller.getTaskById);

// Create task (TEACHER only - FR-44)
router.post('/', verifyToken, requireRole('TEACHER'), controller.createTask);

// Student submit task output (STUDENT only - FR-43)
router.post('/:id/submit', verifyToken, requireRole('STUDENT'), controller.submitTask);

// Teacher view submissions for task (TEACHER only - FR-44)
router.get('/:id/submissions', verifyToken, requireRole('TEACHER'), controller.getTaskSubmissions);

// Teacher grade submission (TEACHER only - FR-44)
router.patch('/submissions/:id/grade', verifyToken, requireRole('TEACHER'), controller.gradeSubmission);

module.exports = router;
