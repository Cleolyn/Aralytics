const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/xlsx/gradebook', verifyToken, requireRole('TEACHER'), exportController.exportGradebookXLSX);
router.get('/pdf/report', verifyToken, requireRole('TEACHER'), exportController.exportReportPDF);

module.exports = router;
