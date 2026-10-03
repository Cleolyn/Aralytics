const express = require('express');
const router = express.Router();
const curriculumController = require('../controllers/curriculumController');
const { verifyToken } = require('../middleware/auth');

router.get('/taxonomy', verifyToken, curriculumController.getFullCurriculum);
router.get('/ilaw/:ilawTag', verifyToken, curriculumController.getCompetenciesByIlaw);

module.exports = router;
