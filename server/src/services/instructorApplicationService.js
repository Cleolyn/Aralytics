/**
 * Instructor applications: the only way an account becomes a TEACHER.
 *
 * A signed-in, verified account that is not a student in a class submits an
 * application; an ADMIN approves (role -> TEACHER) or rejects it with a reason.
 * Rejected applicants may correct their details and resubmit.
 */
const db = require('../config/database');
const { getEnrollment, fail } = require('./enrollmentService');

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const NAME = /^[\p{L}\p{M} .’'\-]+$/u;

async function initializeInstructorApplicationTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS instructor_applications (
    user_id VARCHAR(36) PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    school VARCHAR(150) NOT NULL,
    position VARCHAR(100) NOT NULL,
    employee_id VARCHAR(50),
    mobile VARCHAR(20) NOT NULL,
    message VARCHAR(1000),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reason VARCHAR(300),
    reviewed_by VARCHAR(36),
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
}

const APPLICATION_COLUMNS = `a.user_id, a.full_name, a.school, a.position, a.employee_id, a.mobile, a.message,
  a.status, a.reason, a.reviewed_at, a.created_at, u.email, u.role, r.full_name AS reviewed_by_name`;
const APPLICATION_JOINS = `FROM instructor_applications a JOIN users u ON u.id = a.user_id
  LEFT JOIN users r ON r.id = a.reviewed_by`;

async function getApplication(userId, connection = db) {
  const { rows } = await connection.query(`SELECT ${APPLICATION_COLUMNS} ${APPLICATION_JOINS} WHERE a.user_id = ?`, [userId]);
  return rows[0] || null;
}

async function listApplications(status) {
  if (status && !STATUSES.includes(status)) throw fail(400, 'Unknown application status.');
  const { rows } = await db.query(
    `SELECT ${APPLICATION_COLUMNS} ${APPLICATION_JOINS} ${status ? 'WHERE a.status = ?' : ''}
     ORDER BY CASE a.status WHEN 'PENDING' THEN 0 ELSE 1 END, a.created_at DESC`,
    status ? [status] : []
  );
  return rows;
}

function cleanApplication(payload = {}) {
  const text = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max + 1);
  const application = {
    full_name: text(payload.full_name, 150),
    school: text(payload.school, 150),
    position: text(payload.position, 100),
    employee_id: text(payload.employee_id, 50),
    mobile: String(payload.mobile ?? '').replace(/[\s()-]/g, '').replace(/^\+63/, '0'),
    message: String(payload.message ?? '').trim().slice(0, 1001)
  };
  if (application.full_name.length < 2 || application.full_name.length > 150 || !NAME.test(application.full_name)) {
    throw fail(400, 'Enter your full name using letters and standard name punctuation (up to 150 characters).');
  }
  if (application.school.length < 2 || application.school.length > 150) throw fail(400, 'Enter the school where you teach (up to 150 characters).');
  if (application.position.length < 2 || application.position.length > 100) throw fail(400, 'Enter your position, such as Teacher I (up to 100 characters).');
  if (application.employee_id.length > 50 || (application.employee_id && !/^[\p{L}\p{N} ./-]+$/u.test(application.employee_id))) {
    throw fail(400, 'Employee ID may contain letters, numbers, spaces, dots, slashes, and hyphens (up to 50 characters).');
  }
  if (!/^09\d{9}$/.test(application.mobile)) throw fail(400, 'Enter a Philippine mobile number starting with 09 or +639.');
  if (application.message.length > 1000) throw fail(400, 'Keep your note to 1000 characters.');
  return application;
}

