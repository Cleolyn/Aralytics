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

  // Curriculum is independent of account creation. Accounts are provisioned by verified Clerk sign-in.
  const { rows: existingCurriculum } = await db.query('SELECT COUNT(*) as count FROM curriculum_quarters');
  const curriculumCount = Number(existingCurriculum[0].count || 0);

  if (curriculumCount === 0) {
    console.log('[ARALYTICS DB] Seeding initial curriculum and ILAW competencies...');

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

    console.log('[ARALYTICS DB] Initial curriculum and competency seed data populated.');
  }

  // Seed competencies if empty (needed for material & quiz competency selectors)
  const { rows: existingComps } = await db.query('SELECT COUNT(*) as count FROM competencies');
  const compCount = Number(existingComps[0].count || existingComps[0]['COUNT(*)'] || 0);

  if (compCount === 0) {
    console.log('[ARALYTICS DB] Seeding competencies...');
    await db.query(
      `INSERT INTO competencies (id, quarter, topic_title, ilaw_category, description) VALUES
      ('comp-ap10-q1-001', 'Q1', 'Konsepto ng Kontemporaryong Isyu', 'INTENTIONS', 'Nasusuri ang kahalagahan ng pag-aaral ng Kontemporaryong Isyu upang mapaunlad ang kasanayan sa mapanuring pag-iisip.'),
      ('comp-ap10-q1-002', 'Q1', 'Mga Suliraning Pangkapaligiran', 'LEARNING_EXPERIENCES', 'Natutukoy ang mga suliraning pangkapaligiran na nararanasan sa sariling pamayanan at sa buong bansa.'),
      ('comp-ap10-q1-003', 'Q1', 'Disaster Risk Reduction and Management (CBDRRM Approach)', 'ASSESSMENT', 'Naipaliliwanag ang mga hakbang at katangian ng Community-Based Disaster Risk Reduction and Management Approach.'),
      ('comp-ap10-q1-004', 'Q1', 'Disaster Preparedness Action Plan', 'WAYS_FORWARD', 'Naisasagawa ang mga angkop na hakbang ng kahandaan at pagtugon sa kalamidad bilang aktibong mamamayan.')`
    );
  }

  console.log('[ARALYTICS DB] Ready.');
  await require('../services/enrollmentService').initializeEnrollmentTables();
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
