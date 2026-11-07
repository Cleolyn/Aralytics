/**
 * Roster definition for the 157 Aralytics demo & test accounts:
 * - 1 School Administrator (ADMIN)
 * - 3 Approved Instructors (TEACHER) across 4 sections + 1 Pending Applicant
 * - 140 Enrolled Students (35 per section x 4 sections: 10-Rizal, 10-Bonifacio, 10-Luna, 10-Mabini)
 * - 12 Unassigned / Onboarding Students (4 PENDING, 2 REJECTED, 6 NOT_ENROLLED)
 */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'AralyticsDemo2026!';
const EMAIL_DOMAIN = 'aralytics.edu.ph';
const SCHOOL_NAME = 'Ponce National High School';
const SCHOOL_YEAR = '2026-2027';

const FIRST_NAMES = [
  'Juan', 'Maria', 'Jose', 'Andres', 'Melchora', 'Gabriela', 'Emilio', 'Apolinario', 'Antonio', 'Gregoria',
  'Marcelo', 'Trinidad', 'Diego', 'Marcela', 'Pio', 'Teodora', 'Mariano', 'Josefa', 'Vicente', 'Teresa',
  'Miguel', 'Leona', 'Graciano', 'Marina', 'artemio', 'Agueda', 'Macario', 'Patrocinio', 'Julian', 'Hilaria',
  'Epifanio', 'Clemencia', 'valeriano', 'Gliceria', 'Isabelo'
].map(n => n.charAt(0).toUpperCase() + n.slice(1));

const LAST_NAMES_BY_SECTION = {
  '10-Rizal': [
    'Dela Cruz', 'Santos', 'Reyes', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Tomas', 'Andrada',
    'Castillo', 'Flores', 'Villanueva', 'Ramos', 'Castro', 'Rivera', 'Aquino', 'Navarro', 'Salazar', 'Mercado',
    'Tolentino', 'Valdez', 'Soriano', 'Pascual', 'Aguilar', 'Morales', 'Santiago', 'Rosales', 'Gomez', 'Diaz',
    'Fernandez', 'Lopez', 'Perez', 'De Guzman', 'Velasco'
  ],
  '10-Bonifacio': [
    'Bonifacio', 'Jacinto', 'De Jesus', 'Valenzuela', 'Arellano', 'Diwa', 'Plata', 'Dizon', 'kalaw', 'Ponce',
    'Mabini', 'Agoncillo', 'Palma', 'Evangelista', 'Alvarez', 'Ricarte', 'Trias', 'Mascardo', 'Natividad', 'Llanera',
    'Tinio', 'Malvar', 'Lukban', 'Belarmino', 'Capistrano', 'Fullon', 'Delgado', 'Maxilom', 'Climaco', 'Hernandez',
    'Abad', 'Tecson', 'Kahabagan', 'Magbanua', 'Montoya'
  ].map(n => n.charAt(0).toUpperCase() + n.slice(1)),
  '10-Luna': [
    'Luna', 'Hidalgo', 'Paterno', 'Jaena', 'Del Pilar', 'Panganiban', 'Regidor', 'Basa', 'Jugo', 'Ventura',
    'Alejandrino', 'Sandiko', 'Bugallon', 'Concepcion', 'Hizon', 'Makabulos', 'Servando', 'Torres', 'Veyra', 'Guerrero',
    'Apostol', 'Bernal', 'bañas', 'Carreon', 'Daclan', 'Enriquez', 'Fajardo', 'Gatchalian', 'Ilagan', 'Jocson',
    'Katigbak', 'Laurel', 'Manalo', 'Nolasco', 'Orosa'
  ].map(n => n.charAt(0).toUpperCase() + n.slice(1)),
  '10-Mabini': [
    'Silang', 'Cariño', 'Dagohoy', 'Palaris', 'Sumuroy', 'Tamblot', 'Bankaw', 'Maniago', 'Malong', 'Almazan',
    'Tapar', 'Lakandula', 'Sulayman', 'Magat', 'Salamangka', 'Tupas', 'Sikatuna', 'Kudarat', 'Buisan', 'Corralat',
    'Aman', 'Dula', 'Gatbonton', 'Halili', 'Imperial', 'Jalandoni', 'Kalaw', 'Ledesma', 'Marasigan', 'Nakpil',
    'Ongpin', 'Pangan', 'Quirino', 'Recto', 'Tañada'
  ]
};