async function submitApplication(user, payload) {
  if (user.role !== 'STUDENT') throw fail(409, 'This account already has staff access.');
  const application = cleanApplication(payload);
  return db.transaction(async tx => {
    const enrollment = await getEnrollment(user.id, tx);
    if (enrollment && enrollment.status !== 'REJECTED') {
      throw fail(409, 'This account is enrolled as a student. Use a separate account to apply as an instructor.');
    }
    const existing = await getApplication(user.id, tx);
    if (existing?.status === 'PENDING') throw fail(409, 'Your application is already waiting for review.');
    if (existing?.status === 'APPROVED') throw fail(409, 'Your application was already approved.');
    const values = [application.full_name, application.school, application.position, application.employee_id || null,
      application.mobile, application.message || null];
    if (existing) {
      await tx.query(`UPDATE instructor_applications SET full_name = ?, school = ?, position = ?, employee_id = ?, mobile = ?,
        message = ?, status = 'PENDING', reason = NULL, reviewed_by = NULL, reviewed_at = NULL, created_at = CURRENT_TIMESTAMP
        WHERE user_id = ?`, [...values, user.id]);
    } else {
      await tx.query(`INSERT INTO instructor_applications (full_name, school, position, employee_id, mobile, message, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [...values, user.id]);
    }
    return getApplication(user.id, tx);
  });
}

async function reviewApplication(adminId, userId, status, reason) {
  if (!['APPROVED', 'REJECTED'].includes(status)) throw fail(400, 'Choose approve or reject.');
  const cleanReason = String(reason || '').trim().slice(0, 300);
  if (status === 'REJECTED' && !cleanReason) throw fail(400, 'Provide a reason so the applicant knows what to correct.');
  if (adminId === userId) throw fail(403, 'You cannot review your own application.');
  return db.transaction(async tx => {
    const application = await getApplication(userId, tx);
    if (!application) throw fail(404, 'Application not found.');
    if (status === 'APPROVED') {
      const enrollment = await getEnrollment(userId, tx);
      if (enrollment && enrollment.status !== 'REJECTED') {
        throw fail(409, 'This account is enrolled as a student and cannot be approved as an instructor.');
      }
    }
    const result = await tx.query(`UPDATE instructor_applications SET status = ?, reason = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND status = 'PENDING'`, [status, cleanReason || null, adminId, userId]);
    if (!result.affectedRows) throw fail(409, 'This application has already been reviewed.');
    if (status === 'APPROVED') {
      const names = application.full_name.split(' ');
      const promoted = await tx.query(`UPDATE users SET role = 'TEACHER', full_name = ?, first_name = ?, last_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND role = 'STUDENT'`, [application.full_name, names[0], names.slice(1).join(' ') || names[0], userId]);
      if (!promoted.affectedRows) throw fail(409, 'This account can no longer be made an instructor.');
    }
    return getApplication(userId, tx);
  });
}

async function listInstructors() {
  const { rows } = await db.query(`SELECT u.id, u.email, u.full_name, u.first_name, u.last_name, u.created_at,
      a.school, a.position, a.reviewed_at AS approved_at,
      (SELECT COUNT(*) FROM class_invitations i WHERE i.teacher_id = u.id AND i.active = 1) AS active_class_codes,
      (SELECT COUNT(*) FROM enrollment_requests e JOIN class_invitations i ON i.id = e.invitation_id
        WHERE i.teacher_id = u.id AND e.status = 'APPROVED') AS students
    FROM users u LEFT JOIN instructor_applications a ON a.user_id = u.id
    WHERE u.role = 'TEACHER' ORDER BY u.full_name`);
  return rows.map(row => ({ ...row, active_class_codes: Number(row.active_class_codes), students: Number(row.students) }));
}

async function applicationSummary() {
  const { rows } = await db.query(`SELECT status, COUNT(*) AS count FROM instructor_applications GROUP BY status`);
  const { rows: teachers } = await db.query(`SELECT COUNT(*) AS count FROM users WHERE role = 'TEACHER'`);
  const counts = Object.fromEntries(STATUSES.map(s => [s, 0]));
  for (const row of rows) counts[row.status] = Number(row.count);
  return { pending: counts.PENDING, approved: counts.APPROVED, rejected: counts.REJECTED, instructors: Number(teachers[0].count) };
}

module.exports = {
  initializeInstructorApplicationTables, getApplication, listApplications, submitApplication,
  reviewApplication, listInstructors, applicationSummary
};
