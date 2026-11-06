// Students only see content from their approved adviser. Direct-controller suites call this to put a
// seeded student in a seeded teacher's class (idempotent).
async function enrollDemoStudent(db, studentId = 'usr-student-001', teacherId = 'usr-teacher-001') {
  const invitation = `inv-demo-${teacherId}`;
  await db.query(`INSERT OR IGNORE INTO class_invitations (id, teacher_id, school_year, sections_json, code_hash)
    VALUES (?, ?, '2026-2027', '["10-Rizal"]', ?)`, [invitation, teacherId, `hash-${invitation}`]);
  await db.query(`INSERT OR REPLACE INTO enrollment_requests (user_id, invitation_id, lrn, full_name, mobile, section, status)
    VALUES (?, ?, ?, 'Demo Student', '09171234567', '10-Rizal', 'APPROVED')`, [studentId, invitation, studentId === 'usr-student-001' ? '123456789012' : '123456789999']);
}
module.exports = { enrollDemoStudent };