const INSTRUCTORS = [
  {
    key: 'teacher-ponce',
    fallback_id: 'usr-teacher-001',
    first_name: 'Cleo',
    last_name: 'Ponce',
    email: `teacher.ponce+clerk_test@${EMAIL_DOMAIN}`,
    role: 'TEACHER',
    lrn_or_id: 'DEPED-T1-2026',
    employee_id: 'DEPED-T1-2026',
    position: 'Master Teacher I',
    school: SCHOOL_NAME,
    mobile: '09171001001',
    application_status: 'APPROVED',
    sections: ['10-Rizal', '10-Bonifacio'],
    class_code: 'RIZAL2026A',
    invitation_id: 'inv-demo-ponce-2026',
    notes: 'Adviser for 10-Rizal (35) & 10-Bonifacio (35). Owns 4 Q1 quizzes + 1 archived quiz, 3 tasks, 6 lessons.'
  },
  {
    key: 'teacher-magsaysay',
    fallback_id: 'usr-teacher-002',
    first_name: 'Ramon',
    last_name: 'Magsaysay',
    email: `teacher.magsaysay+clerk_test@${EMAIL_DOMAIN}`,
    role: 'TEACHER',
    lrn_or_id: 'DEPED-T2-2026',
    employee_id: 'DEPED-T2-2026',
    position: 'Teacher III',
    school: SCHOOL_NAME,
    mobile: '09171001002',
    application_status: 'APPROVED',
    sections: ['10-Luna'],
    class_code: 'LUNAMAB26B',
    invitation_id: 'inv-demo-magsaysay-2026',
    notes: 'Adviser for 10-Luna (35). Owns 2 Q1 quizzes, 3 deadline-varied tasks, 3 lessons.'
  },
  {
    key: 'teacher-tecson',
    fallback_id: 'usr-teacher-003',
    first_name: 'Trinidad',
    last_name: 'Tecson',
    email: `teacher.tecson+clerk_test@${EMAIL_DOMAIN}`,
    role: 'TEACHER',
    lrn_or_id: 'DEPED-T3-2026',
    employee_id: 'DEPED-T3-2026',
    position: 'Teacher II',
    school: SCHOOL_NAME,
    mobile: '09171001003',
    application_status: 'APPROVED',
    sections: ['10-Mabini'],
    class_code: 'MABINI2026',
    invitation_id: 'inv-demo-tecson-2026',
    notes: 'Adviser for 10-Mabini (35). Owns 2 Q1 quizzes, 3 deadline-varied tasks, 3 lessons.'
  },
  {
    key: 'applicant-silang',
    fallback_id: 'usr-applicant-004',
    first_name: 'Gabriela',
    last_name: 'Silang',
    email: `applicant.silang+clerk_test@${EMAIL_DOMAIN}`,
    role: 'STUDENT',
    lrn_or_id: 'DEPED-T4-2026',
    employee_id: 'DEPED-T4-2026',
    position: 'Teacher I',
    school: SCHOOL_NAME,
    mobile: '09171001004',
    application_status: 'PENDING',
    sections: [],
    class_code: null,
    invitation_id: null,
    notes: 'Pending instructor applicant — appears in Admin "Waiting for review" tab.'
  }
];

const ADMIN_ACCOUNT = {
  key: 'admin-main',
  fallback_id: 'usr-admin-001',
  first_name: 'Eulyn',
  last_name: 'Admin',
  email: `admin+clerk_test@${EMAIL_DOMAIN}`,
  role: 'ADMIN',
  lrn_or_id: 'ADM-2026-001',
  section: null,
  enrollment_status: 'NOT_ENROLLED',
  cohort_group: 'Staff / Admin',
  profile_type: 'School Administrator',
  notes: 'Full school administrator access (/admin). Reviews instructor applications, storage, people, and audit logs.'
};

