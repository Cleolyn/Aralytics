/** /api/announcements: teachers post to their class, students read their adviser's posts. */
const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const announcements = require('../services/announcementService');
const files = require('../services/fileService');

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const router = express.Router();
router.use(verifyToken);

const teacher = requireRole(['TEACHER']);
const student = requireRole(['STUDENT']);

router.get('/', requireRole(['TEACHER', 'STUDENT']), wrap(async (req, res) => {
  res.json({ success: true, ...await announcements.list(files.envOf(req), req.user, req.query) });
}));

router.post('/', teacher, wrap(async (req, res) => {
  res.status(201).json({ success: true, announcement: await announcements.create(req, req.user, req.body) });
}));

router.post('/read-all', student, wrap(async (req, res) => {
  res.json({ success: true, count: await announcements.markAllRead(req.user) });
}));

router.put('/:id', teacher, wrap(async (req, res) => {
  res.json({ success: true, announcement: await announcements.update(req, req.user, req.params.id, req.body) });
}));

router.delete('/:id', teacher, wrap(async (req, res) => {
  res.json({ success: true, id: await announcements.remove(req.user, req.params.id) });
}));

router.post('/:id/read', student, wrap(async (req, res) => {
  res.json({ success: true, read_at: await announcements.markRead(req.user, req.params.id) });
}));

module.exports = router;
