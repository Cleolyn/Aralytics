const express = require('express');
const router = express.Router();
const materialsController = require('../controllers/materialsController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { signedOrAuthenticated } = require('../middleware/signedAccess');

router.get('/', verifyToken, materialsController.getAllMaterials);
router.get('/read-logs', verifyToken, materialsController.getReadLogs);
router.post('/sync-read-logs', verifyToken, materialsController.syncReadLogs);
router.get('/:id', verifyToken, materialsController.getMaterialById);
router.post('/', verifyToken, requireRole('TEACHER'), materialsController.createMaterial);
router.put('/:id', verifyToken, requireRole(['TEACHER', 'ADMIN']), materialsController.updateMaterial);
router.delete('/:id', verifyToken, requireRole(['TEACHER', 'ADMIN']), materialsController.deleteMaterial);
router.get('/download/:filename', signedOrAuthenticated('materials'), materialsController.streamMaterialFile);

module.exports = router;

