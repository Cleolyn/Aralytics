const express = require('express');
const router = express.Router();
const interventionController = require('../controllers/interventionController');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, interventionController.getInterventions);
router.patch('/:id/resolve', verifyToken, interventionController.resolveIntervention);

module.exports = router;
