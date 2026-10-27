const crypto = require('crypto');
const db = require('../config/database');

const hashCode = code => crypto.createHash('sha256').update(String(code || '').trim().toUpperCase()).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });

async function initializeEnrollmentTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS class_invitations (
    id VARCHAR(36) PRIMARY KEY, teacher_id VARCHAR(36) NOT NULL,
    school_year VARCHAR(30) NOT NULL, sections_json TEXT NOT NULL,
    code_hash VARCHAR(64) UNIQUE NOT NULL, active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS enrollment_requests (
    user_id VARCHAR(36) PRIMARY KEY, invitation_id VARCHAR(36) NOT NULL,
    lrn VARCHAR(12) UNIQUE NOT NULL, full_name VARCHAR(200) NOT NULL,
    mobile VARCHAR(20) NOT NULL, section VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', reason VARCHAR(300),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, reviewed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (invitation_id) REFERENCES class_invitations(id)
  )`);
}

async function getEnrollment(userId, connection = db) {
  const { rows } = await connection.query(`SELECT e.*, i.school_year, i.teacher_id,
    u.full_name AS adviser_name FROM enrollment_requests e
    JOIN class_invitations i ON i.id = e.invitation_id JOIN users u ON u.id = i.teacher_id
    WHERE e.user_id = ?`, [userId]);
  return rows[0] || null;
}

async function findInvitation(code, connection = db) {
  if (!/^[A-Z2-9]{10}$/.test(String(code || '').trim().toUpperCase())) throw fail(400, 'Enter a valid 10-character class code.');
  const { rows } = await connection.query(`SELECT i.*, u.full_name AS adviser_name
    FROM class_invitations i JOIN users u ON u.id = i.teacher_id WHERE i.code_hash = ? AND i.active = 1`, [hashCode(code)]);
  if (!rows[0]) throw fail(400, 'This class code is invalid or enrollment has closed. Ask your adviser for a current code.');
  return rows[0];
}

async function submitEnrollment(userId, payload) {
  const lrn = String(payload.lrn || '').trim();
  const fullName = String(payload.full_name || '').trim().replace(/\s+/g, ' ');
  const mobile = String(payload.mobile || '').replace(/[\s()-]/g, '').replace(/^\+63/, '0');
  const section = String(payload.section || '').trim();
  if (!/^\d{12}$/.test(lrn)) throw fail(400, 'Enter your 12-digit LRN.');
  if (fullName.length < 2 || fullName.length > 150 || !/^[\p{L}\p{M} .’'\-]+$/u.test(fullName)) throw fail(400, 'Enter your full name using letters and standard name punctuation (up to 150 characters).');
  if (!/^09\d{9}$/.test(mobile)) throw fail(400, 'Enter a Philippine mobile number starting with 09 or +639.');
  return db.transaction(async tx => {
    const existing = await getEnrollment(userId, tx);
    if (existing && existing.status !== 'REJECTED') throw fail(409, 'You already have an enrollment request.');
    const invitation = await findInvitation(payload.code, tx);
    if (!JSON.parse(invitation.sections_json).includes(section)) throw fail(400, 'Choose a section provided by your adviser.');
    const { rows: claims } = await tx.query('SELECT user_id FROM enrollment_requests WHERE lrn = ? AND user_id != ?', [lrn, userId]);
    const { rows: users } = await tx.query('SELECT id FROM users WHERE lrn_or_id = ? AND id != ?', [lrn, userId]);
    if (claims.length || users.length) throw fail(409, 'This LRN needs adviser assistance. Please contact your adviser.');
    if (existing) {
      await tx.query(`UPDATE enrollment_requests SET invitation_id = ?, lrn = ?, full_name = ?, mobile = ?, section = ?,
        status = 'PENDING', reason = NULL, reviewed_at = NULL, created_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      [invitation.id, lrn, fullName, mobile, section, userId]);
    } else {
      await tx.query(`INSERT INTO enrollment_requests (user_id, invitation_id, lrn, full_name, mobile, section)
        VALUES (?, ?, ?, ?, ?, ?)`, [userId, invitation.id, lrn, fullName, mobile, section]);
    }
    return getEnrollment(userId, tx);
  });
}

async function reviewEnrollment(teacherId, userId, status, reason) {
  if (!['APPROVED', 'REJECTED'].includes(status)) throw fail(400, 'Choose approve or reject.');
  const cleanReason = String(reason || '').trim().slice(0, 300);
  if (status === 'REJECTED' && !cleanReason) throw fail(400, 'Provide a reason so the student knows what to correct.');
  return db.transaction(async tx => {
    const request = await getEnrollment(userId, tx);
    if (!request || request.teacher_id !== teacherId) throw fail(404, 'Enrollment request not found.');
    const result = await tx.query(`UPDATE enrollment_requests SET status = ?, reason = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND status = 'PENDING'`, [status, cleanReason || null, userId]);
    if (!result.affectedRows) throw fail(409, 'This request has already been reviewed.');
    if (status === 'APPROVED') {
      const names = request.full_name.split(' ');
      await tx.query(`UPDATE users SET lrn_or_id = ?, full_name = ?, first_name = ?, last_name = ?, section = ?, section_id = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [request.lrn, request.full_name, names[0], names.slice(1).join(' ') || names[0], request.section, request.section, userId]);
    }
    return getEnrollment(userId, tx);
  });
}

module.exports = { initializeEnrollmentTables, getEnrollment, findInvitation, submitEnrollment, reviewEnrollment, hashCode, fail };
