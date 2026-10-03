const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, quizController.getAllQuizzes);
router.get('/:id', verifyToken, quizController.getQuizById);
router.post('/', verifyToken, requireRole('TEACHER'), quizController.createQuiz);

module.exports = router;
