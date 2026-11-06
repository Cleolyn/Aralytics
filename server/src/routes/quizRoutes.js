const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');
const { wrap } = require('../services/teachingContentService');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, quizController.getAllQuizzes);
router.get('/:id', verifyToken, quizController.getQuizById);
router.post('/', verifyToken, requireRole('TEACHER'), quizController.createQuiz);

const staff = requireRole(['TEACHER', 'ADMIN']);
router.put('/:id', verifyToken, staff, wrap(quizController.updateQuiz));
router.delete('/:id', verifyToken, staff, wrap(quizController.deleteQuiz));
router.post('/:id/archive', verifyToken, staff, wrap(quizController.archiveQuiz));
router.post('/:id/restore', verifyToken, staff, wrap(quizController.restoreQuiz));

module.exports = router;
