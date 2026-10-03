const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submissionController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.post('/start', verifyToken, submissionController.startQuiz);
router.post('/submit', verifyToken, submissionController.submitQuiz);
router.get('/detail/:id', verifyToken, submissionController.getSubmissionById);
router.get('/gradebook', verifyToken, requireRole('TEACHER'), submissionController.getGradebookData);

module.exports = router;
