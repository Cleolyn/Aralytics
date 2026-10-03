/**
 * Aralytics Account Initialization & User Seeding Script (SRS Section 5.1, FR-01..04)
 * Seeds DepEd AP10 Teacher and Student accounts with bcrypt-hashed credentials.
 */

const bcrypt = require('bcryptjs');
const db = require('../src/config/database');

async function seedUsers() {
  console.log('======================================================================');
  console.log('[ARALYTICS DB] Initializing User Accounts & Bcrypt Hashing...');
  console.log('======================================================================');

  const saltRounds = 10;
  const teacherHash = await bcrypt.hash('Teacher123!', saltRounds);
  const teacherLegacyHash = await bcrypt.hash('TeacherPass123!', saltRounds);
  const studentHash = await bcrypt.hash('Student123!', saltRounds);
  const studentLegacyHash = await bcrypt.hash('StudentPass123!', saltRounds);

  // Default Test Accounts Specification (FR-01, FR-02)
  const defaultAccounts = [
    // 1. Primary Teacher Account (Cleo Ponce)
    {
      id: 'usr-teacher-ap10',
      lrn_or_id: 'EMP-AP10-001',
      first_name: 'Cleo',
      last_name: 'Ponce',
      full_name: 'Cleo Ponce',
      email: 'teacher@ap10.edu.ph',
      password_hash: teacherHash,
      role: 'TEACHER',
      section: null,
      section_id: null
    },
    {
      id: 'usr-teacher-001',
      lrn_or_id: 'EMP-2026-001',
      first_name: 'Cleo',
      last_name: 'Ponce',
      full_name: 'Cleo Ponce',
      email: 'teacher@ponce.edu.ph',
      password_hash: teacherLegacyHash,
      role: 'TEACHER',
      section: null,
      section_id: null
    },

    // 2. Student Account 1 (Section: 10-Rizal)
    {
      id: 'usr-student-ap10-1',
      lrn_or_id: '123456789101',
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      full_name: 'Juan Dela Cruz',
      email: 'student1@ap10.edu.ph',
      password_hash: studentHash,
      role: 'STUDENT',
      section: '10-Rizal',
      section_id: '10-Rizal'
    },
    {
      id: 'usr-student-001',
      lrn_or_id: '123456789012',
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      full_name: 'Juan Dela Cruz',
      email: 'juan.delacruz@student.deped.gov.ph',
      password_hash: studentLegacyHash,
      role: 'STUDENT',
      section: '10-Rizal',
      section_id: '10-Rizal'
    },

    // 3. Student Account 2 (Section: 10-Bonifacio)
    {
      id: 'usr-student-ap10-2',
      lrn_or_id: '123456789102',
      first_name: 'Maria',
      last_name: 'Clara',
      full_name: 'Maria Clara',
      email: 'student2@ap10.edu.ph',
      password_hash: studentHash,
      role: 'STUDENT',
      section: '10-Bonifacio',
      section_id: '10-Bonifacio'
    },
    {
      id: 'usr-student-002',
      lrn_or_id: '123456789013',
      first_name: 'Maria',
      last_name: 'Clara',
      full_name: 'Maria Clara',
      email: 'maria.clara@student.deped.gov.ph',
      password_hash: studentLegacyHash,
      role: 'STUDENT',
      section: '10-Bonifacio',
      section_id: '10-Bonifacio'
    },

    // 4. Student Account 3 (Section: 10-Luna)
    {
      id: 'usr-student-ap10-3',
      lrn_or_id: '123456789103',
      first_name: 'Andres',
      last_name: 'Bonifacio',
      full_name: 'Andres Bonifacio',
      email: 'student3@ap10.edu.ph',
      password_hash: studentHash,
      role: 'STUDENT',
      section: '10-Luna',
      section_id: '10-Luna'
    },
    {
      id: 'usr-student-003',
      lrn_or_id: '123456789014',
      first_name: 'Andres',
      last_name: 'Bonifacio',
      full_name: 'Andres Bonifacio',
      email: 'andres.bonifacio@student.deped.gov.ph',
      password_hash: studentLegacyHash,
      role: 'STUDENT',
      section: '10-Bonifacio',
      section_id: '10-Bonifacio'
    }
  ];

  for (const acc of defaultAccounts) {
    // Check if user with this id, email, or lrn_or_id already exists
    const { rows } = await db.query(
      `SELECT id FROM users WHERE id = ? OR email = ? OR lrn_or_id = ? LIMIT 1`,
      [acc.id, acc.email, acc.lrn_or_id]
    );

    if (rows.length > 0) {
      // Update existing record
      await db.query(
        `UPDATE users 
         SET first_name = ?, last_name = ?, full_name = ?, email = ?, lrn_or_id = ?, password_hash = ?, role = ?, section = ?, section_id = ?
         WHERE id = ?`,
        [
          acc.first_name,
          acc.last_name,
          acc.full_name,
          acc.email,
          acc.lrn_or_id,
          acc.password_hash,
          acc.role,
          acc.section,
          acc.section_id,
          rows[0].id
        ]
      );
      console.log(`[SEED OK] Updated existing user account: ${acc.email} [${acc.role}]`);
    } else {
      // Insert new user
      await db.query(
        `INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role, section, section_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          acc.id,
          acc.lrn_or_id,
          acc.first_name,
          acc.last_name,
          acc.full_name,
          acc.email,
          acc.password_hash,
          acc.role,
          acc.section,
          acc.section_id
        ]
      );
      console.log(`[SEED OK] Created test user account: ${acc.email} [${acc.role}]`);
    }
  }

  console.log('======================================================================');
  console.log('[ALL USERS SEEDED] Accounts are ready for Authentication testing.');
  console.log('  Teacher: teacher@ap10.edu.ph / Teacher123!');
  console.log('  Student 1: student1@ap10.edu.ph / Student123! (Section: 10-Rizal)');
  console.log('  Student 2: student2@ap10.edu.ph / Student123! (Section: 10-Bonifacio)');
  console.log('  Student 3: student3@ap10.edu.ph / Student123! (Section: 10-Luna)');
  console.log('======================================================================');
}

// Execute directly if run via CLI
if (require.main === module) {
  seedUsers()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[SEED ERROR] Failed to seed users:', err);
      process.exit(1);
    });
}

module.exports = { seedUsers };
