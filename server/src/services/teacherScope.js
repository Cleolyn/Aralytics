/**
 * Which students a teacher may see: learners with an APPROVED enrollment under one of the
 * teacher's own class codes. Admins and internal callers (seeds, reports scripts) are unscoped.
 */
const db = require('../config/database');

const ADVISEES = `SELECT e.user_id FROM enrollment_requests e
  JOIN class_invitations ci ON ci.id = e.invitation_id
  WHERE ci.teacher_id = ? AND e.status = 'APPROVED'`;

/** The teacher id to scope by, or null when the caller sees everyone. */
function scopeOf(user) {
  return user?.role === 'TEACHER' ? (user.id || user.user_id) : null;
}

/** Appends `AND <column> IN (advisees)` to a query when a teacher id is given. */
function restrict(query, params, column, teacherId) {
  if (!teacherId) return query;
  params.push(teacherId);
  return `${query} AND ${column} IN (${ADVISEES})`;
}

async function isAdvisee(teacherId, studentId) {
  if (!teacherId) return true;
  const { rows } = await db.query(`SELECT 1 AS ok FROM (${ADVISEES}) a WHERE a.user_id = ? LIMIT 1`, [teacherId, studentId]);
  return rows.length > 0;
}

function notYourStudent() {
  return Object.assign(new Error('This learner is not in one of your classes.'), { status: 404, statusCode: 404 });
}

async function requireAdvisee(teacherId, studentId) {
  if (!(await isAdvisee(teacherId, studentId))) throw notYourStudent();
}

module.exports = { ADVISEES, scopeOf, restrict, isAdvisee, requireAdvisee, notYourStudent };
