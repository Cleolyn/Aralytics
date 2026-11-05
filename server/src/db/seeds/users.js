/**
 * Demo teacher and student records (SRS 5.1, FR-01..04).
 *
 * These are database fixtures only. Sign-in is handled by Clerk, so they have no
 * password; a real Clerk sign-in provisions its own user row via POST /api/auth/sync.
 */
const db = require('../../config/database');

const CLERK_MANAGED = 'CLERK_MANAGED_AUTH';

const DEMO_ACCOUNTS = [
  { id: 'usr-teacher-ap10', lrn_or_id: 'EMP-AP10-001', first_name: 'Cleo', last_name: 'Ponce', email: 'teacher@ap10.edu.ph', role: 'TEACHER', section: null },
  { id: 'usr-teacher-001', lrn_or_id: 'EMP-2026-001', first_name: 'Cleo', last_name: 'Ponce', email: 'teacher@ponce.edu.ph', role: 'TEACHER', section: null },
  { id: 'usr-student-ap10-1', lrn_or_id: '123456789101', first_name: 'Juan', last_name: 'Dela Cruz', email: 'student1@ap10.edu.ph', role: 'STUDENT', section: '10-Rizal' },
  { id: 'usr-student-001', lrn_or_id: '123456789012', first_name: 'Juan', last_name: 'Dela Cruz', email: 'juan.delacruz@student.deped.gov.ph', role: 'STUDENT', section: '10-Rizal' },
  { id: 'usr-student-ap10-2', lrn_or_id: '123456789102', first_name: 'Maria', last_name: 'Clara', email: 'student2@ap10.edu.ph', role: 'STUDENT', section: '10-Bonifacio' },
  { id: 'usr-student-002', lrn_or_id: '123456789013', first_name: 'Maria', last_name: 'Clara', email: 'maria.clara@student.deped.gov.ph', role: 'STUDENT', section: '10-Bonifacio' },
  { id: 'usr-student-ap10-3', lrn_or_id: '123456789103', first_name: 'Andres', last_name: 'Bonifacio', email: 'student3@ap10.edu.ph', role: 'STUDENT', section: '10-Luna' },
  { id: 'usr-student-003', lrn_or_id: '123456789014', first_name: 'Andres', last_name: 'Bonifacio', email: 'andres.bonifacio@student.deped.gov.ph', role: 'STUDENT', section: '10-Bonifacio' }
];

async function seedUsers() {
  for (const account of DEMO_ACCOUNTS) {
    const fullName = `${account.first_name} ${account.last_name}`;
    const values = [
      account.first_name, account.last_name, fullName, account.email, account.lrn_or_id,
      CLERK_MANAGED, account.role, account.section, account.section
    ];

    // Match on id, email, or LRN so re-running never creates duplicates.
    const { rows } = await db.query(
      'SELECT id FROM users WHERE id = ? OR email = ? OR lrn_or_id = ? LIMIT 1',
      [account.id, account.email, account.lrn_or_id]
    );

    if (rows.length > 0) {
      await db.query(
        `UPDATE users
         SET first_name = ?, last_name = ?, full_name = ?, email = ?, lrn_or_id = ?, password_hash = ?, role = ?, section = ?, section_id = ?
         WHERE id = ?`,
        [...values, rows[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO users (first_name, last_name, full_name, email, lrn_or_id, password_hash, role, section, section_id, id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...values, account.id]
      );
    }
  }
  console.log(`[SEED] ${DEMO_ACCOUNTS.length} demo teacher/student records ready.`);
}

module.exports = { seedUsers, DEMO_ACCOUNTS };
