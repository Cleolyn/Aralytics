const express = require('express');
const router = express.Router();
const controller = require('../controllers/performanceTaskController');
const { wrap } = require('../services/teachingContentService');
const { verifyToken, requireRole } = require('../middleware/auth');
const { signedOrAuthenticated } = require('../middleware/signedAccess');

// Older base64 submissions: signed link or signed-in user
router.get('/files/:filename', signedOrAuthenticated('performance-tasks'), controller.downloadFile);

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

// Edit, delete and archive tasks (creator or ADMIN)
const staff = requireRole(['TEACHER', 'ADMIN']);
router.put('/:id', verifyToken, staff, wrap(controller.updateTask));
router.delete('/:id', verifyToken, staff, wrap(controller.deleteTask));
router.post('/:id/archive', verifyToken, staff, wrap(controller.archiveTask));
router.post('/:id/restore', verifyToken, staff, wrap(controller.restoreTask));

module.exports = router;