const SECTION_CONFIGS = [
  { section: '10-Rizal', slug: 'rizal', lrnPrefix: '10202601', teacherKey: 'teacher-ponce', adviserName: 'Cleo Ponce', classCode: 'RIZAL2026A', invitationId: 'inv-demo-ponce-2026' },
  { section: '10-Bonifacio', slug: 'bonifacio', lrnPrefix: '10202602', teacherKey: 'teacher-ponce', adviserName: 'Cleo Ponce', classCode: 'RIZAL2026A', invitationId: 'inv-demo-ponce-2026' },
  { section: '10-Luna', slug: 'luna', lrnPrefix: '10202603', teacherKey: 'teacher-magsaysay', adviserName: 'Ramon Magsaysay', classCode: 'LUNAMAB26B', invitationId: 'inv-demo-magsaysay-2026' },
  { section: '10-Mabini', slug: 'mabini', lrnPrefix: '10202604', teacherKey: 'teacher-tecson', adviserName: 'Trinidad Tecson', classCode: 'MABINI2026', invitationId: 'inv-demo-tecson-2026' }
];

function classifyStudentSlot(slot) {
  if (slot <= 4) {
    return {
      profile_type: 'Scored — Needs Practice (Flagged)',
      tier: 'NEEDS_INTERVENTION',
      blur_count: slot === 1 ? 4 : 3,
      target_ratio: 0.45 + (slot * 0.04),
      task_state: 'GRADED',
      task_score: 74 + slot,
      intervention_status: slot <= 2 ? 'RECOMMENDED' : 'ASSIGNED',
      quick_pick: slot === 1,
      notes: `Low quiz score (<70%) + ${slot === 1 ? 4 : 3} tab-switch proctoring flags. Active remediation plan & graded task.`
    };
  }
  if (slot <= 10) {
    return {
      profile_type: 'Scored — Needs Practice',
      tier: 'NEEDS_INTERVENTION',
      blur_count: slot % 2 === 0 ? 1 : 0,
      target_ratio: 0.52 + ((slot - 5) * 0.025),
      task_state: 'GRADED',
      task_score: 78 + (slot - 5),
      intervention_status: slot % 2 === 0 ? 'ASSIGNED' : 'RECOMMENDED',
      quick_pick: false,
      notes: 'Low quiz score (<70%) with clean proctoring. Queued in teacher Student Support.'
    };
  }
  if (slot <= 18) {
    return {
      profile_type: 'Scored — Developing Tier',
      tier: 'DEVELOPING',
      blur_count: 0,
      target_ratio: 0.72 + ((slot - 11) * 0.015),
      task_state: 'GRADED',
      task_score: 84 + (slot - 11),
      intervention_status: null,
      quick_pick: false,
      notes: 'Developing mastery (70%–84%) across quizzes, 1 graded performance task.'
    };
  }
  if (slot <= 25) {
    return {
      profile_type: 'Scored — Mastered Tier',
      tier: 'MASTERED',
      blur_count: 0,
      target_ratio: 0.88 + ((slot - 19) * 0.018),
      task_state: 'GRADED',
      task_score: 92 + (slot - 19),
      intervention_status: null,
      quick_pick: slot === 19,
      notes: 'High mastery (85%–100%) across quizzes, 1 graded performance task.'
    };
  }
  if (slot <= 30) {
    return {
      profile_type: 'Task Submitted (Needs Teacher Grade)',
      tier: 'DEVELOPING',
      blur_count: 0,
      target_ratio: 0.78,
      task_state: 'SUBMITTED',
      task_score: null,
      intervention_status: null,
      quick_pick: slot === 26,
      notes: 'Completed 1 quiz + uploaded an ungraded PDF task waiting in teacher Gradebook -> Class tasks.'
    };
  }
  return {
    profile_type: 'Clean Slate (Enrolled, 0 Submissions)',
    tier: 'UNASSESSED',
    blur_count: 0,
    target_ratio: null,
    task_state: 'NONE',
    task_score: null,
    intervention_status: null,
    quick_pick: slot === 31,
    notes: 'Approved in class with 0 quiz attempts & 0 task uploads. Use to test taking quizzes, deadlines & uploads live.'
  };
}

