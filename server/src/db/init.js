const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function initializeDatabase() {
  console.log(`[ARALYTICS DB] Initializing unified database (${db.dialect.toUpperCase()})...`);

  // Table Definitions
  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      lrn_or_id VARCHAR(50) UNIQUE NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(191) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'STUDENT',
      section VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS curriculum_quarters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quarter_code VARCHAR(10) UNIQUE NOT NULL,
      quarter_title VARCHAR(255) NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS curriculum_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quarter_id INTEGER NOT NULL,
      topic_code VARCHAR(50) NOT NULL,
      topic_title VARCHAR(255) NOT NULL,
      order_index INTEGER DEFAULT 1,
      FOREIGN KEY (quarter_id) REFERENCES curriculum_quarters(id) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS learning_competencies (
      id VARCHAR(36) PRIMARY KEY,
      topic_id INTEGER NOT NULL,
      melc_code VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      ilaw_tag VARCHAR(50) NOT NULL,
      mastery_threshold_percentage DECIMAL(5,2) DEFAULT 75.00,
      FOREIGN KEY (topic_id) REFERENCES curriculum_topics(id) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS instructional_materials (
      id VARCHAR(36) PRIMARY KEY,
      competency_id VARCHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      file_type VARCHAR(20) NOT NULL,
      storage_url VARCHAR(500) NOT NULL,
      file_size_bytes BIGINT NOT NULL DEFAULT 0,
      content_hash VARCHAR(64) NOT NULL,
      created_by VARCHAR(36) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (competency_id) REFERENCES learning_competencies(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );`,

    `CREATE TABLE IF NOT EXISTS quizzes (
      id VARCHAR(36) PRIMARY KEY,
      competency_id VARCHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      instructions TEXT NULL,
      time_limit_minutes INTEGER NOT NULL DEFAULT 30,
      total_points INTEGER NOT NULL DEFAULT 0,
      passing_score INTEGER NOT NULL DEFAULT 0,
      max_blur_limit INTEGER NOT NULL DEFAULT 3,
      is_published INTEGER DEFAULT 0,
      created_by VARCHAR(36) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (competency_id) REFERENCES learning_competencies(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );`,

    `CREATE TABLE IF NOT EXISTS quiz_questions (
      id VARCHAR(36) PRIMARY KEY,
      quiz_id VARCHAR(36) NOT NULL,
      question_text TEXT NOT NULL,
      question_type VARCHAR(50) NOT NULL,
      options_json TEXT NULL,
      correct_answer VARCHAR(255) NOT NULL,
      points INTEGER NOT NULL DEFAULT 1,
      order_index INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS quiz_submissions (
      id VARCHAR(36) PRIMARY KEY,
      quiz_id VARCHAR(36) NOT NULL,
      student_id VARCHAR(36) NOT NULL,
      started_at TIMESTAMP NOT NULL,
      submitted_at TIMESTAMP NULL,
      score_obtained INTEGER NOT NULL DEFAULT 0,
      percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
      is_passed INTEGER NOT NULL DEFAULT 0,
      blur_count INTEGER NOT NULL DEFAULT 0,
      is_flagged_for_cheating INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS',
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (quiz_id, student_id)
    );`,

    `CREATE TABLE IF NOT EXISTS quiz_submission_answers (
      id VARCHAR(36) PRIMARY KEY,
      submission_id VARCHAR(36) NOT NULL,
      question_id VARCHAR(36) NOT NULL,
      selected_answer VARCHAR(255) NOT NULL,
      is_correct INTEGER NOT NULL DEFAULT 0,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (submission_id) REFERENCES quiz_submissions(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS quiz_proctoring_logs (
      id VARCHAR(36) PRIMARY KEY,
      submission_id VARCHAR(36) NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      duration_unfocused_ms INTEGER DEFAULT 0,
      FOREIGN KEY (submission_id) REFERENCES quiz_submissions(id) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS student_competency_mastery (
      id VARCHAR(36) PRIMARY KEY,
      student_id VARCHAR(36) NOT NULL,
      competency_id VARCHAR(36) NOT NULL,
      mastery_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
      mastery_status VARCHAR(50) NOT NULL,
      last_assessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (competency_id) REFERENCES learning_competencies(id) ON DELETE CASCADE,
      UNIQUE (student_id, competency_id)
    );`,

    `CREATE TABLE IF NOT EXISTS remedial_interventions (
      id VARCHAR(36) PRIMARY KEY,
      student_id VARCHAR(36) NOT NULL,
      competency_id VARCHAR(36) NOT NULL,
      trigger_submission_id VARCHAR(36) NOT NULL,
      remedial_material_id VARCHAR(36) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'ASSIGNED',
      ilaw_phase VARCHAR(50) DEFAULT 'WAYS_FORWARD',
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (competency_id) REFERENCES learning_competencies(id) ON DELETE CASCADE,
      FOREIGN KEY (trigger_submission_id) REFERENCES quiz_submissions(id) ON DELETE CASCADE,
      FOREIGN KEY (remedial_material_id) REFERENCES instructional_materials(id) ON DELETE SET NULL
    );`,

    // UNIFIED PERSISTENCE LAYER ENTITIES (DATA-PERSISTENCE-LAYER MODULE)
    `CREATE TABLE IF NOT EXISTS competencies (
      id VARCHAR(36) PRIMARY KEY,
      quarter VARCHAR(10) NOT NULL,
      topic_title VARCHAR(255) NOT NULL,
      ilaw_category VARCHAR(50) NOT NULL,
      description TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS materials (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_type VARCHAR(20) NOT NULL,
      competency_id VARCHAR(36) NOT NULL,
      is_remedial INTEGER NOT NULL DEFAULT 0,
      uploaded_by VARCHAR(36) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );`,

    `CREATE TABLE IF NOT EXISTS quiz_attempts (
      id VARCHAR(36) PRIMARY KEY,
      quiz_id VARCHAR(36) NOT NULL,
      student_id VARCHAR(36) NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      total_points INTEGER NOT NULL DEFAULT 1,
      is_passed INTEGER NOT NULL DEFAULT 0,
      tab_switch_count INTEGER NOT NULL DEFAULT 0,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS security_logs (
      id VARCHAR(36) PRIMARY KEY,
      attempt_id VARCHAR(36) NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS interventions (
      id VARCHAR(36) PRIMARY KEY,
      student_id VARCHAR(36) NOT NULL,
      competency_id VARCHAR(36) NOT NULL,
      recommended_material_id VARCHAR(36) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'RECOMMENDED',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE CASCADE,
      FOREIGN KEY (recommended_material_id) REFERENCES materials(id) ON DELETE SET NULL
    );`,

    // PERFORMANCE TASKS (SRS FR-43, FR-44)
    `CREATE TABLE IF NOT EXISTS performance_tasks (
      id VARCHAR(36) PRIMARY KEY,
      quarter VARCHAR(10) NOT NULL,
      competency_id VARCHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      instructions TEXT NOT NULL,
      rubric_criteria TEXT NULL,
      total_points INTEGER DEFAULT 100,
      due_date TIMESTAMP NULL,
      created_by VARCHAR(36) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );`,

    `CREATE TABLE IF NOT EXISTS performance_task_submissions (
      id VARCHAR(36) PRIMARY KEY,
      task_id VARCHAR(36) NOT NULL,
      student_id VARCHAR(36) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_url VARCHAR(500) NOT NULL,
      file_size_bytes BIGINT DEFAULT 0,
      notes TEXT NULL,
      score INTEGER NULL,
      feedback TEXT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      graded_at TIMESTAMP NULL,
      FOREIGN KEY (task_id) REFERENCES performance_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (task_id, student_id)
    );`,

    // OFFLINE READ EVENT SYNC QUEUE (SRS FR-50)
    `CREATE TABLE IF NOT EXISTS material_read_logs (
      id VARCHAR(36) PRIMARY KEY,
      student_id VARCHAR(36) NOT NULL,
      material_id VARCHAR(36) NOT NULL,
      read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      synced_from_offline INTEGER DEFAULT 0,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (student_id, material_id)
    );`
  ];

  for (const ddl of ddlStatements) {
    await db.query(ddl);
  }

  // Ensure is_post_test exists on quizzes table (SRS FR-37)
  try {
    await db.query(`ALTER TABLE quizzes ADD COLUMN is_post_test INTEGER DEFAULT 0;`);
  } catch (e) { /* Column already exists */ }

  try {
    await db.query(`ALTER TABLE quizzes ADD COLUMN intervention_id VARCHAR(36) NULL;`);
  } catch (e) { /* Column already exists */ }

  // Ensure full_name and section_id exist on users table
  try {
    await db.query(`ALTER TABLE users ADD COLUMN full_name VARCHAR(150);`);
  } catch (e) { /* Column already exists */ }

  try {
    await db.query(`ALTER TABLE users ADD COLUMN section_id VARCHAR(50);`);
  } catch (e) { /* Column already exists */ }

  // Sync full_name & section_id for any existing user records
  await db.query(`UPDATE users SET full_name = first_name || ' ' || last_name WHERE full_name IS NULL;`);
  await db.query(`UPDATE users SET section_id = section WHERE section_id IS NULL;`);

  console.log('[ARALYTICS DB] Tables verified/created successfully.');

  // Seed default data if users table is empty
  const { rows: existingUsers } = await db.query('SELECT COUNT(*) as count FROM users');
  const userCount = Number(existingUsers[0].count || existingUsers[0]['COUNT(*)'] || 0);

  if (userCount === 0) {
    console.log('[ARALYTICS DB] Seeding initial curriculum, ILAW competencies, users, and quizzes...');

    const salt = await bcrypt.genSalt(10);
    const teacherHash = await bcrypt.hash('TeacherPass123!', salt);
    const studentHash = await bcrypt.hash('StudentPass123!', salt);

    const teacherId = 'usr-teacher-001';
    const student1Id = 'usr-student-001';
    const student2Id = 'usr-student-002';
    const student3Id = 'usr-student-003';

    // 1. Users
    await db.query(
      `INSERT INTO users (id, lrn_or_id, first_name, last_name, email, password_hash, role, section) VALUES
      (?, ?, ?, ?, ?, ?, 'TEACHER', NULL),
      (?, ?, ?, ?, ?, ?, 'STUDENT', '10-Rizal'),
      (?, ?, ?, ?, ?, ?, 'STUDENT', '10-Rizal'),
      (?, ?, ?, ?, ?, ?, 'STUDENT', '10-Bonifacio')`,
      [
        teacherId, 'EMP-2026-001', 'Cleo', 'Ponce', 'teacher@ponce.edu.ph', teacherHash,
        student1Id, '123456789012', 'Juan', 'Dela Cruz', 'juan.delacruz@student.deped.gov.ph', studentHash,
        student2Id, '123456789013', 'Maria', 'Clara', 'maria.clara@student.deped.gov.ph', studentHash,
        student3Id, '123456789014', 'Andres', 'Bonifacio', 'andres.bonifacio@student.deped.gov.ph', studentHash
      ]
    );

    // 2. Curriculum Quarters
    await db.query(
      `INSERT INTO curriculum_quarters (id, quarter_code, quarter_title) VALUES
      (1, 'Q1', 'Unang Markahan: Mga Isyung Pangkapaligiran at Pang-ekonomiya'),
      (2, 'Q2', 'Ikalawang Markahan: Mga Isyung Pang-ekonomiya at Globalisasyon'),
      (3, 'Q3', 'Ikatlong Markahan: Mga Isyung Politikal at Karapatang Pantao'),
      (4, 'Q4', 'Ikaapat na Markahan: Mga Isyung Pansibiko at Pakikilahok sa Pamayanan')`
    );

    // 3. Topics for Q1
    await db.query(
      `INSERT INTO curriculum_topics (id, quarter_id, topic_code, topic_title, order_index) VALUES
      (1, 1, 'TOPIC-Q1-01', 'Konsepto ng Kontemporaryong Isyu', 1),
      (2, 1, 'TOPIC-Q1-02', 'Mga Suliraning Pangkapaligiran (Solid Waste, Deforestation, Climate Change)', 2),
      (3, 1, 'TOPIC-Q1-03', 'Disaster Risk Reduction and Management (CBDRRM Approach)', 3)`
    );

    // 4. Learning Competencies with ILAW Framework Tagging
    const comp1 = 'comp-ap10-q1-001';
    const comp2 = 'comp-ap10-q1-002';
    const comp3 = 'comp-ap10-q1-003';
    const comp4 = 'comp-ap10-q1-004';

    await db.query(
      `INSERT INTO learning_competencies (id, topic_id, melc_code, description, ilaw_tag, mastery_threshold_percentage) VALUES
      (?, 1, 'AP10IPE-Ia-1', 'Nasusuri ang kahalagahan ng pag-aaral ng Kontemporaryong Isyu upang mapaunlad ang kasanayan sa mapanuring pag-iisip.', 'INTENTIONS', 75.00),
      (?, 2, 'AP10IPE-Ib-2', 'Natutukoy ang mga suliraning pangkapaligiran na nararanasan sa sariling pamayanan at sa buong bansa.', 'LEARNING_EXPERIENCES', 75.00),
      (?, 3, 'AP10DRE-Ic-3', 'Naipaliliwanag ang mga hakbang at katangian ng Community-Based Disaster Risk Reduction and Management (CBDRRM) Approach.', 'ASSESSMENT', 75.00),
      (?, 3, 'AP10DRE-Id-4', 'Naisasagawa ang mga angkop na hakbang ng kahandaan at pagtugon sa kalamidad bilang aktibong mamamayan.', 'WAYS_FORWARD', 80.00)`,
      [comp1, comp2, comp3, comp4]
    );

    // 5. Instructional Materials (Offline-Cacheable)
    const mat1Id = 'mat-ap10-001';
    const mat2Id = 'mat-ap10-002';
    const mat3Id = 'mat-ap10-003';

    await db.query(
      `INSERT INTO instructional_materials (id, competency_id, title, description, file_type, storage_url, file_size_bytes, content_hash, created_by) VALUES
      (?, ?, 'Modyul 1: Introduksyon sa Kontemporaryong Isyu.pdf', 'Opisyal na babasahin sa kahalagahan at saklaw ng kontemporaryong isyu.', 'PDF', '/api/materials/download/mod1_intro_ki.pdf', 2450000, ?, ?),
      (?, ?, 'Presentasyon: CBDRRM Framework & Disaster Preparedness.pptx', 'Slide deck sa bottom-up approach at disaster management cycle.', 'PPTX', '/api/materials/download/cbdrrm_slides.pptx', 4120000, ?, ?),
      (?, ?, 'Dokumentaryo: Epekto ng Climate Change sa Pilipinas.mp4', 'Bidyo-aralin ukol sa pagbaha, polusyon sa hangin, at pagkasira ng kabundukan.', 'MP4', '/api/materials/download/climate_change_ph.mp4', 18450000, ?, ?)`,
      [
        mat1Id, comp1, crypto.createHash('sha256').update('mod1_intro_ki.pdf').digest('hex'), teacherId,
        mat2Id, comp3, crypto.createHash('sha256').update('cbdrrm_slides.pptx').digest('hex'), teacherId,
        mat3Id, comp2, crypto.createHash('sha256').update('climate_change_ph.mp4').digest('hex'), teacherId
      ]
    );

    // 6. Pre-configured Quiz for CBDRRM Competency (comp3 - ASSESSMENT)
    const quiz1Id = 'quiz-ap10-cbdrrm-01';
    await db.query(
      `INSERT INTO quizzes (id, competency_id, title, instructions, time_limit_minutes, total_points, passing_score, max_blur_limit, is_published, created_by) VALUES
      (?, ?, 'Pagsusuri sa CBDRRM Approach at Kahandaan sa Kalamidad', 'Basahing mabuti ang bawat tanong. Mahigpit na ipinagbabawal ang paglipat ng tab o window habang sumasagot. Ang higit sa 3 paglabag ay magmamarka ng cheating flag.', 15, 5, 4, 3, 1, ?)`,
      [quiz1Id, comp3, teacherId]
    );

    // Questions for Quiz 1
    const questions = [
      {
        id: 'q-cbdrrm-01',
        text: 'Ano ang pangunahing katangian ng Community-Based Disaster Risk Reduction and Management (CBDRRM) Approach?',
        type: 'MULTIPLE_CHOICE',
        options: JSON.stringify([
          { id: 'A', text: 'Ang pamahalaan lamang ang may pananagutan sa pagpaplano.' },
          { id: 'B', text: 'Aktibong pakikilahok ng mga mamamayan sa pagtukoy at pagtugon sa mga panganib.' },
          { id: 'C', text: 'Pagtutok lamang sa pamamahagi ng relief goods pagkatapos ng bagyo.' },
          { id: 'D', text: 'Paghintay sa tulong mula sa mga dayuhang organisasyon.' }
        ]),
        answer: 'B',
        points: 1,
        order: 1
      },
      {
        id: 'q-cbdrrm-02',
        text: 'Alin sa mga sumusunod ang tamang pagkakaiba ng Top-Down Approach at Bottom-Up Approach?',
        type: 'MULTIPLE_CHOICE',
        options: JSON.stringify([
          { id: 'A', text: 'Ang Top-Down ay umaasa sa mamamayan; ang Bottom-Up ay puro pamahalaan.' },
          { id: 'B', text: 'Walang pagkakaiba ang dalawang pamamaraan.' },
          { id: 'C', text: 'Sa Top-Down, lahat ng desisyon ay nagmumula sa mataas na opisyal; sa Bottom-Up, nagsisimula sa lokal na komunidad.' },
          { id: 'D', text: 'Ang Bottom-Up ay hindi epektibo sa Pilipinas.' }
        ]),
        answer: 'C',
        points: 1,
        order: 2
      },
      {
        id: 'q-cbdrrm-03',
        text: 'Ang Hazard Assessment ay tumutukoy sa pagsusuri sa lawak, sakop, at pinsala na maaaring idulot ng isang kalamidad.',
        type: 'TRUE_FALSE',
        options: JSON.stringify([
          { id: 'TRUE', text: 'Tama (True)' },
          { id: 'FALSE', text: 'Mali (False)' }
        ]),
        answer: 'TRUE',
        points: 1,
        order: 3
      },
      {
        id: 'q-cbdrrm-04',
        text: 'Ano ang tawag sa kahinaan ng isang komunidad na nagdudulot ng mataas na tsansa ng pinsala mula sa kalamidad?',
        type: 'MULTIPLE_CHOICE',
        options: JSON.stringify([
          { id: 'A', text: 'Resilience' },
          { id: 'B', text: 'Vulnerability' },
          { id: 'C', text: 'Mitigation' },
          { id: 'D', text: 'Adaptation' }
        ]),
        answer: 'B',
        points: 1,
        order: 4
      },
      {
        id: 'q-cbdrrm-05',
        text: 'Ang CBDRRM plan ay binubuo ng Disaster Prevention and Mitigation, Preparedness, Response, at Rehabilitation/Recovery.',
        type: 'TRUE_FALSE',
        options: JSON.stringify([
          { id: 'TRUE', text: 'Tama (True)' },
          { id: 'FALSE', text: 'Mali (False)' }
        ]),
        answer: 'TRUE',
        points: 1,
        order: 5
      }
    ];

    for (const q of questions) {
      await db.query(
        `INSERT INTO quiz_questions (id, quiz_id, question_text, question_type, options_json, correct_answer, points, order_index) VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)`,
        [q.id, quiz1Id, q.text, q.type, q.options, q.answer, q.points, q.order]
      );
    }

    console.log('[ARALYTICS DB] Initial seed data successfully populated.');
  }

  // Ensure all 6 question types exist for CBDRRM quiz (SRS FR-16)
  const additionalQuestions = [
    {
      id: 'q-cbdrrm-06',
      quiz_id: 'quiz-ap10-cbdrrm-01',
      question_text: 'Ano ang tawag sa pandaigdigang kasunduan sa ilalim ng UNFCCC na naglalayong limitahan ang pagtaas ng global average temperature sa 1.5 degrees Celsius?',
      question_type: 'IDENTIFICATION',
      options_json: null,
      correct_answer: 'Paris Agreement|Kasunduang Paris|Paris Accord',
      points: 1,
      order_index: 6
    },
    {
      id: 'q-cbdrrm-07',
      quiz_id: 'quiz-ap10-cbdrrm-01',
      question_text: 'Pagtambalin ang bawat yugto ng CBDRRM sa tamang pangunahing layunin at gawain nito.',
      question_type: 'MATCHING',
      options_json: JSON.stringify({
        premises: [
          { id: 'p1', text: 'Yugto 1: Disaster Prevention & Mitigation' },
          { id: 'p2', text: 'Yugto 2: Disaster Preparedness' },
          { id: 'p3', text: 'Yugto 3: Disaster Response' },
          { id: 'p4', text: 'Yugto 4: Disaster Rehabilitation' }
        ],
        responses: [
          { id: 'r1', text: 'Pagtataya ng panganib (Hazard Assessment) at mitigasyon' },
          { id: 'r2', text: 'Pagsasagawa ng evacuation drills at paghahanda ng Go-Bag' },
          { id: 'r3', text: 'Search, rescue, at pamamahagi ng relief goods' },
          { id: 'r4', text: 'Pagbabalik ng mga nasirang pasilidad at kabuhayan' }
        ]
      }),
      correct_answer: JSON.stringify({ p1: 'r1', p2: 'r2', p3: 'r3', p4: 'r4' }),
      points: 1,
      order_index: 7
    },
    {
      id: 'q-cbdrrm-08',
      quiz_id: 'quiz-ap10-cbdrrm-01',
      question_text: 'Sitwasyon: Isang malakas na storm surge warning ang ibinaba sa inyong coastal purok, subalit maraming mangingisda ang tumatangging lumikas dahil sa kanilang mga bangka. Batay sa participatory disaster governance, ano ang pinaka-epektibong hakbang ng barangay lider?',
      question_type: 'SITUATIONAL',
      options_json: JSON.stringify([
        { id: 'A', text: 'Hayaan sila at balikan na lamang pagkatapos ng bagyo.' },
        { id: 'B', text: 'Magpatupad ng maagap na paglikas kasabay ng pagtatatag ng ligtas na secured boat harbor na pinangangasiwaan ng barangay task force.' },
        { id: 'C', text: 'Ipagbawal ang pamamahagi ng relief goods sa mga ayaw lumikas.' },
        { id: 'D', text: 'Ipaubaya ang desisyon sa bawat pamilya nang walang interbensyon.' }
      ]),
      correct_answer: 'B',
      points: 1,
      order_index: 8
    },
    {
      id: 'q-cbdrrm-09',
      quiz_id: 'quiz-ap10-cbdrrm-01',
      question_text: 'Pagsusuri ng Datos (PISA-Style Scientific & Critical Literacy): Ipinapakita sa ulat ng NDRRMC na ang mga komunidad na may 100% community-level hazard mapping ay nagtala ng 85% mas mababang casualty rate sa panahon ng bagyo kumpara sa mga komunidad na umasa lamang sa pambansang direktiba. Batay sa datos at sa konsepto ng CBDRRM, aling pangungusap ang nagpapaliwanag ng ugnayang ito?',
      question_type: 'PISA_LIKE',
      options_json: JSON.stringify([
        { id: 'A', text: 'Ang mga pambansang ahensya ay walang kagamitan para sa pagtugon sa bagyo.' },
        { id: 'B', text: 'Ang lokal na kaalaman at aktibong partisipasyon ay nagpapabilis sa agaran at angkop na pagtugon ng mga residente sa hazard zones.' },
        { id: 'C', text: 'Ang hazard map ay pisikal na humaharang sa pagdating ng mga bagyo.' },
        { id: 'D', text: 'Hindi na kailangan ng pondo mula sa gobyerno kung may hazard map.' }
      ]),
      correct_answer: 'B',
      points: 1,
      order_index: 9
    }
  ];

  for (const q of additionalQuestions) {
    const { rows: exist } = await db.query(`SELECT id FROM quiz_questions WHERE id = ? LIMIT 1`, [q.id]);
    if (exist.length === 0) {
      await db.query(
        `INSERT INTO quiz_questions (id, quiz_id, question_text, question_type, options_json, correct_answer, points, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [q.id, q.quiz_id, q.question_text, q.question_type, q.options_json, q.correct_answer, q.points, q.order_index]
      );
    }
  }

  await db.query(
    `UPDATE quizzes SET total_points = 9, passing_score = 7 WHERE id = 'quiz-ap10-cbdrrm-01'`
  );

  // Seed student item responses in quiz_submission_answers if empty (FR-21, FR-40)
  const { rows: ansCountRow } = await db.query(`SELECT COUNT(*) as count FROM quiz_submission_answers`);
  const ansCount = Number(ansCountRow[0].count || ansCountRow[0]['COUNT(*)'] || 0);

  if (ansCount === 0) {
    console.log('[ARALYTICS DB] Seeding student answers for psychometric item analysis...');
    const { rows: allQuestions } = await db.query(
      `SELECT * FROM quiz_questions WHERE quiz_id = 'quiz-ap10-cbdrrm-01' ORDER BY order_index ASC`
    );
    const { rows: students } = await db.query(`SELECT id FROM users WHERE role = 'STUDENT'`);

    // Distribution profile: some high performers (upper group), some average, some needing intervention
    const profileResponses = [
      // High: 9/9
      { 1: 'B', 2: 'C', 3: 'TRUE', 4: 'B', 5: 'TRUE', 6: 'Paris Agreement', 7: JSON.stringify({ p1: 'r1', p2: 'r2', p3: 'r3', p4: 'r4' }), 8: 'B', 9: 'B' },
      // High: 8/9 (q4 wrong)
      { 1: 'B', 2: 'C', 3: 'TRUE', 4: 'A', 5: 'TRUE', 6: 'Kasunduang Paris', 7: JSON.stringify({ p1: 'r1', p2: 'r2', p3: 'r3', p4: 'r4' }), 8: 'B', 9: 'B' },
      // Developing: 7/9 (q2, q4 wrong)
      { 1: 'B', 2: 'A', 3: 'TRUE', 4: 'C', 5: 'TRUE', 6: 'Paris Accord', 7: JSON.stringify({ p1: 'r1', p2: 'r2', p3: 'r3', p4: 'r4' }), 8: 'B', 9: 'B' },
      // Developing: 6/9
      { 1: 'B', 2: 'B', 3: 'TRUE', 4: 'B', 5: 'FALSE', 6: 'Paris Agreement', 7: JSON.stringify({ p1: 'r1', p2: 'r2', p3: 'r3', p4: 'r4' }), 8: 'A', 9: 'B' },
      // Needs Intervention: 5/9
      { 1: 'A', 2: 'C', 3: 'FALSE', 4: 'B', 5: 'TRUE', 6: 'Kyoto Protocol', 7: JSON.stringify({ p1: 'r1', p2: 'r2', p3: 'r3', p4: 'r4' }), 8: 'C', 9: 'B' },
      // Needs Intervention: 4/9
      { 1: 'A', 2: 'D', 3: 'TRUE', 4: 'A', 5: 'FALSE', 6: 'Montreal Protocol', 7: JSON.stringify({ p1: 'r1', p2: 'r2', p3: 'r4', p4: 'r3' }), 8: 'D', 9: 'B' },
      // Needs Intervention: 3/9
      { 1: 'C', 2: 'B', 3: 'FALSE', 4: 'C', 5: 'TRUE', 6: 'UNFCCC', 7: JSON.stringify({ p1: 'r2', p2: 'r1', p3: 'r3', p4: 'r4' }), 8: 'A', 9: 'A' },
      // High: 8/9
      { 1: 'B', 2: 'C', 3: 'TRUE', 4: 'B', 5: 'TRUE', 6: 'Paris Agreement', 7: JSON.stringify({ p1: 'r1', p2: 'r2', p3: 'r3', p4: 'r4' }), 8: 'B', 9: 'D' }
    ];

    for (let i = 0; i < students.length; i++) {
      const studentId = students[i].id;
      const respSet = profileResponses[i % profileResponses.length];
      const subId = `sub-init-${studentId}-${i}`;
      let studentScore = 0;

      // Upsert submission
      await db.query(
        `INSERT OR REPLACE INTO quiz_submissions
         (id, quiz_id, student_id, started_at, submitted_at, score_obtained, percentage, is_passed, blur_count, is_flagged_for_cheating, status)
         VALUES (?, 'quiz-ap10-cbdrrm-01', ?, datetime('now', '-2 days'), datetime('now', '-2 days'), 0, 0, 0, 0, 0, 'SUBMITTED')`,
        [subId, studentId]
      );

      for (let order = 1; order <= allQuestions.length; order++) {
        const q = allQuestions[order - 1];
        if (!q) continue;

        const givenAns = respSet[order] || 'B';
        let isRight = false;

        if (q.question_type === 'IDENTIFICATION') {
          const aliases = q.correct_answer.split('|').map(s => s.trim().toLowerCase());
          isRight = aliases.includes(givenAns.trim().toLowerCase());
        } else if (q.question_type === 'MATCHING') {
          isRight = givenAns === q.correct_answer;
        } else if (q.question_type === 'TRUE_FALSE') {
          isRight = givenAns.toUpperCase() === q.correct_answer.toUpperCase();
        } else {
          isRight = givenAns.toUpperCase() === q.correct_answer.toUpperCase();
        }

        const pts = isRight ? q.points : 0;
        studentScore += pts;

        const ansId = `qsa-init-${subId}-${q.id}`;
        await db.query(
          `INSERT INTO quiz_submission_answers
           (id, submission_id, question_id, selected_answer, is_correct, points_awarded)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [ansId, subId, q.id, String(givenAns), isRight ? 1 : 0, pts]
        );
      }

      const pct = Number(((studentScore / 9) * 100).toFixed(2));
      const passed = studentScore >= 7 ? 1 : 0;
      await db.query(
        `UPDATE quiz_submissions SET score_obtained = ?, percentage = ?, is_passed = ? WHERE id = ?`,
        [studentScore, pct, passed, subId]
      );
    }
  }

  // Seed competencies if empty
  const { rows: existingComps } = await db.query('SELECT COUNT(*) as count FROM competencies');

  const compCount = Number(existingComps[0].count || existingComps[0]['COUNT(*)'] || 0);

  if (compCount === 0) {
    console.log('[ARALYTICS DB] Seeding DATA-PERSISTENCE-LAYER competencies and remedial materials...');

    await db.query(
      `INSERT INTO competencies (id, quarter, topic_title, ilaw_category, description) VALUES
      ('comp-ap10-q1-001', 'Q1', 'Konsepto ng Kontemporaryong Isyu', 'INTENTIONS', 'Nasusuri ang kahalagahan ng pag-aaral ng Kontemporaryong Isyu upang mapaunlad ang kasanayan sa mapanuring pag-iisip.'),
      ('comp-ap10-q1-002', 'Q1', 'Mga Suliraning Pangkapaligiran', 'LEARNING_EXPERIENCES', 'Natutukoy ang mga suliraning pangkapaligiran na nararanasan sa sariling pamayanan at sa buong bansa.'),
      ('comp-ap10-q1-003', 'Q1', 'Disaster Risk Reduction and Management (CBDRRM Approach)', 'ASSESSMENT', 'Naipaliliwanag ang mga hakbang at katangian ng Community-Based Disaster Risk Reduction and Management Approach.'),
      ('comp-ap10-q1-004', 'Q1', 'Disaster Preparedness Action Plan', 'WAYS_FORWARD', 'Naisasagawa ang mga angkop na hakbang ng kahandaan at pagtugon sa kalamidad bilang aktibong mamamayan.')`
    );

    await db.query(
      `INSERT INTO materials (id, title, file_path, file_type, competency_id, is_remedial, uploaded_by) VALUES
      ('mat-rem-001', 'CBDRRM Remedial Reviewer & Study Guide.pdf', '/api/materials/download/cbdrrm_remedial.pdf', 'PDF', 'comp-ap10-q1-003', 1, 'usr-teacher-001'),
      ('mat-rem-002', 'Lektyur: Pagbawi sa Kahinaan sa CBDRRM.mp4', '/api/materials/download/cbdrrm_recovery.mp4', 'VIDEO', 'comp-ap10-q1-003', 1, 'usr-teacher-001'),
      ('mat-std-001', 'Introduksyon sa Kontemporaryong Isyu.pdf', '/api/materials/download/intro_ki.pdf', 'PDF', 'comp-ap10-q1-001', 0, 'usr-teacher-001')`
    );
  }

  // Seed performance tasks if empty (SRS FR-43, FR-44)
  const { rows: existingPT } = await db.query('SELECT COUNT(*) as count FROM performance_tasks');
  const ptCount = Number(existingPT[0].count || existingPT[0]['COUNT(*)'] || 0);

  if (ptCount === 0) {
    console.log('[ARALYTICS DB] Seeding initial performance tasks (FR-43, FR-44)...');
    await db.query(
      `INSERT INTO performance_tasks (id, quarter, competency_id, title, instructions, rubric_criteria, total_points, due_date, created_by) VALUES
      ('pt-q1-cbdrrm-01', 'Q1', 'comp-ap10-q1-004', 'Barangay CBDRRM Hazard & Evacuation Map Action Plan', 'Gumawa ng komprehensibong hazard map at evacuation plan para sa sariling barangay gamit ang natutunan sa CBDRRM Approach. I-upload ang file bilang PDF, PPT, o DOCX document.', 'Nilalaman at Kaangkupan: 40%, Organisasyon at Kalinawan ng Mapa: 30%, Praktikalidad sa Komunidad: 30%', 100, datetime('now', '+14 days'), 'usr-teacher-001'),
      ('pt-q1-env-02', 'Q1', 'comp-ap10-q1-002', 'Photo-Essay: Pagsusuri sa Suliraning Solid Waste sa Pamayanan', 'Kumuha o magtipon ng 5 larawan na nagpapakita ng isyu sa solid waste at gumawa ng kritikal na pagsusuri at mungkahing solusyon bilang kabataang lider.', 'Mapanuring Pag-iisip: 40%, Biswal na Presentasyon: 30%, Realistikong Solusyon: 30%', 100, datetime('now', '+7 days'), 'usr-teacher-001')`
    );

    await db.query(
      `INSERT INTO performance_task_submissions (id, task_id, student_id, file_name, file_url, file_size_bytes, notes, score, feedback, status) VALUES
      ('pts-001', 'pt-q1-cbdrrm-01', 'usr-student-001', 'Barangay_San_Jose_CBDRRM_Plan_JuanDelaCruz.pdf', '/api/performance-tasks/files/Barangay_San_Jose_CBDRRM_Plan_JuanDelaCruz.pdf', 3450000, 'Ipinapasa ko po ang aming barangay hazard plan.', 92, 'Mahusay na pagsusuri sa hazard zones at malinaw ang evacuation routes.', 'GRADED'),
      ('pts-002', 'pt-q1-cbdrrm-01', 'usr-student-002', 'Evacuation_Plan_MariaClara.docx', '/api/performance-tasks/files/Evacuation_Plan_MariaClara.docx', 2150000, 'Attached po ang aking family and purok evacuation checklist.', NULL, NULL, 'SUBMITTED')`
    );
  }

  console.log('[ARALYTICS DB] Ready.');
}

if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[ARALYTICS DB ERROR]', err);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
