const router = require('express').Router();
const crypto = require('crypto');
const db = require('../config/database');
const { verifyIdentity, requireTeacher, requireStudent } = require('../middleware/authMiddleware');
const { getEnrollment, findInvitation, submitEnrollment, reviewEnrollment, hashCode, fail } = require('../services/enrollmentService');
router.use(verifyIdentity);
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// Account-scoped throttling for code guessing; records expire and are bounded.
const attempts = new Map();
function limitCodes(req, res, next) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires < now) attempts.delete(key);
  const entry = attempts.get(req.user.id) || { count: 0, expires: now + 15 * 60000 };
  if (entry.count >= 15) return res.status(429).json({ message: 'Too many class-code attempts. Try again in 15 minutes.' });
  entry.count++;
  if (attempts.size >= 10000) attempts.delete(attempts.keys().next().value);
  attempts.set(req.user.id, entry);
  next();
}

router.get('/status', wrap(async (req, res) => res.json({ enrollment: await getEnrollment(req.user.id) })));
router.post('/validate-code', requireStudent, limitCodes, wrap(async (req, res) => {
  const invitation = await findInvitation(req.body.code);
  res.json({ adviser_name: invitation.adviser_name, school_year: invitation.school_year, sections: JSON.parse(invitation.sections_json) });
}));
router.post('/request', requireStudent, limitCodes, wrap(async (req, res) => {
  const enrollment = await submitEnrollment(req.user.id, req.body);
  res.status(201).json({ enrollment });
}));
router.get('/manage', requireTeacher, wrap(async (req, res) => {
  const { rows: invitations } = await db.query(`SELECT id, school_year, sections_json, active, created_at
    FROM class_invitations WHERE teacher_id = ? ORDER BY created_at DESC`, [req.user.id]);
  const { rows: requests } = await db.query(`SELECT e.*, u.email, i.school_year FROM enrollment_requests e
    JOIN class_invitations i ON i.id = e.invitation_id JOIN users u ON u.id = e.user_id
    WHERE i.teacher_id = ? ORDER BY e.created_at DESC`, [req.user.id]);
  res.json({ invitations: invitations.map(i => ({ ...i, sections: JSON.parse(i.sections_json) })), requests });
}));
router.post('/invitations', requireTeacher, wrap(async (req, res) => {
  const schoolYear = String(req.body.school_year || '').trim();
  const sections = [...new Set((Array.isArray(req.body.sections) ? req.body.sections : []).map(s => String(s).trim()).filter(Boolean))];
  if (!/^\d{4}-\d{4}$/.test(schoolYear) || Number(schoolYear.slice(5)) !== Number(schoolYear.slice(0, 4)) + 1) throw fail(400, 'Enter a school year such as 2026-2027.');
  if (!sections.length || sections.length > 30 || sections.some(s => s.length > 50)) throw fail(400, 'Provide 1 to 30 section names, up to 50 characters each.');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from({ length: 10 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  const id = crypto.randomUUID();
  await db.query(`INSERT INTO class_invitations (id, teacher_id, school_year, sections_json, code_hash)
    VALUES (?, ?, ?, ?, ?)`, [id, req.user.id, schoolYear, JSON.stringify(sections), hashCode(code)]);
  res.status(201).json({ id, code });
}));
router.patch('/invitations/:id/close', requireTeacher, wrap(async (req, res) => {
  const result = await db.query('UPDATE class_invitations SET active = 0 WHERE id = ? AND teacher_id = ?', [req.params.id, req.user.id]);
  if (!result.affectedRows) throw fail(404, 'Invitation not found.');
  res.json({ success: true });
}));
router.patch('/requests/:userId', requireTeacher, wrap(async (req, res) => {
  res.json({ enrollment: await reviewEnrollment(req.user.id, req.params.userId, req.body.status, req.body.reason) });
}));
module.exports = router;