function buildEnrolledStudents() {
  const students = [];
  for (const cfg of SECTION_CONFIGS) {
    const lastNames = LAST_NAMES_BY_SECTION[cfg.section];
    for (let slot = 1; slot <= 35; slot++) {
      const num = String(slot).padStart(2, '0');
      const firstName = FIRST_NAMES[(slot - 1) % FIRST_NAMES.length];
      const lastName = lastNames[(slot - 1) % lastNames.length];
      const lrn = `${cfg.lrnPrefix}${String(slot).padStart(4, '0')}`;
      const meta = classifyStudentSlot(slot);
      // Preserve usr-student-001 .. 003 for backward compatibility with existing seed references on Rizal/Bonifacio slot 1
      let fallbackId = `usr-${cfg.slug}-${num}`;
      if (cfg.section === '10-Rizal' && slot === 1) fallbackId = 'usr-student-001';
      if (cfg.section === '10-Rizal' && slot === 19) fallbackId = 'usr-student-002';
      if (cfg.section === '10-Bonifacio' && slot === 1) fallbackId = 'usr-student-003';

      const clerkPriority = (
        slot <= 6 ||
        (slot === 7 && (cfg.section === '10-Rizal' || cfg.section === '10-Bonifacio')) ||
        slot === 11 || slot === 12 ||
        slot === 19 || slot === 20 ||
        slot >= 26
      );

      students.push({
        key: `${cfg.slug}-${num}`,
        fallback_id: fallbackId,
        slot,
        clerk_priority: clerkPriority,
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
        email: `${cfg.slug}.${num}+clerk_test@${EMAIL_DOMAIN}`,
        role: 'STUDENT',
        lrn_or_id: lrn,
        mobile: `0917${cfg.lrnPrefix.slice(-3)}${String(slot).padStart(4, '0')}`,
        section: cfg.section,
        teacher_key: cfg.teacherKey,
        adviser_name: cfg.adviserName,
        class_code: cfg.classCode,
        invitation_id: cfg.invitationId,
        enrollment_status: 'APPROVED',
        cohort_group: cfg.section,
        ...meta
      });
    }
  }
  return students;
}

