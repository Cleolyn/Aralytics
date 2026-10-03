const express = require('express');
const router = express.Router();
const materialsController = require('../controllers/materialsController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, materialsController.getAllMaterials);
router.get('/read-logs', verifyToken, materialsController.getReadLogs);
router.post('/sync-read-logs', verifyToken, materialsController.syncReadLogs);
router.get('/:id', verifyToken, materialsController.getMaterialById);
router.post('/', verifyToken, requireRole('TEACHER'), materialsController.createMaterial);
router.get('/download/:filename', materialsController.streamMaterialFile);

module.exports = router;