const UNASSIGNED_STUDENTS = [
  {
    key: 'pending-01', fallback_id: 'usr-pending-01', first_name: 'Diego', last_name: 'Silang',
    email: `pending.01+clerk_test@${EMAIL_DOMAIN}`, role: 'STUDENT', lrn_or_id: '102026990001', mobile: '09179990001',
    section: '10-Rizal', teacher_key: 'teacher-ponce', adviser_name: 'Cleo Ponce', class_code: 'RIZAL2026A',
    invitation_id: 'inv-demo-ponce-2026', enrollment_status: 'PENDING', cohort_group: 'Unassigned / Onboarding',
    profile_type: 'Waiting for Adviser Approval (PENDING)', quick_pick: true,
    notes: 'Submitted class code RIZAL2026A for 10-Rizal. Waiting in Teacher Cleo Ponce’s approval list.'
  },
  {
    key: 'pending-02', fallback_id: 'usr-pending-02', first_name: 'Teresa', last_name: 'Magbanua',
    email: `pending.02+clerk_test@${EMAIL_DOMAIN}`, role: 'STUDENT', lrn_or_id: '102026990002', mobile: '09179990002',
    section: '10-Bonifacio', teacher_key: 'teacher-ponce', adviser_name: 'Cleo Ponce', class_code: 'RIZAL2026A',
    invitation_id: 'inv-demo-ponce-2026', enrollment_status: 'PENDING', cohort_group: 'Unassigned / Onboarding',
    profile_type: 'Waiting for Adviser Approval (PENDING)', quick_pick: false,
    notes: 'Submitted class code RIZAL2026A for 10-Bonifacio. Waiting in Teacher Cleo Ponce’s approval list.'
  },
  {
    key: 'pending-03', fallback_id: 'usr-pending-03', first_name: 'Artemio', last_name: 'Ricarte',
    email: `pending.03+clerk_test@${EMAIL_DOMAIN}`, role: 'STUDENT', lrn_or_id: '102026990003', mobile: '09179990003',
    section: '10-Luna', teacher_key: 'teacher-magsaysay', adviser_name: 'Ramon Magsaysay', class_code: 'LUNAMAB26B',
    invitation_id: 'inv-demo-magsaysay-2026', enrollment_status: 'PENDING', cohort_group: 'Unassigned / Onboarding',
    profile_type: 'Waiting for Adviser Approval (PENDING)', quick_pick: false,
    notes: 'Submitted class code LUNAMAB26B for 10-Luna. Waiting in Teacher Ramon Magsaysay’s approval list.'
  },
  {
    key: 'pending-04', fallback_id: 'usr-pending-04', first_name: 'Agueda', last_name: 'Kahabagan',
    email: `pending.04+clerk_test@${EMAIL_DOMAIN}`, role: 'STUDENT', lrn_or_id: '102026990004', mobile: '09179990004',
    section: '10-Mabini', teacher_key: 'teacher-tecson', adviser_name: 'Trinidad Tecson', class_code: 'MABINI2026',
    invitation_id: 'inv-demo-tecson-2026', enrollment_status: 'PENDING', cohort_group: 'Unassigned / Onboarding',
    profile_type: 'Waiting for Adviser Approval (PENDING)', quick_pick: false,
    notes: 'Submitted class code MABINI2026 for 10-Mabini. Waiting in Teacher Trinidad Tecson’s approval list.'
  },
  {
    key: 'returned-01', fallback_id: 'usr-returned-01', first_name: 'Marcelo', last_name: 'Del Pilar',
    email: `returned.01+clerk_test@${EMAIL_DOMAIN}`, role: 'STUDENT', lrn_or_id: '102026990005', mobile: '09179990005',
    section: '10-Rizal', teacher_key: 'teacher-ponce', adviser_name: 'Cleo Ponce', class_code: 'RIZAL2026A',
    invitation_id: 'inv-demo-ponce-2026', enrollment_status: 'REJECTED',
    rejection_reason: 'Please verify your 12-digit LRN on your school ID card and select your assigned section.',
    cohort_group: 'Unassigned / Onboarding', profile_type: 'Returned Enrollment (REJECTED)', quick_pick: true,
    notes: 'Lands on /onboarding showing the adviser’s return reason; ready to re-enter a class code.'
  },
  {
    key: 'returned-02', fallback_id: 'usr-returned-02', first_name: 'Graciano', last_name: 'Lopez Jaena',
    email: `returned.02+clerk_test@${EMAIL_DOMAIN}`, role: 'STUDENT', lrn_or_id: '102026990006', mobile: '09179990006',
    section: '10-Luna', teacher_key: 'teacher-magsaysay', adviser_name: 'Ramon Magsaysay', class_code: 'LUNAMAB26B',
    invitation_id: 'inv-demo-magsaysay-2026', enrollment_status: 'REJECTED',
    rejection_reason: 'You selected 10-Luna, but your name is listed under 10-Rizal. Check with your adviser.',
    cohort_group: 'Unassigned / Onboarding', profile_type: 'Returned Enrollment (REJECTED)', quick_pick: false,
    notes: 'Lands on /onboarding showing the adviser’s return reason.'
  },
  ...[
    ['01', 'Lapu', 'Lapu', '102026990007', true],
    ['02', 'Sultan', 'Kudarat', '102026990008', true],
    ['03', 'Rajah', 'Sulayman', '102026990009', false],
    ['04', 'Francisco', 'Dagohoy', '102026990010', false],
    ['05', 'Panday', 'Pira', '102026990011', false],
    ['06', 'Prinsesa', 'Urduja', '102026990012', false]
  ].map(([num, first, last, suggestedLrn, quickPick]) => ({
    key: `new-student-${num}`,
    fallback_id: `usr-new-student-${num}`,
    first_name: first,
    last_name: last,
    email: `new.student${num}+clerk_test@${EMAIL_DOMAIN}`,
    role: 'STUDENT',
    lrn_or_id: `account:usr-new-student-${num}`,
    suggested_lrn: suggestedLrn,
    mobile: `091799900${num}`,
    section: null,
    teacher_key: null,
    adviser_name: null,
    class_code: 'RIZAL2026A / LUNAMAB26B / MABINI2026',
    invitation_id: null,
    enrollment_status: 'NOT_ENROLLED',
    cohort_group: 'Unassigned / Onboarding',
    profile_type: 'Brand-New Unassigned Account (NOT_ENROLLED)',
    quick_pick: quickPick,
    notes: `Fresh account with no class or application yet. Lands on /onboarding — use LRN ${suggestedLrn} with code RIZAL2026A, LUNAMAB26B, or MABINI2026, or click "Apply for instructor access".`
  }))
];

module.exports = {
  DEMO_PASSWORD,
  EMAIL_DOMAIN,
  SCHOOL_NAME,
  SCHOOL_YEAR,
  ADMIN_ACCOUNT,
  INSTRUCTORS,
  SECTION_CONFIGS,
  ENROLLED_STUDENTS: buildEnrolledStudents(),
  UNASSIGNED_STUDENTS
};
